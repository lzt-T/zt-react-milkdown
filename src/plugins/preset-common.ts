import type { EditorPluginDescriptor } from '../types/plugin';

/**
 * 默认插件导出集合。
 */
export interface PresetPluginExports {
  /** listener 插件实例。 */
  listener: unknown;
  /** commonmark 插件实例。 */
  commonmark: unknown;
  /** gfm 插件实例。 */
  gfm: unknown;
  /** history 插件实例。 */
  history: unknown;
  /** 代码块 prism 高亮插件实例。 */
  codeBlockPrism: unknown;
  /** 代码块语言选择器插件实例。 */
  codeBlockLanguagePicker: unknown;
  /** clipboard 插件实例。 */
  clipboard: unknown;
  /** indent 插件实例。 */
  indent: unknown;
  /** 图片两段式删除插件实例。 */
  imageDeleteSelection: unknown;
  /** 表格方向键进入插件实例。 */
  tableArrowEntry: unknown;
  /** 公式块 Backspace 进入插件实例。 */
  mathBackspaceEntry: unknown;
  /** 引用块首段 Backspace 提升插件实例。 */
  blockquoteBackspaceLift: unknown;
  /** 表格聚焦操作插件实例。 */
  tableFocusActions: unknown;
  /** 选中文本 tooltip 菜单插件实例。 */
  selectionTooltip: unknown;
  /** 块间光标插件实例。 */
  gapCursor: unknown;
  /** 拖拽落点指示器插件实例。 */
  dropCursor: unknown;
  /** math 插件实例（可为单个插件或插件数组）。 */
  math: unknown | unknown[];
  /** 行内公式编辑插件实例。 */
  mathInlineEdit: unknown;
  /** 行内公式方向键导航插件实例。 */
  mathInlineArrowNavigation: unknown;
  /** 任务列表交互插件实例。 */
  taskListToggle: unknown;
  /** 全局 Tab 空格缩进插件实例。 */
  tabSpaceIndent: unknown;
  /** 代码块内 Mod-A 全选插件实例。 */
  codeBlockModASelect: unknown;
  /** slash 插件实例（可为 null 表示关闭）。 */
  slash?: unknown | null;
}

/**
 * 默认插件收集配置。
 */
export interface ResolvePresetPluginsOptions {
  /** 是否包含运行时延迟注册插件。 */
  includeRuntime?: boolean;
}

/**
 * 将单个或多个插件统一追加到描述列表。
 */
const appendPluginDescriptors = (
  descriptors: EditorPluginDescriptor[],
  baseName: string,
  pluginOrPlugins: unknown | unknown[]
): void => {
  if (Array.isArray(pluginOrPlugins)) {
    pluginOrPlugins.forEach((plugin, index) => {
      descriptors.push({ name: `${baseName}-${index}`, plugin });
    });
    return;
  }

  descriptors.push({ name: baseName, plugin: pluginOrPlugins });
};

/**
 * 基于显式插件导出收集默认插件。
 */
export const resolvePresetPlugins = (
  pluginExports: PresetPluginExports,
  options: ResolvePresetPluginsOptions = {}
): EditorPluginDescriptor[] => {
  /** 默认插件描述列表。 */
  const descriptors: EditorPluginDescriptor[] = [];
  /** 是否包含运行时插件。 */
  const includeRuntime = options.includeRuntime ?? true;

  appendPluginDescriptors(descriptors, 'listener', pluginExports.listener);
  appendPluginDescriptors(descriptors, 'commonmark', pluginExports.commonmark);
  appendPluginDescriptors(descriptors, 'gfm', pluginExports.gfm);
  appendPluginDescriptors(descriptors, 'history', pluginExports.history);
  appendPluginDescriptors(descriptors, 'code-block-prism', pluginExports.codeBlockPrism);
  appendPluginDescriptors(descriptors, 'code-block-language-picker', pluginExports.codeBlockLanguagePicker);
  if (includeRuntime) {
    appendPluginDescriptors(descriptors, 'clipboard', pluginExports.clipboard);
    appendPluginDescriptors(descriptors, 'indent', pluginExports.indent);
  }
  appendPluginDescriptors(descriptors, 'image-delete-selection', pluginExports.imageDeleteSelection);
  appendPluginDescriptors(descriptors, 'table-arrow-entry', pluginExports.tableArrowEntry);
  appendPluginDescriptors(descriptors, 'math-backspace-entry', pluginExports.mathBackspaceEntry);
  appendPluginDescriptors(descriptors, 'blockquote-backspace-lift', pluginExports.blockquoteBackspaceLift);
  appendPluginDescriptors(descriptors, 'table-focus-actions', pluginExports.tableFocusActions);
  appendPluginDescriptors(descriptors, 'selection-tooltip', pluginExports.selectionTooltip);
  appendPluginDescriptors(descriptors, 'gap-cursor', pluginExports.gapCursor);
  appendPluginDescriptors(descriptors, 'drop-cursor', pluginExports.dropCursor);
  appendPluginDescriptors(descriptors, 'math', pluginExports.math);
  appendPluginDescriptors(descriptors, 'math-inline-edit', pluginExports.mathInlineEdit);
  appendPluginDescriptors(descriptors, 'math-inline-arrow-navigation', pluginExports.mathInlineArrowNavigation);
  appendPluginDescriptors(descriptors, 'task-list-toggle', pluginExports.taskListToggle);
  appendPluginDescriptors(descriptors, 'tab-space-indent', pluginExports.tabSpaceIndent);
  appendPluginDescriptors(descriptors, 'code-block-mod-a-select', pluginExports.codeBlockModASelect);
  if (pluginExports.slash) {
    appendPluginDescriptors(descriptors, 'slash', pluginExports.slash);
  }

  return descriptors;
};
