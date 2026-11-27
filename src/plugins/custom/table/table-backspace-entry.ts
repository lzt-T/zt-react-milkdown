import { GapCursor } from '@milkdown/prose/gapcursor';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { resolveLastCellEndPosition } from '@/plugins/custom/table/table-selection';

// 表格节点类型名。
const TABLE_NODE_NAME = 'table';
// 段落节点类型名。
const PARAGRAPH_NODE_NAME = 'paragraph';
// 仅处理 Backspace 按键。
const BACKSPACE_KEY = 'Backspace';
// 表格 Backspace 进入插件唯一键。
const TABLE_BACKSPACE_ENTRY_PLUGIN_KEY = new PluginKey('zt-md-table-backspace-entry');

/** 表格下方退格命中结果。 */
interface TableBackspaceTarget {
  /** 相邻表格节点。 */
  tableNode: ProseNode;
  /** 相邻表格起始位置。 */
  tableStart: number;
  /** 若当前为空段落，记录待删除段落范围；否则为 null。 */
  deleteRange: { from: number; to: number } | null;
}

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
 * 判断是否应跳过 Backspace 处理。
 */
const shouldSkipKeydown = (view: EditorView, event: KeyboardEvent): boolean => {
  return (
    event.key !== BACKSPACE_KEY ||
    event.isComposing ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !isEditorViewEditable(view)
  );
};

/**
 * 从 GapCursor 位置解析紧邻上方表格。
 */
const resolveTableFromGapCursor = (
  selectionFrom: number,
  resolvedPosition: ResolvedPos
): TableBackspaceTarget | null => {
  const previousNode = resolvedPosition.nodeBefore;
  if (!previousNode || previousNode.type.name !== TABLE_NODE_NAME) {
    return null;
  }

  return {
    tableNode: previousNode,
    tableStart: selectionFrom - previousNode.nodeSize,
    deleteRange: null
  };
};

/**
 * 从段落行首位置解析紧邻上方表格，并在当前段落为空时返回待删除范围。
 */
const resolveTableFromParagraphStart = (
  resolvedPosition: ResolvedPos
): TableBackspaceTarget | null => {
  // 仅拦截普通段落行首，避免影响标题行首降级等原生/已有退格行为。
  if (
    resolvedPosition.parent.type.name !== PARAGRAPH_NODE_NAME ||
    resolvedPosition.parentOffset !== 0 ||
    resolvedPosition.depth < 1
  ) {
    return null;
  }

  // 当前段落在其父容器中的索引。
  const currentBlockIndex = resolvedPosition.index(resolvedPosition.depth - 1);
  if (currentBlockIndex <= 0) {
    return null;
  }

  // 当前段落容器。
  const blockContainer = resolvedPosition.node(resolvedPosition.depth - 1);
  // 当前段落同级上一块节点。
  const previousBlock = blockContainer.child(currentBlockIndex - 1);
  if (previousBlock.type.name !== TABLE_NODE_NAME) {
    return null;
  }

  // 当前段落起始位置（节点左边界）。
  const currentBlockStart = resolvedPosition.before(resolvedPosition.depth);
  // 严格判断内容为空，避免误删包含行内图片或公式等非文本节点的段落。
  const deleteRange =
    resolvedPosition.parent.content.size === 0
      ? {
          from: currentBlockStart,
          to: currentBlockStart + resolvedPosition.parent.nodeSize
        }
      : null;

  return {
    tableNode: previousBlock,
    tableStart: currentBlockStart - previousBlock.nodeSize,
    deleteRange
  };
};

/**
 * 处理表格下方 Backspace：空段落先删除自身，并将光标移入表格右下角单元格末尾，避免误选整表。
 */
const handleBackspaceIntoTable = (view: EditorView, event: KeyboardEvent): boolean => {
  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 命中的上方表格及可选删除范围。
  const target =
    selection instanceof GapCursor
      ? resolveTableFromGapCursor(selection.from, selection.$from)
      : resolveTableFromParagraphStart(selection.$from);
  if (!target) {
    return false;
  }

  // 表格最后一行最后一列单元格文本末尾位置。
  const targetPosition = resolveLastCellEndPosition(target.tableNode, target.tableStart);
  if (targetPosition === null) {
    return false;
  }

  event.preventDefault();
  // 先删除空段落（位于表格之后，不影响 targetPosition），再将光标定位到表格末格末尾。
  const transaction = view.state.tr;
  if (target.deleteRange) {
    transaction.delete(target.deleteRange.from, target.deleteRange.to);
  }
  transaction
    .setSelection(TextSelection.near(transaction.doc.resolve(targetPosition), -1))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 表格 Backspace 进入插件：防止表格下方按 Backspace 触发整表 NodeSelection，改为删除空段落并进入表格末格。
 */
export const tableBackspaceEntryPlugin = $prose(() => {
  return new Plugin({
    key: TABLE_BACKSPACE_ENTRY_PLUGIN_KEY,
    props: {
      handleKeyDown: (view, event) => {
        const editorView = view as EditorView;
        if (shouldSkipKeydown(editorView, event)) {
          return false;
        }

        return handleBackspaceIntoTable(editorView, event);
      }
    }
  });
});
