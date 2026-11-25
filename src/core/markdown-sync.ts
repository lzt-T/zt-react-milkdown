import type { EditorChangeHandler } from '@/types/editor';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// Markdown 同步插件键。
const MARKDOWN_SYNC_PLUGIN_KEY = new PluginKey('ZT_MD_MARKDOWN_SYNC');
// IME 组字结束后延迟兜底同步时长（毫秒），等待浏览器完成选词事务落库。
const COMPOSITION_END_SYNC_DELAY_MS = 30;
// 触发大文档自适应防抖与空闲调度的文档节点体积阈值。
const LARGE_DOC_SIZE_THRESHOLD = 8000;
// 大文档下最小序列化防抖时长（毫秒）。
const LARGE_DOC_MIN_DEBOUNCE_MS = 450;
// 视为慢序列化的单次耗时阈值（毫秒）。
const SLOW_SERIALIZE_THRESHOLD_MS = 30;
// 自适应放宽后的最大防抖时长上限（毫秒）。
const MAX_ADAPTIVE_DEBOUNCE_MS = 1000;
// 大文档空闲调度兜底超时时长（毫秒）。
const LARGE_DOC_IDLE_TIMEOUT_MS = 400;

/**
 * Markdown 同步控制器配置参数。
 */
export interface MarkdownSyncControllerOptions {
  /** 初始序列化防抖时长（毫秒）。 */
  debounceMs: number;
  /** 按需读取当前 Markdown 序列化器。 */
  getSerializer: () => ((doc: ProseNode) => string) | null;
  /** 对外通知序列化后的最新 Markdown。 */
  onChange: EditorChangeHandler;
}

/**
 * Markdown 同步控制器句柄。
 */
export interface MarkdownSyncController {
  /** ProseMirror Markdown 同步插件。 */
  plugin: MilkdownPlugin;
  /** 动态更新内容变更防抖时长。 */
  setDebounceMs: (debounceMs: number) => void;
  /** 在外部程序化替换 Markdown 期间包裹执行，抑制反向回抛。 */
  runWithExternalMarkdown: (markdown: string, applyUpdate: () => void) => void;
}

/**
 * 创建面向大文档与 IME 输入优化的 Markdown 异步序列化同步控制器。
 */
export const createMarkdownSyncController = (
  options: MarkdownSyncControllerOptions
): MarkdownSyncController => {
  let currentDebounceMs = Math.max(0, options.debounceMs);
  let isApplyingExternalMarkdown = false;
  let externalMarkdownTarget: string | null = null;
  let lastEmittedMarkdown: string | null = null;
  let lastSerializedDoc: ProseNode | null = null;
  let activeView: EditorView | null = null;
  let activeSerializer: ((doc: ProseNode) => string) | null = null;
  let hasPendingCompositionSync = false;
  let compositionEndTimer: ReturnType<typeof setTimeout> | null = null;
  let serializeTimer: ReturnType<typeof setTimeout> | null = null;
  let idleSerializeId: number | null = null;
  let lastSerializeDurationMs = 0;

  /**
   * 清理挂起的组字结束兜底定时器。
   */
  const clearCompositionEndTimer = (): void => {
    if (compositionEndTimer !== null) {
      clearTimeout(compositionEndTimer);
      compositionEndTimer = null;
    }
  };

  /**
   * 取消尚未执行的防抖与空闲序列化任务。
   */
  const cancelPendingSerialize = (): void => {
    if (serializeTimer !== null) {
      clearTimeout(serializeTimer);
      serializeTimer = null;
    }

    if (idleSerializeId !== null) {
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleSerializeId);
      }
      idleSerializeId = null;
    }
  };

  /**
   * 立即执行一次序列化并在文本变更时通知外部。
   */
  const flushMarkdownChange = (view: EditorView): void => {
    if (view.composing) {
      hasPendingCompositionSync = true;
      return;
    }

    hasPendingCompositionSync = false;
    if (view.state.doc === lastSerializedDoc) {
      return;
    }

    if (!activeSerializer) {
      activeSerializer = options.getSerializer();
    }
    if (!activeSerializer) {
      return;
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // 先完成序列化再记录文档快照，避免异常中断时永久跳过后续变更同步。
    const nextMarkdown = activeSerializer(view.state.doc);
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    lastSerializeDurationMs = Math.max(0, endTime - startTime);
    lastSerializedDoc = view.state.doc;

    if (nextMarkdown === lastEmittedMarkdown) {
      return;
    }

    lastEmittedMarkdown = nextMarkdown;
    options.onChange(nextMarkdown);
  };

  /**
   * 根据文档规模与历史序列化耗时动态解析有效防抖时长。
   */
  const resolveEffectiveDebounceMs = (docSize: number): number => {
    if (currentDebounceMs <= 0) {
      return 0;
    }

    if (docSize < LARGE_DOC_SIZE_THRESHOLD && lastSerializeDurationMs < SLOW_SERIALIZE_THRESHOLD_MS) {
      return currentDebounceMs;
    }

    const largeDocFloor = docSize >= LARGE_DOC_SIZE_THRESHOLD ? LARGE_DOC_MIN_DEBOUNCE_MS : 0;
    const slowSerializeFloor =
      lastSerializeDurationMs >= SLOW_SERIALIZE_THRESHOLD_MS
        ? Math.min(MAX_ADAPTIVE_DEBOUNCE_MS, Math.round(lastSerializeDurationMs * 4))
        : 0;
    return Math.max(currentDebounceMs, largeDocFloor, slowSerializeFloor);
  };

  /**
   * 按自适应防抖与大文档空闲回调策略调度一次 Markdown 序列化同步。
   */
  const scheduleMarkdownSync = (view: EditorView): void => {
    cancelPendingSerialize();
    const effectiveDelay = resolveEffectiveDebounceMs(view.state.doc.content.size);
    if (effectiveDelay <= 0) {
      flushMarkdownChange(view);
      return;
    }

    serializeTimer = setTimeout(() => {
      serializeTimer = null;
      if (!activeView || activeView.composing || isApplyingExternalMarkdown) {
        return;
      }

      if (
        activeView.state.doc.content.size >= LARGE_DOC_SIZE_THRESHOLD &&
        typeof requestIdleCallback === 'function'
      ) {
        idleSerializeId = requestIdleCallback(
          () => {
            idleSerializeId = null;
            if (activeView && !activeView.composing && !isApplyingExternalMarkdown) {
              flushMarkdownChange(activeView);
            }
          },
          { timeout: LARGE_DOC_IDLE_TIMEOUT_MS }
        );
        return;
      }

      flushMarkdownChange(activeView);
    }, effectiveDelay);
  };

  const plugin = $prose(() => {
    return new Plugin({
      key: MARKDOWN_SYNC_PLUGIN_KEY,
      props: {
        handleDOMEvents: {
          keydown: (_view, event) => {
            // Windows IME 会在 compositionstart 之前先派发 Process(229) 按键，提前取消挂起序列化避免卡住候选窗。
            if (event.isComposing || event.key === 'Process' || event.keyCode === 229) {
              clearCompositionEndTimer();
              cancelPendingSerialize();
            }
            return false;
          },
          compositionstart: () => {
            clearCompositionEndTimer();
            cancelPendingSerialize();
            return false;
          },
          compositionend: () => {
            clearCompositionEndTimer();
            compositionEndTimer = setTimeout(() => {
              compositionEndTimer = null;
              if (
                activeView &&
                !activeView.composing &&
                !isApplyingExternalMarkdown &&
                (hasPendingCompositionSync || activeView.state.doc !== lastSerializedDoc)
              ) {
                hasPendingCompositionSync = false;
                scheduleMarkdownSync(activeView);
              }
            }, COMPOSITION_END_SYNC_DELAY_MS);
            return false;
          },
          blur: (view, event) => {
            if (
              view.composing ||
              isApplyingExternalMarkdown ||
              (event instanceof FocusEvent &&
                event.relatedTarget instanceof Node &&
                view.dom.contains(event.relatedTarget))
            ) {
              return false;
            }

            clearCompositionEndTimer();
            cancelPendingSerialize();
            flushMarkdownChange(view);
            return false;
          }
        }
      },
      view: (initialView) => {
        activeView = initialView;
        lastSerializedDoc = initialView.state.doc;

        return {
          update: (view, previousState) => {
            activeView = view;
            if (isApplyingExternalMarkdown) {
              lastSerializedDoc = view.state.doc;
              lastEmittedMarkdown = externalMarkdownTarget;
              hasPendingCompositionSync = false;
              clearCompositionEndTimer();
              cancelPendingSerialize();
              return;
            }

            if (view.composing) {
              if (previousState.doc !== view.state.doc || view.state.doc !== lastSerializedDoc) {
                hasPendingCompositionSync = true;
              }
              clearCompositionEndTimer();
              cancelPendingSerialize();
              return;
            }

            const docChanged = previousState.doc !== view.state.doc;
            const shouldSyncAfterComposition =
              hasPendingCompositionSync && view.state.doc !== lastSerializedDoc;
            if (!docChanged && !shouldSyncAfterComposition) {
              return;
            }

            hasPendingCompositionSync = false;
            clearCompositionEndTimer();
            scheduleMarkdownSync(view);
          },
          destroy: () => {
            clearCompositionEndTimer();
            hasPendingCompositionSync = false;
            cancelPendingSerialize();
            activeSerializer = null;
            activeView = null;
          }
        };
      }
    });
  });

  return {
    plugin,
    setDebounceMs: (nextDebounceMs) => {
      const normalizedDebounceMs = Math.max(0, nextDebounceMs);
      if (currentDebounceMs === normalizedDebounceMs) {
        return;
      }

      currentDebounceMs = normalizedDebounceMs;
      cancelPendingSerialize();
    },
    runWithExternalMarkdown: (markdown, applyUpdate) => {
      clearCompositionEndTimer();
      hasPendingCompositionSync = false;
      cancelPendingSerialize();
      externalMarkdownTarget = markdown;
      isApplyingExternalMarkdown = true;
      try {
        applyUpdate();
      } finally {
        isApplyingExternalMarkdown = false;
        externalMarkdownTarget = null;
      }
    }
  };
};
