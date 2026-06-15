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
  // 插件视图是否已销毁。
  let isDestroyed = false;
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
  // 内容附属 Popover 碰撞边界。
  const collisionBoundary = portalContainer.closest('.zt-md-editor') as HTMLElement | null;

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
        collisionBoundary,
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
        collisionBoundary,
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
  // 选区菜单展示判断函数。
  const shouldShowSelectionTooltip = createSelectionTooltipShouldShow(
    tooltip,
    () => isLinkPopoverOpen,
    () => isBlockTransformPopoverOpen
  );
  // tooltip 浮层提供器。
  const provider = new TooltipProvider({
    content: tooltip,
    debounce: 80,
    offset: 8,
    root: portalContainer,
    shouldShow: shouldShowSelectionTooltip,
    floatingUIOptions: {
      placement: 'top'
    }
  });

  /**
   * 挂载选区菜单 DOM。
   */
  const mountSelectionTooltip = (): void => {
    if (tooltip.parentElement) {
      return;
    }

    portalContainer.appendChild(tooltip);
  };

  /**
   * 卸载选区菜单 DOM。
   */
  const unmountSelectionTooltip = (): void => {
    tooltip.remove();
  };

  provider.onHide = unmountSelectionTooltip;

  /**
   * 隐藏选区菜单与附属 Popover。
   */
  const hideSelectionTooltip = (): void => {
    setLinkPopoverOpen(false);
    setBlockTransformPopoverOpen(false);
    provider.hide();
    unmountSelectionTooltip();
  };

  /**
   * 判断节点是否位于选区菜单交互区域内。
   */
  const isSelectionTooltipTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Node)) {
      return false;
    }

    return (
      Boolean(currentView?.dom.contains(target)) ||
      tooltip.contains(target) ||
      portalContainer.contains(target)
    );
  };

  /**
   * 处理编辑器失焦后的菜单隐藏。
   */
  const handleEditorBlur = (): void => {
    requestAnimationFrame(() => {
      if (isDestroyed) {
        return;
      }

      if (isSelectionTooltipTarget(document.activeElement)) {
        return;
      }

      hideSelectionTooltip();
    });
  };

  /**
   * 处理文档外部点击后的菜单隐藏。
   */
  const handleDocumentMouseDown = (event: MouseEvent): void => {
    if (isSelectionTooltipTarget(event.target)) {
      return;
    }

    hideSelectionTooltip();
  };

  view.dom.addEventListener('blur', handleEditorBlur);
  document.addEventListener('mousedown', handleDocumentMouseDown, true);

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
      if (!shouldShowSelectionTooltip(currentView)) {
        provider.hide();
        unmountSelectionTooltip();
        return;
      }

      mountSelectionTooltip();
      provider.update(currentView, previousState);
    },
    destroy: () => {
      isDestroyed = true;
      currentView = null;
      view.dom.removeEventListener('blur', handleEditorBlur);
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
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
