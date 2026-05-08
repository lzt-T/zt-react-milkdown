import type { CSSProperties, ReactNode } from 'react';

/**
 * 定义编辑器支持的主题类型。
 */
export type EditorTheme = 'light' | 'dark';

/**
 * 定义编辑器支持的语言类型。
 */
export type EditorLocale = 'zh-CN' | 'en-US';

/**
 * 定义编辑器内置文案结构。
 */
export interface EditorI18nMessages {
  /** 空内容占位提示。 */
  placeholder: string;
  /** 编辑器初始化失败提示。 */
  initError: string;
  /** 编辑器区域无障碍标签。 */
  editorAriaLabel: string;
  /** 公式块源码输入无障碍标签。 */
  mathBlockSourceAriaLabel: string;
  /** 公式块复制按钮无障碍标签。 */
  mathBlockCopyAriaLabel: string;
  /** 公式块删除按钮无障碍标签。 */
  mathBlockDeleteAriaLabel: string;
  /** 公式渲染失败提示。 */
  mathRenderError: string;
}

/**
 * 定义 slash 菜单支持的命令类型。
 */
export type SlashMenuCommand =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'mathBlock';

/**
 * 定义 slash 菜单项结构。
 */
export interface SlashMenuItem {
  /** 菜单项唯一标识。 */
  id: string;
  /** 菜单项展示文案。 */
  label: string;
  /** 菜单项分组文案。 */
  group: string;
  /** 菜单项对应命令。 */
  command: SlashMenuCommand;
}

/**
 * 定义 slash 菜单配置结构。
 */
export interface SlashMenuConfig {
  /** 是否启用 slash 菜单。 */
  enabled?: boolean;
  /** 菜单项配置。 */
  items?: SlashMenuItem[];
}

/**
 * 定义编辑器变更事件回调。
 */
export type EditorChangeHandler = (markdown: string) => void;

/**
 * 定义 React 编辑器组件的属性。
 */
export interface MilkdownEditorProps {
  /** 编辑器受控值。 */
  value?: string;
  /** 编辑器非受控初始值。 */
  defaultValue?: string;
  /** 编辑器内容变化回调。 */
  onChange?: EditorChangeHandler;
  /** 主题模式。 */
  theme?: EditorTheme;
  /** 编辑器语言。 */
  locale?: EditorLocale;
  /** 编辑器文案覆盖项。 */
  messages?: Partial<EditorI18nMessages>;
  /** 容器样式类名。 */
  className?: string;
  /** 占位提示文案。 */
  placeholder?: string;
  /** 是否可编辑。 */
  editable?: boolean;
  /** 编辑区最大高度，超出后在编辑区内部滚动。 */
  maxHeight?: CSSProperties['maxHeight'];
  /** 额外头部内容。 */
  headerSlot?: ReactNode;
  /** slash 菜单配置。 */
  slashMenu?: SlashMenuConfig;
}

/**
 * 定义创建编辑器时所需参数。
 */
export interface CreateEditorOptions {
  /** 绑定的根节点。 */
  root: HTMLElement;
  /** 初始 Markdown 内容。 */
  markdown: string;
  /** 是否允许编辑。 */
  editable: boolean;
  /** 编辑器文案。 */
  messages?: EditorI18nMessages;
  /** slash 菜单配置。 */
  slashMenu?: SlashMenuConfig;
  /** Markdown 变化事件。 */
  onChange: EditorChangeHandler;
}

/**
 * 定义编辑器实例的控制句柄。
 */
export interface EditorController {
  /** 销毁编辑器实例。 */
  destroy: () => Promise<void>;
  /** 同步 Markdown 内容。 */
  setMarkdown: (markdown: string) => Promise<void>;
  /** 同步可编辑状态。 */
  setEditable: (editable: boolean) => Promise<void>;
}
