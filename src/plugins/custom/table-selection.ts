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
