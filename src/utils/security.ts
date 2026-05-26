/**
 * 定义安全图片 HTML 解析结果。
 */
export interface SafeImageHtmlAttrs {
  /** 安全图片地址。 */
  src: string;
  /** 图片替代文本。 */
  alt: string;
  /** 图片标题。 */
  title: string;
  /** 归一化后的图片样式。 */
  style: string;
}

// 允许通过的绝对 URL 协议集合。
const ALLOWED_ABSOLUTE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// 安全协议检测前需要移除的控制字符与空白字符。
const URL_PROTOCOL_NOISE_PATTERN = /[\u0000-\u0020\u007f]+/g;

// 用于识别显式协议前缀。
const URL_SCHEME_PATTERN = /^([a-z][a-z\d+\-.]*:)/i;

// 会导致属性注入或标签逃逸的危险字符。
const UNSAFE_URL_CHARACTER_PATTERN = /[<>"'`]/;

// 图片 HTML 允许保留的属性名集合。
const SAFE_IMAGE_ATTRIBUTE_NAMES = new Set(['src', 'alt', 'title', 'style']);

/**
 * 规范化并校验安全 URL，仅保留白名单协议与相对路径。
 */
export const normalizeSafeUrl = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  // 去除首尾空白后的原始地址。
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  if (UNSAFE_URL_CHARACTER_PATTERN.test(trimmedValue) || /[\u0000-\u001f\u007f]/.test(trimmedValue)) {
    return '';
  }

  // 移除控制字符后的协议检测文本。
  const collapsedValue = trimmedValue.replace(URL_PROTOCOL_NOISE_PATTERN, '');
  if (collapsedValue.startsWith('//')) {
    return '';
  }

  // 当前 URL 的协议前缀。
  const scheme = collapsedValue.match(URL_SCHEME_PATTERN)?.[1]?.toLowerCase() ?? '';
  if (!scheme) {
    return trimmedValue;
  }

  if (!ALLOWED_ABSOLUTE_PROTOCOLS.has(scheme)) {
    return '';
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    return '';
  }
};

/**
 * 解析并校验仅包含安全图片的 HTML 片段。
 */
export const parseSafeImageHtml = (
  html: unknown,
  normalizeStyle: (style: unknown) => string
): SafeImageHtmlAttrs | null => {
  if (typeof html !== 'string') {
    return null;
  }

  // 去除首尾空白后的 HTML 片段。
  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    return null;
  }

  // DOM 解析结果。
  const documentNode = new DOMParser().parseFromString(trimmedHtml, 'text/html');
  // 当前命中的图片元素。
  let imageElement: HTMLImageElement | null = null;

  for (const childNode of Array.from(documentNode.body.childNodes)) {
    if (childNode.nodeType === Node.TEXT_NODE && !(childNode.textContent ?? '').trim()) {
      continue;
    }

    if (childNode instanceof HTMLImageElement && imageElement === null) {
      imageElement = childNode;
      continue;
    }

    return null;
  }

  if (!imageElement || imageElement.tagName.toLowerCase() !== 'img') {
    return null;
  }

  for (const attribute of Array.from(imageElement.attributes)) {
    if (!SAFE_IMAGE_ATTRIBUTE_NAMES.has(attribute.name.toLowerCase())) {
      return null;
    }
  }

  // 归一化后的图片地址。
  const src = normalizeSafeUrl(imageElement.getAttribute('src') ?? '');
  if (!src) {
    return null;
  }

  return {
    src,
    alt: imageElement.getAttribute('alt') ?? '',
    title: imageElement.getAttribute('title') ?? '',
    style: normalizeStyle(imageElement.getAttribute('style') ?? '')
  };
};
