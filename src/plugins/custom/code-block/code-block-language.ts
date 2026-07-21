// 纯文本语言值。
export const PLAIN_TEXT_LANGUAGE_VALUE = 'text';

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
 * 判断代码块语言是否支持静态预览。
 */
export const isCodeBlockPreviewLanguage = (language: string): boolean =>
  CODE_BLOCK_PREVIEW_LANGUAGE_MAP[normalizeCodeBlockLanguage(language)] === true;
