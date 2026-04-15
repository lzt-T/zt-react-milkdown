import type { CreateEditorOptions, EditorController } from '../types/editor';
import { createReplaceAllExecutor } from './commands';
import { resolvePresetPlugins } from '../plugins/preset-common';
import { assertKey } from '../utils/guard';

/**
 * 创建并初始化 Milkdown 编辑器实例。
 */
export const createEditor = async (options: CreateEditorOptions): Promise<EditorController> => {
  /** core 子模块导出。 */
  const coreKit = (await import('@milkdown/kit/core')) as Record<string, unknown>;
  /** listener 子模块导出。 */
  const listenerKit = (await import('@milkdown/kit/plugin/listener')) as Record<string, unknown>;
  /** commonmark 子模块导出。 */
  const commonmarkKit = (await import('@milkdown/kit/preset/commonmark')) as Record<string, unknown>;
  /** gfm 子模块导出。 */
  const gfmKit = (await import('@milkdown/kit/preset/gfm')) as Record<string, unknown>;
  /** math 子模块导出。 */
  const mathKit = (await import('@milkdown/plugin-math')) as Record<string, unknown>;
  /** utils 子模块导出。 */
  const utilsKit = (await import('@milkdown/kit/utils')) as Record<string, unknown>;

  /** Editor 构造对象。 */
  const Editor = assertKey(coreKit, 'Editor') as {
    make: () => {
      config: (handler: (ctx: unknown) => void) => unknown;
      use: (plugin: unknown) => unknown;
      create: () => Promise<unknown>;
      action: (handler: unknown) => void;
      destroy: () => Promise<void>;
    };
  };

  /** rootCtx 导出对象。 */
  const rootCtx = assertKey(coreKit, 'rootCtx');
  /** defaultValueCtx 导出对象。 */
  const defaultValueCtx = assertKey(coreKit, 'defaultValueCtx');
  /** editorViewOptionsCtx 导出对象。 */
  const editorViewOptionsCtx = assertKey(coreKit, 'editorViewOptionsCtx');
  /** listenerCtx 导出对象。 */
  const listenerCtx = assertKey(listenerKit, 'listenerCtx');
  /** listener 插件导出对象。 */
  const listener = assertKey(listenerKit, 'listener');
  /** commonmark 插件导出对象。 */
  const commonmark = assertKey(commonmarkKit, 'commonmark');
  /** gfm 插件导出对象。 */
  const gfm = assertKey(gfmKit, 'gfm');
  /** math 插件导出对象。 */
  const math = assertKey(mathKit, 'math');
  /** replaceAll 命令导出对象。 */
  const replaceAll = assertKey(utilsKit, 'replaceAll');

  /** 默认插件集合。 */
  const defaultPlugins = resolvePresetPlugins({
    listener,
    commonmark,
    gfm,
    math
  });

  /** 编辑器实例。 */
  const editor = Editor.make();

  editor.config((ctx: any) => {
    ctx.set(rootCtx, options.root);
    ctx.set(defaultValueCtx, options.markdown);
    ctx.set(editorViewOptionsCtx, {
      editable: () => options.editable
    });

    /** 监听器管理器。 */
    const listenerManager = ctx.get(listenerCtx);
    listenerManager.markdownUpdated((_ctx: unknown, markdown: string) => {
      options.onChange(markdown);
    });
  });

  defaultPlugins.forEach((descriptor) => {
    editor.use(descriptor.plugin);
  });

  await editor.create();

  /** replaceAll 命令执行器。 */
  const runReplaceAll = createReplaceAllExecutor(replaceAll, editor);

  return {
    destroy: async () => {
      await editor.destroy();
    },
    setMarkdown: async (markdown: string) => {
      runReplaceAll(markdown);
    },
    setEditable: async (_editable: boolean) => {
      // 当前版本通过重建实例处理 editable 切换，此处保留接口兼容性。
    }
  };
};
