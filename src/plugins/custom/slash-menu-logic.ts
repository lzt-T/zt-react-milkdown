import type { SlashMenuConfig, SlashMenuItem } from '../../types/editor';

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
const DEFAULT_SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: 'heading-1', label: '标题 1', group: '标题', command: 'heading1' },
  { id: 'heading-2', label: '标题 2', group: '标题', command: 'heading2' },
  { id: 'heading-3', label: '标题 3', group: '标题', command: 'heading3' },
  { id: 'bullet-list', label: '无序列表', group: '列表', command: 'bulletList' },
  { id: 'ordered-list', label: '有序列表', group: '列表', command: 'orderedList' },
  { id: 'task-list', label: '任务列表', group: '列表', command: 'taskList' },
  { id: 'blockquote', label: '引用块', group: '插入', command: 'blockquote' },
  { id: 'math-block', label: '公式块', group: '插入', command: 'mathBlock' }
];

/**
 * 构建最终菜单项配置。
 */
export const resolveSlashMenuItems = (config?: SlashMenuConfig): SlashMenuItem[] => {
  if (config?.items && config.items.length > 0) {
    return config.items;
  }

  return DEFAULT_SLASH_MENU_ITEMS;
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
  return parentTypeName.includes('code') || parentTypeName === 'math_block';
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
