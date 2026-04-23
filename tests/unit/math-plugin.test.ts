import { describe, expect, it } from 'vitest';
import {
  MATH_BLOCK_INPUT_RULE_REGEX,
  MATH_INLINE_INPUT_RULE_REGEX,
  katexOptionsCtx,
  math,
  mathBlockInputRule,
  mathBlockSchema,
  mathInlineInputRule,
  mathInlineSchema,
  remarkMathPlugin
} from '../../src/plugins/custom/math-plugin';

describe('math-plugin', () => {
  it('聚合导出包含所有核心子插件', () => {
    // 插件集合去重视图。
    const pluginSet = new Set(math);

    expect(math).toHaveLength(6);
    expect(pluginSet.has(remarkMathPlugin)).toBe(true);
    expect(pluginSet.has(katexOptionsCtx)).toBe(true);
    expect(pluginSet.has(mathInlineSchema)).toBe(true);
    expect(pluginSet.has(mathBlockSchema)).toBe(true);
    expect(pluginSet.has(mathInlineInputRule)).toBe(true);
    expect(pluginSet.has(mathBlockInputRule)).toBe(true);
  });

  it('输入规则正则保持与既有语法兼容', () => {
    expect(MATH_INLINE_INPUT_RULE_REGEX.source).toBe('(?:\\$)([^$]+)(?:\\$)$');
    expect(MATH_BLOCK_INPUT_RULE_REGEX.source).toBe('^\\$\\$\\s$');
  });
});
