import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { EditorI18nMessages, ImageUploadConfig } from '../../../../types/editor';
import { insertImageNode } from '../image-insert';
import { ImageUploadDialog } from './ImageUploadDialog';

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

// 需要从编辑器根节点复制到 body 弹窗宿主的主题变量。
const DIALOG_THEME_VARIABLES = [
  '--zt-font',
  '--zt-bg',
  '--zt-surface',
  '--zt-elevated',
  '--zt-fg',
  '--zt-muted',
  '--zt-border',
  '--zt-primary',
  '--zt-primary-foreground',
  '--zt-secondary',
  '--zt-destructive',
  '--zt-destructive-foreground',
  '--zt-glow',
  '--zt-radius',
  '--zt-radius-lg'
] as const;

/**
 * 同步编辑器主题变量到 body 弹窗宿主。
 */
const syncDialogHostThemeVariables = (host: HTMLElement, editorRoot: Element | null): void => {
  if (!editorRoot) {
    return;
  }

  // 编辑器根节点的最终主题变量。
  const editorRootStyle = window.getComputedStyle(editorRoot);
  DIALOG_THEME_VARIABLES.forEach((variableName) => {
    // 当前主题变量值。
    const variableValue = editorRootStyle.getPropertyValue(variableName);
    if (variableValue) {
      host.style.setProperty(variableName, variableValue.trim());
    }
  });
};

/**
 * 创建全屏 Dialog 宿主节点。
 */
const createFullscreenDialogHost = (portalContainer: HTMLElement, className: string): HTMLDivElement => {
  // 当前编辑器主题容器。
  const editorRoot = portalContainer.closest('.zt-md');
  // 当前编辑器主题类名。
  const themeClassName = editorRoot?.classList.contains('zt-md-dark') ? 'zt-md-dark' : 'zt-md-light';
  // React 挂载容器。
  const host = document.createElement('div');
  host.className = `zt-md zt-md-dialog-host ${className} ${themeClassName}`;
  syncDialogHostThemeVariables(host, editorRoot);
  document.body.appendChild(host);
  return host;
};

/**
 * 创建图片上传弹窗。
 */
export const showImageUploadDialog = (options: ImageUploadDialogOptions): void => {
  // 图片上传弹窗宿主节点。
  const host = createFullscreenDialogHost(options.portalContainer, 'zt-md-image-upload-host');
  // React 根节点。
  const root = createRoot(host);

  /**
   * 卸载弹窗。
   */
  const unmountDialog = (onAfterUnmount?: () => void): void => {
    queueMicrotask(() => {
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
        // 弹窗与粘贴共用同一块级图片插入行为。
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

