import { createElement, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { EllipsisVertical } from 'lucide-react';
import type { EditorI18nMessages } from '../../types/editor';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { useCloseOnGlobalScroll } from '../../react/hooks/useCloseOnGlobalScroll';

/**
 * 表格更多菜单属性。
 */
interface TableMoreActionsProps {
  /** 编辑器文案。 */
  messages: EditorI18nMessages;
  /** Popover Portal 挂载容器。 */
  portalContainer?: HTMLElement | null;
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

  useCloseOnGlobalScroll(open, () => setOpen(false));

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
   * 阻止 Popover 打开时转移焦点。
   */
  const handleAutoFocus = (event: Event): void => {
    event.preventDefault();
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
    Popover,
    {
      open,
      onOpenChange: handleOpenChange
    },
    createElement(
      PopoverTrigger,
      {
        asChild: true
      },
      createElement(
        'button',
        {
          type: 'button',
          className: 'zt-md-table-action-button',
          'aria-label': props.messages.tableMoreAriaLabel,
          onMouseDown: handleMouseDown
        },
        createElement(EllipsisVertical, {
          size: 14,
          strokeWidth: 2,
          'aria-hidden': 'true'
        })
      )
    ),
    createElement(
      PopoverContent,
      {
        align: 'end',
        sideOffset: 6,
        className: 'zt-md-table-action-popover',
        container: props.portalContainer,
        onOpenAutoFocus: handleAutoFocus,
        onCloseAutoFocus: handleAutoFocus
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
