import type { MilkdownPlugin } from '@milkdown/ctx';
import { prismConfig } from '@milkdown/plugin-prism';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey, type Transaction } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { Refractor, RefractorElement, Text } from 'refractor/core';
import { refractor } from '@/plugins/custom/code-block/code-block-highlighter';

// 代码块节点类型名称。
const CODE_BLOCK_NODE_NAME = 'code_block';
// 代码块高亮插件标识（保持与官方插件一致的 key 命名）。
const PRISM_PLUGIN_KEY = new PluginKey<PrismPluginState>('MILKDOWN_PRISM');

/**
 * 单个代码块的位置与节点快照。
 */
interface CodeBlockSnapshot {
  /** 代码块在文档中的起始位置。 */
  pos: number;
  /** 代码块 ProseMirror 节点引用。 */
  node: ProseNode;
}

/**
 * 增量高亮插件状态。
 */
interface PrismPluginState {
  /** 当前文档全部代码块的高亮装饰集合。 */
  decorations: DecorationSet;
  /** 上一次计算时的代码块列表快照。 */
  blocks: CodeBlockSnapshot[];
}

/**
 * 扁平化高亮文本片段。
 */
interface HighlightedTextSpan {
  /** 文本内容。 */
  text: string;
  /** 语法高亮类名列表。 */
  classNames: string[];
}

/**
 * 扁平化 refractor 返回的 AST 节点树。
 */
const flattenHighlightNodes = (
  nodes: Array<RefractorElement | Text>,
  classNames: string[] = []
): HighlightedTextSpan[] => {
  const spans: HighlightedTextSpan[] = [];
  for (const node of nodes) {
    if (node.type === 'element') {
      const nextClassNames = Array.isArray(node.properties?.className)
        ? [...classNames, ...node.properties.className.map(String)]
        : classNames;
      spans.push(...flattenHighlightNodes(node.children, nextClassNames));
    } else if (node.type === 'text' && node.value) {
      spans.push({ text: node.value, classNames });
    }
  }
  return spans;
};

/**
 * 收集文档中全部代码块的位置与节点。
 */
const collectCodeBlocks = (doc: ProseNode): CodeBlockSnapshot[] => {
  const blocks: CodeBlockSnapshot[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === CODE_BLOCK_NODE_NAME) {
      blocks.push({ pos, node });
      return false;
    }
    return true;
  });
  return blocks;
};

/**
 * 为单个代码块生成语法高亮行内装饰。
 */
const createCodeBlockDecorations = (
  block: CodeBlockSnapshot,
  highlighter: Refractor,
  supportedLanguages: ReadonlySet<string>
): Decoration[] => {
  const language = typeof block.node.attrs.language === 'string' ? block.node.attrs.language : '';
  if (!language || !supportedLanguages.has(language)) {
    return [];
  }

  let from = block.pos + 1;
  const decorations: Decoration[] = [];
  const root = highlighter.highlight(block.node.textContent, language);
  const spans = flattenHighlightNodes(root.children as Array<RefractorElement | Text>);

  for (const span of spans) {
    const to = from + span.text.length;
    if (span.classNames.length > 0 && to > from) {
      decorations.push(Decoration.inline(from, to, { class: span.classNames.join(' ') }));
    }
    from = to;
  }

  return decorations;
};

/**
 * 判断两个代码块列表是否在节点引用上完全一致（即无任何代码块新增、删除或修改）。
 */
const areCodeBlockNodesUnchanged = (
  previousBlocks: readonly CodeBlockSnapshot[],
  nextBlocks: readonly CodeBlockSnapshot[]
): boolean => {
  if (previousBlocks.length !== nextBlocks.length) {
    return false;
  }

  for (let index = 0; index < previousBlocks.length; index += 1) {
    if (previousBlocks[index].node !== nextBlocks[index].node) {
      return false;
    }
  }

  return true;
};

/**
 * 判断指定文档位置是否位于代码块节点内部。
 */
const hasCodeBlockAncestor = (doc: ProseNode, pos: number): boolean => {
  const clampedPos = Math.max(0, Math.min(doc.content.size, pos));
  const resolved = doc.resolve(clampedPos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    if (resolved.node(depth).type.name === CODE_BLOCK_NODE_NAME) {
      return true;
    }
  }

  return false;
};

/**
 * 基于事务步长区间判断本次文档变更是否触及任何代码块，普通正文编辑直接 O(1)/O(blocks) 跳过全文遍历。
 */
const doesTransactionTouchCodeBlocks = (
  transaction: Transaction,
  previousBlocks: readonly CodeBlockSnapshot[],
  newDoc: ProseNode
): boolean => {
  for (let stepIndex = 0; stepIndex < transaction.steps.length; stepIndex += 1) {
    const step = transaction.steps[stepIndex];
    const stepMap = transaction.mapping.maps[stepIndex];
    const ranges: Array<[number, number, number, number]> = [];
    stepMap.forEach((oldStart, oldEnd, newStart, newEnd) => {
      ranges.push([oldStart, oldEnd, newStart, newEnd]);
    });

    if (ranges.length === 0) {
      // 纯 Mark 变更不会影响代码块纯文本或节点属性；AttrStep 等空区间变更则保守触发增量检查。
      if ('mark' in step) {
        continue;
      }
      return true;
    }

    const oldMapping = stepIndex > 0 ? transaction.mapping.slice(0, stepIndex).invert() : null;
    const newMapping =
      stepIndex + 1 < transaction.mapping.maps.length
        ? transaction.mapping.slice(stepIndex + 1)
        : null;

    for (const [oldStart, oldEnd, newStart, newEnd] of ranges) {
      const oldFrom = oldMapping ? oldMapping.map(oldStart, -1) : oldStart;
      const oldTo = oldMapping ? oldMapping.map(oldEnd, 1) : oldEnd;

      for (const block of previousBlocks) {
        if (block.pos > oldTo) {
          break;
        }
        if (oldFrom <= block.pos + block.node.nodeSize && oldTo >= block.pos) {
          return true;
        }
      }

      const newFrom = Math.max(
        0,
        Math.min(newDoc.content.size, newMapping ? newMapping.map(newStart, -1) : newStart)
      );
      const newTo = Math.max(
        newFrom,
        Math.min(newDoc.content.size, newMapping ? newMapping.map(newEnd, 1) : newEnd)
      );

      if (newFrom === newTo) {
        if (hasCodeBlockAncestor(newDoc, newFrom)) {
          return true;
        }
        continue;
      }

      let touched = false;
      newDoc.nodesBetween(newFrom, newTo, (node) => {
        if (node.type.name === CODE_BLOCK_NODE_NAME) {
          touched = true;
          return false;
        }
        return !touched;
      });
      if (touched) {
        return true;
      }
    }
  }

  return false;
};

/**
 * 增量更新代码块语法高亮插件，仅重算发生变更的单个代码块。
 */
export const codeBlockPrismPlugin: MilkdownPlugin = $prose((ctx) => {
  const { configureRefractor } = ctx.get(prismConfig.key);
  const highlighter = (configureRefractor?.(refractor) ?? refractor) as Refractor;
  const supportedLanguages = new Set(highlighter.listLanguages());

  return new Plugin<PrismPluginState>({
    key: PRISM_PLUGIN_KEY,
    state: {
      init: (_config, { doc }) => {
        const blocks = collectCodeBlocks(doc);
        const decorations: Decoration[] = [];
        for (const block of blocks) {
          decorations.push(...createCodeBlockDecorations(block, highlighter, supportedLanguages));
        }

        return {
          decorations: DecorationSet.create(doc, decorations),
          blocks
        };
      },
      apply: (transaction, pluginState, _oldState, newState) => {
        if (!transaction.docChanged) {
          return {
            decorations: pluginState.decorations.map(transaction.mapping, transaction.doc),
            blocks: pluginState.blocks
          };
        }

        if (!doesTransactionTouchCodeBlocks(transaction, pluginState.blocks, newState.doc)) {
          const mappedBlocks =
            pluginState.blocks.length === 0
              ? pluginState.blocks
              : pluginState.blocks.map((block) => ({
                  pos: transaction.mapping.map(block.pos, 1),
                  node: block.node
                }));
          return {
            decorations: pluginState.decorations.map(transaction.mapping, transaction.doc),
            blocks: mappedBlocks
          };
        }

        const nextBlocks = collectCodeBlocks(newState.doc);
        // 普通正文编辑未触及任何代码块时，直接映射既有装饰，跳过全部高亮计算。
        if (areCodeBlockNodesUnchanged(pluginState.blocks, nextBlocks)) {
          return {
            decorations: pluginState.decorations.map(transaction.mapping, transaction.doc),
            blocks: nextBlocks
          };
        }

        let nextDecorations = pluginState.decorations.map(transaction.mapping, transaction.doc);
        const unchangedBlockPositions = new Set<number>();

        for (const oldBlock of pluginState.blocks) {
          const mappedPos = transaction.mapping.map(oldBlock.pos, 1);
          if (newState.doc.nodeAt(mappedPos) === oldBlock.node) {
            unchangedBlockPositions.add(mappedPos);
          }
        }

        const addedDecorations: Decoration[] = [];
        for (const nextBlock of nextBlocks) {
          if (unchangedBlockPositions.has(nextBlock.pos)) {
            continue;
          }

          const staleDecorations = nextDecorations.find(
            nextBlock.pos,
            nextBlock.pos + nextBlock.node.nodeSize
          );
          if (staleDecorations.length > 0) {
            nextDecorations = nextDecorations.remove(staleDecorations);
          }
          addedDecorations.push(
            ...createCodeBlockDecorations(nextBlock, highlighter, supportedLanguages)
          );
        }

        if (addedDecorations.length > 0) {
          nextDecorations = nextDecorations.add(newState.doc, addedDecorations);
        }

        return {
          decorations: nextDecorations,
          blocks: nextBlocks
        };
      }
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      }
    }
  });
});
