import { debounce } from 'es-toolkit/function';
import { useEffect, useMemo, useRef } from 'react';
import { useEditor } from '@milkdown/react';
import type { EditorController, EditorI18nMessages, SlashMenuConfig } from '../../types/editor';
import { createEditor } from '../../core/createEditor';

/**
 * 定义 useMilkdownEditor 的输入参数。
 */
export interface UseMilkdownEditorOptions {
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
 * 定义给 @milkdown/react 使用的生命周期适配器。
 */
interface ReactEditorLifecycleAdapter {
  /** 启动编辑器。 */
  create: () => Promise<ReactEditorLifecycleAdapter>;
  /** 销毁编辑器。 */
  destroy: () => Promise<void>;
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

  /** 稳定的编辑器工厂函数。 */
  const getEditor = useMemo(() => {
    return (root: HTMLElement): ReactEditorLifecycleAdapter => {
      /** 当前适配器的实例状态。 */
      let controller: EditorController | null = null;

      /** 生命周期适配器。 */
      const adapter: ReactEditorLifecycleAdapter = {
        create: async () => {
          try {
            controller = await createEditor({
              root,
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
            controllerRef.current = controller;
            onInitReadyRef.current?.();
          } catch (error) {
            console.error('Milkdown init failed:', error);
            onInitErrorRef.current?.(error);
          }
          return adapter;
        },
        destroy: async () => {
          debouncedEmitRef.current?.cancel();
          if (!controller) {
            return;
          }
          await controller.destroy();
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
          controller = null;
        }
      };

      return adapter;
    };
  }, [options.editable, options.messages, options.portalContainer, options.slashMenu]);

  useEditor(getEditor, [getEditor]);

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
