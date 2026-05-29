import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import {
  createOverlayRepositionScheduler,
  toContentAnchor,
  toPortalPosition,
  type OverlayPlacement
} from '../../lib/editor-overlay-position';

/**
 * 浮层横向对齐方式。
 */
type FloatingPortalPanelHorizontalAlign = 'start' | 'center' | 'end';

/**
 * 浮层面板 Hook 参数。
 */
interface UseFloatingPortalPanelOptions {
  /** 面板是否展开。 */
  open: boolean;
  /** 面板 Portal 容器。 */
  portalContainer?: HTMLElement | null;
  /** 编辑器滚动容器。 */
  editorWrapper?: HTMLElement | null;
  /** 默认展开方向。 */
  defaultPlacement?: OverlayPlacement;
  /** 横向对齐方式。 */
  horizontalAlign?: FloatingPortalPanelHorizontalAlign;
  /** 主轴偏移。 */
  offsetY?: number;
  /** 边界内边距。 */
  boundaryInset?: number;
  /** 首帧宽度兜底。 */
  fallbackWidth: number;
  /** 首帧高度兜底。 */
  fallbackHeight: number;
  /** 点击外部关闭回调。 */
  onOutside: () => void;
}

/**
 * 浮层面板状态。
 */
interface FloatingPortalPanelState {
  /** 面板是否展开。 */
  open: boolean;
  /** 触发按钮引用。 */
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
  /** 面板 DOM 引用回调。 */
  panelRef: (node: HTMLDivElement | null) => void;
  /** 立即刷新定位。 */
  updatePosition: () => void;
}

/**
 * 浮层面板组件属性。
 */
interface FloatingPortalPanelProps {
  /** 面板状态。 */
  panel: FloatingPortalPanelState;
  /** 面板 Portal 容器。 */
  portalContainer?: HTMLElement | null;
  /** 面板 className。 */
  className?: string;
  /** 面板角色。 */
  role?: string;
  /** 鼠标按下事件。 */
  onMouseDown?: (event: MouseEvent<HTMLDivElement>) => void;
  /** 面板内容。 */
  children?: ReactNode;
}

/**
 * 按编辑器视口解析最终展开方向。
 */
const resolveFloatingPanelPlacement = (
  defaultPlacement: OverlayPlacement,
  anchorRect: DOMRect,
  overlayHeight: number,
  wrapperRect: DOMRect
): OverlayPlacement => {
  // 锚点上方可用空间。
  const spaceAbove = anchorRect.top - wrapperRect.top;
  // 锚点下方可用空间。
  const spaceBelow = wrapperRect.bottom - anchorRect.bottom;

  if (defaultPlacement === 'top') {
    return spaceAbove < overlayHeight && spaceBelow > spaceAbove ? 'bottom' : 'top';
  }

  return spaceBelow < overlayHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
};

/**
 * 创建内容 Portal 浮层定位能力。
 */
export const useFloatingPortalPanel = ({
  open,
  portalContainer,
  editorWrapper,
  defaultPlacement = 'bottom',
  horizontalAlign = 'start',
  offsetY = 8,
  boundaryInset = 2,
  fallbackWidth,
  fallbackHeight,
  onOutside
}: UseFloatingPortalPanelOptions): FloatingPortalPanelState => {
  // 触发按钮 DOM。
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // 面板 DOM。
  const panelElementRef = useRef<HTMLDivElement | null>(null);
  // 最新展开状态。
  const openRef = useRef(open);

  /**
   * 按触发器与面板实时尺寸刷新定位。
   */
  const updatePosition = useCallback((): void => {
    // 当前触发按钮。
    const trigger = triggerRef.current;
    // 当前面板节点。
    const panel = panelElementRef.current;
    if (!openRef.current || !trigger || !panel || !portalContainer || !editorWrapper) {
      return;
    }

    // 触发按钮视口矩形。
    const anchorRect = trigger.getBoundingClientRect();
    // 编辑器滚动容器视口矩形。
    const wrapperRect = editorWrapper.getBoundingClientRect();
    // 面板真实宽度。
    const overlayWidth = panel.offsetWidth || fallbackWidth;
    // 面板真实高度。
    const overlayHeight = panel.offsetHeight || fallbackHeight;
    // 当前展开方向。
    const placement = resolveFloatingPanelPlacement(defaultPlacement, anchorRect, overlayHeight, wrapperRect);
    // 面板在 Portal 内的坐标。
    const portalPosition = toPortalPosition(
      {
        wrapper: editorWrapper,
        anchor: toContentAnchor(anchorRect, editorWrapper),
        overlaySize: {
          width: overlayWidth,
          height: overlayHeight
        },
        placement,
        horizontalAlign,
        offsetY,
        boundaryInset
      },
      portalContainer
    );

    panel.style.position = 'absolute';
    panel.style.left = `${portalPosition.left}px`;
    panel.style.top = `${portalPosition.top}px`;
    panel.style.transform = '';
    panel.style.visibility = 'visible';
  }, [
    boundaryInset,
    defaultPlacement,
    editorWrapper,
    fallbackHeight,
    fallbackWidth,
    horizontalAlign,
    offsetY,
    portalContainer
  ]);

  /**
   * 同步面板 DOM 引用。
   */
  const panelRef = useCallback(
    (node: HTMLDivElement | null): void => {
      panelElementRef.current = node;
      if (!node) {
        return;
      }

      node.style.visibility = 'hidden';
      updatePosition();
    },
    [updatePosition]
  );

  useLayoutEffect(() => {
    openRef.current = open;
    if (!open) {
      if (panelElementRef.current) {
        panelElementRef.current.style.visibility = 'hidden';
      }
      return;
    }

    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    // 浮层重定位调度器。
    const scheduler = createOverlayRepositionScheduler(updatePosition);
    scheduler.bindGlobal();
    scheduler.bindWrapper(editorWrapper ?? null);
    scheduler.schedule();

    return () => {
      scheduler.destroy();
    };
  }, [editorWrapper, open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    /**
     * 点击触发器与面板外部时关闭面板。
     */
    const handleDocumentMouseDown = (event: globalThis.MouseEvent): void => {
      // 当前点击目标。
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (triggerRef.current?.contains(target)) {
        return;
      }
      if (panelElementRef.current?.contains(target)) {
        return;
      }

      onOutside();
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [onOutside, open]);

  return {
    open,
    triggerRef,
    panelRef,
    updatePosition
  };
};

/**
 * 渲染内容 Portal 浮层面板。
 */
export const FloatingPortalPanel = ({
  panel,
  portalContainer,
  className,
  role,
  onMouseDown,
  children
}: FloatingPortalPanelProps): ReactElement | null => {
  if (!panel.open || !portalContainer) {
    return null;
  }

  return createPortal(
    createElement(
      'div',
      {
        ref: panel.panelRef,
        role,
        className,
        style: {
          position: 'absolute',
          visibility: 'hidden'
        },
        onMouseDown
      },
      children
    ),
    portalContainer
  );
};
