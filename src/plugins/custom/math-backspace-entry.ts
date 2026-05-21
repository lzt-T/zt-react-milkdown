import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { NodeSelection, Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 块级公式节点类型名。
const MATH_BLOCK_NODE_NAME = 'math_block';
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
 * 解析“当前块同级上一块是否为公式块”。
 */
const resolvePreviousMathBlock = (
  resolvedPosition: ResolvedPos
): { previousBlock: ProseNode; previousBlockStart: number } | null => {
  // 仅在段落行首触发，避免影响普通删除体验。
  if (resolvedPosition.parent.type.name !== 'paragraph' || resolvedPosition.parentOffset !== 0) {
    return null;
  }
  if (resolvedPosition.depth < 1) {
    return null;
  }

  // 当前块在其父容器中的索引。
  const currentBlockIndex = resolvedPosition.index(resolvedPosition.depth - 1);
  if (currentBlockIndex <= 0) {
    return null;
  }

  // 当前块容器。
  const blockContainer = resolvedPosition.node(resolvedPosition.depth - 1);
  // 当前块同级上一块节点。
  const previousBlock = blockContainer.child(currentBlockIndex - 1);
  if (previousBlock.type.name !== MATH_BLOCK_NODE_NAME) {
    return null;
  }

  // 当前块起始位置（节点左边界）。
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  return {
    previousBlock,
    previousBlockStart: currentBlockStart - previousBlock.nodeSize
  };
};

/**
 * 处理“公式块下一行行首 Backspace 进入公式编辑态”。
 */
const handleBackspaceIntoMathBlock = (view: EditorView, event: KeyboardEvent): boolean => {
  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 当前解析位置。
  const resolvedPosition = selection.$from;
  // 命中的上一块公式节点及起始位置。
  const targetMathBlock = resolvePreviousMathBlock(resolvedPosition);
  if (!targetMathBlock) {
    return false;
  }

  // 仅在空段落时删除当前块，避免误删有内容段落。
  const isCurrentParagraphEmpty = resolvedPosition.parent.textContent.length === 0;
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  const currentBlockEnd = currentBlockStart + resolvedPosition.parent.nodeSize;

  event.preventDefault();
  // 选中上一块公式节点，交由 NodeView.selectNode 进入编辑态。
  const transaction = view.state.tr;
  if (isCurrentParagraphEmpty) {
    transaction.delete(currentBlockStart, currentBlockEnd);
  }
  transaction.setSelection(NodeSelection.create(transaction.doc, targetMathBlock.previousBlockStart)).scrollIntoView();
  view.dispatch(transaction);
  // 这里不要再调用 view.focus，否则会覆盖 NodeView.selectNode 内部的 textarea.focus。
  return true;
};

/**
 * 公式块 Backspace 进入插件：支持从公式块下一行回退进入公式编辑态。
 */
export const mathBackspaceEntryPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('zt-md-math-backspace-entry'),
    props: {
      handleKeyDown: (view, event) => {
        if (shouldSkipKeydown(event)) {
          return false;
        }

        return handleBackspaceIntoMathBlock(view as EditorView, event);
      }
    }
  });
});
