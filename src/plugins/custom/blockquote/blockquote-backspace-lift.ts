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
 * 判断当前编辑器视图是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 判断是否应跳过 Backspace 处理。
 */
const shouldSkipKeydown = (view: EditorView, event: KeyboardEvent): boolean => {
  return (
    event.key !== BACKSPACE_KEY ||
    event.isComposing ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !isEditorViewEditable(view)
  );
};

/**
 * 解析“当前光标是否位于引用块直接首段行首”。
 */
const resolveBlockquoteStartContext = (
  resolvedPosition: ResolvedPos
): { blockquoteType: NodeType } | null => {
  // 仅当段落是引用块的直接首个子节点时才触发提升，避免把嵌套列表等子结构整块抬出引用块。
  if (
    resolvedPosition.parent.type.name !== PARAGRAPH_NODE_NAME ||
    resolvedPosition.parentOffset !== 0 ||
    resolvedPosition.depth < 2
  ) {
    return null;
  }

  // 直接父节点深度与节点。
  const blockquoteDepth = resolvedPosition.depth - 1;
  const parentNode = resolvedPosition.node(blockquoteDepth);
  if (
    parentNode.type.name !== BLOCKQUOTE_NODE_NAME ||
    resolvedPosition.index(blockquoteDepth) !== 0
  ) {
    return null;
  }

  return {
    blockquoteType: parentNode.type
  };
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
        const editorView = view as EditorView;
        if (shouldSkipKeydown(editorView, event)) {
          return false;
        }

        return handleBackspaceLiftBlockquote(editorView, event);
      }
    }
  });
});
