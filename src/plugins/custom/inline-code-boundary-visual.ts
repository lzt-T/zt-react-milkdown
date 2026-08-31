import type { Mark } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view';
import {
  resolveInlineCodeElementAtBoundary,
  type InlineCodeBoundarySide
} from './inline-code-boundary-dom';
import {
  inlineCodeBoundaryNavigationPluginKey,
  type InlineCodeBoundaryVisualState
} from './inline-code-boundary-state';

// 行内代码 mark 类型名。
const INLINE_CODE_MARK_NAME = 'inlineCode';
// 行内代码边界指示线类名。
const INLINE_CODE_BOUNDARY_INDICATOR_CLASS_NAME = 'zt-md-inline-code-boundary-indicator';
// 行内代码边界指示线 widget key。
const INLINE_CODE_BOUNDARY_INDICATOR_WIDGET_KEY = 'zt-md-inline-code-boundary-indicator-widget';
// 行内代码边界激活状态根元素类名。
export const INLINE_CODE_BOUNDARY_ACTIVE_CLASS_NAME = 'zt-md-inline-code-boundary-active';
// 行内代码外部方向对应的 widget side。
const INLINE_CODE_OUTSIDE_WIDGET_SIDE_MAP: Readonly<Record<InlineCodeBoundarySide, -1 | 1>> = {
  left: -1,
  right: 1
};
// 行内代码边界方向对应的 DOM 查询偏向。
const INLINE_CODE_BOUNDARY_DOM_BIAS_MAP: Readonly<Record<InlineCodeBoundarySide, -1 | 1>> = {
  left: 1,
  right: -1
};

/**
 * 创建行内代码边界指示线元素。
 */
const createInlineCodeBoundaryIndicator = (
  visualState: InlineCodeBoundaryVisualState
): HTMLElement => {
  // 不参与编辑和无障碍朗读的指示线元素。
  const indicator = document.createElement('span');
  indicator.className = INLINE_CODE_BOUNDARY_INDICATOR_CLASS_NAME;
  indicator.dataset.side = visualState.side;
  indicator.dataset.placement = visualState.placement;
  indicator.contentEditable = 'false';
  indicator.setAttribute('aria-hidden', 'true');
  return indicator;
};

/**
 * 解析边界指示线应继承的 mark 集合。
 */
const resolveInlineCodeBoundaryIndicatorMarks = (
  state: EditorState,
  visualState: InlineCodeBoundaryVisualState
): readonly Mark[] | null => {
  if (visualState.placement === 'outside') {
    return [];
  }

  // 行内代码 mark 类型。
  const inlineCodeMarkType = state.schema.marks[INLINE_CODE_MARK_NAME];
  // 边界右侧的行内代码节点。
  const nodeAfter = state.doc.resolve(visualState.position).nodeAfter;
  // 相邻节点携带的真实行内代码 mark。
  const inlineCodeMark = nodeAfter && inlineCodeMarkType
    ? inlineCodeMarkType.isInSet(nodeAfter.marks)
    : null;
  return inlineCodeMark ? [inlineCodeMark] : null;
};

/**
 * 创建当前行内代码边界指示线装饰集合。
 */
export const createInlineCodeBoundaryDecorations = (state: EditorState): DecorationSet => {
  // 当前行内代码边界视觉状态。
  const visualState = inlineCodeBoundaryNavigationPluginKey.getState(state);
  if (!visualState) {
    return DecorationSet.empty;
  }

  // 指示线应继承的 mark 集合。
  const indicatorMarks = resolveInlineCodeBoundaryIndicatorMarks(state, visualState);
  if (!indicatorMarks) {
    return DecorationSet.empty;
  }

  // 当前视觉状态对应的 widget side。
  const widgetSide = visualState.placement === 'inside'
    ? 1
    : INLINE_CODE_OUTSIDE_WIDGET_SIDE_MAP[visualState.side];
  // 当前视觉状态对应的指示线元素。
  const indicator = createInlineCodeBoundaryIndicator(visualState);
  // 位于行内代码标签内部或外部的零宽指示线装饰。
  const indicatorDecoration = Decoration.widget(
    visualState.position,
    indicator,
    {
      side: widgetSide,
      marks: indicatorMarks,
      key: `${INLINE_CODE_BOUNDARY_INDICATOR_WIDGET_KEY}-${visualState.side}-${visualState.placement}`,
      ignoreSelection: true,
      relaxedSide: true
    }
  );
  return DecorationSet.create(state.doc, [indicatorDecoration]);
};

/**
 * 将外部指示光标校正到真实代码外框与相邻内容之间。
 */
export const alignInlineCodeOutsideIndicator = (
  view: EditorView,
  visualState: InlineCodeBoundaryVisualState | null
): void => {
  if (visualState?.placement !== 'outside') {
    return;
  }

  // 当前外部指示光标元素。
  const indicator = view.dom.querySelector<HTMLElement>(
    `.${INLINE_CODE_BOUNDARY_INDICATOR_CLASS_NAME}[data-side='${visualState.side}'][data-placement='outside']`
  );
  // 当前边界对应的 DOM 查询偏向。
  const domBias = INLINE_CODE_BOUNDARY_DOM_BIAS_MAP[visualState.side];
  // 当前边界相邻的真实代码元素。
  const codeElement = resolveInlineCodeElementAtBoundary(view, visualState.position, domBias);
  if (!indicator || !codeElement) {
    return;
  }

  // 指示光标未偏移时的视口横坐标。
  const indicatorLeft = indicator.getBoundingClientRect().left;
  // 代码元素的视口外框。
  const codeRect = codeElement.getBoundingClientRect();
  // 外部指示线在 2px 间距内的目标横坐标。
  const targetLeft = visualState.side === 'left'
    ? codeRect.left - 1
    : codeRect.right + 1;
  // 指示光标到目标位置的水平偏移。
  const horizontalOffset = Math.round(targetLeft - indicatorLeft);
  indicator.style.setProperty(
    '--zt-md-inline-code-boundary-offset-x',
    `${horizontalOffset}px`
  );
};
