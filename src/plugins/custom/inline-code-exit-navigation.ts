import type { MarkType } from '@milkdown/prose/model';
import { PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import {
  placeCaretInsideInlineCodeEnd,
  type InlineCodeBoundarySide
} from './inline-code-boundary-dom';
import type { InlineCodeBoundaryVisualState } from './inline-code-boundary-state';

/** 行内代码方向键。 */
type InlineCodeArrowKey = 'ArrowLeft' | 'ArrowRight';

/** 行内代码退出状态的方向键规则。 */
interface InlineCodeExitKeyRule {
  /** 返回标签内部的方向键。 */
  inwardKey: InlineCodeArrowKey;
  /** 继续向标签外部移动的方向键。 */
  outwardKey: InlineCodeArrowKey;
}

// 行内代码退出方向对应的方向键规则。
const INLINE_CODE_EXIT_KEY_RULE_MAP: Readonly<
  Record<InlineCodeBoundarySide, InlineCodeExitKeyRule>
> = {
  left: {
    inwardKey: 'ArrowRight',
    outwardKey: 'ArrowLeft'
  },
  right: {
    inwardKey: 'ArrowLeft',
    outwardKey: 'ArrowRight'
  }
};
// 行内代码退出方向对应的相邻节点属性。
const INLINE_CODE_EXIT_ADJACENT_NODE_KEY_MAP = {
  left: 'nodeAfter',
  right: 'nodeBefore'
} as const satisfies Readonly<Record<InlineCodeBoundarySide, 'nodeAfter' | 'nodeBefore'>>;

/**
 * 清除行内代码边界视觉状态。
 */
const clearInlineCodeBoundaryVisualState = (
  view: EditorView,
  pluginKey: PluginKey<InlineCodeBoundaryVisualState | null>
): void => {
  view.dispatch(view.state.tr.setMeta(pluginKey, null));
};

/**
 * 处理标签内开头状态下的左右方向键。
 */
const handleInlineCodeInsideNavigation = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType,
  visualState: InlineCodeBoundaryVisualState,
  pluginKey: PluginKey<InlineCodeBoundaryVisualState | null>
): boolean => {
  if (event.key === 'ArrowRight') {
    clearInlineCodeBoundaryVisualState(view, pluginKey);
    return false;
  }

  if (event.key !== 'ArrowLeft') {
    return false;
  }

  event.preventDefault();
  // 当前显式输入 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  // 移除行内代码后的普通文本 mark 集合。
  const nextStoredMarks = activeMarks.filter((mark) => mark.type !== inlineCodeMarkType);
  view.dispatch(
    view.state.tr
      .setStoredMarks(nextStoredMarks)
      .setMeta(pluginKey, {
        ...visualState,
        placement: 'outside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  return true;
};

/**
 * 处理行内代码边界视觉状态下的方向键导航。
 */
export const handleInlineCodeBoundaryVisualNavigation = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType,
  visualState: InlineCodeBoundaryVisualState,
  pluginKey: PluginKey<InlineCodeBoundaryVisualState | null>
): boolean => {
  if (visualState.placement === 'inside') {
    return handleInlineCodeInsideNavigation(
      view,
      event,
      inlineCodeMarkType,
      visualState,
      pluginKey
    );
  }

  // 当前退出方向对应的方向键规则。
  const keyRule = INLINE_CODE_EXIT_KEY_RULE_MAP[visualState.side];
  if (event.key === keyRule.outwardKey) {
    clearInlineCodeBoundaryVisualState(view, pluginKey);
    return false;
  }

  if (event.key !== keyRule.inwardKey) {
    return false;
  }

  if (visualState.side === 'right' && visualState.requiresInwardConfirmation) {
    event.preventDefault();
    view.dispatch(
      view.state.tr.setMeta(pluginKey, {
        ...visualState,
        requiresInwardConfirmation: false
      } satisfies InlineCodeBoundaryVisualState)
    );
    return true;
  }

  // 当前退出侧紧邻行内代码的节点属性。
  const adjacentNodeKey = INLINE_CODE_EXIT_ADJACENT_NODE_KEY_MAP[visualState.side];
  // 当前退出侧紧邻的文档节点。
  const adjacentNode = view.state.selection.$from[adjacentNodeKey];
  // 相邻节点携带的真实行内代码 mark。
  const inlineCodeMark = adjacentNode
    ? inlineCodeMarkType.isInSet(adjacentNode.marks)
    : null;
  if (!inlineCodeMark) {
    clearInlineCodeBoundaryVisualState(view, pluginKey);
    return false;
  }

  event.preventDefault();
  // 当前显式输入 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  // 恢复行内代码后的显式输入 mark 集合。
  const nextStoredMarks = inlineCodeMark.addToSet(activeMarks);
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, visualState.position))
      .setStoredMarks(nextStoredMarks)
      .setMeta(
        pluginKey,
        visualState.side === 'left'
          ? {
              ...visualState,
              placement: 'inside'
            } satisfies InlineCodeBoundaryVisualState
          : null
      )
  );
  if (visualState.side === 'right') {
    placeCaretInsideInlineCodeEnd(view, visualState.position);
  }
  return true;
};
