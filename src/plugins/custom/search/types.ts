import type { EditorView } from '@milkdown/prose/view';

/**
 * 定义编辑器搜索查询参数。
 */
export interface EditorSearchOptions {
  /** 搜索文本。 */
  search: string;
  /** 替换文本。 */
  replace: string;
  /** 是否区分大小写。 */
  caseSensitive: boolean;
  /** 是否仅匹配完整词语。 */
  wholeWord: boolean;
  /** 是否按正则表达式搜索。 */
  regexp: boolean;
}

/**
 * 定义可切换的布尔搜索选项键。
 */
export type EditorSearchBooleanOption = 'caseSensitive' | 'wholeWord' | 'regexp';

/**
 * 定义编辑器搜索结果快照。
 */
export interface EditorSearchSnapshot {
  /** 当前匹配项序号，未选中匹配时为 0。 */
  current: number;
  /** 匹配结果总数。 */
  total: number;
  /** 当前查询是否为无效正则表达式。 */
  isInvalidExpression: boolean;
}

/**
 * 定义编辑器搜索控制器。
 */
export interface EditorSearchController {
  /** 更新搜索与替换参数。 */
  updateQuery: (options: EditorSearchOptions) => void;
  /** 定位上一项匹配。 */
  findPrevious: () => void;
  /** 定位下一项匹配。 */
  findNext: () => void;
  /** 替换当前匹配。 */
  replaceCurrent: () => void;
  /** 替换全部匹配。 */
  replaceAll: () => void;
  /** 清除搜索状态与高亮。 */
  clear: () => void;
  /** 聚焦当前匹配所在的编辑器视图。 */
  focusCurrent: () => void;
}

/**
 * 定义搜索动作访问 EditorView 的执行器。
 */
export type EditorSearchActionRunner = (action: (view: EditorView) => void) => void;
