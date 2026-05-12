import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';

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
 * 获取单元格对齐属性。
 */
const resolveCellAlignment = (cellNode: ProseNode | null): string => {
  return typeof cellNode?.attrs.alignment === 'string' ? cellNode.attrs.alignment : 'left';
};

/**
 * 创建符合目标类型的表格单元格。
 */
const createNormalizedCell = (cellType: any, sourceCell: ProseNode | null, alignment: string): ProseNode | null => {
  // 新单元格属性。
  const attrs = { alignment };
  if (sourceCell) {
    // 复用原单元格内容创建的单元格。
    const cellWithContent = cellType.createAndFill(attrs, sourceCell.content);
    if (cellWithContent) {
      return cellWithContent;
    }
  }

  return cellType.createAndFill(attrs);
};

/**
 * 创建空白表格单元格。
 */
const createEmptyCell = (cellType: any, alignment: string): ProseNode | null => {
  return cellType.createAndFill({ alignment });
};

/**
 * 过滤掉空单元格并保留 ProseNode 类型信息。
 */
const isProseNode = (cell: ProseNode | null): cell is ProseNode => {
  return cell !== null;
};

/**
 * 将表格行规范为 GFM 表格 schema 所需节点类型。
 */
const createNormalizedRow = (
  rowType: any,
  cellType: any,
  sourceRow: ProseNode,
  columnCount: number,
  alignments: string[]
): ProseNode | null => {
  // 当前行单元格集合。
  const cells = Array.from({ length: columnCount }, (_value, cellIndex) => {
    return createNormalizedCell(cellType, sourceRow.maybeChild(cellIndex), alignments[cellIndex] ?? 'left');
  }).filter(isProseNode);

  return rowType.create(null, cells);
};

/**
 * 创建插入列后的规范化表格行。
 */
const createRowWithInsertedColumn = (
  rowType: any,
  cellType: any,
  sourceRow: ProseNode,
  columnCount: number,
  alignments: string[],
  targetColumnIndex: number,
  direction: TableColumnInsertDirection
): ProseNode | null => {
  // 当前列继承的对齐方式。
  const insertedAlignment = alignments[targetColumnIndex] ?? 'left';
  // 插入列后的单元格集合。
  const cells: ProseNode[] = [];

  for (let cellIndex = 0; cellIndex < columnCount; cellIndex += 1) {
    if (cellIndex === targetColumnIndex && direction === 'left') {
      // 当前列左侧新增的单元格。
      const insertedCell = createEmptyCell(cellType, insertedAlignment);
      if (insertedCell) {
        cells.push(insertedCell);
      }
    }

    // 原始单元格。
    const sourceCell = sourceRow.maybeChild(cellIndex);
    // 规范化后的原始单元格。
    const normalizedCell = createNormalizedCell(cellType, sourceCell, alignments[cellIndex] ?? 'left');
    if (normalizedCell) {
      cells.push(normalizedCell);
    }

    if (cellIndex === targetColumnIndex && direction === 'right') {
      // 当前列右侧新增的单元格。
      const insertedCell = createEmptyCell(cellType, insertedAlignment);
      if (insertedCell) {
        cells.push(insertedCell);
      }
    }
  }

  return rowType.create(null, cells);
};

/**
 * 创建删除列后的规范化表格行。
 */
const createRowWithDeletedColumn = (
  rowType: any,
  cellType: any,
  sourceRow: ProseNode,
  columnCount: number,
  alignments: string[],
  targetColumnIndex: number
): ProseNode | null => {
  // 删除列后的单元格集合。
  const cells: ProseNode[] = [];

  for (let cellIndex = 0; cellIndex < columnCount; cellIndex += 1) {
    if (cellIndex === targetColumnIndex) {
      continue;
    }

    // 原始单元格。
    const sourceCell = sourceRow.maybeChild(cellIndex);
    // 规范化后的保留单元格。
    const normalizedCell = createNormalizedCell(cellType, sourceCell, alignments[cellIndex] ?? 'left');
    if (normalizedCell) {
      cells.push(normalizedCell);
    }
  }

  return rowType.create(null, cells);
};

/**
 * 构造已规范化并插入新行的表格节点。
 */
export const createTableWithInsertedRow = (
  state: EditorState,
  tableNode: ProseNode,
  targetRowIndex: number,
  direction: TableRowInsertDirection
): ProseNode | null => {
  // 表格节点类型。
  const tableType = state.schema.nodes.table;
  // 表头行节点类型。
  const tableHeaderRowType = state.schema.nodes.table_header_row;
  // 普通表格行节点类型。
  const tableRowType = state.schema.nodes.table_row;
  // 表头单元格节点类型。
  const tableHeaderType = state.schema.nodes.table_header;
  // 普通表格单元格节点类型。
  const tableCellType = state.schema.nodes.table_cell;
  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  // 表头行节点。
  const headerRow = tableNode.childCount > 0 ? tableNode.child(0) : null;
  // 表格列数。
  const columnCount = Math.max(1, headerRow?.childCount ?? 0);
  // 表格列对齐方式。
  const alignments = Array.from({ length: columnCount }, (_value, cellIndex) => {
    return resolveCellAlignment(headerRow?.maybeChild(cellIndex) ?? null);
  });
  // 插入后的表格行集合。
  const rows: ProseNode[] = [];

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    if (rowIndex === targetRowIndex && direction === 'above') {
      // 当前行上方新增的普通表格行。
      const insertedCells = alignments.map((alignment) => createEmptyCell(tableCellType, alignment)).filter(isProseNode);
      rows.push(tableRowType.create(null, insertedCells));
    }

    // 原始行节点。
    const sourceRow = tableNode.child(rowIndex);
    // 规范化后的原始行节点。
    const normalizedRow = createNormalizedRow(
      rowIndex === 0 ? tableHeaderRowType : tableRowType,
      rowIndex === 0 ? tableHeaderType : tableCellType,
      sourceRow,
      columnCount,
      alignments
    );
    if (normalizedRow) {
      rows.push(normalizedRow);
    }

    if (rowIndex === targetRowIndex && direction === 'below') {
      // 当前行下方新增的普通表格行。
      const insertedCells = alignments.map((alignment) => createEmptyCell(tableCellType, alignment)).filter(isProseNode);
      rows.push(tableRowType.create(null, insertedCells));
    }
  }

  return tableType.create(null, rows);
};

/**
 * 构造已规范化并删除目标行的表格节点。
 */
export const createTableWithDeletedRow = (
  state: EditorState,
  tableNode: ProseNode,
  targetRowIndex: number
): ProseNode | null => {
  // 表格节点类型。
  const tableType = state.schema.nodes.table;
  // 表头行节点类型。
  const tableHeaderRowType = state.schema.nodes.table_header_row;
  // 普通表格行节点类型。
  const tableRowType = state.schema.nodes.table_row;
  // 表头单元格节点类型。
  const tableHeaderType = state.schema.nodes.table_header;
  // 普通表格单元格节点类型。
  const tableCellType = state.schema.nodes.table_cell;
  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  if (targetRowIndex <= 0 || targetRowIndex >= tableNode.childCount) {
    return null;
  }

  // 表头行节点。
  const headerRow = tableNode.childCount > 0 ? tableNode.child(0) : null;
  // 表格列数。
  const columnCount = Math.max(1, headerRow?.childCount ?? 0);
  // 表格列对齐方式。
  const alignments = Array.from({ length: columnCount }, (_value, cellIndex) => {
    return resolveCellAlignment(headerRow?.maybeChild(cellIndex) ?? null);
  });
  // 删除后的表格行集合。
  const rows: ProseNode[] = [];

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    if (rowIndex === targetRowIndex) {
      continue;
    }

    // 原始行节点。
    const sourceRow = tableNode.child(rowIndex);
    // 规范化后的保留行节点。
    const normalizedRow = createNormalizedRow(
      rowIndex === 0 ? tableHeaderRowType : tableRowType,
      rowIndex === 0 ? tableHeaderType : tableCellType,
      sourceRow,
      columnCount,
      alignments
    );
    if (normalizedRow) {
      rows.push(normalizedRow);
    }
  }

  return tableType.create(null, rows);
};

/**
 * 构造已规范化并插入新列的表格节点。
 */
export const createTableWithInsertedColumn = (
  state: EditorState,
  tableNode: ProseNode,
  targetColumnIndex: number,
  direction: TableColumnInsertDirection
): ProseNode | null => {
  // 表格节点类型。
  const tableType = state.schema.nodes.table;
  // 表头行节点类型。
  const tableHeaderRowType = state.schema.nodes.table_header_row;
  // 普通表格行节点类型。
  const tableRowType = state.schema.nodes.table_row;
  // 表头单元格节点类型。
  const tableHeaderType = state.schema.nodes.table_header;
  // 普通表格单元格节点类型。
  const tableCellType = state.schema.nodes.table_cell;
  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  // 表头行节点。
  const headerRow = tableNode.childCount > 0 ? tableNode.child(0) : null;
  // 表格列数。
  const columnCount = Math.max(1, headerRow?.childCount ?? 0);
  if (targetColumnIndex < 0 || targetColumnIndex >= columnCount) {
    return null;
  }

  // 表格列对齐方式。
  const alignments = Array.from({ length: columnCount }, (_value, cellIndex) => {
    return resolveCellAlignment(headerRow?.maybeChild(cellIndex) ?? null);
  });
  // 插入后的表格行集合。
  const rows: ProseNode[] = [];

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    // 原始行节点。
    const sourceRow = tableNode.child(rowIndex);
    // 插入列后的规范化行节点。
    const normalizedRow = createRowWithInsertedColumn(
      rowIndex === 0 ? tableHeaderRowType : tableRowType,
      rowIndex === 0 ? tableHeaderType : tableCellType,
      sourceRow,
      columnCount,
      alignments,
      targetColumnIndex,
      direction
    );
    if (normalizedRow) {
      rows.push(normalizedRow);
    }
  }

  return tableType.create(null, rows);
};

/**
 * 构造已规范化并删除目标列的表格节点。
 */
export const createTableWithDeletedColumn = (
  state: EditorState,
  tableNode: ProseNode,
  targetColumnIndex: number
): ProseNode | null => {
  // 表格节点类型。
  const tableType = state.schema.nodes.table;
  // 表头行节点类型。
  const tableHeaderRowType = state.schema.nodes.table_header_row;
  // 普通表格行节点类型。
  const tableRowType = state.schema.nodes.table_row;
  // 表头单元格节点类型。
  const tableHeaderType = state.schema.nodes.table_header;
  // 普通表格单元格节点类型。
  const tableCellType = state.schema.nodes.table_cell;
  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  // 表头行节点。
  const headerRow = tableNode.childCount > 0 ? tableNode.child(0) : null;
  // 表格列数。
  const columnCount = Math.max(1, headerRow?.childCount ?? 0);
  if (columnCount <= 1 || targetColumnIndex < 0 || targetColumnIndex >= columnCount) {
    return null;
  }

  // 表格列对齐方式。
  const alignments = Array.from({ length: columnCount }, (_value, cellIndex) => {
    return resolveCellAlignment(headerRow?.maybeChild(cellIndex) ?? null);
  });
  // 删除后的表格行集合。
  const rows: ProseNode[] = [];

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    // 原始行节点。
    const sourceRow = tableNode.child(rowIndex);
    // 删除列后的规范化行节点。
    const normalizedRow = createRowWithDeletedColumn(
      rowIndex === 0 ? tableHeaderRowType : tableRowType,
      rowIndex === 0 ? tableHeaderType : tableCellType,
      sourceRow,
      columnCount,
      alignments,
      targetColumnIndex
    );
    if (normalizedRow) {
      rows.push(normalizedRow);
    }
  }

  return tableType.create(null, rows);
};

/**
 * 构造已规范化并更新目标列对齐方式的表格节点。
 */
export const createTableWithUpdatedColumnAlignment = (
  state: EditorState,
  tableNode: ProseNode,
  targetColumnIndex: number,
  alignment: TableCellAlignment
): ProseNode | null => {
  // 表格节点类型。
  const tableType = state.schema.nodes.table;
  // 表头行节点类型。
  const tableHeaderRowType = state.schema.nodes.table_header_row;
  // 普通表格行节点类型。
  const tableRowType = state.schema.nodes.table_row;
  // 表头单元格节点类型。
  const tableHeaderType = state.schema.nodes.table_header;
  // 普通表格单元格节点类型。
  const tableCellType = state.schema.nodes.table_cell;
  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  // 表头行节点。
  const headerRow = tableNode.childCount > 0 ? tableNode.child(0) : null;
  // 表格列数。
  const columnCount = Math.max(1, headerRow?.childCount ?? 0);
  if (targetColumnIndex < 0 || targetColumnIndex >= columnCount) {
    return null;
  }

  // 原表格列对齐方式。
  const alignments = Array.from({ length: columnCount }, (_value, cellIndex) => {
    return resolveCellAlignment(headerRow?.maybeChild(cellIndex) ?? null);
  });
  // 当前列更新为目标对齐方式。
  alignments[targetColumnIndex] = alignment;
  // 更新后的表格行集合。
  const rows: ProseNode[] = [];

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    // 原始行节点。
    const sourceRow = tableNode.child(rowIndex);
    // 更新对齐后的规范化行节点。
    const normalizedRow = createNormalizedRow(
      rowIndex === 0 ? tableHeaderRowType : tableRowType,
      rowIndex === 0 ? tableHeaderType : tableCellType,
      sourceRow,
      columnCount,
      alignments
    );
    if (normalizedRow) {
      rows.push(normalizedRow);
    }
  }

  return tableType.create(null, rows);
};
