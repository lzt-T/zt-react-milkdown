import { Fragment, createElement, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { EllipsisVertical } from 'lucide-react';
import type { EditorI18nMessages } from '../../../types/editor';
import { Button } from '../../../components/ui/button';
import { FloatingPortalPanel, useFloatingPortalPanel } from '../floating-portal-panel';

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
    horizontalAlign: 'end',
    offsetY: 6,
    fallbackWidth: 168,
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
  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
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
    handleOpenChange(true);
  };

  /**
   * 执行上方插入行并关闭菜单。
   */
  const handleInsertRowAbove = (): void => {
    props.onInsertRowAbove();
    setOpen(false);
  };

  /**
   * 执行下方插入行并关闭菜单。
   */
  const handleInsertRowBelow = (): void => {
    props.onInsertRowBelow();
    setOpen(false);
  };

  /**
   * 执行左侧插入列并关闭菜单。
   */
  const handleInsertColumnLeft = (): void => {
    props.onInsertColumnLeft();
    setOpen(false);
  };

  /**
   * 执行右侧插入列并关闭菜单。
   */
  const handleInsertColumnRight = (): void => {
    props.onInsertColumnRight();
    setOpen(false);
  };

  /**
   * 执行删除当前行并关闭菜单。
   */
  const handleDeleteRow = (): void => {
    props.onDeleteRow();
    setOpen(false);
  };

  /**
   * 执行删除当前列并关闭菜单。
   */
  const handleDeleteColumn = (): void => {
    props.onDeleteColumn();
    setOpen(false);
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
        size: 14,
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
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className:
              'zt-md-table-action-menu-item disabled:pointer-events-auto disabled:cursor-not-allowed',
            disabled: !props.canInsertRowAbove,
            onMouseDown: handleMouseDown,
            onClick: handleInsertRowAbove
          },
          props.messages.tableInsertRowAboveLabel
        ),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className:
              'zt-md-table-action-menu-item disabled:pointer-events-auto disabled:cursor-not-allowed',
            onMouseDown: handleMouseDown,
            onClick: handleInsertRowBelow
          },
          props.messages.tableInsertRowBelowLabel
        ),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className:
              'zt-md-table-action-menu-item disabled:pointer-events-auto disabled:cursor-not-allowed',
            disabled: !props.canInsertColumn,
            onMouseDown: handleMouseDown,
            onClick: handleInsertColumnLeft
          },
          props.messages.tableInsertColumnLeftLabel
        ),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className:
              'zt-md-table-action-menu-item disabled:pointer-events-auto disabled:cursor-not-allowed',
            disabled: !props.canInsertColumn,
            onMouseDown: handleMouseDown,
            onClick: handleInsertColumnRight
          },
          props.messages.tableInsertColumnRightLabel
        )
      ),
      createElement('div', { className: 'zt-md-table-action-menu-divider', 'aria-hidden': 'true' }),
      createElement(
        'div',
        { className: 'zt-md-table-action-menu-group' },
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className:
              'zt-md-table-action-menu-item zt-md-table-action-menu-item-danger disabled:pointer-events-auto disabled:cursor-not-allowed',
            disabled: !props.canDeleteRow,
            onMouseDown: handleMouseDown,
            onClick: handleDeleteRow
          },
          props.messages.tableDeleteRowLabel
        ),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'sm',
            className:
              'zt-md-table-action-menu-item zt-md-table-action-menu-item-danger disabled:pointer-events-auto disabled:cursor-not-allowed',
            disabled: !props.canDeleteColumn,
            onMouseDown: handleMouseDown,
            onClick: handleDeleteColumn
          },
          props.messages.tableDeleteColumnLabel
        )
      )
    )
  );
};

