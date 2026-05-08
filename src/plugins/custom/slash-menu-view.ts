import type { SlashMenuItem } from '../../types/editor';

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
  scrollActiveItemIntoView: () => void;
}

/**
 * 刷新菜单内容与选中态。
 */
const renderMenuItems = (menu: HTMLDivElement, items: SlashMenuItem[], activeIndex: number): void => {
  menu.innerHTML = '';
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
    itemNode.textContent = item.label;
    itemNode.dataset.command = item.command;
    itemNode.dataset.selected = index === activeIndex ? 'true' : 'false';
    menu.appendChild(itemNode);
  });
};

/**
 * 创建 slash 菜单视图控制器。
 */
export const createSlashMenuViewController = (): SlashMenuViewController => {
  // 菜单容器节点。
  const menu = document.createElement('div');
  menu.className = 'slash-menu';
  menu.style.display = 'none';

  // 当前是否展示菜单。
  let menuVisible = false;
  // 上次渲染签名。
  let lastRenderSignature = '';
  // 是否需要在下一次显示时进行双次定位更新。
  let shouldRepositionOnNextShow = false;

  /**
   * 清理浮层定位内联样式，避免下次显示复用旧坐标。
   */
  const resetMenuPositionStyles = (): void => {
    menu.style.top = '';
    menu.style.left = '';
    menu.style.transform = '';
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
      resetMenuPositionStyles();
      lastRenderSignature = '';
      shouldRepositionOnNextShow = true;
      return;
    }

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
   * 仅在渲染输入变化时重绘菜单。
   */
  const renderIfNeeded = (items: SlashMenuItem[], activeIndex: number): void => {
    const commandsSignature = items.map((item) => item.command).join('|');
    const renderSignature = `${commandsSignature}::${activeIndex}`;
    if (lastRenderSignature === renderSignature) {
      return;
    }

    renderMenuItems(menu, items, activeIndex);
    lastRenderSignature = renderSignature;
  };

  /**
   * 将高亮项对齐到菜单容器可视区域（仅在越界时滚动）。
   */
  const scrollActiveItemIntoView = (): void => {
    // 当前高亮菜单项节点。
    const activeItemNode = menu.querySelector('.slash-menu-item[data-selected="true"]') as HTMLElement | null;
    if (!activeItemNode) {
      return;
    }

    activeItemNode.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    });
  };

  return {
    menu,
    isVisible: () => menuVisible,
    setVisible,
    renderIfNeeded,
    scrollActiveItemIntoView
  };
};
