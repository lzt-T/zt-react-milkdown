import type { MarkType } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { Check, ChevronDown, Link2, Trash2 } from 'lucide-react';
import { Fragment, createElement, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { normalizeSafeUrl } from '../../../utils/security';
import { runBlockTransformCommand, resolveCurrentBlockTransformCommand } from '../block-transform';
import { FloatingPortalPanel, useFloatingPortalPanel } from '../floating-portal-panel';
import {
  SELECTION_TOOLTIP_ICON_SIZE,
  SELECTION_TOOLTIP_ICON_STROKE_WIDTH
} from './constants';
import {
  isEditorViewEditable,
  isMarkActive,
  resolveMarkType,
  resolveSelectedLinkHref,
  runSelectionTooltipCommand
} from './mark-logic';
import type { BlockTransformCommand } from '../../../types/editor';
import type { LinkPopoverControlProps, SelectionBlockTransformItem, SelectionTooltipItem } from './types';

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
  items: SelectionTooltipItem[],
  getCurrentView: () => EditorView | null,
  toggleLinkPopover: (view: EditorView) => void,
  blockTransformControlHost: HTMLElement,
  iconRoots: Root[]
): HTMLDivElement => {
  // 菜单容器节点。
  const tooltip = document.createElement('div');
  tooltip.className = 'zt-md-selection-tooltip';
  tooltip.append(blockTransformControlHost);

  items.forEach((item) => {
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
 * 块级转换 Popover 控件属性。
 */
interface BlockTransformPopoverControlProps {
  /** 编辑器视图读取函数。 */
  getCurrentView: () => EditorView | null;
  /** Popover Portal 挂载容器。 */
  portalContainer: HTMLElement;
  /** Popover 碰撞边界，通常为编辑器滚动容器。 */
  collisionBoundary: HTMLElement | null;
  /** 图标尺寸。 */
  iconSize: number;
  /** 图标线宽。 */
  iconStrokeWidth: number;
  /** 转换菜单标题。 */
  menuTitle: string;
  /** 转换菜单项。 */
  items: SelectionBlockTransformItem[];
  /** 当前按钮文案。 */
  activeLabel: string;
  /** 弹层展开状态。 */
  open: boolean;
  /** 开关回调。 */
  onOpenChange: (nextOpen: boolean) => void;
  /** 当前激活命令集合。 */
  activeCommands: ReadonlySet<BlockTransformCommand>;
}

/**
 * 块级转换 Popover 控件。
 */
export const BlockTransformPopoverControl = (props: BlockTransformPopoverControlProps): ReactElement => {
  /** 块级转换菜单浮层定位。 */
  const panel = useFloatingPortalPanel({
    open: props.open,
    portalContainer: props.portalContainer,
    editorWrapper: props.collisionBoundary,
    offsetY: 8,
    fallbackWidth: 176,
    fallbackHeight: 360,
    onOutside: () => props.onOpenChange(false)
  });

  /**
   * 阻止交互破坏当前选区。
   */
  const preventMouseDown = (event: ReactMouseEvent): void => {
    event.preventDefault();
  };

  /**
   * 执行块级转换命令。
   */
  const applyBlockTransform = (command: BlockTransformCommand): void => {
    // 当前编辑器视图。
    const view = props.getCurrentView();
    if (!view || view.state.selection.empty) {
      props.onOpenChange(false);
      return;
    }

    void runBlockTransformCommand(view, command).then(() => {
      props.onOpenChange(false);
      view.focus();
    });
  };

  /**
   * 切换块级转换菜单展开状态。
   */
  const toggleBlockTransformPopover = (): void => {
    if (props.open) {
      props.onOpenChange(false);
      return;
    }

    panel.updatePosition();
    props.onOpenChange(true);
  };

  return createElement(
    Fragment,
    null,
    createElement(
      'button',
      {
        ref: panel.triggerRef,
        type: 'button',
        className: 'zt-md-selection-transform-trigger',
        'aria-label': props.menuTitle,
        'aria-expanded': props.open,
        title: props.menuTitle,
        onMouseDown: preventMouseDown,
        onClick: toggleBlockTransformPopover
      },
      createElement('span', { className: 'zt-md-selection-transform-trigger-label' }, props.activeLabel),
      createElement(ChevronDown, { size: props.iconSize, strokeWidth: props.iconStrokeWidth, 'aria-hidden': 'true' })
    ),
    createElement(
      FloatingPortalPanel,
      {
        panel,
        portalContainer: props.portalContainer,
        className: 'zt-md-selection-transform-popover !w-[176px] p-1',
        onMouseDown: preventMouseDown
      },
      createElement('p', { className: 'zt-md-selection-transform-popover-title' }, props.menuTitle),
      createElement(
        'div',
        { className: 'zt-md-selection-transform-popover-list' },
        ...props.items.map((item) => {
          const isActive = props.activeCommands.has(item.command);
          return createElement(
            'button',
            {
              key: item.command,
              type: 'button',
              className: 'zt-md-selection-transform-item',
              'data-active': isActive ? 'true' : 'false',
              onMouseDown: preventMouseDown,
              onClick: () => applyBlockTransform(item.command)
            },
            createElement(item.icon, {
              size: props.iconSize,
              strokeWidth: props.iconStrokeWidth,
              className: 'zt-md-selection-transform-item-icon',
              'aria-hidden': 'true'
            }),
            createElement('span', { className: 'zt-md-selection-transform-item-label' }, item.label)
          );
        })
      )
    )
  );
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

    // 归一化后的安全链接地址。
    const safeHref = normalizeSafeUrl(href);
    // 当前选区范围。
    const { from, to } = view.state.selection;
    // 链接更新事务。
    const transaction = view.state.tr.removeMark(from, to, linkType);
    if (safeHref) {
      transaction.addMark(from, to, linkType.create({ href: safeHref }));
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

    setInputValue(normalizeSafeUrl(resolveSelectedLinkHref(view.state, linkType)));
    props.onOpenChange(true);
  };

  /** 链接编辑面板浮层定位。 */
  const panel = useFloatingPortalPanel({
    open: props.open,
    portalContainer: props.portalContainer,
    editorWrapper: props.collisionBoundary,
    horizontalAlign: 'center',
    offsetY: 8,
    fallbackWidth: 266,
    fallbackHeight: 48,
    onOutside: () => handleOpenChange(false)
  });

  /**
   * 同步链接按钮引用。
   */
  const handleTriggerRef = (element: HTMLButtonElement | null): void => {
    panel.triggerRef.current = element;
    props.triggerRef(element);
  };

  /**
   * 切换链接编辑面板展开状态。
   */
  const handleTriggerClick = (): void => {
    if (props.open) {
      handleOpenChange(false);
      return;
    }

    panel.updatePosition();
    handleOpenChange(true);
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
    Fragment,
    null,
    createElement(
      'button',
      {
        ref: handleTriggerRef,
        type: 'button',
        className: 'zt-md-selection-tooltip-button',
        'data-command': 'link',
        title: props.messages.selectionTooltipLinkTitle,
        'aria-label': props.messages.selectionTooltipLinkTitle,
        'aria-expanded': props.open,
        onMouseDown: preventMouseDown,
        onClick: handleTriggerClick
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
    ),
    createElement(
      FloatingPortalPanel,
      {
        panel,
        portalContainer: props.portalContainer,
        className: 'zt-md-selection-link-popover w-fit min-w-0 gap-0 p-2'
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
          placeholder: props.messages.selectionLinkInputPlaceholder,
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
          'button',
          {
            type: 'button',
            className: 'zt-md-selection-link-popover-action',
            onMouseDown: preventMouseDown,
            onClick: () => commitLink(inputValue.trim()),
            'aria-label': props.messages.selectionLinkSaveAriaLabel
          },
          createElement(Check, {
            size: props.iconSize,
            strokeWidth: props.iconStrokeWidth
          })
        ),
        createElement(
          'button',
          {
            type: 'button',
            className: 'zt-md-selection-link-popover-action zt-md-selection-link-popover-action-danger',
            onMouseDown: preventMouseDown,
            onClick: () => commitLink(''),
            'aria-label': props.messages.selectionLinkRemoveAriaLabel
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
export const updateSelectionTooltipActiveState = (
  tooltip: HTMLElement,
  view: EditorView,
  items: SelectionTooltipItem[]
): void => {
  items.forEach((item) => {
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
 * 判断当前选区是否涉及代码块节点。
 */
const hasCodeBlockInSelection = (view: EditorView): boolean => {
  // 当前选区范围。
  const { from, to } = view.state.selection;
  // 是否命中代码块节点。
  let matchedCodeBlock = false;

  view.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name !== 'code_block') {
      return true;
    }

    matchedCodeBlock = true;
    return false;
  });

  return matchedCodeBlock;
};

/**
 * 创建 tooltip 展示判断函数。
 */
export const createSelectionTooltipShouldShow = (
  tooltip: HTMLElement,
  isPinned: () => boolean,
  isBlockTransformOpen: () => boolean
): ((view: EditorView) => boolean) => {
  /**
   * 判断 tooltip 是否应该展示。
   */
  return (view: EditorView): boolean => {
    // 当前选区。
    const { selection, doc } = view.state;
    // 当前焦点是否位于菜单内。
    const isTooltipFocused = tooltip.contains(document.activeElement);
    if (!isEditorViewEditable(view) || selection.empty || !(selection instanceof TextSelection)) {
      return false;
    }

    if (!view.hasFocus() && !isTooltipFocused && !isPinned() && !isBlockTransformOpen()) {
      return false;
    }

    if (hasCodeBlockInSelection(view)) {
      return false;
    }

    return tooltip.childElementCount > 0 && doc.textBetween(selection.from, selection.to).trim().length > 0;
  };
};
