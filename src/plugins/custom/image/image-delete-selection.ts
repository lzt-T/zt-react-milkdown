import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type Selection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 图片节点类型名。
const IMAGE_NODE_NAME = 'image';
// 段落节点类型名。
const PARAGRAPH_NODE_NAME = 'paragraph';
// 可向下透传查找末尾图片的容器节点名集合，避免穿过表格等其他独立块。
const TRAVERSABLE_CONTAINER_NODE_NAMES = new Set(['ordered_list', 'bullet_list', 'list_item', 'blockquote']);
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
    event.isComposing ||
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
 * 沿允许透传的容器末尾向下查找紧邻的图片节点起始位置。
 */
const resolveTrailingImageInBlock = (blockNode: ProseNode, blockStart: number): number | null => {
  // 当前正在检查的节点及其起始位置。
  let currentNode: ProseNode = blockNode;
  let currentStart = blockStart;

  while (true) {
    if (isImageNode(currentNode)) {
      return currentStart;
    }

    if (!TRAVERSABLE_CONTAINER_NODE_NAMES.has(currentNode.type.name) || currentNode.childCount === 0) {
      return null;
    }

    // 当前容器的最后一个子节点。
    const lastChild = currentNode.lastChild;
    if (!lastChild) {
      return null;
    }

    // 减去当前容器闭标签占用的一位偏移，得到末尾子节点的精确起点。
    currentStart = currentStart + currentNode.nodeSize - 1 - lastChild.nodeSize;
    currentNode = lastChild;
  }
};

/** 上一块图片命中及当前空段落待删除范围。 */
interface PreviousImageTarget {
  /** 命中的图片节点起始位置。 */
  previousImagePosition: number;
  /** 若当前段落完全为空，记录其待删除文档范围；非空时为 null。 */
  deleteRange: { from: number; to: number } | null;
}

/**
 * 解析“当前段落同级上一块（含列表/引用块末尾）是否为图片节点”。
 */
const resolvePreviousImageBlock = (
  resolvedPosition: ResolvedPos
): PreviousImageTarget | null => {
  // 仅在普通段落行首触发，避免拦截标题行首降级及列表/引用块首段退格。
  if (
    resolvedPosition.parent.type.name !== PARAGRAPH_NODE_NAME ||
    resolvedPosition.parentOffset !== 0 ||
    resolvedPosition.depth < 1
  ) {
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
  // 当前块起始位置（节点左边界）。
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  // 上一块起始位置。
  const previousBlockStart = currentBlockStart - previousBlock.nodeSize;
  // 命中的末尾图片位置。
  const previousImagePosition = resolveTrailingImageInBlock(previousBlock, previousBlockStart);
  if (previousImagePosition === null) {
    return null;
  }

  // 严格判断内容为空，避免误删包含行内图片或公式等非文本节点的段落。
  const deleteRange =
    resolvedPosition.parent.content.size === 0
      ? {
          from: currentBlockStart,
          to: currentBlockStart + resolvedPosition.parent.nodeSize
        }
      : null;

  return {
    previousImagePosition,
    deleteRange
  };
};

/**
 * 创建删除图片后的稳定文本选区。
 */
const createStableTextSelection = (doc: ProseNode, position: number): Selection => {
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
 * 处理图片下方段落行首 Backspace：若为空段落则一并删除，并将上一张图片切换为选中态。
 */
const selectImageFromParagraphStart = (view: EditorView, event: KeyboardEvent): boolean => {
  if (event.key !== 'Backspace') {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 命中的上一张图片节点及可选待删空段落范围。
  const previousImageTarget = resolvePreviousImageBlock(selection.$from);
  if (!previousImageTarget) {
    return false;
  }

  event.preventDefault();
  // 删除范围位于图片之后，先删除空段落不会影响 previousImagePosition。
  const transaction = view.state.tr;
  if (previousImageTarget.deleteRange) {
    transaction.delete(previousImageTarget.deleteRange.from, previousImageTarget.deleteRange.to);
  }
  transaction
    .setSelection(NodeSelection.create(transaction.doc, previousImageTarget.previousImagePosition))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 处理光标紧贴图片边界时的第一次删除按键，将图片切换为选中态。
 */
const selectAdjacentImageNode = (view: EditorView, event: KeyboardEvent): boolean => {
  if (selectImageFromParagraphStart(view, event)) {
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
  if (!adjacentNode) {
    return false;
  }

  // 待选中的相邻图片起始位置（向后退格支持透传列表与引用块末尾图片）。
  const imagePosition =
    direction === 'before'
      ? resolveTrailingImageInBlock(adjacentNode, selection.from - adjacentNode.nodeSize)
      : isImageNode(adjacentNode)
        ? selection.from
        : null;
  if (imagePosition === null) {
    return false;
  }

  event.preventDefault();
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
