import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
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
 * 插入图片节点。
 */
const insertImageNode = (view: any, payload: InsertImagePayload): boolean => {
  // 图片节点类型。
  const imageType = view?.state?.schema?.nodes?.image;
  if (!imageType || !view?.dispatch) {
    return false;
  }

  // 图片节点实例。
  const imageNode = imageType.create(payload);
  view.dispatch(view.state.tr.replaceSelectionWith(imageNode).scrollIntoView());
  view.focus();
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
  document.body.appendChild(host);

  // React 根节点。
  const root = createRoot(host);

  /**
   * 关闭弹窗并卸载 React 根节点。
   */
  const closeDialog = (): void => {
    queueMicrotask(() => {
      root.unmount();
      host.remove();
      options.view?.focus?.();
    });
  };

  root.render(
    createElement(ImageUploadDialog, {
      messages: options.messages,
      portalContainer: host,
      imageUpload: options.imageUpload,
      onConfirm: (payload) => {
        insertImageNode(options.view, {
          src: payload.src,
          alt: payload.alt,
          title: ''
        });
        closeDialog();
      },
      onCancel: closeDialog
    })
  );
};

