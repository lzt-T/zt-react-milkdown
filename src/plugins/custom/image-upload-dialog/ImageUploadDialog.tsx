import { AlertCircle, ImageOff, ImagePlus, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../components/ui/dialog';
import type { EditorI18nMessages, ImageUploadConfig } from '../../../types/editor';

/**
 * 定义图片弹窗上传方式。
 */
type ImageUploadType = 'file' | 'url';

/**
 * 定义图片插入确认参数。
 */
interface ImageConfirmPayload {
  /** 图片地址。 */
  src: string;
  /** 图片替代文本。 */
  alt: string;
}

/**
 * 定义图片上传弹窗属性。
 */
interface ImageUploadDialogProps {
  /** 编辑器文案。 */
  messages: EditorI18nMessages;
  /** 弹窗 Portal 挂载容器。 */
  portalContainer: HTMLElement;
  /** 图片上传配置。 */
  imageUpload?: ImageUploadConfig;
  /** 确认插入回调。 */
  onConfirm: (payload: ImageConfirmPayload) => void;
  /** 取消关闭回调。 */
  onCancel: () => void;
}

// 默认最大文件体积，用于提示文案。
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
// 图片文件输入框 ID。
const IMAGE_FILE_INPUT_ID = 'zt-md-image-upload-file-input';

/**
 * 读取文件为 Data URL。
 */
const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 文件读取器。
    const reader = new FileReader();
    reader.onload = () => {
      // 读取结果。
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }

      reject(new Error('Invalid file result'));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('File read failed'));
    };
    reader.readAsDataURL(file);
  });
};

/**
 * 格式化文件体积。
 */
const formatFileSize = (size: number): string => {
  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)}KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
};

/**
 * 校验链接是否可作为 URL。
 */
const isValidUrl = (value: string): boolean => {
  try {
    // URL 构造器负责基础格式校验。
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

/**
 * 渲染图片上传弹窗。
 */
export const ImageUploadDialog = ({
  messages,
  portalContainer,
  imageUpload,
  onConfirm,
  onCancel
}: ImageUploadDialogProps): JSX.Element => {
  // 当前上传方式。
  const [uploadType, setUploadType] = useState<ImageUploadType>('file');
  // 当前选择的文件。
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // 当前图片地址。
  const [imageUrl, setImageUrl] = useState('');
  // 当前预览图是否加载失败。
  const [previewLoadError, setPreviewLoadError] = useState(false);
  // 当前错误提示。
  const [error, setError] = useState('');
  // 当前是否正在上传或读取。
  const [isUploading, setIsUploading] = useState(false);
  // 当前是否处于拖拽悬停。
  const [isDragOver, setIsDragOver] = useState(false);
  // 文件输入框引用。
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 链接输入框引用。
  const urlInputRef = useRef<HTMLInputElement>(null);
  // 弹窗是否仍挂载。
  const mountedRef = useRef(true);
  // 允许上传的最大文件体积。
  const maxFileSize = imageUpload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  // 当前是否锁定交互。
  const isInteractionLocked = isUploading;
  // 是否保留重选提示高度。
  const shouldReserveReselectHint = uploadType === 'file' && (isUploading || Boolean(imageUrl));
  // 是否展示重选提示。
  const shouldShowReselectHint = uploadType === 'file' && Boolean(imageUrl) && !isUploading;
  // 是否禁用确认按钮。
  const isConfirmDisabled = !imageUrl || Boolean(error) || isUploading || previewLoadError;

  /**
   * 校验并处理图片文件。
   */
  const processFile = useCallback(async (file: File): Promise<void> => {
    if (!file.type.startsWith('image/')) {
      setSelectedFile(null);
      setImageUrl('');
      setError(messages.imageUploadInvalidType);
      return;
    }

    if (file.size > maxFileSize) {
      setSelectedFile(null);
      setImageUrl('');
      setError(messages.imageUploadFileSizeExceeded.replace('{size}', formatFileSize(maxFileSize)));
      return;
    }

    setError('');
    setSelectedFile(file);
    setPreviewLoadError(false);
    setIsUploading(true);

    try {
      // 上传或读取得到的图片地址。
      const nextImageUrl = imageUpload?.upload ? await imageUpload.upload(file) : await readFileAsDataUrl(file);
      if (!mountedRef.current) {
        return;
      }
      if (!nextImageUrl) {
        setImageUrl('');
        setError(messages.imageUploadFailed);
        return;
      }

      setImageUrl(nextImageUrl);
    } catch (uploadError) {
      if (!mountedRef.current) {
        return;
      }
      // 上传错误提示。
      const uploadErrorMessage = imageUpload?.upload
        ? uploadError instanceof Error ? uploadError.message : messages.imageUploadFailed
        : messages.imageUploadFileReadFailed;
      setImageUrl('');
      setError(uploadErrorMessage || messages.imageUploadFailed);
    } finally {
      if (mountedRef.current) {
        setIsUploading(false);
      }
    }
  }, [imageUpload, maxFileSize, messages]);

  /**
   * 处理文件输入变化。
   */
  const handleFileChange = useCallback((): void => {
    // 当前选中的文件。
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      return;
    }
    void processFile(file);
    fileInputRef.current.value = '';
  }, [processFile]);

  /**
   * 处理图片链接变化。
   */
  const handleUrlChange = useCallback((nextUrl: string): void => {
    setSelectedFile(null);
    setPreviewLoadError(false);
    setImageUrl(nextUrl);

    if (!nextUrl) {
      setError('');
      return;
    }
    setError(isValidUrl(nextUrl) ? '' : messages.imageUploadInvalidUrl);
  }, [messages.imageUploadInvalidUrl]);

  /**
   * 处理拖拽经过。
   */
  const handleDragOver = useCallback((event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (isInteractionLocked) {
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, [isInteractionLocked]);

  /**
   * 处理拖拽离开。
   */
  const handleDragLeave = useCallback((event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  }, []);

  /**
   * 处理拖拽投放。
   */
  const handleDrop = useCallback((event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    if (isInteractionLocked) {
      return;
    }
    // 拖拽文件。
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  }, [isInteractionLocked, processFile]);

  /**
   * 处理上传方式切换。
   */
  const handleUploadTypeChange = useCallback((nextUploadType: ImageUploadType): void => {
    if (isInteractionLocked) {
      return;
    }
    setUploadType(nextUploadType);
    setSelectedFile(null);
    setImageUrl('');
    setPreviewLoadError(false);
    setError('');
  }, [isInteractionLocked]);

  /**
   * 处理确认插入。
   */
  const handleConfirm = useCallback((): void => {
    if (isUploading) {
      setError(messages.imageUploadUploadingWait);
      return;
    }
    if (!imageUrl) {
      setError(messages.imageUploadSelectOrEnterImage);
      return;
    }
    if (uploadType === 'url' && !isValidUrl(imageUrl)) {
      setError(messages.imageUploadInvalidUrl);
      return;
    }
    onConfirm({
      src: imageUrl,
      alt: uploadType === 'file' ? selectedFile?.name ?? '' : ''
    });
  }, [
    imageUrl,
    isUploading,
    messages.imageUploadInvalidUrl,
    messages.imageUploadSelectOrEnterImage,
    messages.imageUploadUploadingWait,
    onConfirm,
    selectedFile,
    uploadType
  ]);

  /**
   * 处理键盘确认。
   */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && uploadType === 'url') {
      event.preventDefault();
      handleConfirm();
    }
  }, [handleConfirm, uploadType]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (uploadType === 'url') {
      urlInputRef.current?.focus();
    }
  }, [uploadType]);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        container={portalContainer}
        className="zt-md-image-upload-content-shell max-w-2xl sm:!max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        showCloseButton={false}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{messages.imageUploadDialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {`${messages.imageUploadFileTab}，${messages.imageUploadUrlTab}`}
          </DialogDescription>
        </DialogHeader>

        <div className="zt-md-image-upload-segmented" role="tablist" aria-label={messages.imageUploadDialogTitle}>
          <Button
            type="button"
            variant="ghost"
            className="zt-md-image-upload-segment"
            data-active={uploadType === 'file' ? 'true' : 'false'}
            disabled={isInteractionLocked}
            onClick={() => handleUploadTypeChange('file')}
          >
            {messages.imageUploadFileTab}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="zt-md-image-upload-segment"
            data-active={uploadType === 'url' ? 'true' : 'false'}
            disabled={isInteractionLocked}
            onClick={() => handleUploadTypeChange('url')}
          >
            {messages.imageUploadUrlTab}
          </Button>
        </div>

        <div className="zt-md-image-upload-content">
          {uploadType === 'file' ? (
            <div className="zt-md-image-upload-file">
              <input
                ref={fileInputRef}
                id={IMAGE_FILE_INPUT_ID}
                type="file"
                accept="image/*"
                className="zt-md-image-upload-file-input"
                disabled={isInteractionLocked}
                onChange={handleFileChange}
              />
              <label
                htmlFor={IMAGE_FILE_INPUT_ID}
                className="zt-md-image-upload-file-label"
                data-drag-over={isDragOver ? 'true' : 'false'}
                data-has-preview={imageUrl ? 'true' : 'false'}
                data-disabled={isInteractionLocked ? 'true' : 'false'}
                aria-disabled={isInteractionLocked}
                onClick={(event) => {
                  if (isInteractionLocked) {
                    event.preventDefault();
                  }
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {isUploading ? (
                  <>
                    <div className="zt-md-image-upload-file-icon">
                      <Loader2 size={40} className="zt-md-image-upload-spin" />
                    </div>
                    <div className="zt-md-image-upload-file-text">{messages.imageUploadUploadingLabel}</div>
                  </>
                ) : imageUrl ? (
                  <div className="zt-md-image-upload-file-preview">
                    {previewLoadError ? (
                      <div className="zt-md-image-upload-preview-error">
                        <ImageOff size={40} />
                        <span>{messages.imageUploadLoadFailed}</span>
                      </div>
                    ) : (
                      <img
                        src={imageUrl}
                        alt=""
                        onLoad={() => setPreviewLoadError(false)}
                        onError={() => setPreviewLoadError(true)}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    <div className="zt-md-image-upload-file-icon">
                      <ImagePlus size={40} />
                    </div>
                    <div className="zt-md-image-upload-file-text">{messages.imageUploadDropLabel}</div>
                    <div className="zt-md-image-upload-file-hint">
                      {messages.imageUploadSupportsAndMax.replace('{size}', formatFileSize(maxFileSize))}
                    </div>
                  </>
                )}
              </label>
              {shouldReserveReselectHint ? (
                <div
                  className="zt-md-image-upload-file-hint zt-md-image-upload-reselect-hint"
                  data-placeholder={shouldShowReselectHint ? 'false' : 'true'}
                >
                  {messages.imageUploadReselectHint}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="zt-md-image-upload-url">
              <label className="zt-md-image-upload-label" htmlFor="zt-md-image-upload-url-input">
                {messages.imageUploadUrlTab}
              </label>
              <input
                ref={urlInputRef}
                id="zt-md-image-upload-url-input"
                type="url"
                className="zt-md-image-upload-url-input"
                placeholder={messages.imageUploadUrlPlaceholder}
                value={imageUrl}
                disabled={isInteractionLocked}
                onChange={(event) => handleUrlChange(event.target.value)}
              />
              {imageUrl && !error ? (
                <div className="zt-md-image-upload-url-preview">
                  {previewLoadError ? (
                    <div className="zt-md-image-upload-preview-error">
                      <ImageOff size={32} />
                      <span>{messages.imageUploadLoadFailed}</span>
                    </div>
                  ) : (
                    <img
                      src={imageUrl}
                      alt=""
                      onLoad={() => setPreviewLoadError(false)}
                      onError={() => setPreviewLoadError(true)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          )}

          {error ? (
            <div className="zt-md-image-upload-error" role="alert" aria-live="polite">
              <AlertCircle size={16} className="zt-md-image-upload-error-icon" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            {messages.imageUploadCancelLabel}
          </Button>
          <Button
            type="button"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            {isUploading ? messages.imageUploadUploadingLabel : messages.imageUploadConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
