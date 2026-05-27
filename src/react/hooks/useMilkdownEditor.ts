import { useEditor } from '@milkdown/react';
import { debounce } from 'es-toolkit/function';
import { useEffect, useRef } from 'react';
import type {
  EditorI18nMessages,
  EditorLocale,
  ImageUploadConfig,
  SlashMenuConfig
} from '../../types/editor';
import {
  createMilkdownEditorRuntime,
  type MilkdownEditorRuntime,
  type NativeMilkdownEditor
} from '../../core/createEditor';

/**
 * 定义 useMilkdownEditor 的输入参数。
 */
export interface UseMilkdownEditorOptions {
  /** 需要同步到编辑器的 markdown。 */
  markdown: string;
  /** 编辑器内部浮层 Portal 容器。 */
  portalContainer: HTMLElement;
  /** 编辑器内容附属浮层 Portal 容器。 */
  contentPortalContainer: HTMLElement;
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
 * 为 React 生命周期包装 Milkdown create 方法。
 */
const wrapEditorCreate = (
  editor: NativeMilkdownEditor,
  installRuntimePlugins: () => void,
  onReady: () => void,
  onError: (error: unknown) => void
): NativeMilkdownEditor => {
  /** 可覆盖 create 方法的编辑器视图。 */
  const mutableEditor = editor as NativeMilkdownEditor & {
    create: () => Promise<NativeMilkdownEditor>;
  };
  /** 原始 create 方法。 */
  const runCreate = mutableEditor.create.bind(editor);

  mutableEditor.create = async () => {
    try {
      // 创建结果由 @milkdown/react 写入实例引用。
      const createdEditor = await runCreate();
      installRuntimePlugins();
      onReady();
      return createdEditor;
    } catch (error) {
      console.error('Milkdown init failed:', error);
      onError(error);
      throw error;
    }
  };

  return mutableEditor;
};

/**
 * 封装 Milkdown React 生命周期与外部同步流程。
 */
export const useMilkdownEditor = (options: UseMilkdownEditorOptions): void => {
  /** 编辑器运行时引用。 */
  const runtimeRef = useRef<MilkdownEditorRuntime | null>(null);
  /** 当前已写入编辑器的 markdown。 */
  const currentMarkdownRef = useRef<string>(options.markdown);
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

  /** 当前 Milkdown React 实例信息。 */
  const editorInfo = useEditor(
    (root) => {
      runtimeRef.current = null;
      currentMarkdownRef.current = options.markdown;

      /** 编辑器运行时。 */
      const runtime = createMilkdownEditorRuntime({
        root,
        portalContainer: options.portalContainer,
        contentPortalContainer: options.contentPortalContainer,
        markdown: options.markdown,
        readOnly: options.readOnly,
        messages: options.messages,
        locale: options.locale,
        slashMenu: options.slashMenu,
        imageUpload: options.imageUpload,
        onChange: (nextMarkdown) => {
          currentMarkdownRef.current = nextMarkdown;
          debouncedEmitRef.current?.(nextMarkdown);
        }
      });

      return wrapEditorCreate(
        runtime.editor,
        runtime.installRuntimePlugins,
        () => {
          runtimeRef.current = runtime;
          onInitReadyRef.current?.();
        },
        (error) => {
          onInitErrorRef.current?.(error);
        }
      ) as any;
    },
    [options.portalContainer, options.contentPortalContainer, options.readOnly, options.locale]
  );

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
    return () => {
      runtimeRef.current = null;
    };
  }, [options.portalContainer, options.contentPortalContainer, options.readOnly, options.locale]);

  useEffect(() => {
    /** 当前编辑器运行时。 */
    const runtime = runtimeRef.current;

    if (!runtime || editorInfo.loading) {
      return;
    }

    if (options.markdown === currentMarkdownRef.current) {
      return;
    }

    currentMarkdownRef.current = options.markdown;
    runtime.setMarkdown(options.markdown);
  }, [editorInfo.loading, options.markdown]);
};
