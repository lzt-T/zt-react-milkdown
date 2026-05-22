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
  /** 图片删除按钮无障碍标签。 */
  imageDeleteAriaLabel: string;
  /** 表格删除按钮无障碍标签。 */
  tableDeleteAriaLabel: string;
  /** 表格更多按钮无障碍标签。 */
  tableMoreAriaLabel: string;
  /** 表格列左对齐按钮无障碍标签。 */
  tableAlignLeftAriaLabel: string;
  /** 表格列居中按钮无障碍标签。 */
  tableAlignCenterAriaLabel: string;
  /** 表格列右对齐按钮无障碍标签。 */
  tableAlignRightAriaLabel: string;
  /** 表格上方插入行按钮文案。 */
  tableInsertRowAboveLabel: string;
  /** 表格下方插入行按钮文案。 */
  tableInsertRowBelowLabel: string;
  /** 表格左侧插入列按钮文案。 */
  tableInsertColumnLeftLabel: string;
  /** 表格右侧插入列按钮文案。 */
  tableInsertColumnRightLabel: string;
  /** 表格删除当前行按钮文案。 */
  tableDeleteRowLabel: string;
  /** 表格删除当前列按钮文案。 */
  tableDeleteColumnLabel: string;
  /** 公式渲染失败提示。 */
  mathRenderError: string;
  /** 图片上传弹窗标题。 */
  imageUploadDialogTitle: string;
  /** 图片文件拖拽区域提示。 */
  imageUploadDropLabel: string;
  /** 图片文件选择按钮文案。 */
  imageUploadPickFileLabel: string;
  /** 图片文件上传页签文案。 */
  imageUploadFileTab: string;
  /** 图片链接页签文案。 */
  imageUploadUrlTab: string;
  /** 图片链接输入框占位文案。 */
  imageUploadUrlPlaceholder: string;
  /** 图片链接插入按钮文案。 */
  imageUploadInsertUrlLabel: string;
  /** 图片插入确认按钮文案。 */
  imageUploadConfirmLabel: string;
  /** 图片上传中提示。 */
  imageUploadUploadingLabel: string;
  /** 图片上传取消按钮文案。 */
  imageUploadCancelLabel: string;
  /** 图片加载失败提示。 */
  imageUploadLoadFailed: string;
  /** 图片重新选择提示。 */
  imageUploadReselectHint: string;
  /** 图片格式和大小提示。 */
  imageUploadSupportsAndMax: string;
  /** 文件过大错误提示。 */
  imageUploadFileTooLarge: string;
  /** 文件过大错误提示（带体积占位符）。 */
  imageUploadFileSizeExceeded: string;
  /** 非图片文件错误提示。 */
  imageUploadInvalidType: string;
  /** 上传失败错误提示。 */
  imageUploadFailed: string;
  /** 文件读取失败提示。 */
  imageUploadFileReadFailed: string;
  /** 图片链接格式错误提示。 */
  imageUploadInvalidUrl: string;
  /** 图片链接为空错误提示。 */
  imageUploadUrlRequired: string;
  /** 请选择图片或输入链接提示。 */
  imageUploadSelectOrEnterImage: string;
  /** 图片上传等待提示。 */
  imageUploadUploadingWait: string;
  /** 选区工具栏加粗按钮标题。 */
  selectionTooltipStrongTitle: string;
  /** 选区工具栏斜体按钮标题。 */
  selectionTooltipEmTitle: string;
  /** 选区工具栏删除线按钮标题。 */
  selectionTooltipStrikeTitle: string;
  /** 选区工具栏行内代码按钮标题。 */
  selectionTooltipInlineCodeTitle: string;
  /** 选区工具栏链接按钮标题。 */
  selectionTooltipLinkTitle: string;
  /** 选区链接输入占位文案。 */
  selectionLinkInputPlaceholder: string;
  /** 选区链接保存按钮无障碍文案。 */
  selectionLinkSaveAriaLabel: string;
  /** 选区链接移除按钮无障碍文案。 */
  selectionLinkRemoveAriaLabel: string;
  /** 代码块语言搜索占位文案。 */
  codeBlockLanguageSearchPlaceholder: string;
  /** 代码块纯文本语言文案（text）。 */
  codeBlockLanguagePlainText: string;
  /** 代码块复制按钮无障碍标签。 */
  codeBlockCopyAriaLabel: string;
  /** 代码块删除按钮无障碍标签。 */
  codeBlockDeleteAriaLabel: string;
}

/**
 * 定义 slash 菜单支持的命令类型。
 */
export type SlashMenuCommand =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'inlineCode'
  | 'codeBlock'
  | 'mathBlock'
  | 'table'
  | 'image';

/**
 * 定义图片文件上传处理函数。
 */
export type ImageUploadHandler = (file: File) => string | Promise<string>;

/**
 * 定义图片上传配置。
 */
export interface ImageUploadConfig {
  /** 自定义图片上传函数，返回可插入文档的图片链接。 */
  upload?: ImageUploadHandler;
  /** 允许上传的最大文件体积（字节）。 */
  maxFileSize?: number;
}

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
  /** 菜单项图标键名（对应 lucide-react 图标）。 */
  icon?: string;
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
  /** 是否只读。 */
  readOnly?: boolean;
  /** 编辑区最大高度，超出后在编辑区内部滚动。 */
  maxHeight?: CSSProperties['maxHeight'];
  /** 内容变更回调的防抖时长（毫秒）。 */
  debounceMs?: number;
  /** 额外头部内容。 */
  headerSlot?: ReactNode;
  /** slash 菜单配置。 */
  slashMenu?: SlashMenuConfig;
  /** 图片上传配置。 */
  imageUpload?: ImageUploadConfig;
}

/**
 * 定义创建编辑器时所需参数。
 */
export interface CreateEditorOptions {
  /** 绑定的根节点。 */
  root: HTMLElement;
  /** 编辑器内部浮层 Portal 容器。 */
  portalContainer: HTMLElement;
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
