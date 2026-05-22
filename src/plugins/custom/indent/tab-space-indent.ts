import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import { liftListItem, sinkListItem } from '@milkdown/prose/schema-list';
import type { NodeType } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// Tab 按键值。
const TAB_KEY = 'Tab';
// 默认缩进空格数。
const INDENT_SPACE_SIZE = 4;
// 行首空格正则。
const LINE_LEADING_SPACES_PATTERN = /^ */;
// 列表项节点名。
const LIST_ITEM_NODE_NAME = 'list_item';

/**
 * 解析编辑器是否处于可编辑状态。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 解析当前选区所在的列表项节点类型。
 */
const resolveListItemNodeType = (state: EditorState): NodeType | null => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const currentNode = $from.node(depth);
    if (currentNode.type.name === LIST_ITEM_NODE_NAME) {
      return currentNode.type;
    }
  }

  return null;
};

/**
 * 解析“需要处理缩进”的目标行起始位置集合。
 */
const resolveTargetLineStarts = (state: EditorState): number[] => {
  const { selection, doc } = state;
  if (selection.empty) {
    return [selection.$from.start()];
  }

  // 选区命中的文本块行首位置集合。
  const lineStarts = new Set<number>();
  doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isTextblock) {
      return;
    }

    lineStarts.add(position + 1);
  });

  return Array.from(lineStarts);
};

/**
 * 处理 Tab：有选区时逐行增加缩进，无选区时在光标位插入固定空格。
 */
const handleTabIndent = (view: EditorView, event: KeyboardEvent): boolean => {
  const { state } = view;
  const indentText = ' '.repeat(INDENT_SPACE_SIZE);
  const lineStarts = resolveTargetLineStarts(state).sort((left, right) => right - left);
  const transaction = state.tr;
  if (state.selection.empty) {
    transaction.insertText(indentText, state.selection.to);
  } else {
    lineStarts.forEach((lineStartPosition) => {
      transaction.insertText(indentText, lineStartPosition);
    });
  }

  if (!transaction.docChanged) {
    return false;
  }

  event.preventDefault();
  view.dispatch(transaction);
  return true;
};

/**
 * 处理 Shift+Tab：有选区时逐行减少缩进，无选区时仅减少当前行行首空格。
 */
const handleShiftTabOutdent = (view: EditorView, event: KeyboardEvent): boolean => {
  const { state } = view;
  const { selection } = state;
  if (!(selection instanceof TextSelection)) {
    return false;
  }

  const lineStarts = resolveTargetLineStarts(state).sort((left, right) => right - left);
  const transaction = state.tr;
  lineStarts.forEach((lineStartPosition) => {
    const lineNode = state.doc.resolve(lineStartPosition).parent;
    const lineText = lineNode.textContent;
    const leadingSpaces = lineText.match(LINE_LEADING_SPACES_PATTERN)?.[0].length ?? 0;
    const removeCount = Math.min(leadingSpaces, INDENT_SPACE_SIZE);
    if (removeCount <= 0) {
      return;
    }

    transaction.delete(lineStartPosition, lineStartPosition + removeCount);
  });

  if (!transaction.docChanged) {
    return false;
  }

  event.preventDefault();
  view.dispatch(transaction);
  return true;
};

/**
 * 全局空格缩进插件：支持 Tab 增加缩进、Shift+Tab 减少缩进。
 */
export const tabSpaceIndentPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('zt-md-tab-space-indent'),
    props: {
      handleKeyDown: (view, event) => {
        const editorView = view as EditorView;
        if (!isEditorViewEditable(editorView) || event.defaultPrevented || event.key !== TAB_KEY) {
          return false;
        }

        if (event.altKey || event.ctrlKey || event.metaKey) {
          return false;
        }

        // 列表项内优先使用列表层级命令，不回退到空格缩进。
        const listItemNodeType = resolveListItemNodeType(editorView.state);
        if (listItemNodeType) {
          const listCommand = event.shiftKey ? liftListItem(listItemNodeType) : sinkListItem(listItemNodeType);
          const handled = listCommand(editorView.state, editorView.dispatch);
          event.preventDefault();
          return handled || true;
        }

        if (event.shiftKey) {
          return handleShiftTabOutdent(editorView, event);
        }

        return handleTabIndent(editorView, event);
      }
    }
  });
});
