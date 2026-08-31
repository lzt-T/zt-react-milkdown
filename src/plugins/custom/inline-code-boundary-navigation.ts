import type { MarkType } from '@milkdown/prose/model';
import {
  Plugin,
  TextSelection,
  type Transaction
} from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { placeCaretAtInlineCodeBoundary } from './inline-code-boundary-dom';
import { handleInlineCodeBoundaryVisualNavigation } from './inline-code-exit-navigation';
import {
  hasMarkType,
  resolveInlineCodeEndMark,
  resolveInlineCodeStartMark
} from './inline-code-boundary-mark';
import { handleInlineCodeBoundaryClick } from './inline-code-boundary-mouse';
import {
  inlineCodeBoundaryNavigationPluginKey,
  type InlineCodeBoundaryVisualState
} from './inline-code-boundary-state';
import {
  alignInlineCodeOutsideIndicator,
  createInlineCodeBoundaryDecorations,
  INLINE_CODE_BOUNDARY_ACTIVE_CLASS_NAME
} from './inline-code-boundary-visual';

// 行内代码 mark 类型名。
const INLINE_CODE_MARK_NAME = 'inlineCode';

/**
 * 判断光标是否位于行内代码右边界。
 */
const isAtInlineCodeRightBoundary = (view: EditorView, markType: MarkType): boolean => {
  // 当前文本选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 光标左侧节点。
  const nodeBefore = selection.$from.nodeBefore;
  // 光标右侧节点。
  const nodeAfter = selection.$from.nodeAfter;
  return Boolean(
    nodeBefore &&
      hasMarkType(nodeBefore.marks, markType) &&
      (!nodeAfter || !hasMarkType(nodeAfter.marks, markType))
  );
};

/**
 * 判断光标是否位于行内代码左边界。
 */
const isAtInlineCodeLeftBoundary = (view: EditorView, markType: MarkType): boolean => {
  // 当前文本选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 光标左侧节点。
  const nodeBefore = selection.$from.nodeBefore;
  // 光标右侧节点。
  const nodeAfter = selection.$from.nodeAfter;
  return Boolean(
    nodeAfter &&
      hasMarkType(nodeAfter.marks, markType) &&
      (!nodeBefore || !hasMarkType(nodeBefore.marks, markType))
  );
};

/**
 * 将指定左边界切换到行内代码标签内开头。
 */
const enterInlineCodeStart = (
  view: EditorView,
  position: number,
  markType: MarkType
): boolean => {
  // 右侧节点携带的真实行内代码 mark。
  const inlineCodeMark = resolveInlineCodeStartMark(view, position, markType);
  if (!inlineCodeMark) {
    return false;
  }

  // 当前输入位置继承的 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.doc.resolve(position).marks();
  // 恢复行内代码后的显式输入 mark 集合。
  const nextStoredMarks = inlineCodeMark.addToSet(activeMarks);
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, position))
      .setStoredMarks(nextStoredMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, {
        position,
        side: 'left',
        placement: 'inside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  return true;
};

/**
 * 判断是否应跳过行内代码边界导航。
 */
const shouldSkipInlineCodeBoundaryNavigation = (
  view: EditorView,
  event: KeyboardEvent
): boolean => {
  return (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !view.editable
  );
};

/**
 * 解析从行内代码第一个字符返回标签内起点的位置。
 */
const resolveInlineCodeStartLandingPosition = (
  view: EditorView,
  markType: MarkType
): number | null => {
  // 当前文本选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return null;
  }

  // 光标左侧的行内内容片段。
  const nodeBefore = selection.$from.nodeBefore;
  if (!nodeBefore || !hasMarkType(nodeBefore.marks, markType)) {
    return null;
  }

  // 光标左侧片段包含的 Unicode 字符数量。
  const precedingCodePointCount = Array.from(nodeBefore.textContent).length;
  return precedingCodePointCount === 1
    ? selection.from - nodeBefore.nodeSize
    : null;
};

/**
 * 将左键从第一个字符稳定移动到标签内起点。
 */
const handleInlineCodeStartLanding = (
  view: EditorView,
  event: KeyboardEvent,
  markType: MarkType
): boolean => {
  if (event.key !== 'ArrowLeft') {
    return false;
  }

  // 标签内起点文档位置。
  const landingPosition = resolveInlineCodeStartLandingPosition(view, markType);
  if (landingPosition === null) {
    return false;
  }

  // 当前输入位置继承的 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  if (!hasMarkType(activeMarks, markType)) {
    return false;
  }

  event.preventDefault();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, landingPosition))
      .setStoredMarks(activeMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, {
        position: landingPosition,
        side: 'left',
        placement: 'inside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  return true;
};

/**
 * 处理行内代码左边界显式退出。
 */
const handleInlineCodeLeftExit = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
): boolean => {
  if (!isAtInlineCodeLeftBoundary(view, inlineCodeMarkType)) {
    return false;
  }

  // 当前输入位置继承的 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  if (!hasMarkType(activeMarks, inlineCodeMarkType)) {
    hideInlineCodeBoundaryIndicator(view);
    return false;
  }

  event.preventDefault();
  // 移除行内代码后的普通文本 mark 集合。
  const nextStoredMarks = activeMarks.filter((mark) => mark.type !== inlineCodeMarkType);
  view.dispatch(
    view.state.tr
      .setStoredMarks(nextStoredMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, {
        position: view.state.selection.from,
        side: 'left',
        placement: 'outside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  placeCaretAtInlineCodeBoundary(view, view.state.selection.from, -1);
  return true;
};

/**
 * 处理普通文本光标首次向左接近标签右侧边界。
 */
const handleInlineCodeEndApproach = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
): boolean => {
  if (event.key !== 'ArrowLeft' || !isAtInlineCodeRightBoundary(view, inlineCodeMarkType)) {
    return false;
  }

  // 当前输入位置继承的 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  if (hasMarkType(activeMarks, inlineCodeMarkType)) {
    return false;
  }

  event.preventDefault();
  view.dispatch(
    view.state.tr
      .setStoredMarks(activeMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, {
        position: view.state.selection.from,
        side: 'right',
        placement: 'outside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  placeCaretAtInlineCodeBoundary(view, view.state.selection.from, 1);
  return true;
};

/**
 * 解析从标签后第一个普通字符返回右侧外部边界的位置。
 */
const resolveInlineCodeEndApproachPosition = (
  view: EditorView,
  markType: MarkType
): number | null => {
  // 当前文本选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return null;
  }

  // 光标左侧的普通文本片段。
  const nodeBefore = selection.$from.nodeBefore;
  if (
    !nodeBefore?.isText ||
    hasMarkType(nodeBefore.marks, markType) ||
    Array.from(nodeBefore.textContent).length !== 1
  ) {
    return null;
  }

  // 第一个普通字符之前的文档位置。
  const boundaryPosition = selection.from - nodeBefore.nodeSize;
  return resolveInlineCodeEndMark(view, boundaryPosition, markType)
    ? boundaryPosition
    : null;
};

/**
 * 将标签后第一个普通字符之后的光标移到标签右侧外部边界。
 */
const handleInlineCodeEndLanding = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
): boolean => {
  if (event.key !== 'ArrowLeft') {
    return false;
  }

  // 标签右侧外部边界位置。
  const boundaryPosition = resolveInlineCodeEndApproachPosition(view, inlineCodeMarkType);
  if (boundaryPosition === null) {
    return false;
  }

  // 光标左侧普通字符携带的 mark 集合。
  const plainTextMarks = view.state.selection.$from.nodeBefore?.marks ?? [];
  // 不包含行内代码的普通文本输入 mark 集合。
  const nextStoredMarks = plainTextMarks.filter((mark) => mark.type !== inlineCodeMarkType);
  event.preventDefault();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, boundaryPosition))
      .setStoredMarks(nextStoredMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, {
        position: boundaryPosition,
        side: 'right',
        placement: 'outside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  placeCaretAtInlineCodeBoundary(view, boundaryPosition, 1);
  return true;
};

/**
 * 处理行内代码左方向键导航。
 */
const handleInlineCodeArrowLeft = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
): boolean => {
  return (
    handleInlineCodeEndLanding(view, event, inlineCodeMarkType) ||
    handleInlineCodeEndApproach(view, event, inlineCodeMarkType) ||
    handleInlineCodeStartLanding(view, event, inlineCodeMarkType) ||
    handleInlineCodeLeftExit(view, event, inlineCodeMarkType)
  );
};

/**
 * 初始化行内代码边界导航状态。
 */
const initializeInlineCodeBoundaryNavigationState = (): InlineCodeBoundaryVisualState | null => {
  return null;
};

/**
 * 根据事务更新行内代码边界指示线位置。
 */
const applyInlineCodeBoundaryNavigationTransaction = (
  transaction: Transaction,
  currentState: InlineCodeBoundaryVisualState | null
): InlineCodeBoundaryVisualState | null => {
  // 事务显式指定的下一边界视觉状态。
  const nextState = transaction.getMeta(inlineCodeBoundaryNavigationPluginKey) as
    | InlineCodeBoundaryVisualState
    | null
    | undefined;
  if (nextState !== undefined) {
    return nextState;
  }

  if (transaction.docChanged || transaction.selectionSet || transaction.storedMarksSet) {
    return null;
  }

  return currentState;
};

/**
 * 清除行内代码边界指示线。
 */
const hideInlineCodeBoundaryIndicator = (view: EditorView): void => {
  if (inlineCodeBoundaryNavigationPluginKey.getState(view.state) == null) {
    return;
  }

  view.dispatch(view.state.tr.setMeta(inlineCodeBoundaryNavigationPluginKey, null));
};

/**
 * 编辑器失焦时清除行内代码边界指示线。
 */
const handleInlineCodeBlur = (view: EditorView): boolean => {
  hideInlineCodeBoundaryIndicator(view);
  return false;
};

/**
 * 同步行内代码边界视觉状态对应的根元素类名。
 */
class InlineCodeBoundaryNavigationPluginView {
  /** 编辑器根 DOM。 */
  private readonly editorDom: HTMLElement;

  /**
   * 初始化插件视图并同步当前退出状态。
   */
  constructor(view: EditorView) {
    this.editorDom = view.dom;
    this.update(view);
  }

  /**
   * 根据插件状态控制原生 caret 可见性。
   */
  update(view: EditorView): void {
    // 当前行内代码边界视觉状态。
    const visualState = inlineCodeBoundaryNavigationPluginKey.getState(view.state);
    // 当前是否处于行内代码边界视觉状态。
    const isBoundaryActive = visualState != null;
    this.editorDom.classList.toggle(INLINE_CODE_BOUNDARY_ACTIVE_CLASS_NAME, isBoundaryActive);
    alignInlineCodeOutsideIndicator(view, visualState);
  }

  /**
   * 销毁插件视图时恢复原生 caret。
   */
  destroy(): void {
    this.editorDom.classList.remove(INLINE_CODE_BOUNDARY_ACTIVE_CLASS_NAME);
  }
}

/**
 * 创建行内代码边界导航插件视图。
 */
const createInlineCodeBoundaryNavigationPluginView = (
  view: EditorView
): InlineCodeBoundaryNavigationPluginView => {
  return new InlineCodeBoundaryNavigationPluginView(view);
};

/**
 * 判断点击目标是否属于行内代码。
 */
const isInlineCodeClickTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  // 点击位置所属的代码元素。
  const codeElement = target.closest('code');
  return Boolean(codeElement && !codeElement.closest('pre'));
};

/**
 * 点击行内代码时恢复对应的标签内输入状态。
 */
const handleInlineCodeClick = (
  view: EditorView,
  position: number,
  event: MouseEvent
): boolean => {
  if (!view.state.selection.empty) {
    return false;
  }

  if (handleInlineCodeBoundaryClick(view, event)) {
    return true;
  }

  // 点击目标是否属于行内代码。
  const isInlineCodeTarget = isInlineCodeClickTarget(event.target);
  // 当前行内代码 mark 类型。
  const inlineCodeMarkType = view.state.schema.marks[INLINE_CODE_MARK_NAME];
  if (
    inlineCodeMarkType &&
    isInlineCodeTarget &&
    enterInlineCodeStart(view, position, inlineCodeMarkType)
  ) {
    event.preventDefault();
    return true;
  }

  // 当前行内代码边界视觉状态。
  const visualState = inlineCodeBoundaryNavigationPluginKey.getState(view.state);
  if (!isInlineCodeTarget || !visualState) {
    return false;
  }

  // 当前显式输入 mark 集合。
  const storedMarks = view.state.storedMarks;
  // 清除边界视觉状态的事务。
  const transaction = view.state.tr.setMeta(inlineCodeBoundaryNavigationPluginKey, null);
  if (
    storedMarks !== null &&
    inlineCodeMarkType &&
    !hasMarkType(storedMarks, inlineCodeMarkType)
  ) {
    transaction.setStoredMarks(null);
  }

  view.dispatch(transaction);
  return false;
};

/**
 * 处理普通外部光标首次向右进入标签内开头。
 */
const handleInlineCodeStartEntry = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
): boolean => {
  if (event.key !== 'ArrowRight' || !isAtInlineCodeLeftBoundary(view, inlineCodeMarkType)) {
    return false;
  }

  // 当前输入位置继承的 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  if (hasMarkType(activeMarks, inlineCodeMarkType)) {
    return false;
  }

  if (!enterInlineCodeStart(view, view.state.selection.from, inlineCodeMarkType)) {
    return false;
  }

  event.preventDefault();
  return true;
};

/**
 * 处理行内代码尾部第一次右方向键退出。
 */
const handleInlineCodeArrowRight = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
): boolean => {
  if (event.key !== 'ArrowRight') {
    return false;
  }

  if (handleInlineCodeStartEntry(view, event, inlineCodeMarkType)) {
    return true;
  }

  if (!isAtInlineCodeRightBoundary(view, inlineCodeMarkType)) {
    return false;
  }

  // 当前输入位置继承的 mark 集合。
  const activeMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
  if (!hasMarkType(activeMarks, inlineCodeMarkType)) {
    hideInlineCodeBoundaryIndicator(view);
    return false;
  }

  event.preventDefault();
  // 移除行内代码后的普通文本 mark 集合。
  const nextStoredMarks = activeMarks.filter((mark) => mark.type !== inlineCodeMarkType);
  view.dispatch(
    view.state.tr
      .setStoredMarks(nextStoredMarks)
      .setMeta(inlineCodeBoundaryNavigationPluginKey, {
        position: view.state.selection.from,
        side: 'right',
        placement: 'outside'
      } satisfies InlineCodeBoundaryVisualState)
  );
  placeCaretAtInlineCodeBoundary(view, view.state.selection.from, 1);
  return true;
};

/** 行内代码方向键导航处理器。 */
type InlineCodeBoundaryKeyHandler = (
  view: EditorView,
  event: KeyboardEvent,
  inlineCodeMarkType: MarkType
) => boolean;

// 行内代码方向键处理分发表。
const INLINE_CODE_BOUNDARY_KEY_HANDLER_MAP: Readonly<
  Partial<Record<string, InlineCodeBoundaryKeyHandler>>
> = {
  ArrowLeft: handleInlineCodeArrowLeft,
  ArrowRight: handleInlineCodeArrowRight
};

/**
 * 处理行内代码边界方向键导航。
 */
const handleInlineCodeBoundaryKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
  if (shouldSkipInlineCodeBoundaryNavigation(view, event)) {
    return false;
  }

  // 当前按键对应的边界处理器。
  const boundaryHandler = INLINE_CODE_BOUNDARY_KEY_HANDLER_MAP[event.key];
  if (!boundaryHandler) {
    return false;
  }

  // 当前行内代码 mark 类型。
  const inlineCodeMarkType = view.state.schema.marks[INLINE_CODE_MARK_NAME];
  if (!inlineCodeMarkType) {
    return false;
  }

  // 当前行内代码边界视觉状态。
  const visualState = inlineCodeBoundaryNavigationPluginKey.getState(view.state);
  if (visualState) {
    return handleInlineCodeBoundaryVisualNavigation(
      view,
      event,
      inlineCodeMarkType,
      visualState,
      inlineCodeBoundaryNavigationPluginKey
    );
  }

  return boundaryHandler(view, event, inlineCodeMarkType);
};

/**
 * 行内代码左右边界导航插件。
 */
export const inlineCodeBoundaryNavigationPlugin = $prose(() => {
  return new Plugin<InlineCodeBoundaryVisualState | null>({
    key: inlineCodeBoundaryNavigationPluginKey,
    view: createInlineCodeBoundaryNavigationPluginView,
    state: {
      init: initializeInlineCodeBoundaryNavigationState,
      apply: applyInlineCodeBoundaryNavigationTransaction
    },
    props: {
      handleKeyDown: handleInlineCodeBoundaryKeyDown,
      handleClick: handleInlineCodeClick,
      decorations: createInlineCodeBoundaryDecorations,
      handleDOMEvents: {
        blur: handleInlineCodeBlur
      }
    }
  });
});
