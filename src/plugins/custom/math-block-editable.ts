import katex from 'katex';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import type { EditorI18nMessages } from '../../types/editor';
import { resolveEditorMessages } from '../../local/i18n';

/**
 * math_block 节点类型名。
 */
const MATH_BLOCK_NODE_NAME = 'math_block';

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
 * 创建可点击编辑的公式块 NodeView。
 */
class MathBlockEditableNodeView implements NodeView {
  // 当前节点快照。
  node: ProseNode;
  // 节点根容器。
  dom: HTMLDivElement;
  // 编辑器视图。
  private readonly view: EditorView;
  // 节点位置获取器。
  private readonly getPos: boolean | (() => number);
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 源码编辑容器。
  private readonly sourceContainer: HTMLDivElement;
  // 源码输入框。
  private readonly sourceTextarea: HTMLTextAreaElement;
  // 渲染结果容器。
  private readonly previewContainer: HTMLDivElement;
  // 渲染错误提示节点。
  private readonly errorContainer: HTMLDivElement;

  /**
   * 初始化公式块视图。
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
    // 编辑器文案引用。
    this.messages = messages;

    // 根容器。
    this.dom = document.createElement('div');
    this.dom.dataset.type = MATH_BLOCK_NODE_NAME;
    this.dom.className = 'zt-md-math-block';

    // 源码编辑容器。
    this.sourceContainer = document.createElement('div');
    this.sourceContainer.className = 'zt-md-math-block-source';
    this.sourceContainer.hidden = true;

    // 源码输入框。
    this.sourceTextarea = document.createElement('textarea');
    this.sourceTextarea.className = 'zt-md-math-block-textarea';
    this.sourceTextarea.setAttribute('aria-label', this.messages.mathBlockSourceAriaLabel);
    this.sourceTextarea.spellcheck = false;

    // 渲染结果容器。
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'zt-md-math-block-preview';

    // 渲染错误提示节点。
    this.errorContainer = document.createElement('div');
    this.errorContainer.className = 'zt-md-math-block-error';
    this.errorContainer.hidden = true;

    this.sourceContainer.appendChild(this.sourceTextarea);
    this.previewContainer.appendChild(this.errorContainer);
    this.dom.append(this.sourceContainer, this.previewContainer);

    this.syncFromNode(node);

    this.dom.addEventListener('click', this.handleClick);
    this.sourceTextarea.addEventListener('input', this.handleInput);
    this.sourceTextarea.addEventListener('blur', this.handleBlur);
  }

  /**
   * 响应公式块点击，进入编辑态。
   */
  private readonly handleClick = (): void => {
    this.enterEditMode();
  };

  /**
   * 响应源码输入，实时更新节点并刷新渲染。
   */
  private readonly handleInput = (): void => {
    // 最新源码。
    const nextValue = this.sourceTextarea.value;
    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);

    if (nodePosition === null) {
      return;
    }

    // 预渲染，保证输入时立即反馈。
    this.renderMath(nextValue);

    // 本次事务对象。
    const transaction = this.view.state.tr.setNodeMarkup(nodePosition, undefined, {
      ...this.node.attrs,
      value: nextValue
    });

    if (transaction.docChanged) {
      this.view.dispatch(transaction);
    }
  };

  /**
   * 源码输入框失焦后退出编辑态。
   */
  private readonly handleBlur = (): void => {
    this.exitEditMode();
  };

  /**
   * 更新 DOM 与渲染结果。
   */
  private syncFromNode(node: ProseNode): void {
    // 当前公式源码。
    const formulaSource = typeof node.attrs.value === 'string' ? node.attrs.value : '';
    this.dom.dataset.value = formulaSource;
    this.sourceTextarea.value = formulaSource;
    this.renderMath(formulaSource);
  }

  /**
   * 渲染公式预览。
   */
  private renderMath(source: string): void {
    this.errorContainer.hidden = true;
    this.errorContainer.textContent = '';

    try {
      katex.render(source, this.previewContainer, {
        displayMode: true,
        throwOnError: true
      });
      this.previewContainer.appendChild(this.errorContainer);
    } catch {
      // 渲染失败时仅显示错误提示，不中断输入流程。
      this.previewContainer.textContent = source;
      this.errorContainer.hidden = false;
      this.errorContainer.textContent = this.messages.mathRenderError;
      this.previewContainer.appendChild(this.errorContainer);
    }
  }

  /**
   * 进入编辑态并展示源码输入区。
   */
  private enterEditMode(): void {
    if (!isEditorViewEditable(this.view)) {
      return;
    }

    this.sourceContainer.hidden = false;
    this.dom.classList.add('zt-md-math-block-editing');
    this.sourceTextarea.focus();
  }

  /**
   * 退出编辑态并隐藏源码输入区。
   */
  private exitEditMode(): void {
    this.sourceContainer.hidden = true;
    this.dom.classList.remove('zt-md-math-block-editing');
  }

  /**
   * 处理节点更新。
   */
  update(node: ProseNode): boolean {
    if (node.type.name !== MATH_BLOCK_NODE_NAME) {
      return false;
    }

    this.node = node;
    this.syncFromNode(node);
    return true;
  }

  /**
   * 节点被选中时进入编辑态。
   */
  selectNode(): void {
    this.enterEditMode();
  }

  /**
   * 节点取消选中时退出编辑态。
   */
  deselectNode(): void {
    this.exitEditMode();
  }

  /**
   * 允许输入框事件在 NodeView 内部消费。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    return target instanceof Node ? this.sourceContainer.contains(target) : false;
  }

  /**
   * 忽略 NodeView 内部的 DOM 变更观察。
   */
  ignoreMutation(): boolean {
    return true;
  }

  /**
   * 销毁时解绑监听器。
   */
  destroy(): void {
    this.dom.removeEventListener('click', this.handleClick);
    this.sourceTextarea.removeEventListener('input', this.handleInput);
    this.sourceTextarea.removeEventListener('blur', this.handleBlur);
  }
}

/**
 * 创建 math_block 的 NodeView 构造器。
 */
export const createMathBlockEditableNodeView = (
  messages: EditorI18nMessages = resolveEditorMessages()
): NodeViewConstructor => {
  return (node, view, getPos) => {
    return new MathBlockEditableNodeView(node, view, getPos, messages);
  };
};
