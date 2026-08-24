import { codeBlockSchema } from '@milkdown/preset-commonmark';
import type { GetNodeSchema } from '@milkdown/utils';

// 纯文本语言值。
export const PLAIN_TEXT_LANGUAGE_VALUE = 'text';

/**
 * 代码块语言 schema 配置上下文。
 */
interface CodeBlockLanguageSchemaConfigContext {
  /** 读取代码块 schema 配置。 */
  get: (key: typeof codeBlockSchema.key) => GetNodeSchema;
  /** 写入代码块 schema 配置。 */
  set: (key: typeof codeBlockSchema.key, value: GetNodeSchema) => void;
}

// Canvas 代码块语言关键字映射表。
const CANVAS_LANGUAGE_KEYWORD_MAP: Record<string, string> = {
  svg: 'svg',
  html: 'html'
};

// 支持预览的代码块语言映射表。
const CODE_BLOCK_PREVIEW_LANGUAGE_MAP: Record<string, true> = {
  html: true,
  svg: true
};

/**
 * 规范化代码块语言值。
 */
export const normalizeCodeBlockLanguage = (language: string): string => {
  const normalizedLanguage = language.trim().toLowerCase();
  if (!normalizedLanguage) {
    return PLAIN_TEXT_LANGUAGE_VALUE;
  }

  if (normalizedLanguage.startsWith('canvas-')) {
    // Canvas 代码块对应的标准语言值。
    const canvasLanguage = Object.entries(CANVAS_LANGUAGE_KEYWORD_MAP).find(([keyword]) =>
      normalizedLanguage.includes(keyword)
    )?.[1];

    return canvasLanguage ?? normalizedLanguage;
  }

  return normalizedLanguage;
};

/**
 * 创建默认使用 text 语言的代码块 schema。
 */
const createCodeBlockLanguageSchema = (previousSchema: GetNodeSchema): GetNodeSchema => {
  return (ctx) => {
    // Milkdown 原始代码块 schema。
    const schema = previousSchema(ctx);

    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        language: {
          default: PLAIN_TEXT_LANGUAGE_VALUE,
          validate: 'string'
        }
      },
      parseMarkdown: {
        ...schema.parseMarkdown,
        runner: (state, node, type) => {
          // 已补全默认语言的 Markdown 节点。
          const normalizedNode = {
            ...node,
            lang: normalizeCodeBlockLanguage(String(node.lang ?? ''))
          };
          schema.parseMarkdown.runner(state, normalizedNode, type);
        }
      },
      toMarkdown: {
        ...schema.toMarkdown,
        runner: (state, node) => {
          // 规范化后的序列化语言。
          const language = normalizeCodeBlockLanguage(String(node.attrs.language ?? ''));
          state.addNode('code', undefined, node.content.firstChild?.text || '', { lang: language });
        }
      }
    };
  };
};

/**
 * 配置代码块语言的默认值与 Markdown 转换规则。
 */
export const configureCodeBlockLanguageSchema = (
  ctx: CodeBlockLanguageSchemaConfigContext
): void => {
  // 原始代码块 schema 工厂。
  const previousSchema = ctx.get(codeBlockSchema.key) as GetNodeSchema;
  ctx.set(codeBlockSchema.key, createCodeBlockLanguageSchema(previousSchema));
};

/**
 * 判断代码块语言是否支持静态预览。
 */
export const isCodeBlockPreviewLanguage = (language: string): boolean =>
  CODE_BLOCK_PREVIEW_LANGUAGE_MAP[normalizeCodeBlockLanguage(language)] === true;
