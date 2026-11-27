import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';

// 表格节点类型名。
const TABLE_NODE_NAME = 'table';
// 表头行节点类型名。
const TABLE_HEADER_ROW_NODE_NAME = 'table_header_row';
// 普通表格行节点类型名。
const TABLE_ROW_NODE_NAME = 'table_row';
// 表头单元格节点类型名。
const TABLE_HEADER_NODE_NAME = 'table_header';
// 普通表格单元格节点类型名。
const TABLE_CELL_NODE_NAME = 'table_cell';

/**
 * 当前聚焦表格信息。
 */
export interface FocusedTable {
  /** 表格节点。 */
  tableNode: ProseNode;
  /** 表格起始位置。 */
  tableStart: number;
  /** 表格节点大小。 */
  tableNodeSize: number;
  /** 当前聚焦行索引。 */
  rowIndex: number;
  /** 当前聚焦列索引。 */
  columnIndex: number;
}

/**
 * 解析当前选区所在表格节点与起始位置。
 */
export const resolveFocusedTable = (state: EditorState): FocusedTable | null => {
  // 当前选区起点。
  const selectionStart = state.selection.$from;
  // 当前聚焦行索引。
  let rowIndex = -1;
  // 当前聚焦列索引。
  let columnIndex = -1;

  for (let depth = selectionStart.depth; depth >= 0; depth -= 1) {
    // 当前深度节点。
    const currentNode = selectionStart.node(depth);
    if (
      columnIndex < 0 &&
      (currentNode.type.name === TABLE_CELL_NODE_NAME || currentNode.type.name === TABLE_HEADER_NODE_NAME)
    ) {
      columnIndex = selectionStart.index(depth - 1);
    }

    if (
      rowIndex < 0 &&
      (currentNode.type.name === TABLE_ROW_NODE_NAME || currentNode.type.name === TABLE_HEADER_ROW_NODE_NAME)
    ) {
      rowIndex = selectionStart.index(depth - 1);
    }

    if (currentNode.type.name !== TABLE_NODE_NAME) {
      continue;
    }

    return {
      tableNode: currentNode,
      tableStart: depth === 0 ? 0 : selectionStart.before(depth),
      tableNodeSize: currentNode.nodeSize,
      rowIndex,
      columnIndex
    };
  }

  return null;
};

/**
 * 解析指定表格单元格的文本位置。
 */
export const resolveCellTextPosition = (
  tableNode: ProseNode,
  tableStart: number,
  rowIndex: number,
  columnIndex: number
): number | null => {
  if (rowIndex < 0 || rowIndex >= tableNode.childCount) {
    return null;
  }

  // 目标行前方累计偏移。
  let rowOffset = 0;
  for (let currentRowIndex = 0; currentRowIndex < rowIndex; currentRowIndex += 1) {
    rowOffset += tableNode.child(currentRowIndex).nodeSize;
  }

  // 目标行节点。
  const targetRow = tableNode.child(rowIndex);
  if (columnIndex < 0 || columnIndex >= targetRow.childCount) {
    return null;
  }

  // 目标单元格前方累计偏移。
  let cellOffset = 0;
  for (let currentCellIndex = 0; currentCellIndex < columnIndex; currentCellIndex += 1) {
    cellOffset += targetRow.child(currentCellIndex).nodeSize;
  }

  // table > row > cell > paragraph 的文本起点。
  return tableStart + 1 + rowOffset + 1 + cellOffset + 1 + 1;
};

/**
 * 判断当前聚焦列是否可用于列插入。
 */
export const isFocusedTableColumnValid = (focusedTable: FocusedTable): boolean => {
  if (focusedTable.columnIndex < 0 || focusedTable.tableNode.childCount === 0) {
    return false;
  }

  // 表头行节点。
  const headerRow = focusedTable.tableNode.child(0);
  return focusedTable.columnIndex < headerRow.childCount;
};

/**
 * 定位表格最后一行最后一列单元格内部的“可编辑末尾”位置。
 */
export const resolveLastCellEndPosition = (tableNode: ProseNode, tableStart: number): number | null => {
  if (tableNode.childCount === 0) {
    return null;
  }

  // 最后一行索引。
  const lastRowIndex = tableNode.childCount - 1;
  // 最后一行节点。
  const lastRow = tableNode.child(lastRowIndex);
  if (lastRow.childCount === 0) {
    return null;
  }

  // 累加到最后一行前的偏移。
  let rowOffset = 0;
  for (let rowIndex = 0; rowIndex < lastRowIndex; rowIndex += 1) {
    rowOffset += tableNode.child(rowIndex).nodeSize;
  }

  // 最后一列索引。
  const lastCellIndex = lastRow.childCount - 1;
  // 最后一格节点。
  const lastCell = lastRow.child(lastCellIndex);
  // 累加到最后一格前的偏移。
  let cellOffset = 0;
  for (let cellIndex = 0; cellIndex < lastCellIndex; cellIndex += 1) {
    cellOffset += lastRow.child(cellIndex).nodeSize;
  }

  // table > row > cell 的节点起始位置。
  const lastRowStart = tableStart + 1 + rowOffset;
  const lastCellStart = lastRowStart + 1 + cellOffset;
  // 单元格内容末尾位置（闭标签前）。
  return lastCellStart + lastCell.nodeSize - 1;
};
