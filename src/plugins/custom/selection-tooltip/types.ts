import type { MarkType } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import type { Bold } from 'lucide-react';
import type { EditorI18nMessages } from '../../../types/editor';

/**
 * 选区菜单图标组件类型。
 */
export type SelectionTooltipIcon = typeof Bold;

/**
 * 选区菜单命令键名。
 */
export type SelectionTooltipCommand = 'strong' | 'em' | 'strike' | 'inlineCode' | 'link';

/**
 * 选区菜单项配置。
 */
export interface SelectionTooltipItem {
  /** 命令键名。 */
  command: SelectionTooltipCommand;
  /** 按钮图标组件。 */
  icon: SelectionTooltipIcon;
  /** 无障碍标题。 */
  title: string;
  /** schema mark 候选名。 */
  markNames: string[];
}

/**
 * mark 命令上下文。
 */
export interface MarkCommandContext {
  /** 编辑器视图。 */
  view: EditorView;
  /** mark 类型。 */
  markType: MarkType;
  /** 切换链接编辑器展开状态。 */
  toggleLinkPopover: (view: EditorView) => void;
}

/**
 * 链接编辑 Popover 组件属性。
 */
export interface LinkPopoverControlProps {
  /** 编辑器视图引用读取函数。 */
  getCurrentView: () => EditorView | null;
  /** Popover Portal 挂载容器。 */
  portalContainer: HTMLElement;
  /** 链接按钮图标尺寸。 */
  iconSize: number;
  /** 链接按钮图标线宽。 */
  iconStrokeWidth: number;
  /** 触发器按钮元素引用。 */
  triggerRef: (element: HTMLButtonElement | null) => void;
  /** 链接弹层展开状态。 */
  open: boolean;
  /** 链接弹层开关回调。 */
  onOpenChange: (nextOpen: boolean) => void;
  /** 编辑器文案。 */
  messages: EditorI18nMessages;
}
