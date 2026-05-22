import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, Copy, Trash2 } from 'lucide-react';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import type { EditorI18nMessages } from '../../../types/editor';
import { resolveEditorMessages } from '../../../local/i18n';

// 代码块节点类型名。
const CODE_BLOCK_NODE_NAME = 'code_block';
// 复制成功态清理延迟（毫秒）。
const COPY_FEEDBACK_DURATION = 1200;

/**
 * 基于 lucide-react 组件渲染 SVG 字符串。
 */
const renderLucideIconMarkup = (icon: typeof Copy): string => {
  return renderToStaticMarkup(
    createElement(icon, {
      size: 14,
      strokeWidth: 2,
      'aria-hidden': 'true'
    })
  );
};

// 复制按钮默认图标。
const copyIconMarkup = renderLucideIconMarkup(Copy);
// 复制成功反馈图标。
const checkIconMarkup = renderLucideIconMarkup(Check);
// 删除按钮默认图标。
const deleteIconMarkup = renderLucideIconMarkup(Trash2);

/**
 * 解析 NodeView 的节点位置。
 */
const resolveNodePosition = (getPos: boolean | (() => number)): number | null => {
  if (typeof getPos !== 'function') {
    return null;
  }

  return getPos();
};

/**
 * 判断当前编辑器是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 创建带悬浮操作按钮的代码块 NodeView。
 */
class CodeBlockEditableNodeView implements NodeView {
  // 当前节点快照。
  node: ProseNode;
  // 节点根容器。
  dom: HTMLDivElement;
  // 内容容器。
  contentDOM: HTMLPreElement;
  // 编辑器视图。
  private readonly view: EditorView;
  // 节点位置获取器。
  private readonly getPos: boolean | (() => number);
  // 操作区容器。
  private readonly actionsContainer: HTMLSpanElement;
  // 复制按钮。
  private readonly copyButton: HTMLButtonElement;
  // 删除按钮。
  private readonly deleteButton: HTMLButtonElement;
  // 复制成功反馈计时器。
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 同步代码块语言属性到 pre[data-language]，用于语言说明展示。
   */
  private syncLanguageAttribute(node: ProseNode): void {
    // 当前语言属性值。
    const language = typeof node.attrs.language === 'string' ? node.attrs.language.trim() : '';
    if (!language) {
      this.contentDOM.removeAttribute('data-language');
      return;
    }

    this.contentDOM.setAttribute('data-language', language);
  }

  /**
   * 初始化代码块视图。
   */
  constructor(
    node: ProseNode,
    view: EditorView,
    getPos: boolean | (() => number),
    messages: EditorI18nMessages
  ) {
    // 初始节点快照。
    this.node = node;
    // 编辑器视图引用。
    this.view = view;
    // 节点位置获取器引用。
    this.getPos = getPos;
    // 根容器。
    this.dom = document.createElement('div');
    this.dom.className = 'zt-md-code-block';
    this.dom.dataset.type = CODE_BLOCK_NODE_NAME;
    this.updateEditableState();
    // 内容容器。
    this.contentDOM = document.createElement('pre');
    // 操作区容器。
    this.actionsContainer = document.createElement('span');
    this.actionsContainer.className = 'zt-md-code-block-actions';
    // 复制按钮。
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'zt-md-code-block-action-button';
    this.copyButton.setAttribute('aria-label', messages.codeBlockCopyAriaLabel);
    this.copyButton.innerHTML = copyIconMarkup;
    // 删除按钮。
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'zt-md-code-block-action-button zt-md-code-block-action-button-danger';
    this.deleteButton.setAttribute('aria-label', messages.codeBlockDeleteAriaLabel);
    this.deleteButton.innerHTML = deleteIconMarkup;
    this.actionsContainer.append(this.copyButton, this.deleteButton);
    this.dom.append(this.contentDOM, this.actionsContainer);
    this.syncLanguageAttribute(node);
    this.copyButton.addEventListener('click', this.handleCopyClick);
    this.deleteButton.addEventListener('click', this.handleDeleteClick);
  }

  /**
   * 响应复制按钮点击，复制当前代码块文本。
   */
  private readonly handleCopyClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!isEditorViewEditable(this.view)) {
      return;
    }

    // 当前代码块文本。
    const codeContent = this.node.textContent;
    // 优先使用现代剪贴板 API。
    const writeClipboardPromise =
      typeof navigator !== 'undefined' && navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(codeContent)
        : Promise.resolve();
    void writeClipboardPromise
      .then(() => {
        this.copyButton.innerHTML = checkIconMarkup;
        this.copyButton.dataset.copied = 'true';
        if (this.copyFeedbackTimer !== null) {
          clearTimeout(this.copyFeedbackTimer);
        }
        this.copyFeedbackTimer = setTimeout(() => {
          this.copyButton.innerHTML = copyIconMarkup;
          delete this.copyButton.dataset.copied;
          this.copyFeedbackTimer = null;
        }, COPY_FEEDBACK_DURATION);
      })
      .catch(() => {
        // 剪贴板不可用时忽略反馈，不影响编辑流程。
      });
  };

  /**
   * 响应删除按钮点击，删除当前代码块。
   */
  private readonly handleDeleteClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!isEditorViewEditable(this.view)) {
      return;
    }

    this.deleteCurrentCodeBlock();
  };

  /**
   * 删除当前代码块并将焦点归还编辑器。
   */
  private deleteCurrentCodeBlock(): void {
    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    // 删除后将光标落在安全位置，保证后续连续编辑。
    const transaction = this.view.state.tr.delete(nodePosition, nodePosition + this.node.nodeSize);
    const safePosition = Math.min(nodePosition, transaction.doc.content.size);
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(safePosition), -1)).scrollIntoView();
    this.view.dispatch(transaction);
    requestAnimationFrame(() => {
      this.view.focus();
    });
  }

  /**
   * 更新代码块可编辑状态标记。
   */
  private updateEditableState(): void {
    this.dom.dataset.editable = isEditorViewEditable(this.view) ? 'true' : 'false';
  }

  /**
   * 处理节点更新。
   */
  update(node: ProseNode): boolean {
    if (node.type.name !== CODE_BLOCK_NODE_NAME) {
      return false;
    }

    this.node = node;
    this.updateEditableState();
    this.syncLanguageAttribute(node);
    return true;
  }

  /**
   * 只拦截操作按钮内部事件。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    return this.actionsContainer.contains(target);
  }

  /**
   * 忽略 NodeView 内部的 DOM 变更观察。
   */
  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') {
      return false;
    }

    return this.actionsContainer.contains(mutation.target);
  }

  /**
   * 销毁时解绑监听器。
   */
  destroy(): void {
    this.copyButton.removeEventListener('click', this.handleCopyClick);
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
    if (this.copyFeedbackTimer !== null) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
    this.copyButton.innerHTML = copyIconMarkup;
    delete this.copyButton.dataset.copied;
  }
}

/**
 * 创建 code_block 的 NodeView 构造器。
 */
export const createCodeBlockEditableNodeView = (
  messages: EditorI18nMessages = resolveEditorMessages()
): NodeViewConstructor => {
  return (node, view, getPos) => {
    // 将 NodeViewConstructor 的可选 getPos 统一收敛到当前实现可接受的类型范围。
    const resolvedGetPos =
      typeof getPos === 'function'
        ? () => {
            // 最新节点位置。
            const nextPosition = getPos();
            return typeof nextPosition === 'number' ? nextPosition : 0;
          }
        : false;
    return new CodeBlockEditableNodeView(node, view, resolvedGetPos, messages);
  };
};

