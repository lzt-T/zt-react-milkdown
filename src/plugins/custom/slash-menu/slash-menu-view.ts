import type { EditorShortcutMode, SlashMenuCommand, SlashMenuItem } from '@/types/editor';
import { renderStaticSvgIcon, resolveStaticSvgIconName } from '@/lib/static-svg-icons';
import { resolveSlashMenuShortcutLabels } from '@/plugins/custom/block-transform';
import {
  createOverlayRepositionScheduler,
  toPortalPosition,
  type OverlayPlacement
} from '@/lib/editor-overlay-position';

/**
 * slash 菜单展开方向。
 */
type SlashMenuPlacement = OverlayPlacement;

/**
 * slash 菜单定位上下文（第一段：内容坐标计算所需输入）。
 */
interface SlashMenuPositionContext {
  /** 编辑器滚动容器。 */
  editorWrapper: HTMLElement;
  /** 光标顶部在编辑器内容坐标系中的位置。 */
  anchorTopInContent: number;
  /** 光标底部在编辑器内容坐标系中的位置。 */
  anchorBottomInContent: number;
  /** 光标左侧在编辑器内容坐标系中的位置。 */
  anchorLeftInContent: number;
  /** 菜单展开方向（在输入更新时决策）。 */
  placement: SlashMenuPlacement;
  /** 主轴偏移（与光标的垂直间距）。 */
  offsetY: number;
}

/**
 * slash 菜单视图控制器。
 */
export interface SlashMenuViewController {
  /** 菜单容器节点。 */
  menu: HTMLDivElement;
  /** 当前菜单是否可见。 */
  isVisible: () => boolean;
  /** 切换菜单显隐。 */
  setVisible: (visible: boolean, updatePosition?: () => void) => void;
  /** 渲染菜单项（输入不变时跳过）。 */
  renderIfNeeded: (items: SlashMenuItem[], activeIndex: number) => void;
  /** 将当前高亮菜单项滚动到可视区域内。 */
  scrollActiveItemIntoView: (onAfterScroll?: () => void) => void;
  /** 更新菜单定位上下文（不会立即强制显示）。 */
  updatePositionContext: (context: SlashMenuPositionContext | null) => void;
  /** 按当前上下文刷新定位。 */
  updatePosition: () => void;
  /** 销毁控制器并清理全局监听。 */
  destroy: () => void;
}

/**
 * 同步单个菜单项节点的高亮及无障碍选中状态。
 */
const applyMenuItemSelectedState = (itemNode: HTMLDivElement, selected: boolean): void => {
  const value = selected ? 'true' : 'false';
  itemNode.dataset.selected = value;
  itemNode.setAttribute('aria-selected', value);
};

/**
 * 刷新菜单列表 DOM，并缓存菜单项节点引用以支持 O(1) 高亮切换。
 */
const renderMenuItems = (
  menu: HTMLDivElement,
  items: SlashMenuItem[],
  activeIndex: number,
  shortcutLabels: Readonly<Record<SlashMenuCommand, string>>
): HTMLDivElement[] => {
  menu.innerHTML = '';
  const itemNodes: HTMLDivElement[] = [];
  // 当前渲染分组名。
  let currentGroup = '';

  items.forEach((item, index) => {
    if (item.group !== currentGroup) {
      // 分组标题节点。
      const groupNode = document.createElement('div');
      groupNode.className = 'slash-menu-group';
      groupNode.textContent = item.group;
      menu.appendChild(groupNode);
      currentGroup = item.group;
    }

    // 菜单项节点。
    const itemNode = document.createElement('div');
    itemNode.className = 'slash-menu-item';
    itemNode.setAttribute('role', 'option');
    itemNode.dataset.command = item.command;
    itemNode.dataset.index = String(index);
    applyMenuItemSelectedState(itemNode, index === activeIndex);

    // 菜单项图标容器。
    const iconNode = document.createElement('span');
    iconNode.className = 'slash-menu-item-icon';
    if (item.icon) {
      const iconName = resolveStaticSvgIconName(item.icon, 'Circle');
      iconNode.innerHTML = renderStaticSvgIcon(iconName, { size: 16, strokeWidth: 2 });
    }

    // 菜单项文案容器。
    const labelNode = document.createElement('span');
    labelNode.className = 'slash-menu-item-label';
    labelNode.textContent = item.label;

    // 当前菜单项对应的快捷键文案。
    const shortcutLabel = shortcutLabels[item.command];
    // 菜单项快捷键容器。
    const shortcutNode = shortcutLabel ? document.createElement('kbd') : null;
    if (shortcutNode) {
      shortcutNode.className = 'slash-menu-item-shortcut';
      shortcutNode.textContent = shortcutLabel;
    }

    itemNode.appendChild(iconNode);
    itemNode.appendChild(labelNode);
    if (shortcutNode) {
      itemNode.appendChild(shortcutNode);
    }
    menu.appendChild(itemNode);
    itemNodes.push(itemNode);
  });

  return itemNodes;
};

/**
 * 创建 slash 菜单视图控制器。
 */
export const createSlashMenuViewController = (
  portalContainer: HTMLElement,
  shortcutMode: EditorShortcutMode
): SlashMenuViewController => {
  // 菜单容器节点。
  const menu = document.createElement('div');
  menu.className = 'slash-menu';
  menu.setAttribute('role', 'listbox');
  menu.style.display = 'none';
  portalContainer.appendChild(menu);

  // 当前是否展示菜单。
  let menuVisible = false;
  // 上次渲染的列表内容签名。
  let lastItemsSignature = '';
  // 上次渲染的高亮索引。
  let lastActiveIndex = -1;
  // 缓存的菜单项节点列表，用于局部更新选中态。
  let renderedItemNodes: HTMLDivElement[] = [];
  // 是否需要在下一次显示时进行双次定位更新。
  let shouldRepositionOnNextShow = false;
  // 当前定位上下文（由插件 update 驱动更新）。
  let positionContext: SlashMenuPositionContext | null = null;
  // 当前平台 slash 菜单快捷键文案。
  const shortcutLabels = resolveSlashMenuShortcutLabels(shortcutMode);

  /**
   * 第二段：将内容坐标换算为 Portal 内坐标并写入 absolute 菜单样式。
   */
  const updatePosition = (): void => {
    if (!menuVisible || !positionContext) {
      return;
    }

    // 当前浮层定位参数。
    const {
      editorWrapper,
      anchorTopInContent,
      anchorBottomInContent,
      anchorLeftInContent,
      placement,
      offsetY
    } = positionContext;
    // 菜单在编辑器 Portal 内的定位坐标。
    const portalPosition = toPortalPosition(
      {
        wrapper: editorWrapper,
        anchor: {
          anchorTopInContent,
          anchorBottomInContent,
          anchorLeftInContent
        },
        overlaySize: { width: menu.offsetWidth || 210 },
        placement,
        offsetY,
        boundaryInset: 4
      },
      portalContainer
    );

    menu.style.left = `${portalPosition.left}px`;
    menu.style.top = `${portalPosition.top}px`;
    menu.dataset.placement = placement;
  };

  // 通用浮层重定位调度器（监听 + RAF 节流）。
  const repositionScheduler = createOverlayRepositionScheduler(() => {
    if (!menuVisible) {
      return;
    }
    updatePosition();
  });

  /**
   * 清理浮层定位内联样式，避免下次显示复用旧坐标。
   */
  const resetMenuPositionStyles = (): void => {
    menu.style.top = '';
    menu.style.left = '';
    menu.style.transform = '';
    delete menu.dataset.placement;
  };

  /**
   * 切换菜单显隐并处理定位副作用。
   */
  const setVisible = (visible: boolean, updatePosition?: () => void): void => {
    if (menuVisible === visible) {
      return;
    }

    menuVisible = visible;
    menu.style.display = visible ? 'block' : 'none';
    if (!visible) {
      // 隐藏时清理坐标并重置渲染签名，避免历史位置残留。
      repositionScheduler.unbindGlobal();
      repositionScheduler.bindWrapper(null);
      resetMenuPositionStyles();
      lastItemsSignature = '';
      lastActiveIndex = -1;
      renderedItemNodes = [];
      shouldRepositionOnNextShow = true;
      return;
    }

    repositionScheduler.bindGlobal();

    if (updatePosition) {
      // 从隐藏切换为显示后，立即按当前光标位置刷新定位。
      updatePosition();
      if (shouldRepositionOnNextShow) {
        // 显示首帧后再补一次定位，确保首帧不落在旧坐标。
        updatePosition();
        shouldRepositionOnNextShow = false;
      }
    }
  };

  /**
   * 仅在列表内容变化时重绘菜单，高亮变化时仅局部切换属性。
   */
  const renderIfNeeded = (items: SlashMenuItem[], activeIndex: number): void => {
    // 当前可见命令签名。
    const itemsSignature = JSON.stringify(items.map((item) => [item.command, item.label, item.group, item.icon]));
    if (lastItemsSignature !== itemsSignature) {
      renderedItemNodes = renderMenuItems(menu, items, activeIndex, shortcutLabels);
      lastItemsSignature = itemsSignature;
      lastActiveIndex = activeIndex;
      return;
    }

    if (lastActiveIndex === activeIndex) {
      return;
    }

    if (lastActiveIndex >= 0 && renderedItemNodes[lastActiveIndex]) {
      applyMenuItemSelectedState(renderedItemNodes[lastActiveIndex], false);
    }
    if (activeIndex >= 0 && renderedItemNodes[activeIndex]) {
      applyMenuItemSelectedState(renderedItemNodes[activeIndex], true);
    }
    lastActiveIndex = activeIndex;
  };

  /**
   * 将高亮项对齐到菜单容器可视区域（仅在越界时滚动）。
   */
  const scrollActiveItemIntoView = (onAfterScroll?: () => void): void => {
    // 当前高亮菜单项节点。
    const activeItemNode = renderedItemNodes[lastActiveIndex] ?? null;
    if (!activeItemNode) {
      return;
    }

    activeItemNode.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    });
    if (onAfterScroll) {
      onAfterScroll();
    }
  };

  /**
   * 更新定位上下文；传 null 时清空上下文。
   */
  const updatePositionContext = (context: SlashMenuPositionContext | null): void => {
    positionContext = context;
    repositionScheduler.bindWrapper(context?.editorWrapper ?? null);
  };

  /**
   * 销毁控制器：移除监听并删除菜单节点。
   */
  const destroy = (): void => {
    repositionScheduler.destroy();
    renderedItemNodes = [];
    menu.remove();
  };

  return {
    menu,
    isVisible: () => menuVisible,
    setVisible,
    renderIfNeeded,
    scrollActiveItemIntoView,
    updatePositionContext,
    updatePosition,
    destroy
  };
};
