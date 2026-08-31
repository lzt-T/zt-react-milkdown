import type { EditorView } from '@milkdown/prose/view';

/** 行内代码边界方向。 */
export type InlineCodeBoundarySide = 'left' | 'right';

/**
 * 解析 DOM 位置所属的行内代码元素。
 */
const resolveInlineCodeElement = (node: Node): HTMLElement | null => {
  // DOM 位置对应的元素或父元素。
  const element = node instanceof Element ? node : node.parentElement;
  // DOM 位置所属的代码元素。
  const codeElement = element?.closest('code');
  return codeElement instanceof HTMLElement && !codeElement.closest('pre') ? codeElement : null;
};

/**
 * 根据文档边界位置解析相邻的真实行内代码元素。
 */
export const resolveInlineCodeElementAtBoundary = (
  view: EditorView,
  position: number,
  domBias: -1 | 1
): HTMLElement | null => {
  // 指定偏向对应的 DOM 位置。
  const domPosition = view.domAtPos(position, domBias);
  return resolveInlineCodeElement(domPosition.node);
};

/**
 * 查找代码元素最后一个非空文本节点。
 */
const findInlineCodeEndTextNode = (codeElement: HTMLElement): Text | null => {
  // 仅遍历文本节点的 DOM 游标。
  const textWalker = codeElement.ownerDocument.createTreeWalker(codeElement, NodeFilter.SHOW_TEXT);
  // 当前遍历到的文本节点。
  let currentTextNode = textWalker.nextNode() as Text | null;
  // 最后一个非空文本节点。
  let lastTextNode: Text | null = null;

  while (currentTextNode) {
    if (currentTextNode.data.length > 0) {
      lastTextNode = currentTextNode;
    }
    currentTextNode = textWalker.nextNode() as Text | null;
  }

  return lastTextNode;
};

/**
 * 将原生光标放到行内代码指定 DOM 侧。
 */
export const placeCaretAtInlineCodeBoundary = (
  view: EditorView,
  position: number,
  domBias: -1 | 1
): void => {
  // 指定偏向对应的 DOM 位置。
  const domPosition = view.domAtPos(position, domBias);
  // 编辑器所属文档的原生选区。
  const domSelection = view.dom.ownerDocument.getSelection();
  domSelection?.collapse(domPosition.node, domPosition.offset);
};

/**
 * 将原生光标精确放到行内代码末尾文本节点。
 */
export const placeCaretInsideInlineCodeEnd = (view: EditorView, position: number): void => {
  // 当前文档位置映射的 DOM 位置。
  const domPosition = view.domAtPos(position, -1);
  // 当前 DOM 位置所属的行内代码元素。
  const codeElement = resolveInlineCodeElement(domPosition.node);
  // 编辑器所属文档的原生选区。
  const domSelection = view.dom.ownerDocument.getSelection();
  if (!codeElement) {
    domSelection?.collapse(domPosition.node, domPosition.offset);
    return;
  }

  // 当前边界对应的真实文本节点。
  const endTextNode = findInlineCodeEndTextNode(codeElement);
  if (!endTextNode) {
    // 空代码元素的边界偏移。
    const boundaryOffset = codeElement.childNodes.length;
    domSelection?.collapse(codeElement, boundaryOffset);
    return;
  }

  // 文本节点内的精确边界偏移。
  const boundaryOffset = endTextNode.data.length;
  domSelection?.collapse(endTextNode, boundaryOffset);
};
