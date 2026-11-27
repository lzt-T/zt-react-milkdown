import { GapCursor } from '@milkdown/prose/gapcursor';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { resolveLastCellEndPosition } from '@/plugins/custom/table/table-selection';

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
