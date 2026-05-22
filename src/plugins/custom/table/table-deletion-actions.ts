import type { EditorView } from '@milkdown/prose/view';
import { removeTableColumn, removeTableRow } from './table-row-insertion';
import { resolveFocusedTable } from './table-selection';

/**
 * 删除当前普通表格行。
 */
export const deleteFocusedTableRow = (view: EditorView): void => {
  // 当前聚焦表格信息。
  const focusedTable = resolveFocusedTable(view.state);
  if (!focusedTable || focusedTable.rowIndex <= 0) {
    return;
  }

  removeTableRow(view, focusedTable);
};

/**
 * 删除当前表格列。
 */
export const deleteFocusedTableColumn = (view: EditorView): void => {
  // 当前聚焦表格信息。
  const focusedTable = resolveFocusedTable(view.state);
  if (!focusedTable || focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
    return;
  }

  removeTableColumn(view, focusedTable);
};
