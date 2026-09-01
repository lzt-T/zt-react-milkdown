import type { Ctx } from '@milkdown/ctx';
import {
  blockquoteKeymap,
  bulletListKeymap,
  codeBlockKeymap,
  headingKeymap,
  inlineCodeKeymap,
  orderedListKeymap,
  paragraphKeymap
} from '@milkdown/preset-commonmark';
import { $useKeymap } from '@milkdown/utils';
import type {
  BlockTransformCommand,
  EditorShortcutMode,
  SlashMenuCommand
} from '@/types/editor';
import { runBlockTransformCommand } from './block-transform';

// macOS 平台匹配规则。
const MAC_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/;

/**
 * 定义单个快捷键的主键与物理键码。
 */
interface ShortcutKeyDefinition {
  /** ProseMirror 快捷键使用的主键。 */
  key: string;
  /** 浏览器键盘事件使用的物理键码。 */
  code: string;
}

/**
 * 定义单个命令的助记键配置。
 */
interface ShortcutDefinition extends ShortcutKeyDefinition {
  /** 指定模式使用的快捷键覆盖项。 */
  modeOverrides?: Partial<Record<EditorShortcutMode, ShortcutKeyDefinition>>;
}

// 所有内置命令共用的助记键配置。
export const SLASH_MENU_SHORTCUT_DEFINITIONS: Readonly<
  Record<SlashMenuCommand, ShortcutDefinition>
> = {
  paragraph: {
    key: 'p',
    code: 'KeyP',
    modeOverrides: {
      modAlt: { key: '0', code: 'Digit0' }
    }
  },
  heading1: { key: '1', code: 'Digit1' },
  heading2: { key: '2', code: 'Digit2' },
  heading3: { key: '3', code: 'Digit3' },
  heading4: { key: '4', code: 'Digit4' },
  heading5: { key: '5', code: 'Digit5' },
  heading6: { key: '6', code: 'Digit6' },
  bulletList: { key: 'u', code: 'KeyU' },
  orderedList: { key: 'o', code: 'KeyO' },
  taskList: { key: '9', code: 'Digit9' },
  blockquote: { key: 'q', code: 'KeyQ' },
  inlineCode: { key: 'e', code: 'KeyE' },
  codeBlock: { key: 'c', code: 'KeyC' },
  table: { key: 't', code: 'KeyT' },
  inlineMath: { key: 'f', code: 'KeyF' },
  mathBlock: { key: 'b', code: 'KeyB' },
  image: { key: 'i', code: 'KeyI' }
};

/**
 * 解析指定模式使用的助记键配置。
 */
export const resolveSlashMenuShortcutDefinitions = (
  shortcutMode: EditorShortcutMode
): Record<SlashMenuCommand, ShortcutKeyDefinition> => {
  return Object.fromEntries(
    Object.entries(SLASH_MENU_SHORTCUT_DEFINITIONS).map(([command, definition]) => [
      command,
      definition.modeOverrides?.[shortcutMode] ?? definition
    ])
  ) as Record<SlashMenuCommand, ShortcutKeyDefinition>;
};

// Windows/Linux 快捷键标签映射。
const DEFAULT_SHORTCUT_TOKEN_LABEL_MAP: Record<string, string> = {
  Mod: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift'
};

// macOS 快捷键标签映射。
const MAC_SHORTCUT_TOKEN_LABEL_MAP: Record<string, string> = {
  Mod: '⌘',
  Alt: '⌥',
  Shift: '⇧'
};

/**
 * 判断当前运行环境是否为 macOS 系列平台。
 */
const isMacPlatform = (): boolean => {
  return typeof navigator !== 'undefined' && MAC_PLATFORM_PATTERN.test(navigator.platform);
};

/**
 * 解析指定模式使用的 slash 菜单快捷键。
 */
export const resolveSlashMenuShortcutMap = (
  shortcutMode: EditorShortcutMode
): Record<SlashMenuCommand, string> => {
  // 当前模式使用的 ProseMirror 修饰键。
  const modifier = shortcutMode === 'modAlt' ? 'Mod-Alt' : 'Mod-Shift';
  // 当前模式使用的助记键配置。
  const shortcutDefinitions = resolveSlashMenuShortcutDefinitions(shortcutMode);
  return Object.fromEntries(
    Object.entries(shortcutDefinitions).map(([command, definition]) => [
      command,
      `${modifier}-${definition.key}`
    ])
  ) as Record<SlashMenuCommand, string>;
};

/**
 * 解析当前平台使用的块转换快捷键。
 */
export const resolveBlockTransformShortcutMap = (
  shortcutMode: EditorShortcutMode
): Record<BlockTransformCommand, string> => {
  // 完整 slash 菜单快捷键映射。
  const shortcuts = resolveSlashMenuShortcutMap(shortcutMode);
  return {
    paragraph: shortcuts.paragraph,
    heading1: shortcuts.heading1,
    heading2: shortcuts.heading2,
    heading3: shortcuts.heading3,
    heading4: shortcuts.heading4,
    heading5: shortcuts.heading5,
    heading6: shortcuts.heading6,
    bulletList: shortcuts.bulletList,
    orderedList: shortcuts.orderedList,
    taskList: shortcuts.taskList,
    blockquote: shortcuts.blockquote,
    codeBlock: shortcuts.codeBlock
  };
};

/**
 * 将 ProseMirror 快捷键转换为菜单展示文案。
 */
const formatShortcutLabel = (shortcut: string): string => {
  // 当前是否使用 macOS 快捷键符号。
  const isMac = isMacPlatform();
  // 当前平台快捷键标签映射。
  const tokenLabelMap = isMac ? MAC_SHORTCUT_TOKEN_LABEL_MAP : DEFAULT_SHORTCUT_TOKEN_LABEL_MAP;
  // 格式化后的快捷键按键列表。
  const labels = shortcut.split('-').map((token) => tokenLabelMap[token] ?? token.toUpperCase());
  return labels.join(isMac ? '' : '+');
};

/**
 * 解析 slash 菜单展示的快捷键文案。
 */
export const resolveSlashMenuShortcutLabels = (
  shortcutMode: EditorShortcutMode
): Record<SlashMenuCommand, string> => {
  // 当前平台完整快捷键映射。
  const shortcuts = resolveSlashMenuShortcutMap(shortcutMode);
  return Object.fromEntries(
    Object.entries(shortcuts).map(([command, shortcut]) => [command, formatShortcutLabel(shortcut)])
  ) as Record<SlashMenuCommand, string>;
};

/**
 * 解析块转换菜单展示的快捷键文案。
 */
export const resolveBlockTransformShortcutLabels = (
  shortcutMode: EditorShortcutMode
): Record<BlockTransformCommand, string> => {
  // 完整 slash 菜单快捷键文案。
  const shortcutLabels = resolveSlashMenuShortcutLabels(shortcutMode);
  return {
    paragraph: shortcutLabels.paragraph,
    heading1: shortcutLabels.heading1,
    heading2: shortcutLabels.heading2,
    heading3: shortcutLabels.heading3,
    heading4: shortcutLabels.heading4,
    heading5: shortcutLabels.heading5,
    heading6: shortcutLabels.heading6,
    bulletList: shortcutLabels.bulletList,
    orderedList: shortcutLabels.orderedList,
    taskList: shortcutLabels.taskList,
    blockquote: shortcutLabels.blockquote,
    codeBlock: shortcutLabels.codeBlock
  };
};

/**
 * 覆盖 CommonMark 内置块转换与行内代码快捷键。
 */
export const configureBlockTransformShortcuts = (
  ctx: Ctx,
  shortcutMode: EditorShortcutMode
): void => {
  // 当前平台完整快捷键映射。
  const shortcuts = resolveSlashMenuShortcutMap(shortcutMode);

  ctx.update(paragraphKeymap.key, (keymap) => ({
    ...keymap,
    TurnIntoText: { ...keymap.TurnIntoText, shortcuts: shortcuts.paragraph }
  }));
  ctx.update(headingKeymap.key, (keymap) => ({
    ...keymap,
    TurnIntoH1: { ...keymap.TurnIntoH1, shortcuts: shortcuts.heading1 },
    TurnIntoH2: { ...keymap.TurnIntoH2, shortcuts: shortcuts.heading2 },
    TurnIntoH3: { ...keymap.TurnIntoH3, shortcuts: shortcuts.heading3 },
    TurnIntoH4: { ...keymap.TurnIntoH4, shortcuts: shortcuts.heading4 },
    TurnIntoH5: { ...keymap.TurnIntoH5, shortcuts: shortcuts.heading5 },
    TurnIntoH6: { ...keymap.TurnIntoH6, shortcuts: shortcuts.heading6 }
  }));
  ctx.update(bulletListKeymap.key, (keymap) => ({
    ...keymap,
    WrapInBulletList: { ...keymap.WrapInBulletList, shortcuts: shortcuts.bulletList }
  }));
  ctx.update(orderedListKeymap.key, (keymap) => ({
    ...keymap,
    WrapInOrderedList: { ...keymap.WrapInOrderedList, shortcuts: shortcuts.orderedList }
  }));
  ctx.update(blockquoteKeymap.key, (keymap) => ({
    ...keymap,
    WrapInBlockquote: { ...keymap.WrapInBlockquote, shortcuts: shortcuts.blockquote }
  }));
  ctx.update(codeBlockKeymap.key, (keymap) => ({
    ...keymap,
    CreateCodeBlock: { ...keymap.CreateCodeBlock, shortcuts: shortcuts.codeBlock }
  }));
  ctx.update(inlineCodeKeymap.key, (keymap) => ({
    ...keymap,
    ToggleInlineCode: { ...keymap.ToggleInlineCode, shortcuts: shortcuts.inlineCode }
  }));
};

/**
 * 创建当前模式的任务列表块转换快捷键。
 */
export const createTaskListTransformKeymap = (shortcutMode: EditorShortcutMode) => {
  // 当前模式的任务列表快捷键。
  const shortcut = resolveSlashMenuShortcutMap(shortcutMode).taskList;
  return $useKeymap('taskListTransform', {
    WrapInTaskList: {
      shortcuts: shortcut,
      /**
       * 创建任务列表块转换命令。
       */
      command: () => (_state, _dispatch, view) => {
        if (!view) {
          return false;
        }

        return runBlockTransformCommand(view, 'taskList');
      }
    }
  });
};
