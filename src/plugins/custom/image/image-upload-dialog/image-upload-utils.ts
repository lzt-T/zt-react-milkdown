// 默认最大文件体积，用于提示文案。
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
// 图片文件输入框 ID。
export const IMAGE_FILE_INPUT_ID = 'zt-md-image-upload-file-input';
// 图片替代文本输入框 ID。
export const IMAGE_ALT_INPUT_ID = 'zt-md-image-upload-alt-input';

/**
 * 读取文件为 Data URL。
 */
export const readFileAsDataUrl = (file: File): Promise<string> => {
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
export const formatFileSize = (size: number): string => {
  if (size < 1024 * 1024) {
    return `${Math.ceil(size / 1024)}KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
};

/**
 * 校验链接是否可作为 URL。
 */
export const isValidUrl = (value: string): boolean => {
  try {
    // URL 构造器负责基础格式校验。
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

/**
 * 预加载图片，确保插入编辑器前已经可渲染。
 */
export const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 预加载图片实例。
    const image = new Image();
    image.onload = () => {
      resolve();
    };
    image.onerror = () => {
      reject(new Error('Image load failed'));
    };
    image.src = src;
  });
};

/**
 * 从文件名生成默认图片替代文本。
 */
export const getDefaultImageAltText = (fileName: string): string => {
  return fileName.replace(/\.[^/.]+$/, '');
};
