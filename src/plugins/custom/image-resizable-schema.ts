import { imageSchema } from '@milkdown/preset-commonmark';
import type { GetNodeSchema } from '@milkdown/utils';

/**
 * 图片宽度百分比最小值。
 */
export const IMAGE_WIDTH_MIN_PERCENT = 10;

/**
 * 图片宽度百分比最大值。
 */
export const IMAGE_WIDTH_MAX_PERCENT = 100;

// 图片宽度 style 匹配规则。
const IMAGE_WIDTH_STYLE_PATTERN = /^\s*width\s*:\s*(\d{1,3})%\s*;?\s*$/i;

// 图片 HTML 标签名。
const IMAGE_HTML_TAG_NAME = 'img';

/**
 * 图片 schema 配置上下文。
 */
interface ImageSchemaConfigContext {
  /** 读取 schema 配置。 */
  get: (key: typeof imageSchema.key) => GetNodeSchema;
  /** 写入 schema 配置。 */
  set: (key: typeof imageSchema.key, value: GetNodeSchema) => void;
}

/**
 * 限制图片宽度百分比范围。
 */
export const clampImageWidthPercent = (widthPercent: number): number => {
  return Math.min(IMAGE_WIDTH_MAX_PERCENT, Math.max(IMAGE_WIDTH_MIN_PERCENT, widthPercent));
};

/**
 * 转换图片宽度 style 文本。
 */
export const formatImageWidthStyle = (widthPercent: number): string => {
  return `width: ${clampImageWidthPercent(Math.round(widthPercent))}%;`;
};

/**
 * 解析图片宽度百分比。
 */
export const parseImageWidthPercent = (style: unknown): number | null => {
  if (typeof style !== 'string') {
    return null;
  }

  // 宽度匹配结果。
  const widthMatch = style.match(IMAGE_WIDTH_STYLE_PATTERN);
  if (!widthMatch) {
    return null;
  }

  // 图片宽度百分比。
  const widthPercent = Number(widthMatch[1]);
  if (!Number.isFinite(widthPercent)) {
    return null;
  }

  return clampImageWidthPercent(widthPercent);
};

/**
 * 规范化图片宽度 style。
 */
export const normalizeImageWidthStyle = (style: unknown): string => {
  // 图片宽度百分比。
  const widthPercent = parseImageWidthPercent(style);
  if (widthPercent === null) {
    return '';
  }

  return formatImageWidthStyle(widthPercent);
};

/**
 * 转义 HTML 属性值。
 */
const escapeHtmlAttribute = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * 从 HTML 片段中解析图片属性。
 */
const parseHtmlImageAttrs = (html: unknown): Record<string, string> | null => {
  if (typeof html !== 'string') {
    return null;
  }

  // HTML 解析容器。
  const template = document.createElement('template');
  template.innerHTML = html.trim();

  // 图片元素。
  const image = template.content.firstElementChild;
  if (!(image instanceof HTMLImageElement) || image.tagName.toLowerCase() !== IMAGE_HTML_TAG_NAME) {
    return null;
  }

  return {
    src: image.getAttribute('src') ?? '',
    alt: image.getAttribute('alt') ?? '',
    title: image.getAttribute('title') ?? '',
    style: normalizeImageWidthStyle(image.getAttribute('style') ?? '')
  };
};

/**
 * 序列化图片 HTML。
 */
const serializeImageHtml = (attrs: Record<string, unknown>): string => {
  // 图片标题。
  const title = typeof attrs.title === 'string' ? attrs.title : '';
  // 图片标题属性。
  const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : '';

  return `<img src="${escapeHtmlAttribute(attrs.src)}" alt="${escapeHtmlAttribute(attrs.alt)}"${titleAttribute} style="${escapeHtmlAttribute(attrs.style)}">`;
};

/**
 * 创建支持 width style 的图片 schema。
 */
const createResizableImageSchema = (prevSchema: GetNodeSchema): GetNodeSchema => {
  return (ctx) => {
    // 原始图片 schema。
    const schema = prevSchema(ctx);

    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        style: { default: '', validate: 'string' }
      },
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom) => {
            // 图片 DOM 节点。
            const image = dom as HTMLImageElement;
            return {
              src: image.getAttribute('src') ?? '',
              alt: image.getAttribute('alt') ?? '',
              title: image.getAttribute('title') ?? image.getAttribute('alt') ?? '',
              style: normalizeImageWidthStyle(image.getAttribute('style') ?? '')
            };
          }
        }
      ],
      parseMarkdown: {
        match: (node) => {
          return node.type === 'image' || (node.type === 'html' && parseHtmlImageAttrs(node.value) !== null);
        },
        runner: (state, node, type) => {
          if (node.type === 'html') {
            // HTML 图片属性。
            const attrs = parseHtmlImageAttrs(node.value);
            if (attrs) {
              state.addNode(type, attrs);
            }
            return;
          }

          state.addNode(type, {
            src: String(node.url ?? ''),
            alt: String(node.alt ?? ''),
            title: String(node.title ?? ''),
            style: ''
          });
        }
      },
      toMarkdown: {
        match: (node) => {
          return node.type.name === 'image';
        },
        runner: (state, node) => {
          // 图片宽度 style。
          const style = normalizeImageWidthStyle(node.attrs.style);
          if (style) {
            state.addNode('html', undefined, serializeImageHtml({ ...node.attrs, style }));
            return;
          }

          state.addNode('image', undefined, undefined, {
            title: node.attrs.title,
            url: node.attrs.src,
            alt: node.attrs.alt
          });
        }
      }
    };
  };
};

/**
 * 配置支持尺寸调整的图片 schema。
 */
export const configureImageResizableSchema = (ctx: ImageSchemaConfigContext): void => {
  // 原始图片 schema 工厂。
  const prevSchema = ctx.get(imageSchema.key) as GetNodeSchema;
  ctx.set(imageSchema.key, createResizableImageSchema(prevSchema));
};
