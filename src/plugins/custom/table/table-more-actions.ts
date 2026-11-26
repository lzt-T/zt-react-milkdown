import { Fragment, createElement, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  EllipsisVertical,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import type { EditorI18nMessages } from '../../../types/editor';
import { Button } from '../../../components/ui/button';
import { FloatingPortalPanel, useFloatingPortalPanel } from '../floating-portal-panel';
import { resolveInsertTableRowBelowShortcutLabel } from '@/plugins/custom/table/table-row-shortcuts';

/**
 * 表格更多菜单项配置。
 */
interface TableMoreActionItem {
  /** 菜单项唯一标识。 */
  key: string;
  /** 展示文案。 */
  label: string;
  /** 右侧快捷键提示文案。 */
  shortcut?: string;
  /** 左侧图标组件。 */
  icon: LucideIcon;
  /** 是否禁用。 */
  disabled?: boolean;
  /** 是否为危险操作。 */
  danger?: boolean;
  /** 点击回调。 */
  onAction: () => void;
}

/**
 * 表格更多菜单属性。
 */
interface TableMoreActionsProps {
  /** 编辑器文案。 */
  messages: EditorI18nMessages;
  /** Popover Portal 挂载容器。 */
  portalContainer?: HTMLElement | null;
  /** Popover 碰撞边界，通常为编辑器滚动容器。 */
  collisionBoundary?: HTMLElement | null;
  /** 是否允许在当前行上方插入行。 */
  canInsertRowAbove: boolean;
  /** 是否允许在当前列附近插入列。 */
  canInsertColumn: boolean;
  /** 是否允许删除当前行。 */
  canDeleteRow: boolean;
  /** 是否允许删除当前列。 */
  canDeleteColumn: boolean;
  /** 插入上方行回调。 */
  onInsertRowAbove: () => void;
  /** 插入下方行回调。 */
  onInsertRowBelow: () => void;
  /** 插入左侧列回调。 */
  onInsertColumnLeft: () => void;
  /** 插入右侧列回调。 */
  onInsertColumnRight: () => void;
  /** 删除当前行回调。 */
  onDeleteRow: () => void;
  /** 删除当前列回调。 */
  onDeleteColumn: () => void;
}

/**
 * 渲染表格更多操作菜单。
 */
export const TableMoreActions = (props: TableMoreActionsProps): ReactElement => {
  /** Popover 展开状态。 */
  const [open, setOpen] = useState(false);
  /** 表格更多菜单浮层定位。 */
  const panel = useFloatingPortalPanel({
    open,
    portalContainer: props.portalContainer,
    editorWrapper: props.collisionBoundary,
    horizontalAlign: 'start',
    offsetY: 10,
    fallbackWidth: 188,
    fallbackHeight: 240,
    onOutside: () => setOpen(false)
  });

  /**
   * 阻止菜单交互抢走编辑器选区。
   */
  const handleMouseDown = (event: ReactMouseEvent): void => {
    event.preventDefault();
  };

  /**
   * 切换菜单展开状态。
   */
  const handleTriggerClick = (): void => {
    if (open) {
      setOpen(false);
      return;
    }

    panel.updatePosition();
    setOpen(true);
  };

  /**
   * 执行菜单动作并关闭浮层。
   */
  const runActionAndClose = (action: () => void): void => {
    action();
    setOpen(false);
  };

  // 行与列插入操作分组。
  const insertItems: TableMoreActionItem[] = [
    {
      key: 'insert-row-above',
      label: props.messages.tableInsertRowAboveLabel,
      icon: ArrowUpToLine,
      disabled: !props.canInsertRowAbove,
      onAction: props.onInsertRowAbove
    },
    {
      key: 'insert-row-below',
      label: props.messages.tableInsertRowBelowLabel,
      shortcut: resolveInsertTableRowBelowShortcutLabel(),
      icon: ArrowDownToLine,
      onAction: props.onInsertRowBelow
    },
    {
      key: 'insert-column-left',
      label: props.messages.tableInsertColumnLeftLabel,
      icon: ArrowLeftToLine,
      disabled: !props.canInsertColumn,
      onAction: props.onInsertColumnLeft
    },
    {
      key: 'insert-column-right',
      label: props.messages.tableInsertColumnRightLabel,
      icon: ArrowRightToLine,
      disabled: !props.canInsertColumn,
      onAction: props.onInsertColumnRight
    }
  ];

  // 行与列删除操作分组。
  const deleteItems: TableMoreActionItem[] = [
    {
      key: 'delete-row',
      label: props.messages.tableDeleteRowLabel,
      icon: Trash2,
      disabled: !props.canDeleteRow,
      danger: true,
      onAction: props.onDeleteRow
    },
    {
      key: 'delete-column',
      label: props.messages.tableDeleteColumnLabel,
      icon: Trash2,
      disabled: !props.canDeleteColumn,
      danger: true,
      onAction: props.onDeleteColumn
    }
  ];

  /**
   * 渲染单条表格操作菜单项。
   */
  const renderMenuItem = (item: TableMoreActionItem): ReactElement => {
    return createElement(
      Button,
      {
        key: item.key,
        type: 'button',
        variant: 'ghost',
        size: 'sm',
        className: item.danger
          ? 'zt-md-table-action-menu-item zt-md-table-action-menu-item-danger disabled:pointer-events-auto disabled:cursor-not-allowed'
          : 'zt-md-table-action-menu-item disabled:pointer-events-auto disabled:cursor-not-allowed',
        disabled: item.disabled,
        onMouseDown: handleMouseDown,
        onClick: () => runActionAndClose(item.onAction)
      },
      createElement(item.icon, {
        size: 14,
        strokeWidth: 1.8,
        className: 'zt-md-table-action-menu-item-icon',
        'aria-hidden': 'true'
      }),
      createElement('span', { className: 'zt-md-table-action-menu-item-label' }, item.label),
      item.shortcut
        ? createElement('kbd', { className: 'zt-md-table-action-menu-item-shortcut' }, item.shortcut)
        : null
    );
  };

  return createElement(
    Fragment,
    null,
    createElement(
      'button',
      {
        ref: panel.triggerRef,
        type: 'button',
        className: 'zt-md-table-action-button',
        'aria-label': props.messages.tableMoreAriaLabel,
        'aria-expanded': open,
        onMouseDown: handleMouseDown,
        onClick: handleTriggerClick
      },
      createElement(EllipsisVertical, {
        size: 15,
        strokeWidth: 2,
        'aria-hidden': 'true'
      })
    ),
    createElement(
      FloatingPortalPanel,
      {
        panel,
        portalContainer: props.portalContainer,
        className: 'zt-md-table-action-popover',
        onMouseDown: handleMouseDown
      },
      createElement(
        'div',
        { className: 'zt-md-table-action-menu-group' },
        ...insertItems.map(renderMenuItem)
      ),
      createElement('div', { className: 'zt-md-table-action-menu-divider', 'aria-hidden': 'true' }),
      createElement(
        'div',
        { className: 'zt-md-table-action-menu-group' },
        ...deleteItems.map(renderMenuItem)
      )
    )
  );
};
