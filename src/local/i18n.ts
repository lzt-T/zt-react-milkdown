import type { EditorI18nMessages, EditorLocale } from '../types/editor';
import i18next, { type Resource } from 'i18next';
import { enUSMessages } from './en-US';
import { zhCNMessages } from './zh-CN';

/**
 * 编辑器默认语言。
 */
export const DEFAULT_EDITOR_LOCALE: EditorLocale = 'zh-CN';

/**
 * i18next 资源定义。
 */
const I18N_RESOURCES: Resource = {
  'zh-CN': {
    translation: zhCNMessages
  },
  'en-US': {
    translation: enUSMessages
  }
};

/**
 * 编辑器 i18n 运行时。
 */
const editorI18nRuntime = i18next.createInstance();

/**
 * 是否已完成 i18n 初始化。
 */
let isEditorI18nInitialized = false;

/**
 * 懒初始化 i18n 运行时。
 */
const ensureEditorI18nRuntime = (): void => {
  if (isEditorI18nInitialized) {
    return;
  }

  editorI18nRuntime.init({
    resources: I18N_RESOURCES,
    fallbackLng: DEFAULT_EDITOR_LOCALE,
    lng: DEFAULT_EDITOR_LOCALE,
    interpolation: {
      escapeValue: false
    }
  });

  isEditorI18nInitialized = true;
};

/**
 * 合并编辑器语言包与外部覆盖文案。
 */
export const resolveEditorMessages = (
  locale: EditorLocale = DEFAULT_EDITOR_LOCALE,
  messages?: Partial<EditorI18nMessages>,
  placeholder?: string
): EditorI18nMessages => {
  /** 确保 i18next 实例可用。 */
  ensureEditorI18nRuntime();
  /** 当前语言默认文案。 */
  const defaultMessages = editorI18nRuntime.getResourceBundle(locale, 'translation') as EditorI18nMessages;
  /** 合并后的编辑器文案。 */
  const resolvedMessages = {
    ...defaultMessages,
    ...messages
  };

  if (placeholder !== undefined) {
    resolvedMessages.placeholder = placeholder;
  }

  return resolvedMessages;
};
