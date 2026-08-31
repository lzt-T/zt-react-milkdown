import type { Mark, MarkType, Node as ProseMirrorNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import {
  placeCaretAtInlineCodeBoundary,
  placeCaretInsideInlineCodeEnd,
  resolveInlineCodeElementAtBoundary
} from './inline-code-boundary-dom';
import {
  resolveInlineCodeEndMark,
  resolveInlineCodeStartMark
} from './inline-code-boundary-mark';
import {
  inlineCodeBoundaryNavigationPluginKey,
  type InlineCodeBoundaryVisualState
} from './inline-code-boundary-state';

// 行内代码 mark 类型名。
const INLINE_CODE_MARK_NAME = 'inlineCode';
// 行内代码右侧外部间距宽度。
const INLINE_CODE_RIGHT_OUTSIDE_GAP_WIDTH = 2;

/** 行内代码右边界鼠标上下文。 */
interface InlineCodeEndBoundaryContext {
  /** 归一化后的共享边界位置。 */
  boundaryPosition: number;
  /** 左侧节点携带的真实行内代码 mark。 */
  inlineCodeMark: Mark;
  /** 共享边界右侧的普通文本节点。 */
  rightPlainTextNode: ProseMirrorNode | null;
  /** 共享边界左侧的真实代码元素。 */
  codeElement: HTMLElement;
}

/**
 * 从鼠标坐标位置及紧邻位置解析唯一的行内代码右边界。
 */
const resolveInlineCodeEndBoundaryContext = (
  view: EditorView,
  coordinatePosition: number,
  clientX: number,
  markType: MarkType
): InlineCodeEndBoundaryContext | null => {
  // 鼠标位置及其左侧的候选文档位置。
  const candidatePositions = coordinatePosition > 0
    ? [coordinatePosition, coordinatePosition - 1]
    : [coordinatePosition];

  for (const [candidateIndex, boundaryPosition] of candidatePositions.entries()) {
    // 候选位置左侧节点携带的真实行内代码 mark。
    const inlineCodeMark = resolveInlineCodeEndMark(view, boundaryPosition, markType);
    if (!inlineCodeMark) {
      continue;
    }

    // 候选边界对应的文档位置。
    const resolvedPosition = view.state.doc.resolve(boundaryPosition);
    // 候选边界右侧的普通文本节点。
    const rightPlainTextNode = resolvedPosition.nodeAfter;
    if (rightPlainTextNode !== null && !rightPlainTextNode.isText) {
      continue;
    }

    // 候选边界左侧的真实代码元素。
    const codeElement = resolveInlineCodeElementAtBoundary(view, boundaryPosition, -1);
    if (!codeElement) {
      continue;
    }

    // 真实代码元素的视口外框。
    const codeRect = codeElement.getBoundingClientRect();
    // 相邻候选仅允许吸附代码外框右侧的 2px 连接区。
    const isAdjacentCandidateInGap = clientX <= (
      codeRect.right + INLINE_CODE_RIGHT_OUTSIDE_GAP_WIDTH
    );
    if (candidateIndex > 0 && !isAdjacentCandidateInGap) {
      continue;
    }

    return {
      boundaryPosition,
      inlineCodeMark,
      rightPlainTextNode,
      codeElement
    };
  }

  return null;
};

/**
 * 判断点击是否属于已由鼠标固定的右侧外部边界。
 */
export const shouldPreserveInlineCodeRightPointerBoundary = (
  view: EditorView,
  position: number,
  event: MouseEvent,
  visualState: InlineCodeBoundaryVisualState | null
): boolean => {
  if (
    visualState?.side !== 'right' ||
    visualState.placement !== 'outside' ||
    !visualState.requiresInwardConfirmation
  ) {
    return false;
  }

  if (position === visualState.position) {
    return true;
  }

  if (position !== visualState.position + 1) {
    return false;
  }

  // 右侧外部状态相邻的真实代码元素。
  const codeElement = resolveInlineCodeElementAtBoundary(view, visualState.position, -1);
  if (!codeElement) {
    return false;
  }

  // 真实代码元素的视口外框。
  const codeRect = codeElement.getBoundingClientRect();
  return event.clientX >= codeRect.right && event.clientX <= (
    codeRect.right + INLINE_CODE_RIGHT_OUTSIDE_GAP_WIDTH
  );
};

/**
 * 在鼠标按下阶段固定行内代码左右边界的标签内外输入状态。
 */
export const handleInlineCodeMouseDown = (view: EditorView, event: MouseEvent): boolean => {
  if (
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !view.editable
  ) {
    return false;
  }

  // 鼠标坐标对应的文档位置。
  const coordinatePosition = view.posAtCoords({
    left: event.clientX,
    top: event.clientY
  });
  // 当前行内代码 mark 类型。
  const inlineCodeMarkType = view.state.schema.marks[INLINE_CODE_MARK_NAME];
  if (!coordinatePosition || !inlineCodeMarkType) {
    return false;
  }

  // 鼠标位置对应的共享边界。
  const boundaryPosition = coordinatePosition.pos;
  // 共享边界对应的文档位置。
  const resolvedPosition = view.state.doc.resolve(boundaryPosition);
  // 右侧节点携带的真实行内代码 mark。
  const startInlineCodeMark = resolveInlineCodeStartMark(
    view,
    boundaryPosition,
    inlineCodeMarkType
  );
  // 共享左边界左侧的普通文本节点。
  const leftPlainTextNode = resolvedPosition.nodeBefore;
  if (startInlineCodeMark && (!leftPlainTextNode || leftPlainTextNode.isText)) {
    // 共享左边界右侧的真实代码元素。
    const codeElement = resolveInlineCodeElementAtBoundary(view, boundaryPosition, 1);
    if (!codeElement) {
      return false;
    }

    // 真实代码元素的视口外框。
    const codeRect = codeElement.getBoundingClientRect();
    // 鼠标是否位于代码外框内部。
    const isInlineCodeSide = event.clientX >= codeRect.left;
    // 左侧普通文本输入 mark 集合。
    const plainTextMarks = (leftPlainTextNode?.marks ?? resolvedPosition.marks())
      .filter((mark) => mark.type !== inlineCodeMarkType);
    // 点击侧对应的显式输入 mark 集合。
    const nextStoredMarks = isInlineCodeSide
      ? startInlineCodeMark.addToSet(resolvedPosition.marks())
      : plainTextMarks;
    // 标签内点击对应的视觉状态。
    const visualState = isInlineCodeSide
      ? {
          position: boundaryPosition,
          side: 'left',
          placement: 'inside'
        } satisfies InlineCodeBoundaryVisualState
      : null;

    event.preventDefault();
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, boundaryPosition))
        .setStoredMarks(nextStoredMarks)
        .setMeta(inlineCodeBoundaryNavigationPluginKey, visualState)
    );
    view.focus();
    if (!isInlineCodeSide) {
      placeCaretAtInlineCodeBoundary(view, boundaryPosition, -1);
    }
    return true;
  }

  // 鼠标位置对应的行内代码右边界上下文。
  const endBoundaryContext = resolveInlineCodeEndBoundaryContext(
    view,
    boundaryPosition,
    event.clientX,
    inlineCodeMarkType
  );
  if (!endBoundaryContext) {
    return false;
  }

  // 归一化后的共享右边界位置。
  const normalizedBoundaryPosition = endBoundaryContext.boundaryPosition;
  // 共享右边界对应的文档位置。
  const normalizedResolvedPosition = view.state.doc.resolve(normalizedBoundaryPosition);

  // 真实代码元素的视口外框。
  const codeRect = endBoundaryContext.codeElement.getBoundingClientRect();
  // 鼠标是否位于代码外框右侧。
  const isPlainTextSide = event.clientX >= codeRect.right;
  // 右侧普通文本输入 mark 集合。
  const plainTextMarks = (
    endBoundaryContext.rightPlainTextNode?.marks ?? normalizedResolvedPosition.marks()
  )
    .filter((mark) => mark.type !== inlineCodeMarkType);
  // 点击侧对应的显式输入 mark 集合。
  const nextStoredMarks = isPlainTextSide
    ? plainTextMarks
    : endBoundaryContext.inlineCodeMark.addToSet(normalizedResolvedPosition.marks());
  // 普通文本侧点击对应的右侧外部视觉状态。
  const visualState = isPlainTextSide
    ? {
        position: normalizedBoundaryPosition,
        side: 'right',
        placement: 'outside',
        requiresInwardConfirmation: true
      } satisfies InlineCodeBoundaryVisualState
    : null;

  event.preventDefault();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, normalizedBoundaryPosition))
      .setStoredMarks(nextStoredMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, visualState)
  );
  view.focus();
  if (!isPlainTextSide) {
    placeCaretInsideInlineCodeEnd(view, normalizedBoundaryPosition);
  }
  return true;
};
