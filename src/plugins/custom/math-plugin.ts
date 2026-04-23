import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import { nodeRule } from '@milkdown/kit/prose';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Fragment } from '@milkdown/kit/prose/model';
import { $ctx, $inputRule, $nodeSchema, $remark } from '@milkdown/kit/utils';
import type { KatexOptions } from 'katex';
import katex from 'katex';
import remarkMath from 'remark-math';

/**
 * 行内公式节点类型名。
 */
export const MATH_INLINE_NODE_NAME = 'math_inline';

/**
 * 块级公式节点类型名。
 */
export const MATH_BLOCK_NODE_NAME = 'math_block';

/**
 * 行内公式自动输入规则。
 */
export const MATH_INLINE_INPUT_RULE_REGEX = /(?:\$)([^$]+)(?:\$)$/;

/**
 * 块级公式自动输入规则。
 */
export const MATH_BLOCK_INPUT_RULE_REGEX = /^\$\$\s$/;

/**
 * remark-math 插件包装器。
 */
export const remarkMathPlugin = $remark<'remarkMath', undefined>('remarkMath', () => {
  return remarkMath;
});

/**
 * katex 配置上下文。
 */
export const katexOptionsCtx = $ctx<KatexOptions, 'katexOptions'>({}, 'katexOptions');

/**
 * 行内公式节点 schema。
 */
export const mathInlineSchema = $nodeSchema(MATH_INLINE_NODE_NAME, (ctx) => {
  return {
    group: 'inline',
    content: 'text*',
    inline: true,
    atom: true,
    parseDOM: [
      {
        tag: `span[data-type="${MATH_INLINE_NODE_NAME}"]`,
        getContent: (dom, schema) => {
          // 行内公式容器节点。
          const element = dom as HTMLElement;
          // 行内公式源码。
          const inlineValue = element.dataset.value ?? '';
          return Fragment.from(schema.text(inlineValue));
        }
      }
    ],
    toDOM: (node) => {
      // 行内公式源码。
      const code = node.textContent;
      // 行内公式容器。
      const dom = document.createElement('span');
      dom.dataset.type = MATH_INLINE_NODE_NAME;
      dom.dataset.value = code;
      katex.render(code, dom, ctx.get(katexOptionsCtx.key));
      return dom;
    },
    parseMarkdown: {
      match: (node) => {
        return node.type === 'inlineMath';
      },
      runner: (state, node, type) => {
        // 行内公式源码。
        const inlineValue = String(node.value ?? '');
        state.openNode(type).addText(inlineValue).closeNode();
      }
    },
    toMarkdown: {
      match: (node) => {
        return node.type.name === MATH_INLINE_NODE_NAME;
      },
      runner: (state, node) => {
        state.addNode('inlineMath', undefined, node.textContent);
      }
    }
  };
});

/**
 * 块级公式节点 schema。
 */
export const mathBlockSchema = $nodeSchema(MATH_BLOCK_NODE_NAME, (ctx) => {
  return {
    content: 'text*',
    group: 'block',
    marks: '',
    defining: true,
    atom: true,
    isolating: true,
    attrs: {
      value: {
        default: ''
      }
    },
    parseDOM: [
      {
        tag: `div[data-type="${MATH_BLOCK_NODE_NAME}"]`,
        preserveWhitespace: 'full',
        getAttrs: (dom) => {
          // 块级公式容器节点。
          const element = dom as HTMLElement;
          return {
            value: element.dataset.value ?? ''
          };
        }
      }
    ],
    toDOM: (node) => {
      // 块级公式源码。
      const code = String(node.attrs.value ?? '');
      // 块级公式容器。
      const dom = document.createElement('div');
      dom.dataset.type = MATH_BLOCK_NODE_NAME;
      dom.dataset.value = code;
      katex.render(code, dom, ctx.get(katexOptionsCtx.key));
      return dom;
    },
    parseMarkdown: {
      match: (node) => {
        return node.type === 'math';
      },
      runner: (state, node, type) => {
        // 块级公式源码。
        const blockValue = String(node.value ?? '');
        state.addNode(type, { value: blockValue });
      }
    },
    toMarkdown: {
      match: (node) => {
        return node.type.name === MATH_BLOCK_NODE_NAME;
      },
      runner: (state, node) => {
        // 块级公式源码。
        const blockValue = String(node.attrs.value ?? '');
        state.addNode('math', undefined, blockValue);
      }
    }
  };
});

/**
 * 行内公式输入规则插件。
 */
export const mathInlineInputRule = $inputRule((ctx) => {
  return nodeRule(MATH_INLINE_INPUT_RULE_REGEX, mathInlineSchema.type(ctx), {
    beforeDispatch: ({ tr, match, start }) => {
      // 行内公式实际文本。
      const inlineValue = match[1] ?? '';
      tr.insertText(inlineValue, start + 1);
    }
  });
});

/**
 * 块级公式输入规则插件。
 */
export const mathBlockInputRule = $inputRule((ctx) => {
  return new InputRule(MATH_BLOCK_INPUT_RULE_REGEX, (state, _match, start, end) => {
    // 规则起始位置的解析结果。
    const startPosition = state.doc.resolve(start);
    // 目标节点类型。
    const blockType = mathBlockSchema.type(ctx);

    if (
      !startPosition
        .node(-1)
        .canReplaceWith(startPosition.index(-1), startPosition.indexAfter(-1), blockType)
    ) {
      return null;
    }

    return state.tr.delete(start, end).setBlockType(start, start, blockType);
  });
});

/**
 * 数学插件聚合导出。
 */
export const math: MilkdownPlugin[] = [
  remarkMathPlugin,
  katexOptionsCtx,
  mathInlineSchema,
  mathBlockSchema,
  mathBlockInputRule,
  mathInlineInputRule
].flat();
