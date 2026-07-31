import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, Code2, Copy, Eye, Trash2 } from 'lucide-react';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import {
  isCodeBlockPreviewLanguage,
  normalizeCodeBlockLanguage
} from '@/plugins/custom/code-block/code-block-language';
import { moveSelectionFromSpecialBlock } from '@/plugins/custom/cursor';
import type { EditorI18nMessages } from '@/types/editor';
import { resolveEditorMessages } from '@/local/i18n';

// 代码块节点类型名。
const CODE_BLOCK_NODE_NAME = 'code_block';
// 复制成功态清理延迟（毫秒）。
const COPY_FEEDBACK_DURATION = 1200;
// HTML 代码块语言值。
const HTML_CODE_BLOCK_LANGUAGE = 'html';
// 代码块预览布局变更事务元数据键。
const CODE_BLOCK_PREVIEW_LAYOUT_META = 'ZT_MD_CODE_BLOCK_PREVIEW_LAYOUT';
// 代码块预览基础内容安全策略。
const CODE_BLOCK_PREVIEW_BASE_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'"
];

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
// 预览按钮默认图标。
const previewIconMarkup = renderLucideIconMarkup(Eye);
// 查看源码按钮图标。
const sourceIconMarkup = renderLucideIconMarkup(Code2);

/**
 * 创建隔离的代码块预览文档。
 */
const createCodeBlockPreviewDocument = (codeContent: string, isScriptEnabled: boolean): string => {
  // 当前预览内容安全策略。
  const contentSecurityPolicy = [
    ...CODE_BLOCK_PREVIEW_BASE_CONTENT_SECURITY_POLICY,
    ...(isScriptEnabled ? ["script-src 'unsafe-inline'"] : [])
  ].join('; ');

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { min-height: 100%; margin: 0; }
      body { padding: 1rem; overflow-wrap: anywhere; }
      svg { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>${codeContent}</body>
</html>`;
};

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
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 操作区容器。
  private readonly actionsContainer: HTMLSpanElement;
  // 预览切换按钮。
  private readonly previewButton: HTMLButtonElement;
  // 复制按钮。
  private readonly copyButton: HTMLButtonElement;
  // 删除按钮。
  private readonly deleteButton: HTMLButtonElement;
  // 预览区域。
  private readonly previewContainer: HTMLDivElement;
  // 当前挂载的预览 iframe。
  private previewFrame: HTMLIFrameElement | null = null;
  // 当前是否支持预览。
  private isPreviewAvailable = false;
  // 当前是否显示预览。
  private isPreviewMode = false;
  // 已渲染的预览标识。
  private renderedPreviewKey: string | null = null;
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
    // 编辑器文案引用。
    this.messages = messages;
    // 根容器。
    this.dom = document.createElement('div');
    this.dom.className = 'zt-md-code-block';
    this.dom.dataset.type = CODE_BLOCK_NODE_NAME;
    // 内容容器。
    this.contentDOM = document.createElement('pre');
    // 预览区域。
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'zt-md-code-block-preview';
    this.previewContainer.contentEditable = 'false';
    this.previewContainer.hidden = true;
    this.previewContainer.tabIndex = -1;
    this.previewContainer.setAttribute('role', 'region');
    this.previewContainer.setAttribute('aria-label', messages.codeBlockPreviewAriaLabel);
    // 操作区容器。
    this.actionsContainer = document.createElement('span');
    this.actionsContainer.className = 'zt-md-code-block-actions';
    this.actionsContainer.contentEditable = 'false';
    // 预览切换按钮。
    this.previewButton = document.createElement('button');
    this.previewButton.type = 'button';
    this.previewButton.className = 'zt-md-code-block-action-button';
    this.previewButton.hidden = true;
    this.previewButton.innerHTML = previewIconMarkup;
    // 复制按钮。
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'zt-md-code-block-action-button zt-md-code-block-editable-action';
    this.copyButton.setAttribute('aria-label', messages.codeBlockCopyAriaLabel);
    this.copyButton.innerHTML = copyIconMarkup;
    // 删除按钮。
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className =
      'zt-md-code-block-action-button zt-md-code-block-editable-action zt-md-code-block-action-button-danger';
    this.deleteButton.setAttribute('aria-label', messages.codeBlockDeleteAriaLabel);
    this.deleteButton.innerHTML = deleteIconMarkup;
    this.actionsContainer.append(this.previewButton, this.copyButton, this.deleteButton);
    this.dom.append(this.contentDOM, this.previewContainer, this.actionsContainer);
    this.updateEditableState();
    this.syncLanguageAttribute(node);
    this.syncPreviewAvailability(node);
    this.previewButton.addEventListener('click', this.handlePreviewClick);
    this.copyButton.addEventListener('click', this.handleCopyClick);
    this.deleteButton.addEventListener('click', this.handleDeleteClick);
    this.previewContainer.addEventListener('keydown', this.handlePreviewKeyDown);
  }

  /**
   * 响应预览按钮点击，切换源码与静态预览。
   */
  private readonly handlePreviewClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isPreviewAvailable) {
      return;
    }

    this.isPreviewMode = !this.isPreviewMode;
    this.syncPreviewState();
    // 触发插件视图按新的代码块尺寸刷新浮层定位，不修改文档内容。
    this.view.dispatch(this.view.state.tr.setMeta(CODE_BLOCK_PREVIEW_LAYOUT_META, true));
  };

  /**
   * 处理预览容器方向键边界导航。
   */
  private readonly handlePreviewKeyDown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
    ) {
      return;
    }

    // 当前代码块位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    if (moveSelectionFromSpecialBlock(this.view, nodePosition, this.node, event.key)) {
      event.preventDefault();
    }
  };

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
   * 同步当前语言对应的预览能力。
   */
  private syncPreviewAvailability(node: ProseNode): void {
    const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
    this.isPreviewAvailable = isCodeBlockPreviewLanguage(language);
    if (!this.isPreviewAvailable) {
      this.isPreviewMode = false;
    }

    this.previewButton.hidden = !this.isPreviewAvailable;
    this.syncPreviewState();
    this.syncActionsVisibility();
  }

  /**
   * 同步代码块预览状态与无障碍属性。
   */
  private syncPreviewState(): void {
    const shouldShowPreview = this.isPreviewAvailable && this.isPreviewMode;
    const actionLabel = shouldShowPreview
      ? this.messages.codeBlockSourceAriaLabel
      : this.messages.codeBlockPreviewAriaLabel;
    this.dom.dataset.viewMode = shouldShowPreview ? 'preview' : 'source';
    this.previewContainer.hidden = !shouldShowPreview;
    this.previewContainer.tabIndex = shouldShowPreview ? 0 : -1;
    this.previewButton.dataset.active = shouldShowPreview ? 'true' : 'false';
    this.previewButton.setAttribute('aria-pressed', shouldShowPreview ? 'true' : 'false');
    this.previewButton.setAttribute('aria-label', actionLabel);
    this.previewButton.title = actionLabel;
    this.previewButton.innerHTML = shouldShowPreview ? sourceIconMarkup : previewIconMarkup;

    if (shouldShowPreview) {
      this.contentDOM.setAttribute('aria-hidden', 'true');
      this.renderPreview();
      return;
    }

    this.contentDOM.removeAttribute('aria-hidden');
    this.clearPreview();
  }

  /**
   * 同步当前模式可见的操作按钮。
   */
  private syncActionsVisibility(): void {
    const hasVisibleAction = isEditorViewEditable(this.view) || this.isPreviewAvailable;
    this.actionsContainer.dataset.visible = hasVisibleAction ? 'true' : 'false';
  }

  /**
   * 渲染当前代码块的隔离预览文档。
   */
  private renderPreview(): void {
    const codeContent = this.node.textContent;
    const language = normalizeCodeBlockLanguage(String(this.node.attrs.language ?? ''));
    const isScriptEnabled = language === HTML_CODE_BLOCK_LANGUAGE;
    const previewKey = `${language}\u0000${codeContent}`;
    if (this.renderedPreviewKey === previewKey) {
      return;
    }

    this.renderedPreviewKey = previewKey;
    // 在首次导航前固定 sandbox 权限，避免沿用旧 about:blank 文档的限制。
    const previewFrame = document.createElement('iframe');
    previewFrame.className = 'zt-md-code-block-preview-frame';
    previewFrame.title = this.messages.codeBlockPreviewAriaLabel;
    previewFrame.tabIndex = -1;
    previewFrame.referrerPolicy = 'no-referrer';
    previewFrame.setAttribute('sandbox', isScriptEnabled ? 'allow-scripts' : '');
    previewFrame.srcdoc = createCodeBlockPreviewDocument(codeContent, isScriptEnabled);
    this.previewContainer.replaceChildren(previewFrame);
    this.previewFrame = previewFrame;
  }

  /**
   * 清理当前预览文档。
   */
  private clearPreview(): void {
    this.renderedPreviewKey = null;
    this.previewFrame?.remove();
    this.previewFrame = null;
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
    this.syncPreviewAvailability(node);
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

    return this.actionsContainer.contains(target) || this.previewContainer.contains(target);
  }

  /**
   * 忽略 NodeView 内部的 DOM 变更观察。
   */
  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') {
      return false;
    }

    // 预览切换产生的视图属性不属于 Markdown 内容变更。
    const isPreviewViewMutation =
      mutation.type === 'attributes' &&
      ((mutation.target === this.dom && mutation.attributeName === 'data-view-mode') ||
        (mutation.target === this.contentDOM && mutation.attributeName === 'aria-hidden'));
    if (isPreviewViewMutation) {
      return true;
    }

    return this.actionsContainer.contains(mutation.target) || this.previewContainer.contains(mutation.target);
  }

  /**
   * 销毁时解绑监听器。
   */
  destroy(): void {
    this.previewButton.removeEventListener('click', this.handlePreviewClick);
    this.copyButton.removeEventListener('click', this.handleCopyClick);
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
    this.previewContainer.removeEventListener('keydown', this.handlePreviewKeyDown);
    if (this.copyFeedbackTimer !== null) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
    this.copyButton.innerHTML = copyIconMarkup;
    delete this.copyButton.dataset.copied;
    this.clearPreview();
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

