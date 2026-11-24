import { resolveEditorMessages } from '@/local/i18n';
import { observeEditorMessages } from '@/local/message-updates';
import {
  FRONTMATTER_NODE_NAME,
  normalizeFrontmatterFormat,
  type FrontmatterFormat
} from '@/plugins/custom/frontmatter/frontmatter-plugin';
import type { EditorI18nMessages } from '@/types/editor';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import { Check, ChevronDown, Copy, Trash2 } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// 复制成功态清理延迟（毫秒）。
const COPY_FEEDBACK_DURATION = 1200;

// Frontmatter 格式到国际化标题键的固定映射表。
const FRONTMATTER_LABEL_KEY_MAP: Readonly<
  Record<FrontmatterFormat, 'frontmatterYamlLabel' | 'frontmatterTomlLabel'>
> = {
  yaml: 'frontmatterYamlLabel',
  toml: 'frontmatterTomlLabel'
};

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

// 折叠指示箭头图标。
const chevronIconMarkup = renderLucideIconMarkup(ChevronDown);
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
 * 创建可折叠、可原地编辑的 Frontmatter NodeView。
 */
class FrontmatterEditableNodeView implements NodeView {
  // 视图销毁时解除文案观察。
  private readonly stopObservingMessages: () => void;
  // 当前节点快照。
  node: ProseNode;
  // 节点根容器。
  dom: HTMLDivElement;
  // 源码内容容器，由 ProseMirror 直接托管文本编辑。
  contentDOM: HTMLPreElement;
  // 编辑器视图。
  private readonly view: EditorView;
  // 节点位置获取器。
  private readonly getPos: boolean | (() => number);
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 顶部栏容器。
  private readonly headerContainer: HTMLDivElement;
  // 折叠切换按钮。
  private readonly toggleButton: HTMLButtonElement;
  // 折叠箭头容器。
  private readonly chevronIcon: HTMLSpanElement;
  // 标题文本容器。
  private readonly titleSpan: HTMLSpanElement;
  // 操作按钮容器。
  private readonly actionsContainer: HTMLSpanElement;
  // 复制按钮。
  private readonly copyButton: HTMLButtonElement;
  // 删除按钮。
  private readonly deleteButton: HTMLButtonElement;
  // 当前是否处于折叠状态。
  private isCollapsed = false;
  // 复制成功反馈计时器。
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 初始化 Frontmatter 视图。
   */
  constructor(
    node: ProseNode,
    view: EditorView,
    getPos: boolean | (() => number),
    messages: EditorI18nMessages
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.messages = messages;

    // 根容器。
    this.dom = document.createElement('div');
    this.dom.className = 'zt-md-frontmatter';
    this.dom.dataset.type = FRONTMATTER_NODE_NAME;

    // 顶部栏容器（禁止编辑）。
    this.headerContainer = document.createElement('div');
    this.headerContainer.className = 'zt-md-frontmatter-header';
    this.headerContainer.contentEditable = 'false';

    // 折叠切换按钮。
    this.toggleButton = document.createElement('button');
    this.toggleButton.type = 'button';
    this.toggleButton.className = 'zt-md-frontmatter-toggle';

    // 折叠箭头图标容器。
    this.chevronIcon = document.createElement('span');
    this.chevronIcon.className = 'zt-md-frontmatter-chevron';
    this.chevronIcon.innerHTML = chevronIconMarkup;

    // 元数据格式标题。
    this.titleSpan = document.createElement('span');
    this.titleSpan.className = 'zt-md-frontmatter-title';
    this.toggleButton.append(this.chevronIcon, this.titleSpan);

    // 操作按钮区。
    this.actionsContainer = document.createElement('span');
    this.actionsContainer.className = 'zt-md-frontmatter-actions';

    // 复制按钮。
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'zt-md-frontmatter-action-button';
    this.copyButton.innerHTML = copyIconMarkup;

    // 删除按钮。
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className =
      'zt-md-frontmatter-action-button zt-md-frontmatter-editable-action zt-md-frontmatter-action-button-danger';
    this.deleteButton.innerHTML = deleteIconMarkup;

    this.actionsContainer.append(this.copyButton, this.deleteButton);
    this.headerContainer.append(this.toggleButton, this.actionsContainer);

    // 原生 ProseMirror 可编辑源码区。
    this.contentDOM = document.createElement('pre');
    this.contentDOM.className = 'zt-md-frontmatter-body';

    this.dom.append(this.headerContainer, this.contentDOM);

    this.syncFormatState(node);
    this.syncEditableState();
    this.syncCollapsedState();
    this.syncLocalizedLabels();

    this.toggleButton.addEventListener('click', this.handleToggleClick);
    this.copyButton.addEventListener('click', this.handleCopyClick);
    this.deleteButton.addEventListener('click', this.handleDeleteClick);
    this.stopObservingMessages = observeEditorMessages(messages, () => {
      this.syncLocalizedLabels();
    });
  }

  /**
   * 同步节点格式属性与展示标签。
   */
  private syncFormatState(node: ProseNode): void {
    // 标准化格式标识。
    const format = normalizeFrontmatterFormat(node.attrs.format);
    this.dom.dataset.format = format;
    this.titleSpan.textContent = this.messages[FRONTMATTER_LABEL_KEY_MAP[format]];
  }

  /**
   * 同步编辑器可编辑状态到容器属性。
   */
  private syncEditableState(): void {
    this.dom.dataset.editable = isEditorViewEditable(this.view) ? 'true' : 'false';
  }

  /**
   * 同步折叠态 DOM 属性与可访问性状态。
   */
  private syncCollapsedState(): void {
    this.dom.dataset.collapsed = this.isCollapsed ? 'true' : 'false';
    this.toggleButton.setAttribute('aria-expanded', String(!this.isCollapsed));
    this.contentDOM.hidden = this.isCollapsed;
    this.contentDOM.setAttribute('aria-hidden', String(this.isCollapsed));
  }

  /**
   * 刷新当前语言下的标题与按钮无障碍标签。
   */
  private syncLocalizedLabels(): void {
    // 当前格式对应的标题键。
    const format = normalizeFrontmatterFormat(this.node.attrs.format);
    this.titleSpan.textContent = this.messages[FRONTMATTER_LABEL_KEY_MAP[format]];

    // 折叠切换无障碍标签。
    const toggleLabel = this.isCollapsed
      ? this.messages.frontmatterExpandAriaLabel
      : this.messages.frontmatterCollapseAriaLabel;
    this.toggleButton.setAttribute('aria-label', toggleLabel);
    this.toggleButton.title = toggleLabel;

    this.copyButton.setAttribute('aria-label', this.messages.frontmatterCopyAriaLabel);
    this.copyButton.title = this.messages.frontmatterCopyAriaLabel;
    this.deleteButton.setAttribute('aria-label', this.messages.frontmatterDeleteAriaLabel);
    this.deleteButton.title = this.messages.frontmatterDeleteAriaLabel;
  }

  /**
   * 切换元数据块折叠与展开状态。
   */
  private readonly handleToggleClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.isCollapsed = !this.isCollapsed;
    this.syncCollapsedState();
    this.syncLocalizedLabels();
  };

  /**
   * 复制 Frontmatter 原始内容。
   */
  private readonly handleCopyClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    // 当前节点原始文本。
    const rawContent = this.node.textContent;
    // 优先使用现代剪贴板 API。
    const writeClipboardPromise =
      typeof navigator !== 'undefined' && navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(rawContent)
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
   * 删除当前 Frontmatter 块；若文档因此为空则保留一个空段落。
   */
  private readonly handleDeleteClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!isEditorViewEditable(this.view)) {
      return;
    }

    // 当前节点起始位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    // 当前节点结束位置。
    const nodeEnd = nodePosition + this.node.nodeSize;
    // 当前文档是否仅包含该节点。
    const isOnlyNodeInDoc =
      nodePosition === 0 && nodeEnd === this.view.state.doc.content.size;
    // 普通段落节点类型。
    const paragraphType = this.view.state.schema.nodes.paragraph;
    // 删空文档时补入的兜底空段落。
    const fallbackParagraph = isOnlyNodeInDoc ? paragraphType?.createAndFill() : null;

    if (fallbackParagraph) {
      // 使用空段落替换唯一节点，维持 docSchema 的 block+ 约束。
      const transaction = this.view.state.tr.replaceWith(
        nodePosition,
        nodeEnd,
        fallbackParagraph
      );
      transaction
        .setSelection(TextSelection.near(transaction.doc.resolve(nodePosition + 1), 1))
        .scrollIntoView();
      this.view.dispatch(transaction);
      this.view.focus();
      return;
    }

    // 存在后续内容时直接删除节点并将光标定位到紧邻位置。
    const transaction = this.view.state.tr.delete(nodePosition, nodeEnd);
    // 安全光标落点位置。
    const safePosition = Math.min(nodePosition, transaction.doc.content.size);
    transaction
      .setSelection(TextSelection.near(transaction.doc.resolve(safePosition), 1))
      .scrollIntoView();
    this.view.dispatch(transaction);
    this.view.focus();
  };

  /**
   * 响应 ProseMirror 节点更新。
   */
  update(node: ProseNode): boolean {
    if (node.type.name !== FRONTMATTER_NODE_NAME) {
      return false;
    }

    this.node = node;
    this.syncFormatState(node);
    this.syncEditableState();
    return true;
  }

  /**
   * 拦截头部控件区事件，避免干扰 ProseMirror 选区。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    return this.headerContainer.contains(target);
  }

  /**
   * 忽略头部控件与折叠视图状态变更，保留内容区文本变更观察。
   */
  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') {
      return false;
    }

    if (this.headerContainer.contains(mutation.target)) {
      return true;
    }

    // 折叠、格式及只读属性变化仅属于视图态，不触发正文变更。
    const isViewAttributeMutation =
      mutation.type === 'attributes' &&
      ((mutation.target === this.dom &&
        (mutation.attributeName === 'data-collapsed' ||
          mutation.attributeName === 'data-editable' ||
          mutation.attributeName === 'data-format')) ||
        (mutation.target === this.contentDOM &&
          (mutation.attributeName === 'hidden' || mutation.attributeName === 'aria-hidden')));
    if (isViewAttributeMutation) {
      return true;
    }

    return false;
  }

  /**
   * 销毁视图时解绑监听并清理计时器。
   */
  destroy(): void {
    this.stopObservingMessages();
    this.toggleButton.removeEventListener('click', this.handleToggleClick);
    this.copyButton.removeEventListener('click', this.handleCopyClick);
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
    if (this.copyFeedbackTimer !== null) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
  }
}

/**
 * 创建 frontmatter 的 NodeView 构造器。
 */
export const createFrontmatterEditableNodeView = (
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
    return new FrontmatterEditableNodeView(node, view, resolvedGetPos, messages);
  };
};
