import katex from 'katex';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import type { EditorI18nMessages } from '../../../types/editor';
import { resolveEditorMessages } from '../../../local/i18n';
import { openMathInlineEditor } from './math-inline-edit-plugin';

/**
 * math_inline 节点类型名。
 */
const MATH_INLINE_NODE_NAME = 'math_inline';

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
 * 读取行内公式源码。
 */
const resolveInlineMathSource = (node: ProseNode): string => {
  return String(node.attrs.value ?? node.textContent ?? '');
};

/**
 * 创建可点击编辑的行内公式 NodeView。
 */
class MathInlineEditableNodeView implements NodeView {
  // 当前节点快照。
  node: ProseNode;
  // 节点根容器。
  dom: HTMLSpanElement;
  // 编辑器视图。
  private readonly view: EditorView;
  // 节点位置获取器。
  private readonly getPos: boolean | (() => number);
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 渲染结果容器。
  private readonly previewContainer: HTMLSpanElement;
  // 渲染错误提示节点。
  private readonly errorContainer: HTMLSpanElement;

  /**
   * 同步行内公式可编辑状态标记，供样式层判断只读态。
   */
  private syncEditableState(): void {
    this.dom.dataset.editable = isEditorViewEditable(this.view) ? 'true' : 'false';
  }

  /**
   * 初始化行内公式视图。
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
    this.dom = document.createElement('span');
    this.dom.dataset.type = MATH_INLINE_NODE_NAME;
    this.dom.className = 'zt-md-math-inline';
    this.dom.dataset.editing = 'false';
    this.syncEditableState();

    // 渲染结果容器。
    this.previewContainer = document.createElement('span');
    this.previewContainer.className = 'zt-md-math-inline-preview';

    // 渲染错误提示节点。
    this.errorContainer = document.createElement('span');
    this.errorContainer.className = 'zt-md-math-inline-error';
    this.errorContainer.hidden = true;

    this.dom.append(this.previewContainer, this.errorContainer);
    this.syncFromNode(node);
    this.dom.addEventListener('click', this.handleClick);
  }

  /**
   * 响应行内公式点击，交给独立插件打开编辑器。
   */
  private readonly handleClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!isEditorViewEditable(this.view)) {
      return;
    }

    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    openMathInlineEditor(this.view, nodePosition);
  };

  /**
   * 更新 DOM 与渲染结果。
   */
  private syncFromNode(node: ProseNode): void {
    // 当前公式源码。
    const formulaSource = resolveInlineMathSource(node);
    this.dom.dataset.value = formulaSource;
    this.renderMath(formulaSource);
  }

  /**
   * 渲染公式预览。
   */
  private renderMath(source: string): void {
    this.errorContainer.hidden = true;
    this.errorContainer.textContent = '';
    this.previewContainer.textContent = '';

    try {
      katex.render(source, this.previewContainer, {
        displayMode: false,
        throwOnError: true
      });
    } catch {
      // 渲染失败时仅显示源码与错误提示，不中断编辑入口。
      this.previewContainer.textContent = source;
      this.errorContainer.hidden = false;
      this.errorContainer.textContent = this.messages.mathRenderError;
    }
  }

  /**
   * 处理节点更新。
   */
  update(node: ProseNode): boolean {
    if (node.type.name !== MATH_INLINE_NODE_NAME) {
      return false;
    }

    this.node = node;
    this.syncEditableState();
    this.syncFromNode(node);
    return true;
  }

  /**
   * 阻止编辑控件事件落回编辑器默认选区逻辑。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    if (!(target instanceof Element)) {
      return event.type === 'click';
    }

    return event.type === 'click' || Boolean(target.closest('.zt-md-math-inline-editor'));
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
  }
}

/**
 * 创建 math_inline 的 NodeView 构造器。
 */
export const createMathInlineEditableNodeView = (
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
    return new MathInlineEditableNodeView(node, view, resolvedGetPos, messages);
  };
};
