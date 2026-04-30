import type { ReactNode } from 'react';

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
  /** 公式渲染失败提示。 */
  mathRenderError: string;
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
  /** 额外头部内容。 */
  headerSlot?: ReactNode;
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
