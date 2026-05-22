import { Bold, Code2, Italic, Link2, Strikethrough } from 'lucide-react';
import type { EditorI18nMessages } from '../../../types/editor';
import type { SelectionTooltipItem } from './types';

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

// 选区菜单图标尺寸。
export const SELECTION_TOOLTIP_ICON_SIZE = 14;

// 选区菜单图标线宽。
export const SELECTION_TOOLTIP_ICON_STROKE_WIDTH = 2;
