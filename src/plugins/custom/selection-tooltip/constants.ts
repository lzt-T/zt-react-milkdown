import { Bold, Code2, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Italic, Link2, List, ListChecks, ListOrdered, Strikethrough, TextQuote, Type, type LucideIcon } from 'lucide-react';
import type { BlockTransformCommand, EditorI18nMessages } from '../../../types/editor';
import type { SelectionBlockTransformItem, SelectionTooltipItem } from './types';

// 选区 tooltip 插件唯一标识。
export const SELECTION_TOOLTIP_ID = 'zt-md-selection-tooltip';

// 构建当前语言下的选区菜单项配置。
export const resolveSelectionTooltipItems = (messages: EditorI18nMessages): SelectionTooltipItem[] => {
  return [
    { command: 'strong', icon: Bold, title: messages.selectionTooltipStrongTitle, markNames: ['strong'] },
    { command: 'em', icon: Italic, title: messages.selectionTooltipEmTitle, markNames: ['em', 'emphasis'] },
    {
      command: 'strike',
      icon: Strikethrough,
      title: messages.selectionTooltipStrikeTitle,
      markNames: ['strike_through', 'strikeThrough']
    },
    {
      command: 'inlineCode',
      icon: Code2,
      title: messages.selectionTooltipInlineCodeTitle,
      markNames: ['inlineCode', 'code_inline']
    },
    { command: 'link', icon: Link2, title: messages.selectionTooltipLinkTitle, markNames: ['link'] }
  ];
};

/**
 * 块级转换命令图标映射表。
 */
const BLOCK_TRANSFORM_ICON_MAP: Record<BlockTransformCommand, LucideIcon> = {
  paragraph: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  heading4: Heading4,
  heading5: Heading5,
  heading6: Heading6,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListChecks,
  blockquote: TextQuote,
  codeBlock: Code2
};

/**
 * 构建块级转换菜单项配置。
 */
export const resolveSelectionBlockTransformItems = (messages: EditorI18nMessages): SelectionBlockTransformItem[] => {
  return [
    { command: 'paragraph', icon: BLOCK_TRANSFORM_ICON_MAP.paragraph, label: messages.selectionTooltipTransformParagraphLabel },
    { command: 'heading1', icon: BLOCK_TRANSFORM_ICON_MAP.heading1, label: messages.selectionTooltipTransformHeading1Label },
    { command: 'heading2', icon: BLOCK_TRANSFORM_ICON_MAP.heading2, label: messages.selectionTooltipTransformHeading2Label },
    { command: 'heading3', icon: BLOCK_TRANSFORM_ICON_MAP.heading3, label: messages.selectionTooltipTransformHeading3Label },
    { command: 'heading4', icon: BLOCK_TRANSFORM_ICON_MAP.heading4, label: messages.selectionTooltipTransformHeading4Label },
    { command: 'heading5', icon: BLOCK_TRANSFORM_ICON_MAP.heading5, label: messages.selectionTooltipTransformHeading5Label },
    { command: 'heading6', icon: BLOCK_TRANSFORM_ICON_MAP.heading6, label: messages.selectionTooltipTransformHeading6Label },
    {
      command: 'bulletList',
      icon: BLOCK_TRANSFORM_ICON_MAP.bulletList,
      label: messages.selectionTooltipTransformBulletListLabel
    },
    {
      command: 'orderedList',
      icon: BLOCK_TRANSFORM_ICON_MAP.orderedList,
      label: messages.selectionTooltipTransformOrderedListLabel
    },
    { command: 'taskList', icon: BLOCK_TRANSFORM_ICON_MAP.taskList, label: messages.selectionTooltipTransformTaskListLabel },
    {
      command: 'blockquote',
      icon: BLOCK_TRANSFORM_ICON_MAP.blockquote,
      label: messages.selectionTooltipTransformBlockquoteLabel
    },
    {
      command: 'codeBlock',
      icon: BLOCK_TRANSFORM_ICON_MAP.codeBlock,
      label: messages.selectionTooltipTransformCodeBlockLabel
    }
  ];
};

// 选区菜单图标尺寸。
export const SELECTION_TOOLTIP_ICON_SIZE = 14;

// 选区菜单图标线宽。
export const SELECTION_TOOLTIP_ICON_STROKE_WIDTH = 2;
