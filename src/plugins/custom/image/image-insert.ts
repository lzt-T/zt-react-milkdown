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

/** 判断原始选区之后是否还存在真实后续内容或后续块。 */
const hasContentAfterSelection = (selection: Selection): boolean => {
  // 当前光标所在父块。
  const parentNode = selection.$to.parent;
  // 当前选区结束后在父块内是否仍有文本内容。
  const hasTextAfterInParent = selection.$to.parentOffset < parentNode.content.size;
  if (hasTextAfterInParent) {
    return true;
  }

  if (selection.$to.depth < 1) {
    return false;
  }

  // 当前顶层块容器。
  const blockContainer = selection.$to.node(selection.$to.depth - 1);
  // 当前块在父容器中的索引。
  const currentBlockIndex = selection.$to.index(selection.$to.depth - 1);
  return currentBlockIndex < blockContainer.childCount - 1;
};

/** 解析事务文档中的真实图片节点位置。 */
const resolveImageNodePosition = (doc: ProseNode, candidatePosition: number): number | null => {
  // 候选位置集合，优先使用计算出的图片起点，再尝试相邻位置兜底。
  const positionCandidates = [candidatePosition, candidatePosition - 1, candidatePosition + 1];

  for (const position of positionCandidates) {
    if (position < 0 || position > doc.content.size) {
      continue;
    }

    // 当前候选位置上的节点。
    const node = doc.nodeAt(position);
    if (node?.type.name === 'image') {
      return position;
    }
  }

  return null;
};

/** 基于真实图片节点位置创建稳定的节点选区。 */
const createImageNodeSelection = (
  transaction: Transaction,
  imageNodeSize: number
): NodeSelection | null => {
  // replaceSelectionWith 后的选区通常位于图片节点后方。
  const candidateImagePosition = transaction.selection.from - imageNodeSize;
  // 事务文档中的真实图片起始位置。
  const imagePosition = resolveImageNodePosition(transaction.doc, candidateImagePosition);
  return imagePosition === null ? null : NodeSelection.create(transaction.doc, imagePosition);
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

  // 插入前是否存在真实后续内容。
  const shouldKeepFollowingContent = hasContentAfterSelection(selection);
  // 图片插入事务。
  const transaction = view.state.tr.setSelection(selection).replaceSelectionWith(imageNode);
  // 图片后方位置。
  const imageAfterPosition = transaction.selection.to;
  if (!shouldKeepFollowingContent) {
    // 图片后方承接空段落。
    const trailingParagraph = createParagraphNode(view);
    if (trailingParagraph) {
      transaction.insert(imageAfterPosition, trailingParagraph);
    }
  }

  // 当前图片节点选区。
  const imageSelection = createImageNodeSelection(transaction, imageNode.nodeSize);
  if (!imageSelection) {
    return false;
  }

  transaction.setSelection(imageSelection).scrollIntoView();
  view.dispatch(transaction);
  return true;
};
