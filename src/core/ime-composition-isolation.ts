import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

/** 组合输入期间挂在 `.ProseMirror` 根节点上的块级隔离样式类。 */
export const IME_ISOLATION_CLASS_NAME = 'zt-md-ime-isolating';

// IME 块级隔离插件状态键。
const IME_COMPOSITION_ISOLATION_KEY = new PluginKey('ZT_MD_IME_COMPOSITION_ISOLATION');
// 触发 IME 预隔离的直接块级子节点数量阈值。
const LARGE_DOC_BLOCK_THRESHOLD = 30;
// 触发 IME 预隔离的文档节点体积阈值。
const LARGE_DOC_CONTENT_SIZE_THRESHOLD = 4000;
// 连续可打印英文字符输入后延迟恢复预隔离的时长（毫秒）。
const TEXT_KEY_REISOLATE_DELAY_MS = 150;
// 内部包含独立焦点的交互元素选择器，交互或输入时不强行把焦点拉回编辑器根节点。
const INTERACTIVE_TARGET_SELECTOR = 'button, input, textarea, select, [contenteditable="false"]';

/** DOM 选区起止位置快照。 */
interface SavedDomSelection {
  /** 选区锚点节点。 */
  anchorNode: Node;
  /** 选区锚点偏移量。 */
  anchorOffset: number;
  /** 选区焦点节点。 */
  focusNode: Node;
  /** 选区焦点偏移量。 */
  focusOffset: number;
}

/** 退出 IME 块级隔离态的可选项。 */
interface ExitIsolationOptions {
  /** 是否在子块持有焦点时交回给 `.ProseMirror`。 */
  restoreFocus?: boolean;
  /** 交回焦点前后是否保留并恢复原有 DOM 选区。 */
  preserveSelection?: boolean;
}

/** 暴露 ProseMirror 内部 DOM 观察器刷新能力，用于在切换隔离宿主前同步挂起选区。 */
interface EditorViewWithDomObserver extends EditorView {
  /** ProseMirror 内部 DOM 变更与选区观察器。 */
  domObserver?: {
    /** 立即刷新挂起的 DOM 变更与选区状态。 */
    flush?: () => void;
  };
}

/**
 * 判断键盘事件是否属于 IME 预处理按键。
 */
const isImeProcessKeyDown = (event: KeyboardEvent): boolean => {
  return event.isComposing || event.key === 'Process' || event.keyCode === 229;
};

/**
 * 判断按键是否为普通单字符可打印按键（不含组合修饰键）。
 */
const isPrintableAsciiKey = (event: KeyboardEvent): boolean => {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
};

/**
 * 判断事件或焦点目标是否位于按钮、表单控件或不可编辑子块等交互区域内。
 */
const isInteractiveTarget = (target: EventTarget | null): boolean => {
  return target instanceof Element && target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
};

/**
 * 向上查找节点在编辑区根元素下的直接块级子节点。
 */
const resolveDirectBlockChild = (root: HTMLElement, node: Node | null): HTMLElement | null => {
  let current = node;
  while (current && current.parentNode !== root) {
    current = current.parentNode;
  }
  return current instanceof HTMLElement ? current : null;
};

/**
 * 获取当前折叠选区所在的单一可编辑直接块级子节点。
 */
const resolveCollapsedEditableBlock = (root: HTMLElement): HTMLElement | null => {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }

  const block = resolveDirectBlockChild(root, selection.anchorNode);
  if (!block || block.getAttribute('contenteditable') === 'false') {
    return null;
  }

  return block;
};

/**
 * 保存编辑区内的当前 DOM 选区（兼容折叠光标与正反向跨节点选区）。
 */
const saveDomSelection = (root: HTMLElement): SavedDomSelection | null => {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !selection.focusNode
  ) {
    return null;
  }

  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
    return null;
  }

  return {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset
  };
};

/**
 * 在焦点切换未保留原选区时恢复 DOM 选区，避免多余选区变更事件。
 */
const restoreDomSelection = (root: HTMLElement, saved: SavedDomSelection | null): void => {
  if (
    !saved ||
    !saved.anchorNode.isConnected ||
    !saved.focusNode.isConnected ||
    !root.contains(saved.anchorNode) ||
    !root.contains(saved.focusNode)
  ) {
    return;
  }

  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection) {
    return;
  }

  if (
    selection.rangeCount > 0 &&
    selection.anchorNode === saved.anchorNode &&
    selection.anchorOffset === saved.anchorOffset &&
    selection.focusNode === saved.focusNode &&
    selection.focusOffset === saved.focusOffset
  ) {
    return;
  }

  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(
      saved.anchorNode,
      saved.anchorOffset,
      saved.focusNode,
      saved.focusOffset
    );
    return;
  }

  // 兜底不支持 setBaseAndExtent 的测试环境。
  const range = root.ownerDocument.createRange();
  range.setStart(saved.anchorNode, saved.anchorOffset);
  if (saved.anchorNode === saved.focusNode && saved.anchorOffset === saved.focusOffset) {
    range.collapse(true);
  } else {
    range.setEnd(saved.focusNode, saved.focusOffset);
  }
  selection.removeAllRanges();
  selection.addRange(range);
};

/**
 * 在大文档单块空闲态提前隔离编辑边界，并在拖选/非空选区等场景下确保 `.ProseMirror` 及时取回焦点。
 */
export const imeCompositionIsolationPlugin = $prose(
  () =>
    new Plugin({
      key: IME_COMPOSITION_ISOLATION_KEY,
      view(editorView) {
        const dom = editorView.dom;
        const ownerDocument = dom.ownerDocument;
        const hasOwnHasFocus = Object.prototype.hasOwnProperty.call(editorView, 'hasFocus');
        const originalHasFocus = editorView.hasFocus;
        let activeView = editorView;
        let isolating = false;
        let isolatedBlock: HTMLElement | null = null;
        let pendingDetachedBlock: HTMLElement | null = null;
        let isPointerSelecting = false;
        let restoringRootFocus = false;
        let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
        let dispatchingSyntheticBlur = false;

        /**
         * 判断当前浏览器焦点是否合法停留在已被隔离的可编辑直接块上。
         */
        const isIsolatedBlockFocused = (): boolean => {
          return (
            isolating &&
            isolatedBlock !== null &&
            isolatedBlock.isConnected &&
            dom.getAttribute('contenteditable') === 'true' &&
            ownerDocument.activeElement === isolatedBlock &&
            !isInteractiveTarget(isolatedBlock)
          );
        };

        // 隔离态下焦点位于当前直接块而非 .ProseMirror，代理 hasFocus 避免 ProseMirror 跳过选区同步与光标回写。
        editorView.hasFocus = () => originalHasFocus.call(editorView) || isIsolatedBlockFocused();

        /**
         * 清理尚未触发的延迟预隔离定时器。
         */
        const cancelScheduledIsolation = (): void => {
          if (scheduleTimer !== null) {
            clearTimeout(scheduleTimer);
            scheduleTimer = null;
          }
        };

        /**
         * 判断当前文档是否可编辑且达到大文档预隔离阈值。
         */
        const shouldEnableForCurrentDoc = (): boolean => {
          return (
            dom.getAttribute('contenteditable') === 'true' &&
            (activeView.state.doc.content.size >= LARGE_DOC_CONTENT_SIZE_THRESHOLD ||
              dom.childElementCount >= LARGE_DOC_BLOCK_THRESHOLD)
          );
        };

        /**
         * 当浏览器焦点仍停留在 `.ProseMirror` 的子块内时，将焦点平滑交回 `.ProseMirror` 根节点。
         */
        const restoreRootFocusIfNeeded = (preserveSelection: boolean): void => {
          const activeElement = ownerDocument.activeElement;
          if (
            !(activeElement instanceof Node) ||
            !dom.contains(activeElement) ||
            activeElement === dom ||
            isInteractiveTarget(activeElement)
          ) {
            return;
          }

          const savedSelection = preserveSelection ? saveDomSelection(dom) : null;
          restoringRootFocus = true;
          try {
            dom.focus({ preventScroll: true });
          } finally {
            restoringRootFocus = false;
          }

          if (preserveSelection) {
            restoreDomSelection(dom, savedSelection);
          }
        };

        /**
         * 进入单块空闲预隔离态，并将浏览器焦点稳定锚定到当前直接块。
         */
        const enterIsolation = (): void => {
          if (
            isolating ||
            isPointerSelecting ||
            activeView.composing ||
            !shouldEnableForCurrentDoc()
          ) {
            return;
          }

          const activeElement = ownerDocument.activeElement;
          if (
            !(activeElement instanceof Node) ||
            !dom.contains(activeElement) ||
            isInteractiveTarget(activeElement)
          ) {
            return;
          }

          // 切走根焦点前先刷新挂起的 DOM 选区，避免 pointerup/keyup 抢跑于 selectionchange 导致状态选区滞后。
          (activeView as EditorViewWithDomObserver).domObserver?.flush?.();

          if (!activeView.state.selection.empty) {
            return;
          }

          const block = resolveCollapsedEditableBlock(dom);
          if (!block) {
            return;
          }

          const savedSelection = saveDomSelection(dom);
          dom.classList.add(IME_ISOLATION_CLASS_NAME);
          isolating = true;
          isolatedBlock = block;

          if (ownerDocument.activeElement !== block) {
            block.focus({ preventScroll: true });
            restoreDomSelection(dom, savedSelection);
          }
        };

        /**
         * 退出 IME 块级隔离态，并按需交回 `.ProseMirror` 根节点焦点（包括隔离类已移除但子块仍持有焦点的情况）。
         */
        const exitIsolation = (options: ExitIsolationOptions = {}): void => {
          cancelScheduledIsolation();
          if (isolating) {
            dom.classList.remove(IME_ISOLATION_CLASS_NAME);
            isolating = false;
            isolatedBlock = null;
          } else {
            isolatedBlock = null;
          }

          if (options.restoreFocus) {
            restoreRootFocusIfNeeded(options.preserveSelection ?? true);
          }
        };

        /**
         * 当前被隔离的子块因 ProseMirror 转换节点或刷新属性而脱离文档后，同步恢复根焦点与光标并按需重入预隔离。
         */
        const recoverFocusAfterDetachedBlock = (view: EditorView): void => {
          pendingDetachedBlock = null;
          exitIsolation({ restoreFocus: false });
          if (dom.getAttribute('contenteditable') !== 'true') {
            return;
          }

          restoringRootFocus = true;
          try {
            view.focus();
          } finally {
            restoringRootFocus = false;
          }

          if (!view.composing && view.state.selection.empty && shouldEnableForCurrentDoc()) {
            schedulePreIsolation(0);
          }
        };

        /**
         * 在空闲或短暂停顿后安排一次预隔离检查。
         */
        const schedulePreIsolation = (delayMs = 0): void => {
          cancelScheduledIsolation();
          if (isolating || isPointerSelecting || activeView.composing || !shouldEnableForCurrentDoc()) {
            return;
          }

          scheduleTimer = setTimeout(() => {
            scheduleTimer = null;
            enterIsolation();
          }, delayMs);
        };

        const handleKeyDown = (event: KeyboardEvent): void => {
          // 焦点位于公式块等内部交互控件时放行按键，不抢回 .ProseMirror 焦点。
          if (isInteractiveTarget(event.target) || isInteractiveTarget(ownerDocument.activeElement)) {
            cancelScheduledIsolation();
            return;
          }

          // 绝不在 IME 预处理或组字中途切换隔离态与焦点宿主，避免 TSF 取消首字符。
          if (isImeProcessKeyDown(event)) {
            cancelScheduledIsolation();
            return;
          }

          // 切换输入法或输入全角标点时经常伴随 Shift，保持隔离态稳定。
          if (event.key === 'Shift') {
            return;
          }

          exitIsolation({ restoreFocus: true, preserveSelection: true });
        };

        const handleKeyUp = (event: KeyboardEvent): void => {
          if (
            isInteractiveTarget(event.target) ||
            isInteractiveTarget(ownerDocument.activeElement) ||
            isImeProcessKeyDown(event) ||
            activeView.composing
          ) {
            return;
          }

          if (isPrintableAsciiKey(event)) {
            schedulePreIsolation(TEXT_KEY_REISOLATE_DELAY_MS);
            return;
          }

          schedulePreIsolation(0);
        };

        const handlePointerDown = (event: PointerEvent): void => {
          isPointerSelecting = true;
          if (!isInteractiveTarget(event.target)) {
            // 在鼠标拖选开始前先把焦点还给 .ProseMirror，避免拖选时 view.hasFocus() 返回 false。
            exitIsolation({ restoreFocus: true, preserveSelection: true });
            return;
          }

          exitIsolation({ restoreFocus: false });
        };

        const handlePointerEnd = (event: PointerEvent): void => {
          isPointerSelecting = false;
          if (event.type === 'pointerup' && event.target instanceof Node && dom.contains(event.target)) {
            schedulePreIsolation(0);
          }
        };

        const handleFocus = (event: FocusEvent): void => {
          if (restoringRootFocus || isPointerSelecting || event.target !== dom) {
            return;
          }

          schedulePreIsolation(0);
        };

        const handleSelectionChange = (): void => {
          if (activeView.composing) {
            return;
          }

          const selection = ownerDocument.defaultView?.getSelection();
          if (
            !selection ||
            selection.rangeCount === 0 ||
            selection.isCollapsed ||
            !selection.anchorNode ||
            !dom.contains(selection.anchorNode)
          ) {
            return;
          }

          const activeElement = ownerDocument.activeElement;
          // 内部交互控件内的选区变更不触发根节点回焦，避免打断公式编辑框内拖选。
          if (isInteractiveTarget(activeElement)) {
            return;
          }

          const hasChildFocus =
            activeElement instanceof Node && dom.contains(activeElement) && activeElement !== dom;
          if (isolating || hasChildFocus) {
            exitIsolation({
              restoreFocus: dom.getAttribute('contenteditable') === 'true',
              preserveSelection: true
            });
          }
        };

        const handleCompositionEnd = (): void => {
          if (!isolating) {
            schedulePreIsolation(0);
          }
        };

        const handleBlur = (event: FocusEvent): void => {
          if (dispatchingSyntheticBlur) {
            return;
          }

          // ProseMirror 更新节点属性（如标题同步 id）重建当前隔离块时，旧节点脱离 DOM 不是外部失焦，交由紧随其后的 update(view) 恢复焦点与光标。
          if (isolating && isolatedBlock !== null && !isolatedBlock.isConnected) {
            return;
          }

          // 编辑器内部焦点在 .ProseMirror 与可编辑子块间迁移时保留聚焦态与隔离态。
          if (event.relatedTarget instanceof Node && dom.contains(event.relatedTarget)) {
            if (isolating && event.target === dom) {
              event.stopImmediatePropagation();
            }
            return;
          }

          const wasChildBlur = event.target !== dom;
          const blurredBlock = wasChildBlur
            ? (isolatedBlock ?? (event.target instanceof HTMLElement ? event.target : null))
            : null;
          const relatedTarget = event.relatedTarget;
          exitIsolation({ restoreFocus: false });

          // 子块失焦后延后至微任务确认：若紧接着被 ProseMirror 从 DOM 移除则交由恢复流程，否则补发根节点 blur。
          if (wasChildBlur) {
            if (blurredBlock !== null) {
              pendingDetachedBlock = blurredBlock;
            }
            queueMicrotask(() => {
              if (blurredBlock !== null) {
                if (pendingDetachedBlock !== blurredBlock) {
                  return;
                }
                pendingDetachedBlock = null;
                if (!blurredBlock.isConnected) {
                  recoverFocusAfterDetachedBlock(activeView);
                  return;
                }
              }

              if (
                ownerDocument.activeElement instanceof Node &&
                dom.contains(ownerDocument.activeElement)
              ) {
                return;
              }

              dispatchingSyntheticBlur = true;
              try {
                dom.dispatchEvent(new FocusEvent('blur', { relatedTarget }));
              } finally {
                dispatchingSyntheticBlur = false;
              }
            });
          }
        };

        dom.addEventListener('keydown', handleKeyDown, true);
        dom.addEventListener('keyup', handleKeyUp, true);
        dom.addEventListener('pointerdown', handlePointerDown, true);
        ownerDocument.addEventListener('pointerup', handlePointerEnd, true);
        ownerDocument.addEventListener('pointercancel', handlePointerEnd, true);
        dom.addEventListener('focus', handleFocus, true);
        ownerDocument.addEventListener('selectionchange', handleSelectionChange);
        dom.addEventListener('compositionend', handleCompositionEnd, false);
        dom.addEventListener('blur', handleBlur, true);

        return {
          update(view) {
            activeView = view;
            const hasDetachedIsolatedBlock =
              (isolating && isolatedBlock !== null && !isolatedBlock.isConnected) ||
              (pendingDetachedBlock !== null && !pendingDetachedBlock.isConnected);
            if (hasDetachedIsolatedBlock) {
              recoverFocusAfterDetachedBlock(view);
              return;
            }

            if (
              isolating &&
              (!shouldEnableForCurrentDoc() || (!view.composing && !view.state.selection.empty))
            ) {
              exitIsolation({
                restoreFocus: dom.getAttribute('contenteditable') === 'true',
                preserveSelection: true
              });
            }
          },
          destroy() {
            pendingDetachedBlock = null;
            cancelScheduledIsolation();
            exitIsolation({ restoreFocus: false });
            if (hasOwnHasFocus) {
              editorView.hasFocus = originalHasFocus;
            } else {
              delete (editorView as Partial<EditorView>).hasFocus;
            }
            dom.removeEventListener('keydown', handleKeyDown, true);
            dom.removeEventListener('keyup', handleKeyUp, true);
            dom.removeEventListener('pointerdown', handlePointerDown, true);
            ownerDocument.removeEventListener('pointerup', handlePointerEnd, true);
            ownerDocument.removeEventListener('pointercancel', handlePointerEnd, true);
            dom.removeEventListener('focus', handleFocus, true);
            ownerDocument.removeEventListener('selectionchange', handleSelectionChange);
            dom.removeEventListener('compositionend', handleCompositionEnd, false);
            dom.removeEventListener('blur', handleBlur, true);
          }
        };
      }
    })
);
