import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { SelectionBookmark, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { EditorI18nMessages, ImageUploadConfig } from '@/types/editor';
import { insertImageNode } from '@/plugins/custom/image/image-insert';
import {
  DEFAULT_MAX_FILE_SIZE,
  formatFileSize,
  getDefaultImageAltText,
  readFileAsDataUrl
} from '@/plugins/custom/image/image-upload-dialog/image-upload-utils';

/** 定义待完成图片粘贴记录。 */
type PendingImagePastes = Map<string, SelectionBookmark>;

/** 定义图片粘贴插件事务。 */
type ImagePasteMeta =
  | { type: 'add'; requestId: string; bookmark: SelectionBookmark }
  | { type: 'remove'; requestId: string };

// 图片粘贴插件键同时提供待处理选区状态访问。
const IMAGE_PASTE_PLUGIN_KEY = new PluginKey<PendingImagePastes>('zt-md-image-paste');
// 单调递增序号为当前页面内的粘贴任务提供唯一标识。
let imagePasteRequestSequence = 0;

/** 判断当前编辑器是否可处理图片粘贴。 */
const canPasteImage = (view: EditorView): boolean => {
  // 编辑状态由宿主配置与当前视图共同决定。
  const isEditable = typeof view.props.editable === 'function'
    ? view.props.editable(view.state)
    : view.editable;
  return isEditable && !view.state.selection.$from.parent.type.spec.code;
};

/** 从剪贴板中读取第一张图片文件。 */
const getFirstPastedImage = (clipboardData: DataTransfer): File | null => {
  // 剪贴板项目保留图片 MIME 类型，优先于文件列表。
  const imageItem = Array.from(clipboardData.items).find(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  );
  // 图片项目对应文件。
  const itemFile = imageItem?.getAsFile();
  if (itemFile) {
    return itemFile;
  }

  // 文件列表作为不提供项目数据的浏览器回退。
  return Array.from(clipboardData.files).find((file) => file.type.startsWith('image/')) ?? null;
};

/** 创建当前页面内唯一的图片粘贴任务标识。 */
const createImagePasteRequestId = (): string => {
  imagePasteRequestSequence += 1;
  return `image-paste-${imagePasteRequestSequence}`;
};

/** 映射待处理选区并应用任务增删事务。 */
const applyImagePasteTransaction = (
  transaction: Transaction,
  pendingImagePastes: PendingImagePastes
): PendingImagePastes => {
  // 所有待处理选区跟随当前文档事务移动。
  const nextPendingImagePastes = new Map<string, SelectionBookmark>();
  pendingImagePastes.forEach((bookmark, requestId) => {
    nextPendingImagePastes.set(requestId, bookmark.map(transaction.mapping));
  });

  // 当前图片粘贴状态变更。
  const meta = transaction.getMeta(IMAGE_PASTE_PLUGIN_KEY) as ImagePasteMeta | undefined;
  if (meta?.type === 'add') {
    nextPendingImagePastes.set(meta.requestId, meta.bookmark);
  }
  if (meta?.type === 'remove') {
    nextPendingImagePastes.delete(meta.requestId);
  }
  return nextPendingImagePastes;
};

/** 移除已经完成或失败的图片粘贴任务。 */
const removePendingImagePaste = (view: EditorView, requestId: string): void => {
  // 已销毁视图不再接收事务。
  if (view.isDestroyed || !IMAGE_PASTE_PLUGIN_KEY.getState(view.state)?.has(requestId)) {
    return;
  }
  view.dispatch(
    view.state.tr.setMeta(IMAGE_PASTE_PLUGIN_KEY, { type: 'remove', requestId } satisfies ImagePasteMeta)
  );
};

/** 上传或读取一张粘贴图片。 */
const resolvePastedImageUrl = async (
  file: File,
  imageUpload: ImageUploadConfig | undefined,
  messages: EditorI18nMessages
): Promise<string> => {
  // 宿主上传函数优先于内置 Data URL 读取。
  const imageUrl = imageUpload?.upload
    ? await imageUpload.upload(file)
    : await readFileAsDataUrl(file);
  if (!imageUrl) {
    throw new Error(messages.imageUploadFailed);
  }
  return imageUrl;
};

/** 完成异步上传并在原始粘贴选区插入图片。 */
const processPastedImage = async (
  view: EditorView,
  file: File,
  requestId: string,
  imageUpload: ImageUploadConfig | undefined,
  messages: EditorI18nMessages
): Promise<void> => {
  try {
    // 最终图片地址由宿主上传策略或默认读取流程提供。
    const imageUrl = await resolvePastedImageUrl(file, imageUpload, messages);
    if (view.isDestroyed) {
      return;
    }

    // 映射后的书签恢复图片最初粘贴位置。
    const bookmark = IMAGE_PASTE_PLUGIN_KEY.getState(view.state)?.get(requestId);
    if (!bookmark) {
      return;
    }
    // 当前文档中的目标选区。
    const selection = bookmark.resolve(view.state.doc);
    removePendingImagePaste(view, requestId);
    insertImageNode(
      view,
      {
        src: imageUrl,
        alt: getDefaultImageAltText(file.name),
        title: ''
      },
      selection
    );
  } catch (error) {
    console.error(error);
  } finally {
    removePendingImagePaste(view, requestId);
  }
};

/** 创建将剪贴板图片交给统一上传策略的插件。 */
export const createImagePastePlugin = (
  imageUpload: ImageUploadConfig | undefined,
  messages: EditorI18nMessages
) => $prose(() => {
  return new Plugin<PendingImagePastes>({
    key: IMAGE_PASTE_PLUGIN_KEY,
    state: {
      /** 初始化待处理图片粘贴集合。 */
      init: () => new Map<string, SelectionBookmark>(),
      /** 让待处理粘贴位置跟随编辑事务。 */
      apply: applyImagePasteTransaction
    },
    props: {
      /** 优先消费剪贴板中的第一张图片。 */
      handlePaste: (view, event) => {
        if (!canPasteImage(view)) {
          return false;
        }

        // 剪贴板中的第一张图片文件。
        const imageFile = event.clipboardData
          ? getFirstPastedImage(event.clipboardData)
          : null;
        if (!imageFile) {
          return false;
        }

        event.preventDefault();
        // 当前上传策略允许的最大文件体积。
        const maxFileSize = imageUpload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
        if (imageFile.size > maxFileSize) {
          console.error(
            new Error(messages.imageUploadFileSizeExceeded.replace('{size}', formatFileSize(maxFileSize)))
          );
          return true;
        }

        // 当前图片粘贴任务标识。
        const requestId = createImagePasteRequestId();
        // 当前选区书签会在上传期间跟随其他编辑事务移动。
        const bookmark = view.state.selection.getBookmark();
        view.dispatch(
          view.state.tr.setMeta(IMAGE_PASTE_PLUGIN_KEY, {
            type: 'add',
            requestId,
            bookmark
          } satisfies ImagePasteMeta)
        );
        void processPastedImage(view, imageFile, requestId, imageUpload, messages);
        return true;
      }
    }
  });
});
