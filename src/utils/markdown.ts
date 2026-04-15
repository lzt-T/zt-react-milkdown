/**
 * 归一化 Markdown 字符串，避免出现 undefined 输入。
 */
export const normalizeMarkdown = (markdown: string | undefined): string => {
  return typeof markdown === 'string' ? markdown : '';
};

/**
 * 判断 Markdown 内容是否为空，用于占位态展示。
 */
export const isMarkdownEmpty = (markdown: string): boolean => {
  return markdown.trim().length === 0;
};
