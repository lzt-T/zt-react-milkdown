import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// Backspace 按键值。
const BACKSPACE_KEY = 'Backspace';
// 标题节点名。
const HEADING_NODE_NAME = 'heading';
// 段落节点名。
const PARAGRAPH_NODE_NAME = 'paragraph';

/** 前置空白段落的文档范围。 */
interface PreviousEmptyParagraphRange {
  /** 段落起始位置。 */
  from: number;
  /** 段落结束位置。 */
  to: number;
}

/**
 * 判断编辑器是否允许修改内容。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 判断节点是否为仅含空白文本的段落。
 */
const isEmptyTextParagraph = (node: ProseNode): boolean => {
  if (node.type.name !== PARAGRAPH_NODE_NAME) {
    return false;
  }

  // 段落文本。
  const paragraphText = node.textContent;
  return paragraphText.trim().length === 0 && node.content.size === paragraphText.length;
};

/**
 * 解析标题行首紧邻的前置空白段落。
 */
const resolvePreviousEmptyParagraphRange = (
  resolvedPosition: ResolvedPos
): PreviousEmptyParagraphRange | null => {
  if (
    resolvedPosition.parent.type.name !== HEADING_NODE_NAME ||
    resolvedPosition.parentOffset !== 0 ||
    resolvedPosition.depth < 1
  ) {
    return null;
  }

  // 当前标题在父容器中的索引。
  const currentHeadingIndex = resolvedPosition.index(resolvedPosition.depth - 1);
  if (currentHeadingIndex <= 0) {
    return null;
  }

  // 当前标题的父容器。
  const blockContainer = resolvedPosition.node(resolvedPosition.depth - 1);
  // 标题前的同级节点。
  const previousBlock = blockContainer.child(currentHeadingIndex - 1);
  if (!isEmptyTextParagraph(previousBlock)) {
    return null;
  }

  // 当前标题起始位置。
  const currentHeadingStart = resolvedPosition.before(resolvedPosition.depth);
  return {
    from: currentHeadingStart - previousBlock.nodeSize,
    to: currentHeadingStart
  };
};

/**
 * 处理标题行首 Backspace 删除前置空白段落。
 */
const handleBackspaceEmptyParagraph = (view: EditorView, event: KeyboardEvent): boolean => {
  if (
    event.key !== BACKSPACE_KEY ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !isEditorViewEditable(view)
  ) {
    return false;
  }

  // 当前选区。
  const { selection } = view.state;
  if (!selection.empty) {
    return false;
  }

  // 需删除的前置空白段落范围。
  const paragraphRange = resolvePreviousEmptyParagraphRange(selection.$from);
  if (!paragraphRange) {
    return false;
  }

  event.preventDefault();
  // 删除空白段落后的事务。
  const transaction = view.state.tr.delete(paragraphRange.from, paragraphRange.to);
  transaction
    .setSelection(TextSelection.create(transaction.doc, paragraphRange.from + 1))
    .scrollIntoView();
  view.dispatch(transaction);
  return true;
};

/**
 * 创建标题空白段落 Backspace 处理器。
 */
const createHeadingBackspaceEmptyParagraphPlugin = (): Plugin => {
  return new Plugin({
    key: new PluginKey('zt-md-heading-backspace-empty-paragraph'),
    props: {
      /**
       * 优先删除标题前的空白段落，未命中时放行默认标题降级。
       */
      handleKeyDown: (view, event) => {
        return handleBackspaceEmptyParagraph(view as EditorView, event);
      }
    }
  });
};

/** 标题前空白段落 Backspace 删除插件。 */
export const headingBackspaceEmptyParagraphPlugin = $prose(
  createHeadingBackspaceEmptyParagraphPlugin
);
