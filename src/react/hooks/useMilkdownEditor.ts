import { debounce } from 'es-toolkit/function';
import { useEffect, useRef } from 'react';
import type { EditorController, EditorI18nMessages, SlashMenuConfig } from '../../types/editor';
import { createEditor } from '../../core/createEditor';

/**
 * 定义 useMilkdownEditor 的输入参数。
 */
export interface UseMilkdownEditorOptions {
  /** Milkdown 编辑器根容器。 */
  root: HTMLElement | null;
  /** 需要同步到编辑器的 markdown。 */
  markdown: string;
  /** 编辑器内部浮层 Portal 容器。 */
  portalContainer: HTMLElement;
  /** 当前是否可编辑。 */
  editable: boolean;
  /** 内容变更外发的防抖时长（毫秒）。 */
  debounceMs: number;
  /** 编辑器文案。 */
  messages?: EditorI18nMessages;
  /** slash 菜单配置。 */
  slashMenu?: SlashMenuConfig;
  /** 编辑器内容变更回调。 */
  onMarkdownChange: (markdown: string) => void;
  /** 编辑器初始化失败回调。 */
  onInitError?: (error: unknown) => void;
  /** 编辑器初始化成功回调。 */
  onInitReady?: () => void;
}

/**
 * 封装 Milkdown 的创建、销毁与外部同步流程。
 */
export const useMilkdownEditor = (options: UseMilkdownEditorOptions): void => {
  /** 编辑器控制器引用。 */
  const controllerRef = useRef<EditorController | null>(null);
  /** 当前已写入编辑器的 markdown。 */
  const currentMarkdownRef = useRef<string>(options.markdown);
  /** 当前最新 markdown 入参引用。 */
  const latestMarkdownRef = useRef<string>(options.markdown);
  /** markdown 变更回调引用。 */
  const onMarkdownChangeRef = useRef<(markdown: string) => void>(options.onMarkdownChange);
  /** 初始化失败回调引用。 */
  const onInitErrorRef = useRef<((error: unknown) => void) | undefined>(options.onInitError);
  /** 初始化成功回调引用。 */
  const onInitReadyRef = useRef<(() => void) | undefined>(options.onInitReady);
  /** markdown 变化外发防抖器引用。 */
  const debouncedEmitRef = useRef<ReturnType<typeof debounce<(markdown: string) => void>> | null>(
    null
  );

  useEffect(() => {
    latestMarkdownRef.current = options.markdown;
  }, [options.markdown]);

  useEffect(() => {
    onMarkdownChangeRef.current = options.onMarkdownChange;
  }, [options.onMarkdownChange]);

  useEffect(() => {
    onInitErrorRef.current = options.onInitError;
  }, [options.onInitError]);

  useEffect(() => {
    onInitReadyRef.current = options.onInitReady;
  }, [options.onInitReady]);

  useEffect(() => {
    if (debouncedEmitRef.current) {
      debouncedEmitRef.current.cancel();
    }

    // 防抖后再向外抛出 markdown，降低高频输入回调压力。
    debouncedEmitRef.current = debounce(
      (nextMarkdown: string) => {
        onMarkdownChangeRef.current(nextMarkdown);
      },
      options.debounceMs
    );

    return () => {
      debouncedEmitRef.current?.cancel();
      debouncedEmitRef.current = null;
    };
  }, [options.debounceMs]);

  useEffect(() => {
    const rootElement = options.root;
    if (!rootElement) {
      return;
    }

    /** 标记当前 effect 是否已被清理，避免过期异步结果回写。 */
    let disposed = false;
    /** 当前 effect 创建的控制器实例。 */
    let localController: EditorController | null = null;

    void (async () => {
      try {
        const controller = await createEditor({
          root: rootElement,
          portalContainer: options.portalContainer,
          markdown: latestMarkdownRef.current,
          editable: options.editable,
          messages: options.messages,
          slashMenu: options.slashMenu,
          onChange: (nextMarkdown) => {
            currentMarkdownRef.current = nextMarkdown;
            debouncedEmitRef.current?.(nextMarkdown);
          }
        });

        if (disposed) {
          await controller.destroy();
          return;
        }

        localController = controller;
        controllerRef.current = controller;
        onInitReadyRef.current?.();
      } catch (error) {
        if (!disposed) {
          console.error('Milkdown init failed:', error);
          onInitErrorRef.current?.(error);
        }
      }
    })();

    return () => {
      disposed = true;
      debouncedEmitRef.current?.cancel();
      if (!localController) {
        return;
      }
      void localController.destroy();
      if (controllerRef.current === localController) {
        controllerRef.current = null;
      }
      localController = null;
    };
  }, [options.root, options.editable, options.messages, options.portalContainer, options.slashMenu]);

  useEffect(() => {
    /** 当前控制器。 */
    const controller = controllerRef.current;

    if (!controller) {
      return;
    }

    if (options.markdown === currentMarkdownRef.current) {
      return;
    }

    currentMarkdownRef.current = options.markdown;
    void controller.setMarkdown(options.markdown);
  }, [options.markdown]);
};
