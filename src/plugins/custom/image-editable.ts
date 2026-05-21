import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trash2 } from 'lucide-react';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import type { EditorI18nMessages } from '../../types/editor';
import { resolveEditorMessages } from '../../local/i18n';
import {
  clampImageWidthPercent,
  formatImageWidthStyle,
  normalizeImageWidthStyle,
  parseImageWidthPercent
} from './image-resizable-schema';

/**
 * image 节点类型名。
 */
const IMAGE_NODE_NAME = 'image';

/**
 * 图片左侧缩放手柄标识。
 */
const IMAGE_RESIZE_SIDE_LEFT = 'left';

/**
 * 图片右侧缩放手柄标识。
 */
const IMAGE_RESIZE_SIDE_RIGHT = 'right';

/**
 * 图片缩放手柄方向。
 */
type ImageResizeSide = typeof IMAGE_RESIZE_SIDE_LEFT | typeof IMAGE_RESIZE_SIDE_RIGHT;

/**
 * 图片拖拽缩放状态。
 */
interface ImageResizeState {
  /** 拖拽手柄方向。 */
  side: ImageResizeSide;
  /** 拖拽起始横坐标。 */
  startClientX: number;
  /** 拖拽起始图片宽度。 */
  startWidth: number;
  /** 图片父级容器宽度。 */
  containerWidth: number;
  /** 最新宽度百分比。 */
  widthPercent: number;
}

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
  // 左侧缩放手柄。
  private readonly leftResizeHandle: HTMLSpanElement;
  // 右侧缩放手柄。
  private readonly rightResizeHandle: HTMLSpanElement;
  // 当前缩放状态。
  private resizeState: ImageResizeState | null = null;

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
    this.updateEditableState();

    // 图片元素。
    this.imageElement = document.createElement('img');

    // 左侧缩放手柄。
    this.leftResizeHandle = this.createResizeHandle(IMAGE_RESIZE_SIDE_LEFT);

    // 右侧缩放手柄。
    this.rightResizeHandle = this.createResizeHandle(IMAGE_RESIZE_SIDE_RIGHT);

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
    this.dom.append(this.imageElement, this.leftResizeHandle, this.rightResizeHandle, this.actionsContainer);
    this.syncFromNode(node);

    this.deleteButton.addEventListener('click', this.handleDeleteClick);
    this.leftResizeHandle.addEventListener('pointerdown', this.handleResizePointerDown);
    this.rightResizeHandle.addEventListener('pointerdown', this.handleResizePointerDown);
  }

  /**
   * 创建图片缩放手柄。
   */
  private createResizeHandle(side: ImageResizeSide): HTMLSpanElement {
    // 缩放手柄元素。
    const handle = document.createElement('span');
    handle.className = `zt-md-image-resize-handle zt-md-image-resize-handle-${side}`;
    handle.dataset.side = side;
    handle.setAttribute('aria-hidden', 'true');
    return handle;
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
   * 更新图片可编辑状态标记。
   */
  private updateEditableState(): void {
    this.dom.dataset.editable = isEditorViewEditable(this.view) ? 'true' : 'false';
  }

  /**
   * 响应图片缩放开始。
   */
  private readonly handleResizePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    if (!isEditorViewEditable(this.view)) {
      return;
    }

    // 当前手柄元素。
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) {
      return;
    }

    // 当前手柄方向。
    const side = handle.dataset.side === IMAGE_RESIZE_SIDE_LEFT ? IMAGE_RESIZE_SIDE_LEFT : IMAGE_RESIZE_SIDE_RIGHT;
    // 图片父级元素。
    const container = this.dom.parentElement;
    if (!container) {
      return;
    }

    // 图片矩形。
    const imageRect = this.imageElement.getBoundingClientRect();
    // 容器矩形。
    const containerRect = container.getBoundingClientRect();
    if (imageRect.width <= 0 || containerRect.width <= 0) {
      return;
    }

    // 初始宽度百分比。
    const widthPercent = clampImageWidthPercent((imageRect.width / containerRect.width) * 100);
    this.resizeState = {
      side,
      startClientX: event.clientX,
      startWidth: imageRect.width,
      containerWidth: containerRect.width,
      widthPercent
    };
    this.dom.dataset.resizing = 'true';
    this.applyPreviewWidth(widthPercent);

    window.addEventListener('pointermove', this.handleResizePointerMove);
    window.addEventListener('pointerup', this.handleResizePointerUp);
    window.addEventListener('pointercancel', this.handleResizePointerUp);
  };

  /**
   * 响应图片缩放移动。
   */
  private readonly handleResizePointerMove = (event: PointerEvent): void => {
    if (!this.resizeState) {
      return;
    }

    event.preventDefault();
    // 鼠标横向位移。
    const deltaX = event.clientX - this.resizeState.startClientX;
    // 方向修正后的宽度变化。
    const widthDelta = this.resizeState.side === IMAGE_RESIZE_SIDE_LEFT ? -deltaX : deltaX;
    // 下一张图片宽度。
    const nextWidth = this.resizeState.startWidth + widthDelta;
    // 下一张图片宽度百分比。
    const nextWidthPercent = clampImageWidthPercent((nextWidth / this.resizeState.containerWidth) * 100);

    this.resizeState.widthPercent = nextWidthPercent;
    this.applyPreviewWidth(nextWidthPercent);
  };

  /**
   * 响应图片缩放结束。
   */
  private readonly handleResizePointerUp = (event: PointerEvent): void => {
    event.preventDefault();

    if (!this.resizeState) {
      return;
    }

    // 最终宽度百分比。
    const widthPercent = Math.round(this.resizeState.widthPercent);
    this.resizeState = null;
    delete this.dom.dataset.resizing;
    this.removeResizeWindowListeners();
    this.commitImageWidth(widthPercent);
  };

  /**
   * 移除图片缩放全局监听。
   */
  private removeResizeWindowListeners(): void {
    window.removeEventListener('pointermove', this.handleResizePointerMove);
    window.removeEventListener('pointerup', this.handleResizePointerUp);
    window.removeEventListener('pointercancel', this.handleResizePointerUp);
  }

  /**
   * 应用图片宽度预览。
   */
  private applyPreviewWidth(widthPercent: number): void {
    this.dom.style.width = `${Math.round(widthPercent)}%`;
    this.dom.dataset.hasWidth = 'true';
  }

  /**
   * 提交图片宽度到节点属性。
   */
  private commitImageWidth(widthPercent: number): void {
    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    // 下一组节点属性。
    const nextAttrs = {
      ...this.node.attrs,
      style: formatImageWidthStyle(widthPercent)
    };
    // 图片宽度更新事务。
    const transaction = this.view.state.tr.setNodeMarkup(nodePosition, undefined, nextAttrs);
    this.view.dispatch(transaction);
    requestAnimationFrame(() => {
      this.view.focus();
    });
  }

  /**
   * 更新图片 DOM 属性。
   */
  private syncFromNode(node: ProseNode): void {
    this.updateEditableState();
    // 图片地址。
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
    // 图片替代文本。
    const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
    // 图片标题。
    const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';
    // 图片宽度样式。
    const style = normalizeImageWidthStyle(node.attrs.style);
    // 图片宽度百分比。
    const widthPercent = parseImageWidthPercent(style);

    this.imageElement.setAttribute('src', src);
    this.imageElement.setAttribute('alt', alt);
    if (title) {
      this.imageElement.title = title;
    } else {
      this.imageElement.removeAttribute('title');
    }
    if (widthPercent !== null) {
      this.dom.style.width = `${widthPercent}%`;
      this.dom.dataset.hasWidth = 'true';
    } else {
      this.dom.style.removeProperty('width');
      delete this.dom.dataset.hasWidth;
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
   * 只拦截删除按钮和缩放手柄内部事件。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    return (
      this.deleteButton.contains(target) ||
      this.leftResizeHandle.contains(target) ||
      this.rightResizeHandle.contains(target) ||
      this.resizeState !== null
    );
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
    this.removeResizeWindowListeners();
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
    this.leftResizeHandle.removeEventListener('pointerdown', this.handleResizePointerDown);
    this.rightResizeHandle.removeEventListener('pointerdown', this.handleResizePointerDown);
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
