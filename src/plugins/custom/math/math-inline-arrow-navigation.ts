import type { Node as ProseNode } from '@milkdown/prose/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type Selection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { openMathInlineEditor } from './math-inline-edit-plugin';

/**
 * math_inline 节点类型名。
 */
const MATH_INLINE_NODE_NAME = 'math_inline';
/**
 * 行内公式方向键导航插件 key。
 */
const MATH_INLINE_ARROW_NAVIGATION_PLUGIN_KEY = 'zt-md-math-inline-arrow-navigation';
/**
 * 方向键对应的选择偏移配置。
 */
const ARROW_NAVIGATION_DIRECTION_MAP: Record<string, { positionKey: 'from' | 'to' }> = {
  ArrowLeft: { positionKey: 'from' },
  ArrowRight: { positionKey: 'to' }
};

/**
 * 方向键进入行内公式编辑时的光标落点映射。
 */
const ARROW_TO_CARET_POSITION_MAP: Record<string, 'start' | 'end'> = {
  ArrowLeft: 'end',
  ArrowRight: 'start'
};
/**
 * 删除键对应的相邻节点方向。
 */
const DELETE_BOUNDARY_DIRECTION_MAP: Record<string, 'before' | 'after'> = {
  Backspace: 'before',
  Delete: 'after'
};

/**
 * 判断事件目标是否位于行内公式编辑控件内。
 */
const isInsideMathInlineEditor = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('.zt-md-math-inline-editor'));
};

/**
 * 判断节点是否为行内公式。
 */
const isMathInlineNode = (node: ProseNode | null | undefined): node is ProseNode => {
  return node?.type.name === MATH_INLINE_NODE_NAME;
};

/**
 * 判断键盘事件是否应跳过行内公式删除处理。
 */
const shouldSkipMathInlineDeletion = (event: KeyboardEvent): boolean => {
  return (
    !DELETE_BOUNDARY_DIRECTION_MAP[event.key] ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isInsideMathInlineEditor(event.target) ||
    isInsideMathInlineEditor(document.activeElement)
  );
};

/**
 * 处理行内公式选中态下的左右方向键落点。
 */
const handleMathInlineArrowNavigation = (view: EditorView, event: KeyboardEvent): boolean => {
  // 当前方向配置。
  const direction = ARROW_NAVIGATION_DIRECTION_MAP[event.key];
  if (!direction || isInsideMathInlineEditor(event.target)) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== MATH_INLINE_NODE_NAME) {
    return false;
  }

  event.preventDefault();
  // 选中态下直接进入行内公式编辑，避免再退回文本光标。
  openMathInlineEditor(view, selection.from, { caret: ARROW_TO_CARET_POSITION_MAP[event.key] ?? 'end' });
  return true;
};

/**
 * 处理光标位于行内公式边界时的方向键进入编辑。
 */
const handleMathInlineArrowOpen = (view: EditorView, event: KeyboardEvent): boolean => {
  // 当前方向配置。
  const direction = ARROW_NAVIGATION_DIRECTION_MAP[event.key];
  if (!direction || isInsideMathInlineEditor(event.target)) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 当前光标位置。
  const resolvedPosition = selection.$from;
  // 相邻节点。
  const adjacentNode = direction.positionKey === 'from' ? resolvedPosition.nodeBefore : resolvedPosition.nodeAfter;
  if (!isMathInlineNode(adjacentNode)) {
    return false;
  }

  event.preventDefault();
  // 相邻行内公式起始位置。
  const mathInlinePosition =
    direction.positionKey === 'from' ? selection.from - adjacentNode.nodeSize : selection.from;
  openMathInlineEditor(view, mathInlinePosition, { caret: ARROW_TO_CARET_POSITION_MAP[event.key] ?? 'end' });
  return true;
};

/**
 * 创建删除行内公式后的稳定文本选区。
 */
const createStableTextSelection = (doc: ProseNode, position: number): Selection => {
  try {
    return TextSelection.create(doc, position);
  } catch {
    // 精确位置不可用时，优先向左寻找同一上下文附近的文本落点。
    return TextSelection.near(doc.resolve(position), -1);
  }
};

/**
 * 删除已选中的行内公式节点并稳定光标落点。
 */
const deleteSelectedMathInlineNode = (view: EditorView, selection: NodeSelection, event: KeyboardEvent): boolean => {
  event.preventDefault();
  // 删除后的光标候选位置。
  const selectionPosition = selection.from;
  // 删除行内公式的事务。
  const transaction = view.state.tr.delete(selection.from, selection.to);
  // 文档最大可解析位置。
  const maxPosition = transaction.doc.content.size;
  // 删除后安全落点。
  const safePosition = Math.min(selectionPosition, maxPosition);
  transaction.setSelection(createStableTextSelection(transaction.doc, safePosition)).scrollIntoView();

  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 处理光标紧贴行内公式边界时的删除键落点。
 */
const selectAdjacentMathInlineNode = (view: EditorView, event: KeyboardEvent): boolean => {
  // 删除方向。
  const direction = DELETE_BOUNDARY_DIRECTION_MAP[event.key];
  if (!direction) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 当前光标位置。
  const resolvedPosition = selection.$from;
  // 相邻节点。
  const adjacentNode = direction === 'before' ? resolvedPosition.nodeBefore : resolvedPosition.nodeAfter;
  if (!isMathInlineNode(adjacentNode)) {
    return false;
  }

  event.preventDefault();
  // 相邻行内公式起始位置。
  const mathInlinePosition =
    direction === 'before' ? selection.from - adjacentNode.nodeSize : selection.from;
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(view.state.doc, mathInlinePosition))
      .scrollIntoView()
  );
  view.focus();
  return true;
};

/**
 * 处理行内公式删除边界。
 */
const handleMathInlineDeletion = (view: EditorView, event: KeyboardEvent): boolean => {
  if (shouldSkipMathInlineDeletion(event)) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (selection instanceof NodeSelection && isMathInlineNode(selection.node)) {
    return deleteSelectedMathInlineNode(view, selection, event);
  }

  return selectAdjacentMathInlineNode(view, event);
};

/**
 * 处理行内公式选中态下的普通文本输入落点。
 */
const handleMathInlineTextInput = (view: EditorView, text: string): boolean => {
  if (isInsideMathInlineEditor(document.activeElement)) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== MATH_INLINE_NODE_NAME) {
    return false;
  }

  // 目标插入位置。
  const insertPosition = selection.to;
  // 插入后的光标位置。
  const nextSelectionPosition = insertPosition + text.length;
  // 文本插入事务。
  const transaction = view.state.tr.insertText(text, insertPosition, insertPosition);
  transaction.setSelection(TextSelection.create(transaction.doc, nextSelectionPosition)).scrollIntoView();

  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 行内公式方向键导航插件。
 */
export const mathInlineArrowNavigationPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey(MATH_INLINE_ARROW_NAVIGATION_PLUGIN_KEY),
    props: {
      handleKeyDown: (view, event) => {
        if (handleMathInlineArrowOpen(view as EditorView, event)) {
          return true;
        }

        if (handleMathInlineDeletion(view as EditorView, event)) {
          return true;
        }

        return handleMathInlineArrowNavigation(view as EditorView, event);
      },
      handleTextInput: (view, _from, _to, text) => {
        return handleMathInlineTextInput(view as EditorView, text);
      }
    }
  });
});
