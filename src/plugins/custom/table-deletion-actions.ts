import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { createTableWithDeletedColumn, createTableWithDeletedRow } from './table-row-insertion';
import { resolveCellTextPosition, resolveFocusedTable } from './table-selection';

/**
 * 删除当前普通表格行。
 */
export const deleteFocusedTableRow = (view: EditorView): void => {
  // 当前聚焦表格信息。
  const focusedTable = resolveFocusedTable(view.state);
  if (!focusedTable || focusedTable.rowIndex <= 0) {
    return;
  }

  // 删除目标行后的合法表格节点。
  const nextTable = createTableWithDeletedRow(view.state, focusedTable.tableNode, focusedTable.rowIndex);
  if (!nextTable) {
    return;
  }

  // 表格替换起点。
  const replaceFrom = focusedTable.tableStart;
  // 表格替换终点。
  const replaceTo = focusedTable.tableStart + focusedTable.tableNodeSize;
  // 替换为合法表格后的事务。
  const transaction = view.state.tr.replaceWith(replaceFrom, replaceTo, nextTable);
  // 删除后就近保留焦点的行索引。
  const targetRowIndex = Math.min(focusedTable.rowIndex, nextTable.childCount - 1);
  // 删除后目标行节点。
  const targetRow = nextTable.child(targetRowIndex);
  // 删除后就近保留焦点的列索引。
  const targetColumnIndex = Math.min(Math.max(0, focusedTable.columnIndex), targetRow.childCount - 1);
  // 删除后对应单元格文本位置。
  const targetPosition = resolveCellTextPosition(nextTable, replaceFrom, targetRowIndex, targetColumnIndex);
  if (targetPosition !== null) {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(targetPosition), 1));
  }
  transaction.scrollIntoView();
  view.dispatch(transaction);
  view.focus();
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

  // 删除目标列后的合法表格节点。
  const nextTable = createTableWithDeletedColumn(view.state, focusedTable.tableNode, focusedTable.columnIndex);
  if (!nextTable) {
    return;
  }

  // 表格替换起点。
  const replaceFrom = focusedTable.tableStart;
  // 表格替换终点。
  const replaceTo = focusedTable.tableStart + focusedTable.tableNodeSize;
  // 替换为合法表格后的事务。
  const transaction = view.state.tr.replaceWith(replaceFrom, replaceTo, nextTable);
  // 删除后就近保留焦点的列索引。
  const targetColumnIndex = Math.min(focusedTable.columnIndex, nextTable.child(0).childCount - 1);
  // 删除后对应单元格文本位置。
  const targetPosition = resolveCellTextPosition(nextTable, replaceFrom, focusedTable.rowIndex, targetColumnIndex);
  if (targetPosition !== null) {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(targetPosition), 1));
  }
  transaction.scrollIntoView();
  view.dispatch(transaction);
  view.focus();
};
