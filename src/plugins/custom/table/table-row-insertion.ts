import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { TableMap, addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow } from '@milkdown/prose/tables';
import type { FocusedTable } from './table-selection';
import { resolveCellTextPosition } from './table-selection';

/**
 * 表格行插入方向。
 */
export type TableRowInsertDirection = 'above' | 'below';

/**
 * 表格列插入方向。
 */
export type TableColumnInsertDirection = 'left' | 'right';

/**
 * 表格单元格对齐方式。
 */
export type TableCellAlignment = 'left' | 'center' | 'right';

/**
 * 将选区定位到指定单元格。
 */
const focusTableCell = (view: EditorView, focusedTable: FocusedTable, rowIndex: number, columnIndex: number): boolean => {
  // 目标单元格文本位置。
  const targetPosition = resolveCellTextPosition(focusedTable.tableNode, focusedTable.tableStart, rowIndex, columnIndex);
  if (targetPosition === null) {
    return false;
  }

  // 当前定位事务。
  const transaction = view.state.tr.setSelection(TextSelection.near(view.state.tr.doc.resolve(targetPosition), 1));
  view.dispatch(transaction);
  return true;
};

/**
 * 执行 ProseMirror Table 命令。
 */
const runTableCommand = (
  view: EditorView,
  command: (state: EditorView['state'], dispatch?: EditorView['dispatch'], view?: EditorView) => boolean
): boolean => {
  // 命令执行结果。
  const success = command(view.state, view.dispatch, view);
  if (!success) {
    return false;
  }

  view.dispatch(view.state.tr.scrollIntoView());
  view.focus();
  return true;
};

/**
 * 在目标行上下插入一行。
 */
export const insertTableRow = (
  view: EditorView,
  focusedTable: FocusedTable,
  direction: TableRowInsertDirection
): boolean => {
  if (focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
    return false;
  }

  if (!focusTableCell(view, focusedTable, focusedTable.rowIndex, focusedTable.columnIndex)) {
    return false;
  }

  return runTableCommand(view, direction === 'above' ? addRowBefore : addRowAfter);
};

/**
 * 删除目标行（首行表头不允许删除）。
 */
export const removeTableRow = (view: EditorView, focusedTable: FocusedTable): boolean => {
  if (focusedTable.rowIndex <= 0 || focusedTable.columnIndex < 0) {
    return false;
  }

  if (!focusTableCell(view, focusedTable, focusedTable.rowIndex, focusedTable.columnIndex)) {
    return false;
  }

  return runTableCommand(view, deleteRow);
};

/**
 * 在目标列左右插入一列。
 */
export const insertTableColumn = (
  view: EditorView,
  focusedTable: FocusedTable,
  direction: TableColumnInsertDirection
): boolean => {
  if (focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
    return false;
  }

  if (!focusTableCell(view, focusedTable, focusedTable.rowIndex, focusedTable.columnIndex)) {
    return false;
  }

  return runTableCommand(view, direction === 'left' ? addColumnBefore : addColumnAfter);
};

/**
 * 删除目标列（至少保留一列）。
 */
export const removeTableColumn = (view: EditorView, focusedTable: FocusedTable): boolean => {
  if (focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
    return false;
  }

  // 当前表格列数。
  const columnCount = focusedTable.tableNode.childCount > 0 ? focusedTable.tableNode.child(0).childCount : 0;
  if (columnCount <= 1) {
    return false;
  }

  if (!focusTableCell(view, focusedTable, focusedTable.rowIndex, focusedTable.columnIndex)) {
    return false;
  }

  return runTableCommand(view, deleteColumn);
};

/**
 * 将目标列设置为指定对齐方式。
 */
export const alignTableColumn = (view: EditorView, focusedTable: FocusedTable, alignment: TableCellAlignment): boolean => {
  if (focusedTable.columnIndex < 0) {
    return false;
  }

  // 当前表格映射。
  const tableMap = TableMap.get(focusedTable.tableNode);
  // 表格内容起点。
  const tableContentStart = focusedTable.tableStart + 1;
  // 列索引。
  const columnIndex = focusedTable.columnIndex;
  // 对齐更新事务。
  const transaction = view.state.tr;

  for (let rowIndex = 0; rowIndex < tableMap.height; rowIndex += 1) {
    // 当前单元格偏移槽位索引。
    const mapIndex = rowIndex * tableMap.width + columnIndex;
    // 当前单元格在 table 内容内的偏移。
    const cellOffset = tableMap.map[mapIndex];
    if (typeof cellOffset !== 'number') {
      continue;
    }

    // 当前单元格绝对位置。
    const cellPosition = tableContentStart + cellOffset;
    // 当前单元格节点。
    const cellNode = transaction.doc.nodeAt(cellPosition);
    if (!cellNode) {
      continue;
    }

    // 当前单元格新属性。
    const nextAttrs = { ...cellNode.attrs, alignment };
    transaction.setNodeMarkup(cellPosition, cellNode.type, nextAttrs, cellNode.marks);
  }

  if (!transaction.docChanged) {
    return false;
  }

  transaction.scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};
