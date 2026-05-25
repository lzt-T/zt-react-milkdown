import { TooltipProvider } from '@milkdown/plugin-tooltip';
import { Plugin, PluginKey, type PluginView } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BlockTransformCommand, EditorI18nMessages } from '../../../types/editor';
import {
  SELECTION_TOOLTIP_ICON_SIZE,
  SELECTION_TOOLTIP_ICON_STROKE_WIDTH,
  SELECTION_TOOLTIP_ID,
  resolveSelectionBlockTransformItems,
  resolveSelectionTooltipItems
} from './constants';
import { resolveActiveBlockTransformCommands, resolveCurrentBlockTransformCommand } from '../block-transform';
import { isMarkActive, resolveMarkType } from './mark-logic';
import {
  BlockTransformPopoverControl,
  createSelectionTooltipElement,
  createSelectionTooltipShouldShow,
  LinkPopoverControl,
  updateSelectionTooltipActiveState
} from './tooltip-view';

/**
 * 创建选区 tooltip 插件视图。
 */
const createSelectionTooltipPluginView = (
  view: EditorView,
  portalContainer: HTMLElement,
  messages: EditorI18nMessages
): PluginView => {
  // 当前语言下的选区菜单项。
  const items = resolveSelectionTooltipItems(messages);
  // 当前语言下的块级转换菜单项。
  const blockTransformItems = resolveSelectionBlockTransformItems(messages);
  // 当前编辑器视图引用。
  let currentView: EditorView | null = view;
  // 链接 Popover 展开状态。
  let isLinkPopoverOpen = false;
  // 块级转换 Popover 展开状态。
  let isBlockTransformPopoverOpen = false;
  // 图标渲染根节点集合。
  const iconRoots: Root[] = [];
  // 块级转换按钮 React 挂载容器。
  const blockTransformControlHost = document.createElement('span');
  // 块级转换按钮 React 根节点。
  const blockTransformControlRoot = createRoot(blockTransformControlHost);
  // 链接按钮 React 挂载容器。
  const linkControlHost = document.createElement('span');
  // 链接按钮 DOM 引用。
  let linkTriggerButton: HTMLButtonElement | null = null;
  // 链接按钮 React 根节点。
  const linkControlRoot = createRoot(linkControlHost);

  /**
   * 控制链接 Popover 展开状态。
   */
  const setLinkPopoverOpen = (nextOpen: boolean): void => {
    if (isLinkPopoverOpen === nextOpen) {
      return;
    }

    isLinkPopoverOpen = nextOpen;
    renderLinkControl();
  };

  /**
   * 控制块级转换 Popover 展开状态。
   */
  const setBlockTransformPopoverOpen = (nextOpen: boolean): void => {
    if (isBlockTransformPopoverOpen === nextOpen) {
      return;
    }

    isBlockTransformPopoverOpen = nextOpen;
    renderBlockTransformControl();
  };

  /**
   * 触发链接 Popover 开关。
   */
  const toggleLinkPopover = (nextView: EditorView): void => {
    if (nextView.state.selection.empty) {
      return;
    }

    setLinkPopoverOpen(!isLinkPopoverOpen);
  };

  /**
   * 渲染块级转换控件。
   */
  const renderBlockTransformControl = (): void => {
    // 当前激活的块级命令集合。
    const activeCommands = currentView
      ? resolveActiveBlockTransformCommands(currentView)
      : new Set<BlockTransformCommand>(['paragraph']);
    // 当前激活的块级命令。
    const activeCommand = currentView ? resolveCurrentBlockTransformCommand(currentView) : 'paragraph';
    // 当前激活命令菜单项。
    const activeItem = blockTransformItems.find((item) => item.command === activeCommand) ?? blockTransformItems[0];
    blockTransformControlRoot.render(
      createElement(BlockTransformPopoverControl, {
        getCurrentView: () => currentView,
        portalContainer,
        iconSize: SELECTION_TOOLTIP_ICON_SIZE,
        iconStrokeWidth: SELECTION_TOOLTIP_ICON_STROKE_WIDTH,
        menuTitle: messages.selectionTooltipTransformLabel,
        items: blockTransformItems,
        activeLabel: activeItem?.label ?? messages.selectionTooltipTransformParagraphLabel,
        open: isBlockTransformPopoverOpen,
        onOpenChange: setBlockTransformPopoverOpen,
        activeCommands
      })
    );
  };

  /**
   * 渲染链接 Popover 控件。
   */
  const renderLinkControl = (): void => {
    linkControlRoot.render(
      createElement(LinkPopoverControl, {
        getCurrentView: () => currentView,
        portalContainer,
        iconSize: SELECTION_TOOLTIP_ICON_SIZE,
        iconStrokeWidth: SELECTION_TOOLTIP_ICON_STROKE_WIDTH,
        triggerRef: (element: HTMLButtonElement | null) => {
          linkTriggerButton = element;
        },
        open: isLinkPopoverOpen,
        onOpenChange: setLinkPopoverOpen,
        messages
      })
    );
  };

  // 选区菜单 DOM。
  const tooltip = createSelectionTooltipElement(
    view,
    items,
    () => currentView,
    toggleLinkPopover,
    blockTransformControlHost,
    iconRoots
  );
  renderBlockTransformControl();
  if (resolveMarkType(view, ['link'])) {
    tooltip.append(linkControlHost);
    renderLinkControl();
  }
  // tooltip 浮层提供器。
  const provider = new TooltipProvider({
    content: tooltip,
    debounce: 80,
    offset: 8,
    root: portalContainer,
    shouldShow: createSelectionTooltipShouldShow(
      tooltip,
      () => isLinkPopoverOpen,
      () => isBlockTransformPopoverOpen
    ),
    floatingUIOptions: {
      placement: 'top'
    }
  });

  return {
    update: (nextView, previousState) => {
      currentView = nextView as EditorView;
      if (currentView.state.selection.empty) {
        setLinkPopoverOpen(false);
        setBlockTransformPopoverOpen(false);
      }
      updateSelectionTooltipActiveState(tooltip, currentView, items);
      renderBlockTransformControl();
      if (linkTriggerButton) {
        // 链接 mark 类型。
        const linkType = resolveMarkType(currentView, ['link']);
        linkTriggerButton.dataset.active = linkType && isMarkActive(currentView.state, linkType) ? 'true' : 'false';
      }
      provider.update(currentView, previousState);
    },
    destroy: () => {
      currentView = null;
      blockTransformControlRoot.unmount();
      linkControlRoot.unmount();
      iconRoots.splice(0).forEach((iconRoot) => {
        iconRoot.unmount();
      });
      provider.destroy();
      tooltip.remove();
    }
  };
};

/**
 * 创建选区 tooltip 菜单插件。
 */
export const createSelectionTooltipPlugin = (
  portalContainer: HTMLElement,
  messages: EditorI18nMessages
): ReturnType<typeof $prose> => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey(SELECTION_TOOLTIP_ID),
      view: (view) => createSelectionTooltipPluginView(view as EditorView, portalContainer, messages)
    });
  });
};
