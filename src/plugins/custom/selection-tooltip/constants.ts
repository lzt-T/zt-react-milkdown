import { Bold, Code2, Italic, Link2, Strikethrough } from 'lucide-react';
import type { SelectionTooltipItem } from './types';

// 选区 tooltip 插件唯一标识。
export const SELECTION_TOOLTIP_ID = 'zt-md-selection-tooltip';

// 选区菜单项固定配置。
export const SELECTION_TOOLTIP_ITEMS: SelectionTooltipItem[] = [
  { command: 'strong', icon: Bold, title: '加粗', markNames: ['strong'] },
  { command: 'em', icon: Italic, title: '斜体', markNames: ['em', 'emphasis'] },
  { command: 'strike', icon: Strikethrough, title: '删除线', markNames: ['strike_through', 'strikeThrough'] },
  { command: 'inlineCode', icon: Code2, title: '行内代码', markNames: ['inlineCode', 'code_inline'] },
  { command: 'link', icon: Link2, title: '链接', markNames: ['link'] }
];

// 选区菜单图标尺寸。
export const SELECTION_TOOLTIP_ICON_SIZE = 14;

// 选区菜单图标线宽。
export const SELECTION_TOOLTIP_ICON_STROKE_WIDTH = 2;
