import type {
  EditorChangeHandler,
  EditorI18nMessages,
  EditorLocale,
  ImageUploadConfig,
  SlashMenuConfig
} from '../types/editor';
import type { Node as ProseNode } from '@milkdown/prose/model';
import {
  defaultValueCtx,
  Editor,
  editorViewOptionsCtx,
  nodeViewCtx,
  rootCtx
} from '@milkdown/core';
import { clipboard } from '@milkdown/plugin-clipboard';
import { history } from '@milkdown/plugin-history';
import { indent, indentConfig } from '@milkdown/plugin-indent';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { replaceAll } from '@milkdown/utils';
import { createReplaceAllExecutor } from './commands';
import { resolvePresetPlugins } from '../plugins/preset-common';
import { dropCursorPlugin, gapCursorPlugin } from '../plugins/custom/cursor';
import {
  createImageEditableNodeView,
  configureImageResizableSchema,
  imageDeleteSelectionPlugin
} from '../plugins/custom/image';
import {
  createMathBlockEditableNodeView,
  createMathInlineEditPlugin,
  createMathInlineEditableNodeView,
  math,
  mathInlineArrowNavigationPlugin,
  mathBackspaceEntryPlugin
} from '../plugins/custom/math';
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
import { normalizeSafeUrl } from '../utils/security';

/**
 * 定义 Milkdown 原生编辑器实例类型。
 */
export type NativeMilkdownEditor = ReturnType<typeof Editor.make>;

/**
 * 定义已配置编辑器的运行时句柄。
 */
export interface MilkdownEditorRuntime {
  /** Milkdown 原生编辑器实例。 */
  editor: NativeMilkdownEditor;
  /** 注册需要在 create 后延迟启用的插件。 */
  installRuntimePlugins: () => void;
  /** 同步 Markdown 内容。 */
  setMarkdown: (markdown: string) => void;
}

/**
 * 定义创建 Milkdown 编辑器运行时时所需参数。
 */
export interface CreateMilkdownEditorRuntimeOptions {
  /** 绑定的根节点。 */
  root: HTMLElement;
  /** 编辑器内部浮层 Portal 容器。 */
  portalContainer: HTMLElement;
  /** 编辑器内容附属浮层 Portal 容器。 */
  contentPortalContainer: HTMLElement;
  /** 初始 Markdown 内容。 */
  markdown: string;
  /** 是否只读。 */
  readOnly: boolean;
  /** 编辑器文案。 */
  messages?: EditorI18nMessages;
  /** 编辑器语言。 */
  locale?: EditorLocale;
  /** slash 菜单配置。 */
  slashMenu?: SlashMenuConfig;
  /** 图片上传配置。 */
  imageUpload?: ImageUploadConfig;
  /** Markdown 变化事件。 */
  onChange: EditorChangeHandler;
}

/**
 * 获取当前事件命中的链接元素。
 */
const resolveEventAnchor = (event: MouseEvent): HTMLAnchorElement | null => {
  // 当前点击目标节点。
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }

  // 当前点击命中的链接元素。
  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
};

/**
 * 判断当前节点是否为图片节点。
 */
const isImageNode = (node: ProseNode | null | undefined): boolean => {
  return node?.type.name === 'image';
};

/**
 * 处理编辑器内链接点击跳转。
 */
const handleEditorLinkClick = (event: MouseEvent, readOnly: boolean): boolean => {
  // 当前点击命中的链接元素。
  const anchor = resolveEventAnchor(event);
  if (!anchor) {
    return false;
  }

  // 当前链接地址。
  const href = normalizeSafeUrl(anchor.getAttribute('href'));
  if (!href) {
    return false;
  }

  // 只读态下禁用编辑器内链接点击跳转。
  if (readOnly) {
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
};

/**
 * 只读态下拦截原生链接点击，避免浏览器默认跳转。
 */
const blockReadonlyLinkClick = (event: MouseEvent, readOnly: boolean): boolean => {
  if (!readOnly || !resolveEventAnchor(event)) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
};

/**
 * 创建面向 React 生命周期的 Milkdown 编辑器运行时。
 */
export const createMilkdownEditorRuntime = (
  options: CreateMilkdownEditorRuntimeOptions
): MilkdownEditorRuntime => {
  /** 编辑器文案。 */
  const messages = options.messages ?? resolveEditorMessages();
  /** 表格聚焦操作插件实例。 */
  const tableFocusActionsPlugin = createTableFocusActionsPlugin(options.contentPortalContainer, messages);
  /** 选区 tooltip 菜单插件实例。 */
  const selectionTooltipPlugin = createSelectionTooltipPlugin(options.contentPortalContainer, messages);
  /** 代码块语言选择器插件实例。 */
  const codeBlockLanguagePickerPlugin = createCodeBlockLanguagePickerPlugin(messages, options.contentPortalContainer);
  /** 行内公式编辑插件实例。 */
  const mathInlineEditPlugin = createMathInlineEditPlugin(messages, options.contentPortalContainer);

  /** 默认插件集合。 */
  const slashSetup = createSlashMenuPlugin(
    options.portalContainer,
    options.slashMenu,
    messages,
    options.imageUpload,
    options.locale
  );
  /** slash 插件实例列表。 */
  const slashPlugins = slashSetup.plugins;
  /** 预设插件导出集合。 */
  const presetPluginExports: PresetPluginExports = {
    listener,
    commonmark,
    gfm,
    history,
    codeBlockPrism: codeBlockPrismPlugin,
    codeBlockLanguagePicker: codeBlockLanguagePickerPlugin,
    clipboard,
    indent,
    imageDeleteSelection: imageDeleteSelectionPlugin,
    tableArrowEntry: tableArrowEntryPlugin,
    mathBackspaceEntry: mathBackspaceEntryPlugin,
    blockquoteBackspaceLift: blockquoteBackspaceLiftPlugin,
    tableFocusActions: tableFocusActionsPlugin,
    selectionTooltip: selectionTooltipPlugin,
    gapCursor: gapCursorPlugin,
    dropCursor: dropCursorPlugin,
    math,
    mathInlineEdit: mathInlineEditPlugin,
    mathInlineArrowNavigation: mathInlineArrowNavigationPlugin,
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

  /** 编辑器实例。 */
  const editor = Editor.make();
  editor.config((ctx: any) => {
    configureImageResizableSchema(ctx);
    ctx.set(rootCtx, options.root);
    ctx.set(defaultValueCtx, options.markdown);
    ctx.set(editorViewOptionsCtx, {
      editable: () => !options.readOnly,
      handleDOMEvents: {
        mousedown: (_view: unknown, event: Event) => {
          return event instanceof MouseEvent
            ? blockReadonlyLinkClick(event, options.readOnly)
            : false;
        },
        click: (_view: unknown, event: Event) => {
          return event instanceof MouseEvent
            ? blockReadonlyLinkClick(event, options.readOnly)
            : false;
        }
      },
      handleClick: (_view: unknown, _position: number, event: MouseEvent) => {
        return handleEditorLinkClick(event, options.readOnly);
      },
      handleClickOn: (
        _view: unknown,
        _position: number,
        node: ProseNode,
        _nodePosition: number,
        event: MouseEvent,
        direct: boolean
      ) => {
        if (handleEditorLinkClick(event, options.readOnly)) {
          return true;
        }

        // 仅拦截直接点击到的只读图片节点，避免进入选中态。
        if (options.readOnly && direct && isImageNode(node)) {
          event.preventDefault();
          return true;
        }

        return false;
      }
    });
    /** 当前 nodeView 注册列表。 */
    const currentNodeViews = (ctx.get(nodeViewCtx) ?? []) as Array<[string, unknown]>;
    ctx.set(nodeViewCtx, [
      ...currentNodeViews,
      ['image', createImageEditableNodeView(messages)],
      ['math_block', createMathBlockEditableNodeView(messages)],
      ['math_inline', createMathInlineEditableNodeView(messages)],
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
    editor.use(descriptor.plugin as any);
  });

  /**
   * 注册运行时延迟插件。
   */
  const installRuntimePlugins = (): void => {
    runtimePluginDescriptors.forEach((descriptor) => {
      try {
        editor.use(descriptor.plugin as any);
        if (descriptor.name === 'indent') {
          editor.action((ctx: any) => {
            ctx.set(indentConfig, {
              type: 'space',
              size: 4
            });
          });
        }
      } catch (error) {
        console.error(error);
      }
    });
  };

  /** replaceAll 命令执行器。 */
  const runReplaceAll = createReplaceAllExecutor(replaceAll, editor as any);

  return {
    editor,
    installRuntimePlugins,
    setMarkdown: (markdown: string): void => {
      runReplaceAll(markdown);
    }
  };
};
