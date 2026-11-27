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
import type { Command } from '@milkdown/prose/state';
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
 * 生成调用统一块级转换逻辑的 keymap 命令。
 */
const createBlockTransformKeymapCommand = (
  command: BlockTransformCommand
): (() => Command) => {
  return () => (_state, _dispatch, view) => {
    if (!view) {
      return false;
    }

    return runBlockTransformCommand(view, command);
  };
};

/**
 * 清空 CommonMark 内置块转换快捷键并更新行内代码快捷键（块级转换由自定义 keymap 统一承载）。
 */
export const configureBlockTransformShortcuts = (
  ctx: Ctx,
  shortcutMode: EditorShortcutMode
): void => {
  // 当前平台完整快捷键映射。
  const shortcuts = resolveSlashMenuShortcutMap(shortcutMode);

  ctx.update(paragraphKeymap.key, (keymap) => ({
    ...keymap,
    TurnIntoText: { ...keymap.TurnIntoText, shortcuts: [] }
  }));
  ctx.update(headingKeymap.key, (keymap) => ({
    ...keymap,
    TurnIntoH1: { ...keymap.TurnIntoH1, shortcuts: [] },
    TurnIntoH2: { ...keymap.TurnIntoH2, shortcuts: [] },
    TurnIntoH3: { ...keymap.TurnIntoH3, shortcuts: [] },
    TurnIntoH4: { ...keymap.TurnIntoH4, shortcuts: [] },
    TurnIntoH5: { ...keymap.TurnIntoH5, shortcuts: [] },
    TurnIntoH6: { ...keymap.TurnIntoH6, shortcuts: [] }
  }));
  ctx.update(bulletListKeymap.key, (keymap) => ({
    ...keymap,
    WrapInBulletList: { ...keymap.WrapInBulletList, shortcuts: [] }
  }));
  ctx.update(orderedListKeymap.key, (keymap) => ({
    ...keymap,
    WrapInOrderedList: { ...keymap.WrapInOrderedList, shortcuts: [] }
  }));
  ctx.update(blockquoteKeymap.key, (keymap) => ({
    ...keymap,
    WrapInBlockquote: { ...keymap.WrapInBlockquote, shortcuts: [] }
  }));
  ctx.update(codeBlockKeymap.key, (keymap) => ({
    ...keymap,
    CreateCodeBlock: { ...keymap.CreateCodeBlock, shortcuts: [] }
  }));
  ctx.update(inlineCodeKeymap.key, (keymap) => ({
    ...keymap,
    ToggleInlineCode: { ...keymap.ToggleInlineCode, shortcuts: shortcuts.inlineCode }
  }));
};

/**
 * 创建当前模式的全部块级转换快捷键（含任务列表、段落、标题、列表、引用与代码块）。
 */
export const createTaskListTransformKeymap = (shortcutMode: EditorShortcutMode) => {
  // 当前模式的块级转换快捷键映射。
  const shortcuts = resolveBlockTransformShortcutMap(shortcutMode);
  return $useKeymap('blockTransform', {
    TurnIntoText: {
      shortcuts: shortcuts.paragraph,
      command: createBlockTransformKeymapCommand('paragraph')
    },
    TurnIntoH1: {
      shortcuts: shortcuts.heading1,
      command: createBlockTransformKeymapCommand('heading1')
    },
    TurnIntoH2: {
      shortcuts: shortcuts.heading2,
      command: createBlockTransformKeymapCommand('heading2')
    },
    TurnIntoH3: {
      shortcuts: shortcuts.heading3,
      command: createBlockTransformKeymapCommand('heading3')
    },
    TurnIntoH4: {
      shortcuts: shortcuts.heading4,
      command: createBlockTransformKeymapCommand('heading4')
    },
    TurnIntoH5: {
      shortcuts: shortcuts.heading5,
      command: createBlockTransformKeymapCommand('heading5')
    },
    TurnIntoH6: {
      shortcuts: shortcuts.heading6,
      command: createBlockTransformKeymapCommand('heading6')
    },
    WrapInBulletList: {
      shortcuts: shortcuts.bulletList,
      command: createBlockTransformKeymapCommand('bulletList')
    },
    WrapInOrderedList: {
      shortcuts: shortcuts.orderedList,
      command: createBlockTransformKeymapCommand('orderedList')
    },
    WrapInTaskList: {
      shortcuts: shortcuts.taskList,
      command: createBlockTransformKeymapCommand('taskList')
    },
    WrapInBlockquote: {
      shortcuts: shortcuts.blockquote,
      command: createBlockTransformKeymapCommand('blockquote')
    },
    CreateCodeBlock: {
      shortcuts: shortcuts.codeBlock,
      command: createBlockTransformKeymapCommand('codeBlock')
    }
  });
};
