import { Plugin, PluginKey } from '@milkdown/prose/state';
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

/** 折叠光标位置快照。 */
interface CollapsedCaret {
  /** 光标所在的 DOM 节点。 */
  node: Node;
  /** 光标在节点内的偏移量。 */
  offset: number;
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
 * 保存编辑区内的当前折叠光标位置。
 */
const saveCollapsedCaret = (root: HTMLElement): CollapsedCaret | null => {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !selection.anchorNode) {
    return null;
  }

  if (!root.contains(selection.anchorNode)) {
    return null;
  }

  return {
    node: selection.anchorNode,
    offset: selection.anchorOffset
  };
};

/**
 * 在焦点切换未保留原光标时恢复折叠光标，避免多余选区变更事件。
 */
const restoreCollapsedCaret = (root: HTMLElement, caret: CollapsedCaret | null): void => {
  if (!caret || !caret.node.isConnected || !root.contains(caret.node)) {
    return;
  }

  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection) {
    return;
  }

  if (
    selection.rangeCount > 0 &&
    selection.isCollapsed &&
    selection.anchorNode === caret.node &&
    selection.anchorOffset === caret.offset
  ) {
    return;
  }

  const range = root.ownerDocument.createRange();
  range.setStart(caret.node, caret.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

/**
 * 在大文档单块空闲态提前隔离编辑边界，确保整个中文 IME 组合期间焦点宿主稳定、零丢字与零长链扫描。
 */
export const imeCompositionIsolationPlugin = $prose(
  () =>
    new Plugin({
      key: IME_COMPOSITION_ISOLATION_KEY,
      view(editorView) {
        const dom = editorView.dom;
        let activeView = editorView;
        let isolating = false;
        let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
        let dispatchingSyntheticBlur = false;

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
         * 进入单块空闲预隔离态，并将浏览器焦点稳定锚定到当前直接块。
         */
        const enterIsolation = (): void => {
          if (isolating || activeView.composing || !shouldEnableForCurrentDoc()) {
            return;
          }

          const activeElement = dom.ownerDocument.activeElement;
          if (!(activeElement instanceof Node) || !dom.contains(activeElement)) {
            return;
          }

          const block = resolveCollapsedEditableBlock(dom);
          if (!block) {
            return;
          }

          const caret = saveCollapsedCaret(dom);
          dom.classList.add(IME_ISOLATION_CLASS_NAME);
          isolating = true;

          if (dom.ownerDocument.activeElement !== block) {
            block.focus({ preventScroll: true });
            restoreCollapsedCaret(dom, caret);
          }
        };

        /**
         * 退出 IME 块级隔离态，必要时将焦点平滑交回 `.ProseMirror`。
         */
        const exitIsolation = (restoreFocus = false): void => {
          cancelScheduledIsolation();
          if (!isolating) {
            return;
          }

          const activeElement = dom.ownerDocument.activeElement;
          const shouldRestoreFocus =
            restoreFocus &&
            activeElement instanceof Node &&
            dom.contains(activeElement) &&
            activeElement !== dom;
          const caret = shouldRestoreFocus ? saveCollapsedCaret(dom) : null;

          dom.classList.remove(IME_ISOLATION_CLASS_NAME);
          isolating = false;

          if (shouldRestoreFocus) {
            dom.focus({ preventScroll: true });
            restoreCollapsedCaret(dom, caret);
          }
        };

        /**
         * 在空闲或短暂停顿后安排一次预隔离检查。
         */
        const schedulePreIsolation = (delayMs = 0): void => {
          cancelScheduledIsolation();
          if (isolating || activeView.composing || !shouldEnableForCurrentDoc()) {
            return;
          }

          scheduleTimer = setTimeout(() => {
            scheduleTimer = null;
            enterIsolation();
          }, delayMs);
        };

        const handleKeyDown = (event: KeyboardEvent): void => {
          // 绝不在 IME 预处理或组字中途切换隔离态与焦点宿主，避免 TSF 取消首字符。
          if (isImeProcessKeyDown(event)) {
            cancelScheduledIsolation();
            return;
          }

          // 切换输入法或输入全角标点时经常伴随 Shift，保持隔离态稳定。
          if (event.key === 'Shift') {
            return;
          }

          exitIsolation(true);
        };

        const handleKeyUp = (event: KeyboardEvent): void => {
          if (isImeProcessKeyDown(event) || activeView.composing) {
            return;
          }

          if (isPrintableAsciiKey(event)) {
            schedulePreIsolation(TEXT_KEY_REISOLATE_DELAY_MS);
            return;
          }

          schedulePreIsolation(0);
        };

        const handlePointerDown = (): void => {
          exitIsolation(false);
        };

        const handleMouseUp = (): void => {
          schedulePreIsolation(0);
        };

        const handleFocus = (event: FocusEvent): void => {
          if (event.target === dom) {
            schedulePreIsolation(0);
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

          // 编辑器内部焦点在 .ProseMirror 与可编辑子块间迁移时保留聚焦态与隔离态。
          if (event.relatedTarget instanceof Node && dom.contains(event.relatedTarget)) {
            if (isolating && event.target === dom) {
              event.stopImmediatePropagation();
            }
            return;
          }

          const wasChildBlur = event.target !== dom;
          exitIsolation(false);

          // 子块真实失焦离开编辑器时，向 .ProseMirror 补发一次失焦通知以清理聚焦态并触发同步。
          if (wasChildBlur) {
            dispatchingSyntheticBlur = true;
            try {
              dom.dispatchEvent(new FocusEvent('blur', { relatedTarget: event.relatedTarget }));
            } finally {
              dispatchingSyntheticBlur = false;
            }
          }
        };

        dom.addEventListener('keydown', handleKeyDown, true);
        dom.addEventListener('keyup', handleKeyUp, true);
        dom.addEventListener('pointerdown', handlePointerDown, true);
        dom.addEventListener('mouseup', handleMouseUp, true);
        dom.addEventListener('focus', handleFocus, true);
        dom.addEventListener('compositionend', handleCompositionEnd, false);
        dom.addEventListener('blur', handleBlur, true);

        return {
          update(view) {
            activeView = view;
            if (
              isolating &&
              (!shouldEnableForCurrentDoc() || (!view.composing && !view.state.selection.empty))
            ) {
              exitIsolation(false);
            }
          },
          destroy() {
            cancelScheduledIsolation();
            exitIsolation(false);
            dom.removeEventListener('keydown', handleKeyDown, true);
            dom.removeEventListener('keyup', handleKeyUp, true);
            dom.removeEventListener('pointerdown', handlePointerDown, true);
            dom.removeEventListener('mouseup', handleMouseUp, true);
            dom.removeEventListener('focus', handleFocus, true);
            dom.removeEventListener('compositionend', handleCompositionEnd, false);
            dom.removeEventListener('blur', handleBlur, true);
          }
        };
      }
    })
);
