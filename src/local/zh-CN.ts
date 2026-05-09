import type { EditorI18nMessages } from '../types/editor';

/**
 * 中文编辑器语言包。
 */
export const zhCNMessages: EditorI18nMessages = {
  placeholder: '请输入 / 打开命令菜单...',
  initError: '编辑器初始化失败，请刷新页面后重试。',
  editorAriaLabel: 'Markdown 编辑器',
  mathBlockSourceAriaLabel: '公式块源码',
  mathBlockCopyAriaLabel: '复制公式源码',
  mathBlockDeleteAriaLabel: '删除公式块',
  tableDeleteAriaLabel: '删除表格',
  tableMoreAriaLabel: '更多表格操作',
  tableAlignLeftAriaLabel: '当前列左对齐',
  tableAlignCenterAriaLabel: '当前列居中对齐',
  tableAlignRightAriaLabel: '当前列右对齐',
  tableInsertRowAboveLabel: '上方插入行',
  tableInsertRowBelowLabel: '下方插入行',
  tableInsertColumnLeftLabel: '左侧插入列',
  tableInsertColumnRightLabel: '右侧插入列',
  tableDeleteRowLabel: '删除该行',
  tableDeleteColumnLabel: '删除该列',
  mathRenderError: '公式渲染失败，请检查公式语法。'
};
