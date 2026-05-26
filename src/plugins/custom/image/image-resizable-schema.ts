import { imageSchema, paragraphSchema } from '@milkdown/preset-commonmark';
import type { GetNodeSchema } from '@milkdown/utils';
import { normalizeSafeUrl, parseSafeImageHtml } from '../../../utils/security';

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

/**
 * 图片 schema 配置上下文。
 */
interface ImageSchemaConfigContext {
  /** 读取 schema 配置。 */
  get: (key: typeof imageSchema.key | typeof paragraphSchema.key) => GetNodeSchema;
  /** 写入 schema 配置。 */
  set: (key: typeof imageSchema.key | typeof paragraphSchema.key, value: GetNodeSchema) => void;
}

/**
 * 解析段落中独立存在的图片节点。
 */
const resolveStandaloneMarkdownImage = (node: any): any | null => {
  // 段落子节点列表。
  const children = Array.isArray(node.children) ? node.children : [];
  // 段落内唯一子节点。
  const child = children[0];
  if (children.length !== 1) {
    return null;
  }

  if (child?.type === 'image') {
    return child;
  }

  if (child?.type === 'html' && parseSafeImageHtml(child.value, normalizeImageWidthStyle) !== null) {
    return child;
  }

  return null;
};

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
 * 序列化图片 HTML。
 */
const serializeImageHtml = (attrs: Record<string, unknown>): string => {
  // 归一化后的图片地址。
  const src = normalizeSafeUrl(attrs.src);
  if (!src) {
    return '';
  }

  // 归一化后的图片替代文本。
  const alt = typeof attrs.alt === 'string' ? attrs.alt : '';
  // 图片标题。
  const title = typeof attrs.title === 'string' ? attrs.title : '';
  // 图片标题属性。
  const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : '';
  // 归一化后的图片宽度样式。
  const style = normalizeImageWidthStyle(attrs.style);

  return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}"${titleAttribute} style="${escapeHtmlAttribute(style)}">`;
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
      inline: false,
      group: 'block',
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
            // 归一化后的图片地址。
            const src = normalizeSafeUrl(image.getAttribute('src') ?? '');
            if (!src) {
              return false;
            }

            return {
              src,
              alt: image.getAttribute('alt') ?? '',
              title: image.getAttribute('title') ?? image.getAttribute('alt') ?? '',
              style: normalizeImageWidthStyle(image.getAttribute('style') ?? '')
            };
          }
        }
      ],
      parseMarkdown: {
        match: (node) => {
          return (
            node.type === 'image' ||
            (node.type === 'html' && parseSafeImageHtml(node.value, normalizeImageWidthStyle) !== null)
          );
        },
        runner: (state, node, type) => {
          if (node.type === 'html') {
            // HTML 图片属性。
            const attrs = parseSafeImageHtml(node.value, normalizeImageWidthStyle);
            if (attrs) {
              state.addNode(type, attrs);
            }
            return;
          }

          // 归一化后的 Markdown 图片地址。
          const src = normalizeSafeUrl(String(node.url ?? ''));
          if (!src) {
            return;
          }

          state.addNode(type, {
            src,
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
          // 归一化后的图片地址。
          const src = normalizeSafeUrl(node.attrs.src);
          if (!src) {
            return;
          }

          // 图片宽度 style。
          const style = normalizeImageWidthStyle(node.attrs.style);
          if (style) {
            // 序列化后的安全图片 HTML。
            const html = serializeImageHtml({ ...node.attrs, src, style });
            if (html) {
              state.addNode('html', undefined, html);
            }
            return;
          }

          // Markdown 图片节点属于行内节点，块级图片需包进段落避免和相邻块黏连。
          const imageMarkdownNode = {
            type: 'image',
            title: node.attrs.title,
            url: src,
            alt: node.attrs.alt
          };
          state.addNode('paragraph', [imageMarkdownNode]);
        }
      }
    };
  };
};

/**
 * 创建兼容块级图片的 paragraph schema。
 */
const createImageCompatibleParagraphSchema = (prevSchema: GetNodeSchema): GetNodeSchema => {
  return (ctx) => {
    // 原始段落 schema。
    const schema = prevSchema(ctx);

    return {
      ...schema,
      parseMarkdown: {
        ...schema.parseMarkdown,
        runner: (state, node, type) => {
          // 独立图片节点。
          const standaloneImage = resolveStandaloneMarkdownImage(node);
          if (standaloneImage) {
            state.next(standaloneImage);
            return;
          }

          schema.parseMarkdown.runner(state, node, type);
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
  const prevImageSchema = ctx.get(imageSchema.key) as GetNodeSchema;
  // 原始段落 schema 工厂。
  const prevParagraphSchema = ctx.get(paragraphSchema.key) as GetNodeSchema;
  ctx.set(imageSchema.key, createResizableImageSchema(prevImageSchema));
  ctx.set(paragraphSchema.key, createImageCompatibleParagraphSchema(prevParagraphSchema));
};
