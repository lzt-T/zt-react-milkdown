import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trash2 } from 'lucide-react';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import type { EditorI18nMessages } from '../../types/editor';
import { resolveEditorMessages } from '../../local/i18n';

/**
 * image 节点类型名。
 */
const IMAGE_NODE_NAME = 'image';

/**
 * 基于 lucide-react 组件渲染 SVG 字符串。
 */
const renderLucideIconMarkup = (icon: typeof Trash2): string => {
  return renderToStaticMarkup(
    createElement(icon, {
      size: 14,
      strokeWidth: 2,
      'aria-hidden': 'true'
    })
  );
};

// 删除按钮图标。
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
 * 创建带悬停删除按钮的图片 NodeView。
 */
class ImageEditableNodeView implements NodeView {
  // 当前节点快照。
  node: ProseNode;
  // 节点根容器。
  dom: HTMLSpanElement;
  // 编辑器视图。
  private readonly view: EditorView;
  // 节点位置获取器。
  private readonly getPos: boolean | (() => number);
  // 图片删除文案。
  private readonly deleteAriaLabel: string;
  // 图片元素。
  private readonly imageElement: HTMLImageElement;
  // 操作区容器。
  private readonly actionsContainer: HTMLSpanElement;
  // 删除按钮。
  private readonly deleteButton: HTMLButtonElement;

  /**
   * 初始化图片视图。
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
    // 删除按钮文案。
    this.deleteAriaLabel = messages.imageDeleteAriaLabel;

    // 根容器。
    this.dom = document.createElement('span');
    this.dom.dataset.type = IMAGE_NODE_NAME;
    this.dom.className = 'zt-md-image';

    // 图片元素。
    this.imageElement = document.createElement('img');

    // 图片悬停操作区。
    this.actionsContainer = document.createElement('span');
    this.actionsContainer.className = 'zt-md-image-actions';

    // 删除按钮。
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'zt-md-image-action-button zt-md-image-action-button-danger';
    this.deleteButton.setAttribute('aria-label', this.deleteAriaLabel);
    this.deleteButton.innerHTML = deleteIconMarkup;

    this.actionsContainer.appendChild(this.deleteButton);
    this.dom.append(this.imageElement, this.actionsContainer);
    this.syncFromNode(node);

    this.deleteButton.addEventListener('click', this.handleDeleteClick);
  }

  /**
   * 响应删除按钮点击，删除当前图片。
   */
  private readonly handleDeleteClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    if (!isEditorViewEditable(this.view)) {
      return;
    }

    this.deleteCurrentImage();
  };

  /**
   * 删除当前图片并将焦点归还编辑器。
   */
  private deleteCurrentImage(): void {
    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    // 删除图片节点事务。
    const transaction = this.view.state.tr.delete(nodePosition, nodePosition + this.node.nodeSize).scrollIntoView();
    this.view.dispatch(transaction);
    requestAnimationFrame(() => {
      this.view.focus();
    });
  }

  /**
   * 更新图片 DOM 属性。
   */
  private syncFromNode(node: ProseNode): void {
    // 图片地址。
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
    // 图片替代文本。
    const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
    // 图片标题。
    const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';

    this.imageElement.setAttribute('src', src);
    this.imageElement.setAttribute('alt', alt);
    if (title) {
      this.imageElement.title = title;
    } else {
      this.imageElement.removeAttribute('title');
    }
  }

  /**
   * 处理节点更新。
   */
  update(node: ProseNode): boolean {
    if (node.type.name !== IMAGE_NODE_NAME) {
      return false;
    }

    this.node = node;
    this.syncFromNode(node);
    return true;
  }

  /**
   * 只拦截删除按钮内部事件。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    return this.deleteButton.contains(target);
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
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
  }
}

/**
 * 创建 image 的 NodeView 构造器。
 */
export const createImageEditableNodeView = (
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
    return new ImageEditableNodeView(node, view, resolvedGetPos, messages);
  };
};
