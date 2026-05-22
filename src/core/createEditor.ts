import type { CreateEditorOptions, EditorController } from '../types/editor';
import { createReplaceAllExecutor } from './commands';
import { resolvePresetPlugins } from '../plugins/preset-common';
import { assertKey } from '../utils/guard';
import { dropCursorPlugin, gapCursorPlugin } from '../plugins/custom/cursor';
import { createImageEditableNodeView, configureImageResizableSchema } from '../plugins/custom/image';
import { createMathBlockEditableNodeView, math, mathBackspaceEntryPlugin } from '../plugins/custom/math';
import { blockquoteBackspaceLiftPlugin } from '../plugins/custom/blockquote';
import {
  codeBlockModASelectPlugin,
  codeBlockPrismPlugin,
  createCodeBlockEditableNodeView,
  createCodeBlockLanguagePickerPlugin
} from '../plugins/custom/code-block';
import { createSelectionTooltipPlugin } from '../plugins/custom/selection-tooltip';
import { createSlashMenuPlugin } from '../plugins/custom/slash-menu';
import { createTableFocusActionsPlugin, tableArrowEntryPlugin } from '../plugins/custom/table';
import { taskListToggle } from '../plugins/custom/list';
import { tabSpaceIndentPlugin } from '../plugins/custom/indent';
import { resolveEditorMessages } from '../local/i18n';
import type { PresetPluginExports } from '../plugins/preset-common';
// slash 菜单调试日志前缀。
const SLASH_DEBUG_PREFIX = '[zt-md/slash-debug]';

/**
 * 创建并初始化 Milkdown 编辑器实例。
 */
export const createEditor = async (options: CreateEditorOptions): Promise<EditorController> => {
  /** core 子模块导出。 */
  const coreKit = (await import('@milkdown/core')) as Record<string, unknown>;
  /** clipboard 子模块导出。 */
  const clipboardKit = (await import('@milkdown/plugin-clipboard')) as Record<string, unknown>;
  /** indent 子模块导出。 */
  const indentKit = (await import('@milkdown/plugin-indent')) as Record<string, unknown>;
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
  /** clipboard 插件导出对象。 */
  const clipboard = assertKey(clipboardKit, 'clipboard');
  /** indent 插件导出对象。 */
  const indent = assertKey(indentKit, 'indent');
  /** indent 配置上下文。 */
  const indentConfig = assertKey(indentKit, 'indentConfig');
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
  /** 选区 tooltip 菜单插件实例。 */
  const selectionTooltipPlugin = createSelectionTooltipPlugin(options.portalContainer, messages);
  /** 代码块语言选择器插件实例。 */
  const codeBlockLanguagePickerPlugin = createCodeBlockLanguagePickerPlugin(messages, options.portalContainer);

  /** 默认插件集合。 */
  const slashSetup = await createSlashMenuPlugin(
    options.portalContainer,
    options.slashMenu,
    messages,
    options.imageUpload,
    options.locale
  );
  /** slash 插件实例列表。 */
  const slashPlugins = slashSetup.plugins;
  console.log(`${SLASH_DEBUG_PREFIX} CREATE_EDITOR_SLASH_PLUGIN`, {
    isNull: slashPlugins.length === 0,
    pluginCount: slashPlugins.length
  });
  /** 预设插件导出集合。 */
  const presetPluginExports: PresetPluginExports = {
    listener,
    commonmark,
    gfm,
    codeBlockPrism: codeBlockPrismPlugin,
    codeBlockLanguagePicker: codeBlockLanguagePickerPlugin,
    clipboard,
    indent,
    tableArrowEntry: tableArrowEntryPlugin,
    mathBackspaceEntry: mathBackspaceEntryPlugin,
    blockquoteBackspaceLift: blockquoteBackspaceLiftPlugin,
    tableFocusActions: tableFocusActionsPlugin,
    selectionTooltip: selectionTooltipPlugin,
    gapCursor: gapCursorPlugin,
    dropCursor: dropCursorPlugin,
    math,
    taskListToggle,
    tabSpaceIndent: tabSpaceIndentPlugin,
    codeBlockModASelect: codeBlockModASelectPlugin,
    slash: slashPlugins.length > 0 ? slashPlugins : null
  };
  /** 启动阶段插件集合（不含运行时延迟插件）。 */
  const bootstrapPlugins = resolvePresetPlugins(presetPluginExports, {
    includeRuntime: false
  });
  /** 运行时延迟注册插件集合。 */
  const runtimePlugins = resolvePresetPlugins(presetPluginExports, {
    includeRuntime: true
  });
  /** 运行时插件描述列表。 */
  const runtimePluginDescriptors = runtimePlugins.filter((descriptor) =>
    descriptor.name === 'clipboard' || descriptor.name === 'indent'
  );
  console.log(`${SLASH_DEBUG_PREFIX} PRESET_PLUGIN_NAMES`, {
    names: bootstrapPlugins.map((descriptor) => descriptor.name)
  });
  console.log(`${SLASH_DEBUG_PREFIX} RUNTIME_PLUGIN_NAMES`, {
    names: runtimePluginDescriptors.map((descriptor) => descriptor.name)
  });

  /** 编辑器实例。 */
  const editor = Editor.make();
  editor.config((ctx: any) => {
    configureImageResizableSchema(ctx);
    ctx.set(rootCtx, options.root);
    ctx.set(defaultValueCtx, options.markdown);
    ctx.set(editorViewOptionsCtx, {
      editable: () => options.editable,
      handleClick: (_view: unknown, _position: number, event: MouseEvent) => {
        // 当前点击目标节点。
        const target = event.target;
        if (!(target instanceof Element)) {
          return false;
        }

        // 当前点击命中的链接元素。
        const anchor = target.closest('a[href]');
        if (!(anchor instanceof HTMLAnchorElement)) {
          return false;
        }

        // 当前链接地址。
        const href = anchor.getAttribute('href')?.trim();
        if (!href) {
          return false;
        }

        // 仅在 Ctrl+点击 时触发链接跳转。
        if (!event.ctrlKey) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      }
    });
    /** 当前 nodeView 注册列表。 */
    const currentNodeViews = (ctx.get(nodeViewCtx) ?? []) as Array<[string, unknown]>;
    ctx.set(nodeViewCtx, [
      ...currentNodeViews,
      ['image', createImageEditableNodeView(messages)],
      ['math_block', createMathBlockEditableNodeView(messages)],
      ['code_block', createCodeBlockEditableNodeView(messages)]
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

  bootstrapPlugins.forEach((descriptor) => {
    editor.use(descriptor.plugin);
  });

  await editor.create();
  runtimePluginDescriptors.forEach((descriptor) => {
    try {
      editor.use(descriptor.plugin);
      if (descriptor.name === 'indent') {
        editor.action((ctx: any) => {
          ctx.set(indentConfig, {
            type: 'space',
            size: 4
          });
        });
      }
      console.log(`${SLASH_DEBUG_PREFIX} RUNTIME_PLUGIN_REGISTERED`, {
        name: descriptor.name
      });
    } catch (error) {
      console.error(`${SLASH_DEBUG_PREFIX} RUNTIME_PLUGIN_REGISTER_FAILED`, {
        name: descriptor.name,
        error
      });
    }
  });

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
