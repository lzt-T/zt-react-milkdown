import type { Mark, MarkType } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';

/**
 * 判断 mark 集合是否包含指定类型。
 */
export const hasMarkType = (marks: readonly Mark[], markType: MarkType): boolean => {
  return Boolean(markType.isInSet(marks));
};

/**
 * 解析指定位置右侧的真实行内代码 mark。
 */
export const resolveInlineCodeStartMark = (
  view: EditorView,
  position: number,
  markType: MarkType
): Mark | null => {
  // 指定文档位置。
  const resolvedPosition = view.state.doc.resolve(position);
  // 指定位置左侧节点。
  const nodeBefore = resolvedPosition.nodeBefore;
  // 指定位置右侧节点。
  const nodeAfter = resolvedPosition.nodeAfter;
  if (
    !nodeAfter ||
    hasMarkType(nodeBefore?.marks ?? [], markType) ||
    !hasMarkType(nodeAfter.marks, markType)
  ) {
    return null;
  }

  return markType.isInSet(nodeAfter.marks);
};

/**
 * 解析指定位置左侧的真实行内代码 mark。
 */
export const resolveInlineCodeEndMark = (
  view: EditorView,
  position: number,
  markType: MarkType
): Mark | null => {
  // 指定文档位置。
  const resolvedPosition = view.state.doc.resolve(position);
  // 指定位置左侧节点。
  const nodeBefore = resolvedPosition.nodeBefore;
  // 指定位置右侧节点。
  const nodeAfter = resolvedPosition.nodeAfter;
  if (
    !nodeBefore ||
    !hasMarkType(nodeBefore.marks, markType) ||
    hasMarkType(nodeAfter?.marks ?? [], markType)
  ) {
    return null;
  }

  return markType.isInSet(nodeBefore.marks);
};
