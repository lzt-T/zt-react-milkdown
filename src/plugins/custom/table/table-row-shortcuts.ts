import type { Ctx } from '@milkdown/ctx';
import { tableKeymap } from '@milkdown/preset-gfm';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { insertTableRowBelow } from '@/plugins/custom/table/table-row-insertion';
import { resolveFocusedTable, type FocusedTable } from '@/plugins/custom/table/table-selection';

// macOS 平台匹配规则。
const MAC_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/;
// 表格行快捷键插件唯一键。
const TABLE_ROW_SHORTCUTS_PLUGIN_KEY = new PluginKey('zt-md-table-row-shortcuts');

/**
 * 判断当前运行环境是否为 macOS 系列平台。
 */
const isMacPlatform = (): boolean => {
  return typeof navigator !== 'undefined' && MAC_PLATFORM_PATTERN.test(navigator.platform);
};

/**
 * 判断当前编辑器视图是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 判断键盘事件是否仅按下了当前平台的 Mod 主修饰键。
 */
const matchesModModifier = (event: KeyboardEvent): boolean => {
  return isMacPlatform()
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
};

/**
 * 判断选区是否正位于当前表格最后一行最后一列的单个单元格内。
 */
const isAtLastTableCell = (view: EditorView, focusedTable: FocusedTable): boolean => {
  const { $from, $to } = view.state.selection;
  if (!$from.sameParent($to)) {
    return false;
  }

  // 当前表格最后一行索引及该行最后一列索引。
  const lastRowIndex = focusedTable.tableNode.childCount - 1;
  if (lastRowIndex < 0 || focusedTable.rowIndex !== lastRowIndex) {
    return false;
  }

  const lastColumnIndex = focusedTable.tableNode.child(lastRowIndex).childCount - 1;
  return lastColumnIndex >= 0 && focusedTable.columnIndex === lastColumnIndex;
};

/**
 * 覆盖 GFM 默认表格退出快捷键，保留 Enter 退出表格并释放 Mod-Enter 给下方插入行。
 */
export const configureTableShortcuts = (ctx: Ctx): void => {
  ctx.update(tableKeymap.key, (keymap) => ({
    ...keymap,
    ExitTable: { ...keymap.ExitTable, shortcuts: 'Enter' }
  }));
};

/**
 * 解析“下方插入行”菜单项展示的快捷键提示文案。
 */
export const resolveInsertTableRowBelowShortcutLabel = (): string => {
  return isMacPlatform() ? '⌘Enter' : 'Ctrl+Enter';
};

/**
 * 表格行快捷键插件：支持 Mod+Enter 在当前行下方插入行，以及末格 Tab 自动追加下一行。
 */
export const tableRowShortcutsPlugin = $prose(() => {
  return new Plugin({
    key: TABLE_ROW_SHORTCUTS_PLUGIN_KEY,
    props: {
      handleKeyDown: (view, event) => {
        const editorView = view as EditorView;
        if (event.isComposing || event.defaultPrevented || !isEditorViewEditable(editorView)) {
          return false;
        }

        // 当前聚焦的表格及行列索引。
        const focusedTable = resolveFocusedTable(editorView.state);
        if (!focusedTable || focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
          return false;
        }

        // 任意单元格内按 Mod+Enter 在当前行下方插入新行。
        const isInsertRowBelowShortcut =
          event.key === 'Enter' && matchesModModifier(event) && !event.shiftKey && !event.altKey;
        if (isInsertRowBelowShortcut) {
          if (!insertTableRowBelow(editorView, focusedTable)) {
            return false;
          }
          event.preventDefault();
          return true;
        }

        // 表格最后一个单元格内按 Tab 自动在末尾追加一行并落焦到新行第一列。
        const isLastCellTab =
          event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
        if (isLastCellTab && isAtLastTableCell(editorView, focusedTable)) {
          if (!insertTableRowBelow(editorView, focusedTable)) {
            return false;
          }
          event.preventDefault();
          return true;
        }

        return false;
      }
    }
  });
});
