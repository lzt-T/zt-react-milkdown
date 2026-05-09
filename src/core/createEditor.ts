import type { CreateEditorOptions, EditorController } from '../types/editor';
import { createReplaceAllExecutor } from './commands';
import { resolvePresetPlugins } from '../plugins/preset-common';
import { assertKey } from '../utils/guard';
import { dropCursorPlugin } from '../plugins/custom/drop-cursor';
import { gapCursorPlugin } from '../plugins/custom/gap-cursor';
import { createMathBlockEditableNodeView } from '../plugins/custom/math-block-editable';
import { math } from '../plugins/custom/math-plugin';
import { createSlashMenuPlugin } from '../plugins/custom/slash-menu';
import { tableArrowEntryPlugin } from '../plugins/custom/table-arrow-entry';
import { createTableFocusActionsPlugin } from '../plugins/custom/table-focus-actions';
import { taskListToggle } from '../plugins/custom/task-list-toggle';
import { resolveEditorMessages } from '../local/i18n';
// slash 菜单调试日志前缀。
const SLASH_DEBUG_PREFIX = '[zt-md/slash-debug]';

/**
 * 创建并初始化 Milkdown 编辑器实例。
 */
export const createEditor = async (options: CreateEditorOptions): Promise<EditorController> => {
  /** core 子模块导出。 */
  const coreKit = (await import('@milkdown/core')) as Record<string, unknown>;
  /** listener 子模块导出。 */
  const listenerKit = (await import('@milkdown/plugin-listener')) as Record<string, unknown>;
  /** commonmark 子模块导出。 */
  const commonmarkKit = (await import('@milkdown/preset-commonmark')) as Record<string, unknown>;
  /** gfm 子模块导出。 */
  const gfmKit = (await import('@milkdown/preset-gfm')) as Record<string, unknown>;
  /** utils 子模块导出。 */
  const utilsKit = (await import('@milkdown/utils')) as Record<string, unknown>;

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
  /** nodeViewCtx 导出对象。 */
  const nodeViewCtx = assertKey(coreKit, 'nodeViewCtx');
  /** listenerCtx 导出对象。 */
  const listenerCtx = assertKey(listenerKit, 'listenerCtx');
  /** listener 插件导出对象。 */
  const listener = assertKey(listenerKit, 'listener');
  /** commonmark 插件导出对象。 */
  const commonmark = assertKey(commonmarkKit, 'commonmark');
  /** gfm 插件导出对象。 */
  const gfm = assertKey(gfmKit, 'gfm');
  /** replaceAll 命令导出对象。 */
  const replaceAll = assertKey(utilsKit, 'replaceAll');
  /** 编辑器文案。 */
  const messages = options.messages ?? resolveEditorMessages();
  /** 表格聚焦操作插件实例。 */
  const tableFocusActionsPlugin = createTableFocusActionsPlugin(options.portalContainer, messages);

  /** 默认插件集合。 */
  const slashSetup = await createSlashMenuPlugin(options.portalContainer, options.slashMenu);
  /** slash 插件实例列表。 */
  const slashPlugins = slashSetup.plugins;
  console.log(`${SLASH_DEBUG_PREFIX} CREATE_EDITOR_SLASH_PLUGIN`, {
    isNull: slashPlugins.length === 0,
    pluginCount: slashPlugins.length
  });
  /** 默认插件集合。 */
  const defaultPlugins = resolvePresetPlugins({
    listener,
    commonmark,
    gfm,
    tableArrowEntry: tableArrowEntryPlugin,
    tableFocusActions: tableFocusActionsPlugin,
    gapCursor: gapCursorPlugin,
    dropCursor: dropCursorPlugin,
    math,
    taskListToggle,
    slash: slashPlugins.length > 0 ? slashPlugins : null
  });
  console.log(`${SLASH_DEBUG_PREFIX} PRESET_PLUGIN_NAMES`, {
    names: defaultPlugins.map((descriptor) => descriptor.name)
  });

  /** 编辑器实例。 */
  const editor = Editor.make();
  editor.config((ctx: any) => {
    ctx.set(rootCtx, options.root);
    ctx.set(defaultValueCtx, options.markdown);
    ctx.set(editorViewOptionsCtx, {
      editable: () => options.editable
    });
    /** 当前 nodeView 注册列表。 */
    const currentNodeViews = (ctx.get(nodeViewCtx) ?? []) as Array<[string, unknown]>;
    ctx.set(nodeViewCtx, [
      ...currentNodeViews,
      ['math_block', createMathBlockEditableNodeView(messages)]
    ]);

    /** 监听器管理器。 */
    const listenerManager = ctx.get(listenerCtx);
    listenerManager.markdownUpdated((_ctx: unknown, markdown: string) => {
      options.onChange(markdown);
    });

    if (slashSetup.config) {
      slashSetup.config(ctx);
    }
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
