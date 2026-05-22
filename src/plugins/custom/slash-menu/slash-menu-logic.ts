import type { EditorLocale, SlashMenuConfig, SlashMenuItem } from '../../../types/editor';

/**
 * slash 菜单当前状态。
 */
export interface SlashMenuState {
  /** 当前过滤后的菜单项。 */
  visibleItems: SlashMenuItem[];
  /** 当前是否应显示菜单。 */
  shouldShow: boolean;
}

/**
 * 默认 slash 菜单项。
 */
const DEFAULT_SLASH_MENU_ITEMS_ZH_CN: SlashMenuItem[] = [
  { id: 'paragraph', label: '普通文本', group: '标题', icon: 'Type', command: 'paragraph' },
  { id: 'heading-1', label: '标题 1', group: '标题', icon: 'Heading1', command: 'heading1' },
  { id: 'heading-2', label: '标题 2', group: '标题', icon: 'Heading2', command: 'heading2' },
  { id: 'heading-3', label: '标题 3', group: '标题', icon: 'Heading3', command: 'heading3' },
  { id: 'heading-4', label: '标题 4', group: '标题', icon: 'Heading4', command: 'heading4' },
  { id: 'heading-5', label: '标题 5', group: '标题', icon: 'Heading5', command: 'heading5' },
  { id: 'heading-6', label: '标题 6', group: '标题', icon: 'Heading6', command: 'heading6' },
  { id: 'bullet-list', label: '无序列表', group: '列表', icon: 'List', command: 'bulletList' },
  { id: 'ordered-list', label: '有序列表', group: '列表', icon: 'ListOrdered', command: 'orderedList' },
  { id: 'task-list', label: '任务列表', group: '列表', icon: 'ListTodo', command: 'taskList' },
  { id: 'blockquote', label: '引用块', group: '插入', icon: 'TextQuote', command: 'blockquote' },
  { id: 'inline-code', label: '行内代码', group: '插入', icon: 'Code', command: 'inlineCode' },
  { id: 'code-block', label: '代码块', group: '插入', icon: 'SquareCode', command: 'codeBlock' },
  { id: 'math-block', label: '公式块', group: '插入', icon: 'Sigma', command: 'mathBlock' },
  { id: 'table', label: '表格', group: '插入', icon: 'Table', command: 'table' },
  { id: 'image', label: '图片', group: '媒体', icon: 'Image', command: 'image' }
];

/**
 * 英文默认 slash 菜单项。
 */
const DEFAULT_SLASH_MENU_ITEMS_EN_US: SlashMenuItem[] = [
  { id: 'paragraph', label: 'Paragraph', group: 'Headings', icon: 'Type', command: 'paragraph' },
  { id: 'heading-1', label: 'Heading 1', group: 'Headings', icon: 'Heading1', command: 'heading1' },
  { id: 'heading-2', label: 'Heading 2', group: 'Headings', icon: 'Heading2', command: 'heading2' },
  { id: 'heading-3', label: 'Heading 3', group: 'Headings', icon: 'Heading3', command: 'heading3' },
  { id: 'heading-4', label: 'Heading 4', group: 'Headings', icon: 'Heading4', command: 'heading4' },
  { id: 'heading-5', label: 'Heading 5', group: 'Headings', icon: 'Heading5', command: 'heading5' },
  { id: 'heading-6', label: 'Heading 6', group: 'Headings', icon: 'Heading6', command: 'heading6' },
  { id: 'bullet-list', label: 'Bullet list', group: 'Lists', icon: 'List', command: 'bulletList' },
  { id: 'ordered-list', label: 'Ordered list', group: 'Lists', icon: 'ListOrdered', command: 'orderedList' },
  { id: 'task-list', label: 'Task list', group: 'Lists', icon: 'ListTodo', command: 'taskList' },
  { id: 'blockquote', label: 'Blockquote', group: 'Insert', icon: 'TextQuote', command: 'blockquote' },
  { id: 'inline-code', label: 'Inline code', group: 'Insert', icon: 'Code', command: 'inlineCode' },
  { id: 'code-block', label: 'Code block', group: 'Insert', icon: 'SquareCode', command: 'codeBlock' },
  { id: 'math-block', label: 'Math block', group: 'Insert', icon: 'Sigma', command: 'mathBlock' },
  { id: 'table', label: 'Table', group: 'Insert', icon: 'Table', command: 'table' },
  { id: 'image', label: 'Image', group: 'Media', icon: 'Image', command: 'image' }
];

/**
 * 构建最终菜单项配置。
 */
export const resolveSlashMenuItems = (config?: SlashMenuConfig, locale: EditorLocale = 'zh-CN'): SlashMenuItem[] => {
  if (config?.items && config.items.length > 0) {
    return config.items;
  }

  return locale === 'en-US' ? DEFAULT_SLASH_MENU_ITEMS_EN_US : DEFAULT_SLASH_MENU_ITEMS_ZH_CN;
};

/**
 * 判断是否处于不应展示 slash 菜单的节点。
 */
const shouldBlockSlashMenu = (view: any): boolean => {
  // 当前选区起点。
  const from = view?.state?.selection?.$from;
  if (!from) {
    return false;
  }

  // 当前父节点类型名。
  const parentTypeName = String(from.parent?.type?.name ?? '');
  if (parentTypeName.includes('code') || parentTypeName === 'math_block') {
    return true;
  }

  // 从当前节点向上查找，命中 table 祖先时禁止展示 slash 菜单。
  for (let depth = from.depth; depth > 0; depth -= 1) {
    // 当前层级节点类型名。
    const nodeTypeName = String(from.node(depth)?.type?.name ?? '');
    if (nodeTypeName === 'table' || nodeTypeName === 'table_cell' || nodeTypeName === 'table_header') {
      return true;
    }
  }

  return false;
};

/**
 * 读取光标前的文本块内容。
 */
const getTextBeforeCursor = (view: any): string => {
  // 当前编辑器状态。
  const state = view?.state;
  // 当前选区起点。
  const from = state?.selection?.$from;
  if (!state || !from) {
    return '';
  }

  // 当前文本块起始位置。
  const blockStart = from.start();
  // 当前光标位置。
  const cursorPos = from.pos;
  return state.doc.textBetween(blockStart, cursorPos, '\n', '\n');
};

/**
 * 读取当前光标所在文本块的 slash 查询词。
 */
const getSlashQueryAtCursor = (view: any): string | null => {
  // 光标前文本。
  const textBeforeCursor = getTextBeforeCursor(view);
  // 本次触发 slash 在块内的起始偏移。
  const slashOffset = textBeforeCursor.lastIndexOf('/');
  if (slashOffset < 0) {
    return null;
  }

  // slash 到光标之间的查询词（不包含 slash）。
  const query = textBeforeCursor.slice(slashOffset + 1);
  // 若查询中包含空白，说明已脱离当前 slash 查询态。
  if (/\s/.test(query)) {
    return null;
  }

  return query;
};

/**
 * 按查询词过滤 slash 菜单项（前缀匹配）。
 */
const filterSlashMenuItems = (items: SlashMenuItem[], query: string | null): SlashMenuItem[] => {
  if (query === null || query.length === 0) {
    return items;
  }

  // 统一小写查询词。
  const normalizedQuery = query.toLowerCase();
  return items.filter((item) => {
    // 可匹配字段集合（仅做前缀匹配）。
    const candidates = [item.label, item.group, item.command, item.id];
    return candidates.some((candidate) => String(candidate).toLowerCase().startsWith(normalizedQuery));
  });
};

/**
 * 计算当前菜单状态。
 */
export const resolveMenuState = (view: any, items: SlashMenuItem[]): SlashMenuState => {
  // 当前 slash 查询词。
  const query = getSlashQueryAtCursor(view);
  // 当前过滤后的菜单项。
  const visibleItems = filterSlashMenuItems(items, query);
  // 当前是否应展示菜单。
  const shouldShow = !shouldBlockSlashMenu(view) && query !== null && visibleItems.length > 0;
  return { visibleItems, shouldShow };
};

/**
 * 删除当前光标所在文本块中最后一个 slash 查询词。
 */
export const removeSlashQueryAtCursor = (view: any): boolean => {
  // 当前编辑器状态。
  const state = view?.state;
  // 当前选区起点。
  const from = state?.selection?.$from;
  if (!state || !from || !view?.dispatch) {
    return false;
  }

  // 当前文本块起始位置。
  const blockStart = from.start();
  // 当前光标位置。
  const cursorPos = from.pos;
  // 光标前文本。
  const textBeforeCursor = state.doc.textBetween(blockStart, cursorPos, '\n', '\n');
  // 本次触发 slash 在块内的起始偏移。
  const slashOffset = textBeforeCursor.lastIndexOf('/');
  if (slashOffset < 0) {
    return false;
  }

  // slash 在文档中的绝对位置。
  const slashFrom = blockStart + slashOffset;
  // 删除事务。
  const tr = state.tr.delete(slashFrom, cursorPos);
  view.dispatch(tr.scrollIntoView());
  return true;
};

