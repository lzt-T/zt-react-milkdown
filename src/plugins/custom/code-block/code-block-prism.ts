import { findChildren } from '@milkdown/prose';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { refractor } from 'refractor';
import type { Refractor } from 'refractor/core';

/**
 * prism 语法节点结构。
 */
interface PrismAstNode {
  /** 节点类型。 */
  type: string;
  /** 文本节点内容。 */
  value?: string;
  /** 元素节点属性。 */
  properties?: {
    /** prism token 类名。 */
    className?: string[];
  };
  /** 子节点集合。 */
  children?: PrismAstNode[];
}

/**
 * 拉平后的 prism token。
 */
interface FlattenedPrismToken {
  /** token 文本内容。 */
  text: string;
  /** token 类名集合。 */
  className: string[];
}

// 代码块节点名称。
const CODE_BLOCK_NODE_NAME = 'code_block';

// prism 插件 key 名称。
const CODE_BLOCK_PRISM_PLUGIN_KEY = 'ZT_MD_CODE_BLOCK_PRISM';

/**
 * 将 prism 语法树拉平成可映射到 ProseMirror 文本位置的 token。
 */
const flattenPrismNodes = (nodes: PrismAstNode[], className: string[] = []): FlattenedPrismToken[] =>
  nodes.flatMap((node): FlattenedPrismToken[] => {
    if (node.type === 'element') {
      // 当前元素继承后的类名。
      const nextClassName = [...className, ...(node.properties?.className ?? [])];
      return flattenPrismNodes(node.children ?? [], nextClassName);
    }

    return [
      {
        text: node.value ?? '',
        className
      }
    ];
  });

/**
 * 判断语言是否被当前 refractor 支持。
 */
const isSupportedLanguage = (language: string, highlighter: Refractor): boolean => highlighter.listLanguages().includes(language);

/**
 * 基于代码块内容创建 prism 装饰集合。
 */
const createCodeBlockDecorations = (doc: ProseNode, highlighter: Refractor): DecorationSet => {
  // 当前文档装饰集合。
  const decorations: Decoration[] = [];

  findChildren((node) => node.type.name === CODE_BLOCK_NODE_NAME)(doc).forEach((block) => {
    // 当前代码块语言。
    const language = String(block.node.attrs.language ?? '');
    if (!language || !isSupportedLanguage(language, highlighter)) {
      return;
    }

    // 当前 token 起始位置。
    let from = block.pos + 1;
    // 当前代码块高亮语法树。
    const highlightedTree = highlighter.highlight(block.node.textContent, language) as { children: PrismAstNode[] };
    // 当前代码块 token 集合。
    const flattenedTokens = flattenPrismNodes(highlightedTree.children);
    flattenedTokens.forEach((token) => {
      // 当前 token 结束位置。
      const to = from + token.text.length;
      if (token.className.length > 0) {
        decorations.push(
          Decoration.inline(from, to, {
            class: token.className.join(' ')
          })
        );
      }

      from = to;
    });
  });

  return DecorationSet.create(doc, decorations);
};

/**
 * 提供代码块 prism 语法高亮。
 */
export const codeBlockPrismPlugin = $prose(() => {
  // prism 高亮器。
  const highlighter = refractor;

  return new Plugin({
    key: new PluginKey(CODE_BLOCK_PRISM_PLUGIN_KEY),
    state: {
      init: (_config, state) => createCodeBlockDecorations(state.doc, highlighter),
      apply: (transaction, decorationSet) => {
        if (transaction.docChanged) {
          return createCodeBlockDecorations(transaction.doc, highlighter);
        }

        return decorationSet.map(transaction.mapping, transaction.doc);
      }
    },
    props: {
      decorations(this: Plugin, state) {
        return this.getState(state);
      }
    }
  });
});
