import { GapCursor } from '@milkdown/prose/gapcursor';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 表格节点类型名。
const TABLE_NODE_NAME = 'table';
// 仅处理上方向键。
const ARROW_UP_KEY = 'ArrowUp';

/**
 * 判断是否应跳过本插件处理。
 */
const shouldSkipKeydown = (event: KeyboardEvent): boolean => {
  return event.key !== ARROW_UP_KEY || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey;
};

/**
 * 从 GapCursor 位置解析紧邻上方表格。
 */
const resolveTableFromGapCursor = (
  selectionFrom: number,
  resolvedPosition: ResolvedPos
): { tableNode: ProseNode; tableStart: number } | null => {
  const previousNode = resolvedPosition.nodeBefore;
  if (!previousNode || previousNode.type.name !== TABLE_NODE_NAME) {
    return null;
  }

  return {
    tableNode: previousNode,
    tableStart: selectionFrom - previousNode.nodeSize
  };
};

/**
 * 从“空段落开头”位置解析紧邻上方表格。
 */
const resolveTableFromEmptyParagraphStart = (
  resolvedPosition: ResolvedPos
): { tableNode: ProseNode; tableStart: number } | null => {
  // 仅处理空段落开头。
  if (resolvedPosition.parent.type.name !== 'paragraph' || resolvedPosition.parentOffset !== 0) {
    return null;
  }
  if (resolvedPosition.parent.childCount > 0) {
    return null;
  }
  if (resolvedPosition.depth < 1) {
    return null;
  }

  // 当前段落在其父级中的索引。
  const currentBlockIndex = resolvedPosition.index(resolvedPosition.depth - 1);
  if (currentBlockIndex <= 0) {
    return null;
  }

  // 当前段落同级上一块节点。
  const blockContainer = resolvedPosition.node(resolvedPosition.depth - 1);
  const previousBlock = blockContainer.child(currentBlockIndex - 1);
  if (previousBlock.type.name !== TABLE_NODE_NAME) {
    return null;
  }

  // 当前段落起始位置（节点左边界）。
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  return {
    tableNode: previousBlock,
    tableStart: currentBlockStart - previousBlock.nodeSize
  };
};

/**
 * 定位表格最后一行最后一列单元格内部的“可编辑末尾”位置。
 */
const resolveLastCellEndPosition = (tableNode: ProseNode, tableStart: number): number | null => {
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

/**
 * 处理从表格下方上键进入表格末尾单元格。
 */
const handleArrowUpIntoTable = (view: EditorView): boolean => {
  // 当前选区。
  const { selection } = view.state;
  // 当前解析位置。
  const resolvedPosition = selection.$from;
  // 命中的表格节点与起始位置。
  let targetTable: { tableNode: ProseNode; tableStart: number } | null = null;

  if (selection instanceof GapCursor) {
    targetTable = resolveTableFromGapCursor(selection.from, resolvedPosition);
  } else if (selection.empty) {
    targetTable = resolveTableFromEmptyParagraphStart(resolvedPosition);
  }

  if (!targetTable) {
    return false;
  }

  // 目标单元格文本末尾位置。
  const targetPosition = resolveLastCellEndPosition(targetTable.tableNode, targetTable.tableStart);
  if (targetPosition === null) {
    return false;
  }

  const transaction = view.state.tr
    .setSelection(TextSelection.near(view.state.doc.resolve(targetPosition), -1))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 表格方向键进入插件：支持从表格下方按上键进入右下角单元格。
 */
export const tableArrowEntryPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('zt-md-table-arrow-entry'),
    props: {
      handleKeyDown: (view, event) => {
        if (shouldSkipKeydown(event)) {
          return false;
        }

        return handleArrowUpIntoTable(view as EditorView);
      }
    }
  });
});
