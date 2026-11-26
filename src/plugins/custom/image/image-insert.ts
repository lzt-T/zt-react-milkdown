import type { Node as ProseNode } from '@milkdown/prose/model';
import { NodeSelection } from '@milkdown/prose/state';
import type { Selection, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

/** 定义图片插入参数。 */
export interface InsertImagePayload {
  /** 图片地址。 */
  src: string;
  /** 图片替代文本。 */
  alt: string;
  /** 图片标题。 */
  title: string;
}

/** 创建普通段落节点。 */
const createParagraphNode = (view: EditorView): ProseNode | null => {
  // 普通段落节点类型。
  const paragraphType = view.state.schema.nodes.paragraph;
  return paragraphType?.createAndFill() ?? null;
};

/** 创建图片节点。 */
const createImageNode = (view: EditorView, payload: InsertImagePayload): ProseNode | null => {
  // 图片节点类型。
  const imageType = view.state.schema.nodes.image;
  return imageType?.create(payload) ?? null;
};

/** 通过事务映射范围定位刚插入的图片节点位置。 */
const resolveInsertedImagePosition = (transaction: Transaction, imageNode: ProseNode): number | null => {
  // 事务变更映射在当前文档中的边界起点。
  let rangeStart = transaction.doc.content.size;
  // 事务变更映射在当前文档中的边界终点。
  let rangeEnd = 0;

  for (let index = 0; index < transaction.mapping.maps.length; index += 1) {
    // 当前步的位置映射。
    const stepMap = transaction.mapping.maps[index];
    // 后续步的组合映射，用于将当前步结果映射到最终文档。
    const remainingMapping = transaction.mapping.slice(index + 1);
    stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      rangeStart = Math.min(rangeStart, remainingMapping.map(newStart, -1));
      rangeEnd = Math.max(rangeEnd, remainingMapping.map(newEnd, 1));
    });
  }

  if (rangeStart > rangeEnd) {
    return null;
  }

  // 限制在文档有效范围内的遍历起止位置。
  const clampedStart = Math.max(0, rangeStart);
  const clampedEnd = Math.min(transaction.doc.content.size, rangeEnd);
  // 精确匹配当前图片节点实例的位置。
  let exactPosition: number | null = null;
  // 变更范围内首个图片节点的兜底位置。
  let fallbackPosition: number | null = null;

  transaction.doc.nodesBetween(clampedStart, clampedEnd, (node, position) => {
    if (node === imageNode) {
      exactPosition = position;
      return false;
    }

    if (fallbackPosition === null && node.type === imageNode.type) {
      fallbackPosition = position;
    }

    return exactPosition === null;
  });

  return exactPosition ?? fallbackPosition;
};

/** 判断文档指定位置之后是否仍存在后续内容或后续块。 */
const hasContentAfterPosition = (doc: ProseNode, position: number): boolean => {
  // 图片结束位置在文档中的解析结果。
  const resolvedPosition = doc.resolve(position);

  for (let depth = resolvedPosition.depth; depth >= 0; depth -= 1) {
    // 若当前层光标索引小于子节点数，说明后方仍有同级或外层后续节点。
    if (resolvedPosition.index(depth) < resolvedPosition.node(depth).childCount) {
      return true;
    }
  }

  return false;
};

/** 在文档末尾图片后补充空段落，便于用户继续在下方输入。 */
const insertTrailingParagraphIfNeeded = (
  view: EditorView,
  transaction: Transaction,
  imageAfterPosition: number
): void => {
  if (hasContentAfterPosition(transaction.doc, imageAfterPosition)) {
    return;
  }

  // 图片后方承接空段落。
  const trailingParagraph = createParagraphNode(view);
  if (!trailingParagraph) {
    return;
  }

  // 校验父容器在该位置是否允许直接插入段落节点。
  const resolvedAfter = transaction.doc.resolve(imageAfterPosition);
  if (!resolvedAfter.parent.canReplaceWith(resolvedAfter.index(), resolvedAfter.index(), trailingParagraph.type)) {
    return;
  }

  transaction.insert(imageAfterPosition, trailingParagraph);
};

/** 在指定选区插入图片节点。 */
export const insertImageNode = (
  view: EditorView,
  payload: InsertImagePayload,
  selection: Selection = view.state.selection
): boolean => {
  // 图片节点实例。
  const imageNode = createImageNode(view, payload);
  if (!imageNode) {
    return false;
  }

  // 图片插入事务。
  const transaction = view.state.tr.setSelection(selection).replaceSelectionWith(imageNode);
  // 事务文档中的真实图片起始位置。
  const imagePosition = resolveInsertedImagePosition(transaction, imageNode);
  if (imagePosition === null) {
    return false;
  }

  // imageAfterPosition 严格大于 imagePosition，后方插段落不会偏移图片起点。
  insertTrailingParagraphIfNeeded(view, transaction, imagePosition + imageNode.nodeSize);

  // 当前已插入的图片节点实例。
  const insertedNode = transaction.doc.nodeAt(imagePosition);
  if (insertedNode && NodeSelection.isSelectable(insertedNode)) {
    transaction.setSelection(NodeSelection.create(transaction.doc, imagePosition));
  }

  transaction.scrollIntoView();
  view.dispatch(transaction);
  return true;
};
