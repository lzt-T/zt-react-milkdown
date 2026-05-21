import type { MarkType } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { Check, Link2, Trash2 } from 'lucide-react';
import { createElement, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '../../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { useCloseOnGlobalScroll } from '../../../react/hooks/useCloseOnGlobalScroll';
import {
  SELECTION_TOOLTIP_ICON_SIZE,
  SELECTION_TOOLTIP_ICON_STROKE_WIDTH,
  SELECTION_TOOLTIP_ITEMS
} from './constants';
import {
  isEditorViewEditable,
  isMarkActive,
  resolveMarkType,
  resolveSelectedLinkHref,
  runSelectionTooltipCommand
} from './mark-logic';
import type { LinkPopoverControlProps, SelectionTooltipItem } from './types';

/**
 * 创建选区菜单按钮。
 */
const createSelectionTooltipButton = (
  item: SelectionTooltipItem,
  markType: MarkType,
  getCurrentView: () => EditorView | null,
  toggleLinkPopover: (view: EditorView) => void,
  iconRoots: Root[]
): HTMLButtonElement => {
  // 菜单按钮节点。
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zt-md-selection-tooltip-button';
  button.dataset.command = item.command;
  button.title = item.title;
  button.setAttribute('aria-label', item.title);
  // 按钮图标容器节点。
  const iconNode = document.createElement('span');
  iconNode.className = 'zt-md-selection-tooltip-button-icon';
  // 图标渲染根节点。
  const iconRoot = createRoot(iconNode);
  iconRoot.render(
    createElement(item.icon, {
      size: SELECTION_TOOLTIP_ICON_SIZE,
      strokeWidth: SELECTION_TOOLTIP_ICON_STROKE_WIDTH
    })
  );
  iconRoots.push(iconRoot);
  button.append(iconNode);
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    // 当前编辑器视图。
    const currentView = getCurrentView();
    if (!currentView || currentView.state.selection.empty) {
      return;
    }

    runSelectionTooltipCommand(item.command, {
      view: currentView,
      markType,
      toggleLinkPopover
    });
  });

  return button;
};

/**
 * 创建选区菜单 DOM。
 */
export const createSelectionTooltipElement = (
  view: EditorView,
  getCurrentView: () => EditorView | null,
  toggleLinkPopover: (view: EditorView) => void,
  iconRoots: Root[]
): HTMLDivElement => {
  // 菜单容器节点。
  const tooltip = document.createElement('div');
  tooltip.className = 'zt-md-selection-tooltip';

  SELECTION_TOOLTIP_ITEMS.forEach((item) => {
    // 当前菜单项 mark 类型。
    const markType = resolveMarkType(view, item.markNames);
    if (!markType) {
      return;
    }

    if (item.command === 'link') {
      return;
    }

    tooltip.append(createSelectionTooltipButton(item, markType, getCurrentView, toggleLinkPopover, iconRoots));
  });

  return tooltip;
};

/**
 * 链接编辑 Popover 控件。
 */
export const LinkPopoverControl = (props: LinkPopoverControlProps): ReactElement => {
  /** 当前链接输入值。 */
  const [inputValue, setInputValue] = useState('');
  /** 链接输入框引用。 */
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 滚动时关闭链接 Popover。
   */
  const handleCloseOnScroll = (): void => {
    props.onOpenChange(false);
  };

  useCloseOnGlobalScroll(props.open, handleCloseOnScroll);

  /**
   * 阻止交互时破坏当前选区。
   */
  const preventMouseDown = (event: ReactMouseEvent): void => {
    event.preventDefault();
  };

  /**
   * 提交链接修改。
   */
  const commitLink = (href: string): void => {
    // 当前编辑器视图。
    const view = props.getCurrentView();
    if (!view || view.state.selection.empty) {
      props.onOpenChange(false);
      return;
    }

    // 链接 mark 类型。
    const linkType = resolveMarkType(view, ['link']);
    if (!linkType) {
      props.onOpenChange(false);
      return;
    }

    // 当前选区范围。
    const { from, to } = view.state.selection;
    // 链接更新事务。
    const transaction = view.state.tr.removeMark(from, to, linkType);
    if (href) {
      transaction.addMark(from, to, linkType.create({ href }));
    }

    view.dispatch(transaction.scrollIntoView());
    props.onOpenChange(false);
    view.focus();
  };

  /**
   * 处理 Popover 开关，打开时回填当前链接值。
   */
  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      props.onOpenChange(false);
      return;
    }

    // 当前编辑器视图。
    const view = props.getCurrentView();
    // 链接 mark 类型。
    const linkType = view ? resolveMarkType(view, ['link']) : null;
    if (!view || !linkType || view.state.selection.empty) {
      props.onOpenChange(false);
      return;
    }

    setInputValue(resolveSelectedLinkHref(view.state, linkType));
    props.onOpenChange(true);
  };

  useEffect(() => {
    if (!props.open) {
      return;
    }

    // 当前编辑器视图。
    const view = props.getCurrentView();
    // 链接 mark 类型。
    const linkType = view ? resolveMarkType(view, ['link']) : null;
    if (!view || !linkType || view.state.selection.empty) {
      props.onOpenChange(false);
    }
  }, [props.open, props.getCurrentView, props.onOpenChange]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    inputRef.current?.focus();
  }, [props.open]);

  return createElement(
    Popover,
    {
      open: props.open,
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
          ref: props.triggerRef,
          type: 'button',
          className: 'zt-md-selection-tooltip-button',
          'data-command': 'link',
          title: '链接',
          'aria-label': '链接',
          onMouseDown: preventMouseDown
        },
        createElement(
          'span',
          {
            className: 'zt-md-selection-tooltip-button-icon'
          },
          createElement(Link2, {
            size: props.iconSize,
            strokeWidth: props.iconStrokeWidth
          })
        )
      )
    ),
    createElement(
      PopoverContent,
      {
        container: props.portalContainer,
        align: 'center',
        sideOffset: 8,
        className: 'zt-md-selection-link-popover w-fit min-w-0 gap-0 p-2',
        onOpenAutoFocus: (event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        },
        onCloseAutoFocus: (event) => event.preventDefault()
      },
      createElement(
        'div',
        {
          className: 'zt-md-selection-link-popover-row'
        },
        createElement('input', {
          ref: inputRef,
          type: 'text',
          value: inputValue,
          placeholder: '输入或粘贴链接',
          className: 'zt-md-selection-link-popover-input',
          onChange: (event) => setInputValue(event.currentTarget.value),
          onKeyDown: (event) => {
            if (event.key !== 'Enter') {
              return;
            }

            event.preventDefault();
            commitLink(inputValue.trim());
          }
        }),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'icon-sm',
            className:
              'zt-md-selection-link-popover-action cursor-pointer bg-transparent hover:bg-transparent focus-visible:ring-0',
            onMouseDown: preventMouseDown,
            onClick: () => commitLink(inputValue.trim()),
            'aria-label': '保存链接'
          },
          createElement(Check, {
            size: props.iconSize,
            strokeWidth: props.iconStrokeWidth
          })
        ),
        createElement(
          Button,
          {
            type: 'button',
            variant: 'ghost',
            size: 'icon-sm',
            className:
              'zt-md-selection-link-popover-action cursor-pointer bg-transparent hover:bg-transparent focus-visible:ring-0',
            onMouseDown: preventMouseDown,
            onClick: () => commitLink(''),
            'aria-label': '移除链接'
          },
          createElement(Trash2, {
            size: props.iconSize,
            strokeWidth: props.iconStrokeWidth
          })
        )
      )
    )
  );
};

/**
 * 刷新菜单按钮激活态。
 */
export const updateSelectionTooltipActiveState = (tooltip: HTMLElement, view: EditorView): void => {
  SELECTION_TOOLTIP_ITEMS.forEach((item) => {
    // 当前菜单项 mark 类型。
    const markType = resolveMarkType(view, item.markNames);
    if (!markType) {
      return;
    }

    // 当前按钮节点。
    const button = tooltip.querySelector(`[data-command="${item.command}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.dataset.active = isMarkActive(view.state, markType) ? 'true' : 'false';
  });
};

/**
 * 创建 tooltip 展示判断函数。
 */
export const createSelectionTooltipShouldShow = (
  tooltip: HTMLElement,
  isPinned: () => boolean
): ((view: EditorView) => boolean) => {
  /**
   * 判断 tooltip 是否应该展示。
   */
  return (view: EditorView): boolean => {
    // 当前选区。
    const { selection, doc } = view.state;
    // 当前焦点是否位于菜单内。
    const isTooltipFocused = tooltip.contains(document.activeElement);
    if (!isEditorViewEditable(view) || selection.empty) {
      return false;
    }

    if (!view.hasFocus() && !isTooltipFocused && !isPinned()) {
      return false;
    }

    return tooltip.childElementCount > 0 && doc.textBetween(selection.from, selection.to).trim().length > 0;
  };
};
