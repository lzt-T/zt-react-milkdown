import type { EditorView } from '@milkdown/prose/view';
import type {
  EditorI18nMessages,
  EditorShortcutMode,
  ImageUploadConfig,
  SlashMenuCommand
} from '@/types/editor';
import { SLASH_MENU_SHORTCUT_DEFINITIONS } from '@/plugins/custom/block-transform';
import { showImageUploadDialog } from '@/plugins/custom/image/image-upload-dialog';
import { isEditorViewEditable } from './slash-menu-logic';
import { runSlashCommand } from './slash-menu-commands';

// macOS 平台匹配规则。
const MAC_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/;

// 物理键码到 slash 命令的分发表。
const SLASH_MENU_COMMAND_BY_CODE = Object.fromEntries(
  Object.entries(SLASH_MENU_SHORTCUT_DEFINITIONS).map(([command, definition]) => [
    definition.code,
    command
  ])
) as Record<string, SlashMenuCommand>;

/**
 * 判断当前快捷键是否匹配指定修饰键模式。
 */
const matchesShortcutMode = (event: KeyboardEvent, shortcutMode: EditorShortcutMode): boolean => {
  // 当前环境是否使用 Command 作为 Mod 键。
  const isMac = typeof navigator !== 'undefined' && MAC_PLATFORM_PATTERN.test(navigator.platform);
  // 当前事件是否按下正确的 Mod 键。
  const hasMod = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!hasMod) {
    return false;
  }

  return shortcutMode === 'modAlt'
    ? event.altKey && !event.shiftKey
    : event.shiftKey && !event.altKey;
};

/**
 * 执行图片上传快捷键。
 */
const runImageShortcut = (
  view: EditorView,
  portalContainer: HTMLElement,
  messages: EditorI18nMessages,
  imageUpload?: ImageUploadConfig
): boolean => {
  showImageUploadDialog({
    portalContainer,
    view,
    messages,
    imageUpload
  });
  return true;
};

/**
 * 创建编辑器内置快捷键处理器。
 */
export const createEditorShortcutKeyDownHandler = (
  portalContainer: HTMLElement,
  messages: EditorI18nMessages,
  shortcutMode: EditorShortcutMode,
  imageUpload?: ImageUploadConfig
): ((view: EditorView, event: KeyboardEvent) => boolean) => {
  /**
   * 优先处理编辑器内置快捷键。
   */
  const handleKeyDown = (view: EditorView, event: KeyboardEvent): boolean => {
    if (
      event.isComposing ||
      !matchesShortcutMode(event, shortcutMode) ||
      !isEditorViewEditable(view)
    ) {
      return false;
    }

    // 当前物理键码对应的内置命令。
    const command = SLASH_MENU_COMMAND_BY_CODE[event.code];
    if (!command) {
      return false;
    }

    // 当前命令是否执行成功。
    const handled = command === 'image'
      ? runImageShortcut(view, portalContainer, messages, imageUpload)
      : runSlashCommand(view, command);
    if (handled) {
      event.preventDefault();
    }
    return handled;
  };

  return handleKeyDown;
};
