import { useEffect, useRef } from 'react';
import type { EditorController, EditorI18nMessages, SlashMenuConfig } from '../../types/editor';
import { createEditor } from '../../core/createEditor';

/**
 * 定义 useMilkdownEditor 的输入参数。
 */
export interface UseMilkdownEditorOptions {
  /** 编辑器容器节点。 */
  container: HTMLElement | null;
  /** 需要同步到编辑器的 markdown。 */
  markdown: string;
  /** 当前是否可编辑。 */
  editable: boolean;
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
  /** markdown 变更回调引用。 */
  const onMarkdownChangeRef = useRef<(markdown: string) => void>(options.onMarkdownChange);
  /** 初始化失败回调引用。 */
  const onInitErrorRef = useRef<((error: unknown) => void) | undefined>(options.onInitError);
  /** 初始化成功回调引用。 */
  const onInitReadyRef = useRef<(() => void) | undefined>(options.onInitReady);

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
    if (!options.container) {
      return;
    }
    /** 已校验非空的容器节点。 */
    const container = options.container;

    /** 是否已经被销毁。 */
    let disposed = false;

    /**
     * 启动编辑器实例。
     */
    const boot = async (): Promise<void> => {
      try {
        /** 新建控制器。 */
        const controller = await createEditor({
          root: container,
          markdown: options.markdown,
          editable: options.editable,
          messages: options.messages,
          slashMenu: options.slashMenu,
          onChange: (nextMarkdown) => {
            currentMarkdownRef.current = nextMarkdown;
            onMarkdownChangeRef.current(nextMarkdown);
          }
        });

        if (disposed) {
          await controller.destroy();
          return;
        }

        controllerRef.current = controller;
        onInitReadyRef.current?.();
      } catch (error) {
        console.error('Milkdown init failed:', error);
        onInitErrorRef.current?.(error);
      }
    };

    void boot();

    return () => {
      disposed = true;
      /** 旧控制器引用。 */
      const prevController = controllerRef.current;
      controllerRef.current = null;

      if (prevController) {
        void prevController.destroy();
      }
    };
  }, [
    options.container,
    options.editable,
    options.slashMenu,
    options.messages?.mathBlockSourceAriaLabel,
    options.messages?.mathRenderError
  ]);

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
