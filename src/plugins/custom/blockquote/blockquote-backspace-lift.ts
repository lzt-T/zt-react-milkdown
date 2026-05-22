import type { NodeType, ResolvedPos } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { liftTarget } from '@milkdown/prose/transform';
import { $prose } from '@milkdown/utils';

// 引用块节点类型名。
const BLOCKQUOTE_NODE_NAME = 'blockquote';
// 段落节点类型名。
const PARAGRAPH_NODE_NAME = 'paragraph';
// 仅处理 Backspace 按键。
const BACKSPACE_KEY = 'Backspace';

/**
 * 判断是否应跳过 Backspace 处理。
 */
const shouldSkipKeydown = (event: KeyboardEvent): boolean => {
  return (
    event.key !== BACKSPACE_KEY ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  );
};

/**
 * 解析“当前光标是否位于引用块首段行首”。
 */
const resolveBlockquoteStartContext = (
  resolvedPosition: ResolvedPos
): { paragraphDepth: number; blockquoteDepth: number; blockquoteType: NodeType } | null => {
  if (resolvedPosition.parent.type.name !== PARAGRAPH_NODE_NAME || resolvedPosition.parentOffset !== 0) {
    return null;
  }

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    const nodeAtDepth = resolvedPosition.node(depth);
    if (nodeAtDepth.type.name !== BLOCKQUOTE_NODE_NAME) {
      continue;
    }

    const paragraphDepth = resolvedPosition.depth;
    const paragraphIndexInBlockquote = resolvedPosition.index(depth);
    if (paragraphDepth <= depth || paragraphIndexInBlockquote !== 0) {
      return null;
    }

    return {
      paragraphDepth,
      blockquoteDepth: depth,
      blockquoteType: nodeAtDepth.type
    };
  }

  return null;
};

/**
 * 处理“引用块首段行首 Backspace 退回普通段落”。
 */
const handleBackspaceLiftBlockquote = (view: EditorView, event: KeyboardEvent): boolean => {
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  const resolvedPosition = selection.$from;
  const context = resolveBlockquoteStartContext(resolvedPosition);
  if (!context) {
    return false;
  }

  const paragraphBlockRange = resolvedPosition.blockRange(resolvedPosition, (node) => {
    return node.type === context.blockquoteType;
  });
  if (!paragraphBlockRange) {
    return false;
  }

  const target = liftTarget(paragraphBlockRange);
  if (target === null) {
    return false;
  }

  event.preventDefault();
  const transaction = view.state.tr.lift(paragraphBlockRange, target).scrollIntoView();
  view.dispatch(transaction);
  return true;
};

/**
 * 引用块 Backspace 提升插件：支持在引用块首段行首回退为普通段落。
 */
export const blockquoteBackspaceLiftPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('zt-md-blockquote-backspace-lift'),
    props: {
      handleKeyDown: (view, event) => {
        if (shouldSkipKeydown(event)) {
          return false;
        }

        return handleBackspaceLiftBlockquote(view as EditorView, event);
      }
    }
  });
});
