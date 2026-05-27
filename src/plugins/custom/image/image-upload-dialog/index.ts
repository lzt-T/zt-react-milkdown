import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NodeSelection } from '@milkdown/prose/state';
import type { EditorI18nMessages, ImageUploadConfig } from '../../../../types/editor';
import { ImageUploadDialog } from './ImageUploadDialog';

/**
 * 定义图片插入参数。
 */
interface InsertImagePayload {
  /** 图片地址。 */
  src: string;
  /** 图片替代文本。 */
  alt: string;
  /** 图片标题。 */
  title: string;
}

/**
 * 定义图片上传弹窗参数。
 */
interface ImageUploadDialogOptions {
  /** 编辑器内部浮层 Portal 容器。 */
  portalContainer: HTMLElement;
  /** 当前编辑器视图。 */
  view: any;
  /** 编辑器文案。 */
  messages: EditorI18nMessages;
  /** 图片上传配置。 */
  imageUpload?: ImageUploadConfig;
}

/**
 * 同步图片上传弹窗宿主到浏览器视口。
 */
const syncImageUploadHostBounds = (host: HTMLElement, portalContainer: HTMLElement): void => {
  // Portal 容器相对视口的位置。
  const portalRect = portalContainer.getBoundingClientRect();
  host.style.left = `${-portalRect.left}px`;
  host.style.top = `${-portalRect.top}px`;
};

/**
 * 创建普通段落节点。
 */
const createParagraphNode = (view: any, content?: any): any | null => {
  // 普通段落节点类型。
  const paragraphType = view?.state?.schema?.nodes?.paragraph;
  if (!paragraphType) {
    return null;
  }

  return content ? paragraphType.create(null, content) : paragraphType.createAndFill();
};

/**
 * 创建图片节点。
 */
const createImageNode = (view: any, payload: InsertImagePayload): any | null => {
  // 图片节点类型。
  const imageType = view?.state?.schema?.nodes?.image;
  if (!imageType) {
    return null;
  }

  return imageType.create(payload);
};

/**
 * 判断原始选区之后是否还存在真实后续内容或后续块。
 */
const hasContentAfterSelection = (view: any): boolean => {
  // 当前选区。
  const selection = view?.state?.selection;
  if (!selection) {
    return false;
  }

  // 当前光标所在父块。
  const parentNode = selection.$to.parent;
  // 当前选区结束后在父块内是否仍有文本内容。
  const hasTextAfterInParent = selection.$to.parentOffset < parentNode.content.size;
  if (hasTextAfterInParent) {
    return true;
  }

  if (selection.$to.depth < 1) {
    return false;
  }

  // 当前顶层块容器。
  const blockContainer = selection.$to.node(selection.$to.depth - 1);
  // 当前块在父容器中的索引。
  const currentBlockIndex = selection.$to.index(selection.$to.depth - 1);
  return currentBlockIndex < blockContainer.childCount - 1;
};

/**
 * 解析事务文档中的真实图片节点位置。
 */
const resolveImageNodePosition = (doc: any, candidatePosition: number): number | null => {
  // 候选位置集合，优先使用计算出的图片起点，再尝试相邻位置兜底。
  const positionCandidates = [
    candidatePosition,
    candidatePosition - 1,
    candidatePosition + 1
  ];

  for (const position of positionCandidates) {
    if (position < 0 || position > doc.content.size) {
      continue;
    }

    // 当前候选位置上的节点。
    const node = doc.nodeAt(position);
    if (node?.type?.name === 'image') {
      return position;
    }
  }

  return null;
};

/**
 * 基于真实图片节点位置创建稳定的节点选区。
 */
const createImageNodeSelection = (transaction: any, imageNodeSize: number): NodeSelection | null => {
  // replaceSelectionWith 后的选区通常位于图片节点后方。
  const candidateImagePosition = transaction.selection.from - imageNodeSize;
  // 事务文档中的真实图片起始位置。
  const imagePosition = resolveImageNodePosition(transaction.doc, candidateImagePosition);
  if (imagePosition === null) {
    return null;
  }

  return NodeSelection.create(transaction.doc, imagePosition);
};

/**
 * 插入图片节点。
 */
const insertImageNode = (view: any, payload: InsertImagePayload): boolean => {
  if (!view?.state || !view?.dispatch) {
    return false;
  }

  // 图片节点实例。
  const imageNode = createImageNode(view, payload);
  if (!imageNode) {
    return false;
  }

  // 插入前是否存在真实后续内容。
  const shouldKeepFollowingContent = hasContentAfterSelection(view);

  // 图片插入事务。
  const transaction = view.state.tr.replaceSelectionWith(imageNode);
  // 图片后方位置。
  const imageAfterPosition = transaction.selection.to;
  if (!shouldKeepFollowingContent) {
    // 图片后方承接空段落。
    const trailingParagraph = createParagraphNode(view);
    if (trailingParagraph) {
      transaction.insert(imageAfterPosition, trailingParagraph);
    }
  }

  // 当前图片节点选区。
  const imageSelection = createImageNodeSelection(transaction, imageNode.nodeSize);
  if (!imageSelection) {
    return false;
  }

  // 让最终选区稳定停留在新插入图片节点上。
  transaction.setSelection(imageSelection).scrollIntoView();
  view.dispatch(transaction);
  return true;
};

/**
 * 创建图片上传弹窗。
 */
export const showImageUploadDialog = (options: ImageUploadDialogOptions): void => {
  // 当前编辑器主题容器。
  const editorRoot = options.portalContainer.closest('.zt-md');
  // 当前编辑器主题类名。
  const themeClassName = editorRoot?.classList.contains('zt-md-dark') ? 'zt-md-dark' : 'zt-md-light';
  // React 挂载容器。
  const host = document.createElement('div');
  host.className = `zt-md-image-upload-host ${themeClassName}`;
  options.portalContainer.appendChild(host);
  syncImageUploadHostBounds(host, options.portalContainer);

  /**
   * 视口或页面滚动变化时重新对齐宿主。
   */
  const handleViewportChange = (): void => {
    syncImageUploadHostBounds(host, options.portalContainer);
  };

  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);

  // React 根节点。
  const root = createRoot(host);

  /**
   * 卸载弹窗。
   */
  const unmountDialog = (onAfterUnmount?: () => void): void => {
    queueMicrotask(() => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      root.unmount();
      host.remove();
      onAfterUnmount?.();
    });
  };

  /**
   * 关闭弹窗并将焦点归还编辑器。
   */
  const closeDialog = (): void => {
    unmountDialog(() => {
      options.view?.focus?.();
    });
  };

  root.render(
    createElement(ImageUploadDialog, {
      messages: options.messages,
      portalContainer: host,
      imageUpload: options.imageUpload,
      onConfirm: (payload) => {
        const didInsertImage = insertImageNode(options.view, {
          src: payload.src,
          alt: payload.alt,
          title: ''
        });
        unmountDialog(() => {
          if (didInsertImage) {
            options.view?.focus?.();
          }
        });
      },
      onCancel: closeDialog
    })
  );
};

