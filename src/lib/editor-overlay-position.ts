/**
 * 编辑器浮层展开方向。
 */
export type OverlayPlacement = 'top' | 'bottom';

/**
 * 浮层锚点在编辑器内容坐标系中的稳定坐标。
 */
export interface OverlayContentAnchor {
  /** 锚点顶部（内容坐标）。 */
  anchorTopInContent: number;
  /** 锚点底部（内容坐标）。 */
  anchorBottomInContent: number;
  /** 锚点左侧（内容坐标）。 */
  anchorLeftInContent: number;
}

/**
 * 浮层视口坐标（用于 fixed 定位）。
 */
export interface OverlayViewportPosition {
  /** 视口顶部坐标。 */
  top: number;
  /** 视口左侧坐标。 */
  left: number;
}

/**
 * 浮层换算配置。
 */
export interface OverlayPositionConfig {
  /** 编辑器滚动容器。 */
  wrapper: HTMLElement;
  /** 内容坐标锚点。 */
  anchor: OverlayContentAnchor;
  /** 浮层尺寸。 */
  overlaySize: { width: number };
  /** 展开方向。 */
  placement: OverlayPlacement;
  /** 主轴偏移。 */
  offsetY: number;
  /** 边界内边距。 */
  boundaryInset: number;
}

/**
 * 解析真实滚动容器：优先 zt-md-editor，兜底回退到编辑器根节点。
 */
export const resolveEditorWrapper = (viewDom: HTMLElement | null): HTMLElement | null => {
  if (!viewDom) {
    return null;
  }

  return (viewDom.closest('.zt-md-editor') as HTMLElement | null) ?? viewDom;
};

/**
 * 根据当前光标视口矩形与阈值解析菜单展开方向。
 */
export const resolvePlacement = (anchorRect: DOMRect, threshold: number): OverlayPlacement => {
  const viewportHeight = typeof window === 'undefined' ? anchorRect.bottom : window.innerHeight;
  const spaceAbove = anchorRect.top;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  if (spaceBelow < threshold && spaceAbove > spaceBelow) {
    return 'top';
  }

  return 'bottom';
};

/**
 * 将锚点矩形换算为编辑器内容坐标中的稳定锚点。
 */
export const toContentAnchor = (anchorRect: DOMRect, wrapper: HTMLElement): OverlayContentAnchor => {
  const wrapperRect = wrapper.getBoundingClientRect();

  return {
    anchorTopInContent: anchorRect.top - wrapperRect.top + wrapper.scrollTop,
    anchorBottomInContent: anchorRect.bottom - wrapperRect.top + wrapper.scrollTop,
    anchorLeftInContent: anchorRect.left - wrapperRect.left + wrapper.scrollLeft
  };
};

/**
 * 将内容坐标换算为视口 fixed 坐标。
 */
export const toViewportPosition = (config: OverlayPositionConfig): OverlayViewportPosition => {
  const { wrapper, anchor, overlaySize, placement, offsetY, boundaryInset } = config;
  const wrapperRect = wrapper.getBoundingClientRect();
  const minLeft = wrapper.scrollLeft + boundaryInset;
  const maxLeft = wrapper.scrollLeft + wrapper.clientWidth - overlaySize.width - boundaryInset;
  const clampedLeft = Math.min(
    Math.max(anchor.anchorLeftInContent, minLeft),
    Math.max(minLeft, maxLeft)
  );
  const overlayTopInContent =
    placement === 'top'
      ? anchor.anchorTopInContent - offsetY
      : anchor.anchorBottomInContent + offsetY;

  return {
    left: wrapperRect.left + clampedLeft - wrapper.scrollLeft,
    top: wrapperRect.top + overlayTopInContent - wrapper.scrollTop
  };
};

/**
 * 创建浮层位置刷新调度器（RAF 节流 + 监听绑定/解绑）。
 */
export const createOverlayRepositionScheduler = (updateFn: () => void) => {
  // 合并高频刷新请求的 RAF id。
  let rafId = 0;
  // 当前绑定滚动监听的编辑器滚动容器。
  let scrollListenerWrapper: HTMLElement | null = null;

  /**
   * 触发一次 RAF 节流刷新。
   */
  const schedule = (): void => {
    if (typeof window === 'undefined') {
      return;
    }
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateFn();
    });
  };

  /**
   * 绑定全局 resize / scroll 监听。
   */
  const bindGlobal = (): void => {
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, {
      capture: true,
      passive: true
    });
  };

  /**
   * 解绑全局 resize / scroll 监听。
   */
  const unbindGlobal = (): void => {
    window.removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
  };

  /**
   * 切换容器级 scroll 监听。
   */
  const bindWrapper = (nextWrapper: HTMLElement | null): void => {
    if (scrollListenerWrapper === nextWrapper) {
      return;
    }
    if (scrollListenerWrapper) {
      scrollListenerWrapper.removeEventListener('scroll', schedule);
    }
    scrollListenerWrapper = nextWrapper;
    if (scrollListenerWrapper) {
      scrollListenerWrapper.addEventListener('scroll', schedule, { passive: true });
    }
  };

  /**
   * 销毁调度器并清理监听。
   */
  const destroy = (): void => {
    if (typeof window !== 'undefined' && rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    unbindGlobal();
    bindWrapper(null);
  };

  return {
    schedule,
    bindGlobal,
    unbindGlobal,
    bindWrapper,
    destroy
  };
};
