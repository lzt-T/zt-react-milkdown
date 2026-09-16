import { refractor } from 'refractor/all';
import type { Refractor } from 'refractor/core';

/**
 * 注册纯文本空语法，避免官方插件将 text 视为不支持的语言。
 */
function plainText(highlighter: Refractor): void {
  highlighter.languages.text = {};
}

plainText.displayName = 'text';

/**
 * 为已加载全部语法的菜单和官方插件补充纯文本支持。
 */
export function configureCodeBlockHighlighter(highlighter: Refractor): void {
  highlighter.register(plainText);
}

configureCodeBlockHighlighter(refractor);

export { refractor };
