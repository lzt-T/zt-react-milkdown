import type { MilkdownPlugin } from '@milkdown/ctx';
import { $nodeSchema, $remark } from '@milkdown/utils';
import remarkFrontmatter, { type Options as FrontmatterOptions } from 'remark-frontmatter';

/**
 * Frontmatter 节点类型名。
 */
export const FRONTMATTER_NODE_NAME = 'frontmatter';

/**
 * 支持的 Frontmatter 语法格式列表。
 */
export const FRONTMATTER_FORMATS = ['yaml', 'toml'] as const;

/**
 * Frontmatter 格式类型。
 */
export type FrontmatterFormat = (typeof FRONTMATTER_FORMATS)[number];

/**
 * 将未知格式值规范化为受支持的 Frontmatter 格式。
 */
export const normalizeFrontmatterFormat = (value: unknown): FrontmatterFormat => {
  return value === 'toml' ? 'toml' : 'yaml';
};

/**
 * remark-frontmatter 插件包装器，支持 YAML（---）与 TOML（+++）头部元数据。
 */
export const remarkFrontmatterPlugin = $remark<'remarkFrontmatter', FrontmatterOptions>(
  'remarkFrontmatter',
  () => remarkFrontmatter,
  [...FRONTMATTER_FORMATS]
);

/**
 * Frontmatter 块级节点 schema，保留原始文本内容并支持双向无损序列化。
 */
export const frontmatterSchema = $nodeSchema(FRONTMATTER_NODE_NAME, () => {
  return {
    content: 'text*',
    group: 'block',
    marks: '',
    code: true,
    defining: true,
    isolating: true,
    attrs: {
      format: {
        default: 'yaml',
        validate: 'string'
      }
    },
    parseDOM: [
      {
        tag: `pre[data-type="${FRONTMATTER_NODE_NAME}"]`,
        preserveWhitespace: 'full',
        getAttrs: (dom) => {
          // Frontmatter 源码容器元素。
          const element = dom as HTMLElement;
          return {
            format: normalizeFrontmatterFormat(element.dataset.format)
          };
        }
      }
    ],
    toDOM: (node) => {
      // 标准化后的 Frontmatter 格式。
      const format = normalizeFrontmatterFormat(node.attrs.format);
      return [
        'pre',
        {
          'data-type': FRONTMATTER_NODE_NAME,
          'data-format': format
        },
        ['code', 0]
      ];
    },
    parseMarkdown: {
      match: (node) => {
        return node.type === 'yaml' || node.type === 'toml';
      },
      runner: (state, node, type) => {
        // 当前 Frontmatter 节点格式。
        const format = normalizeFrontmatterFormat(node.type);
        // 当前 Frontmatter 原始文本。
        const value = typeof node.value === 'string' ? node.value : '';
        state.openNode(type, { format });
        if (value) {
          state.addText(value);
        }
        state.closeNode();
      }
    },
    toMarkdown: {
      match: (node) => {
        return node.type.name === FRONTMATTER_NODE_NAME;
      },
      runner: (state, node) => {
        // 序列化目标节点类型（yaml 或 toml）。
        const format = normalizeFrontmatterFormat(node.attrs.format);
        state.addNode(format, undefined, node.textContent);
      }
    }
  };
});

/**
 * Frontmatter 插件聚合导出。
 */
export const frontmatter: MilkdownPlugin[] = [remarkFrontmatterPlugin, frontmatterSchema].flat();
