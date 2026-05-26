import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 图片节点类型名。
const IMAGE_NODE_NAME = 'image';
// 删除键与相邻节点方向映射。
const DELETE_BOUNDARY_DIRECTION_MAP: Record<string, 'before' | 'after'> = {
  Backspace: 'before',
  Delete: 'after'
};

/**
 * 判断当前编辑器是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 判断事件目标是否位于图片内部交互控件内。
 */
const isInsideImageInteractiveElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('.zt-md-image-actions, .zt-md-image-resize-handle'));
};

/**
 * 判断节点是否为图片节点。
 */
const isImageNode = (node: ProseNode | null | undefined): node is ProseNode => {
  return node?.type.name === IMAGE_NODE_NAME;
};

/**
 * 判断是否应跳过图片删除处理。
 */
const shouldSkipImageDeletion = (view: EditorView, event: KeyboardEvent): boolean => {
  return (
    !DELETE_BOUNDARY_DIRECTION_MAP[event.key] ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !isEditorViewEditable(view) ||
    isInsideImageInteractiveElement(event.target) ||
    isInsideImageInteractiveElement(document.activeElement)
  );
};

/**
 * 解析“当前块同级上一块是否为图片节点”。
 */
const resolvePreviousImageBlock = (
  resolvedPosition: ResolvedPos
): { previousBlockStart: number } | null => {
  // 仅在空段落行首触发，避免误删普通内容段落。
  if (resolvedPosition.parent.type.name !== 'paragraph' || resolvedPosition.parentOffset !== 0) {
    return null;
  }
  if (resolvedPosition.parent.textContent.length > 0 || resolvedPosition.depth < 1) {
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
  if (!isImageNode(previousBlock)) {
    return null;
  }

  // 当前块起始位置（节点左边界）。
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  return {
    previousBlockStart: currentBlockStart - previousBlock.nodeSize
  };
};

/**
 * 创建删除图片后的稳定文本选区。
 */
const createStableTextSelection = (doc: ProseNode, position: number): TextSelection => {
  try {
    return TextSelection.create(doc, position);
  } catch {
    return TextSelection.near(doc.resolve(position), -1);
  }
};

/**
 * 删除已选中的图片节点并稳定光标落点。
 */
const deleteSelectedImageNode = (view: EditorView, selection: NodeSelection, event: KeyboardEvent): boolean => {
  event.preventDefault();
  // 删除后的光标候选位置。
  const selectionPosition = selection.from;
  // 删除图片节点事务。
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
 * 处理图片下方空段落行首 Backspace，删除空段落并选中上一张图片。
 */
const selectImageFromTrailingEmptyParagraph = (view: EditorView, event: KeyboardEvent): boolean => {
  if (event.key !== 'Backspace') {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 当前解析位置。
  const resolvedPosition = selection.$from;
  // 命中的上一张图片节点及起始位置。
  const previousImageBlock = resolvePreviousImageBlock(resolvedPosition);
  if (!previousImageBlock) {
    return false;
  }

  // 当前空段落起始位置。
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  // 当前空段落结束位置。
  const currentBlockEnd = currentBlockStart + resolvedPosition.parent.nodeSize;

  event.preventDefault();
  // 删除当前空段落并选中上一张图片。
  const transaction = view.state.tr;
  transaction.delete(currentBlockStart, currentBlockEnd);
  transaction.setSelection(NodeSelection.create(transaction.doc, previousImageBlock.previousBlockStart)).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 处理光标紧贴图片边界时的第一次删除按键，将图片切换为选中态。
 */
const selectAdjacentImageNode = (view: EditorView, event: KeyboardEvent): boolean => {
  if (selectImageFromTrailingEmptyParagraph(view, event)) {
    return true;
  }

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
  if (!isImageNode(adjacentNode)) {
    return false;
  }

  event.preventDefault();
  // 相邻图片起始位置。
  const imagePosition = direction === 'before' ? selection.from - adjacentNode.nodeSize : selection.from;
  view.dispatch(
    view.state.tr
      .setSelection(NodeSelection.create(view.state.doc, imagePosition))
      .scrollIntoView()
  );
  view.focus();
  return true;
};

/**
 * 处理图片两段式删除：第一次选中，第二次删除。
 */
const handleImageDeletion = (view: EditorView, event: KeyboardEvent): boolean => {
  if (shouldSkipImageDeletion(view, event)) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (selection instanceof NodeSelection && isImageNode(selection.node)) {
    return deleteSelectedImageNode(view, selection, event);
  }

  return selectAdjacentImageNode(view, event);
};

/**
 * 图片删除选中插件：支持 Backspace/Delete 两段式删除图片。
 */
export const imageDeleteSelectionPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('zt-md-image-delete-selection'),
    props: {
      handleKeyDown: (view, event) => {
        return handleImageDeletion(view as EditorView, event);
      }
    }
  });
});
