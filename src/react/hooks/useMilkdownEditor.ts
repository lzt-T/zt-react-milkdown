import { debounce } from 'es-toolkit/function';
import { useEffect, useRef } from 'react';
import type { EditorController, EditorI18nMessages, EditorLocale, ImageUploadConfig, SlashMenuConfig } from '../../types/editor';
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
  /** 当前是否只读。 */
  readOnly: boolean;
  /** 内容变更外发的防抖时长（毫秒）。 */
  debounceMs: number;
  /** 编辑器文案。 */
  messages?: EditorI18nMessages;
  /** 编辑器语言。 */
  locale?: EditorLocale;
  /** slash 菜单配置。 */
  slashMenu?: SlashMenuConfig;
  /** 图片上传配置。 */
  imageUpload?: ImageUploadConfig;
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
  /** 当前最新文案配置引用。 */
  const latestMessagesRef = useRef<EditorI18nMessages | undefined>(options.messages);
  /** 当前最新语言配置引用。 */
  const latestLocaleRef = useRef<EditorLocale | undefined>(options.locale);
  /** 当前最新 slash 菜单配置引用。 */
  const latestSlashMenuRef = useRef<SlashMenuConfig | undefined>(options.slashMenu);
  /** 当前最新图片上传配置引用。 */
  const latestImageUploadRef = useRef<ImageUploadConfig | undefined>(options.imageUpload);
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
    latestMessagesRef.current = options.messages;
  }, [options.messages]);

  useEffect(() => {
    latestLocaleRef.current = options.locale;
  }, [options.locale]);

  useEffect(() => {
    latestSlashMenuRef.current = options.slashMenu;
  }, [options.slashMenu]);

  useEffect(() => {
    latestImageUploadRef.current = options.imageUpload;
  }, [options.imageUpload]);

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
          readOnly: options.readOnly,
          messages: latestMessagesRef.current,
          locale: latestLocaleRef.current,
          slashMenu: latestSlashMenuRef.current,
          imageUpload: latestImageUploadRef.current,
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
    /**
     * 仅结构性依赖触发编辑器重建：
     * - root / portalContainer：宿主容器变化，必须重建。
     * - readOnly：编辑模式切换，按现有行为重建。
     * - locale：语言切换时重建，刷新初始化时注入的插件文案。
     * 内容变化不重建；messages/slashMenu/imageUpload 通过 ref 读取，
     * 避免父组件重渲染时对象引用变化导致输入失焦。
     */
  }, [options.root, options.readOnly, options.portalContainer, options.locale]);

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
