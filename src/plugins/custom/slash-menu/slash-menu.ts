import type { EditorI18nMessages, EditorLocale, ImageUploadConfig, SlashMenuConfig, SlashMenuItem } from '../../../types/editor';
import { slashFactory } from '@milkdown/plugin-slash';
import { resolveEditorWrapper, resolvePlacement, toContentAnchor } from '../../../lib/editor-overlay-position';
import { showImageUploadDialog } from '../image/image-upload-dialog';
import { runSlashCommand } from './slash-menu-commands';
import { isEditorViewEditable, removeSlashQueryAtCursor, resolveMenuState, resolveSlashMenuItems } from './slash-menu-logic';
import { createSlashMenuViewController } from './slash-menu-view';

/**
 * slash 插件初始化结果。
 */
export interface SlashPluginSetup {
  /** slash 插件实例列表（可包含 spec + plugin）。 */
  plugins: unknown[];
  /** slash 上下文配置器。 */
  config: ((ctx: unknown) => void) | null;
}

/**
 * slash 插件运行时解析结果。
 */
interface SlashRuntime {
  /** slash 插件列表。 */
  plugins: unknown[];
  /** slash key。 */
  key: unknown;
}

/**
 * slash 工厂函数类型。
 */
type SlashFactory = (id: string) => unknown;

/**
 * 从 unknown 值中安全读取对象字段。
 */
const readObjectField = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
};

/**
 * 规范化 slash 工厂返回值。
 */
const resolveSlashRuntime = (): SlashRuntime | null => {
  if (typeof (slashFactory as SlashFactory | undefined) !== 'function') {
    console.error('[zt-md/slash] slashFactory not found');
    return null;
  }

  // slash 工厂返回值。
  const tuple = (slashFactory as (id: string) => unknown)('zt-md-slash');
  // tuple 第一位（spec）。
  const tupleSpec = Array.isArray(tuple) ? tuple[0] : undefined;
  // tuple 第二位（plugin）。
  const tuplePlugin = Array.isArray(tuple) ? tuple[1] : tuple;
  // tuple 第三位（兜底 key 提供者候选）。
  const tupleThird = Array.isArray(tuple) ? tuple[2] : undefined;
  if (!tuplePlugin) {
    return null;
  }

  // 规范化后的插件列表（tuple 至少保留前两项）。
  const plugins = Array.isArray(tuple)
    ? tuple.filter((entry, index) => index < 2 && entry != null)
    : [tuplePlugin];
  // 多策略解析 slash key。
  const key =
    readObjectField(tupleSpec, 'key') ??
    readObjectField(tuplePlugin, 'key') ??
    readObjectField(tupleThird, 'key') ??
    readObjectField(tuple, 'key');
  if (plugins.length === 0 || typeof key === 'undefined') {
    return null;
  }

  return {
    plugins,
    key
  };
};

/**
 * 创建 slash 菜单插件。
 */
export const createSlashMenuPlugin = (
  portalContainer: HTMLElement,
  config?: SlashMenuConfig,
  messages?: EditorI18nMessages,
  imageUpload?: ImageUploadConfig,
  locale: EditorLocale = 'zh-CN'
): SlashPluginSetup => {
  if (config?.enabled === false) {
    return { plugins: [], config: null };
  }

  try {
    // slash 插件运行时能力。
    const runtime = resolveSlashRuntime();
    if (!runtime) {
      return { plugins: [], config: null };
    }

    // 最终菜单项配置。
    const items = resolveSlashMenuItems(config, locale);
    // slash 菜单视图控制器。
    const menuView = createSlashMenuViewController(portalContainer);
    // 当前高亮索引。
    let activeIndex = 0;
    // 当前编辑器视图引用。
    let currentView: any = null;
    // 当前过滤后的菜单项。
    let visibleItems: SlashMenuItem[] = items;
    // 当前周期可交互态快照。
    let menuInteractable = false;
    // 菜单导航键集合。
    const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Escape']);

    /**
     * 处理菜单可见态下的键盘导航。
     */
    const handleVisibleMenuKeyDown = (event: KeyboardEvent): boolean => {
      if (!NAVIGATION_KEYS.has(event.key) || !menuInteractable) {
        return false;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (visibleItems.length === 0) {
          return true;
        }
        activeIndex = (activeIndex + 1) % visibleItems.length;
        menuView.renderIfNeeded(visibleItems, activeIndex);
        menuView.scrollActiveItemIntoView(() => {
          menuView.updatePosition();
        });
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (visibleItems.length === 0) {
          return true;
        }
        activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
        menuView.renderIfNeeded(visibleItems, activeIndex);
        menuView.scrollActiveItemIntoView(() => {
          menuView.updatePosition();
        });
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void runActiveCommand();
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        menuView.setVisible(false);
        return true;
      }
      return false;
    };

    /**
     * 解析当前光标在视口中的锚点矩形。
     */
    const resolveAnchorRect = (view: any): DOMRect | null => {
      const from = view?.state?.selection?.from;
      if (typeof from !== 'number') {
        return null;
      }

      const coords = view?.coordsAtPos?.(from) as
        | { top: number; bottom: number; left: number; right: number }
        | null;
      if (!coords) {
        return null;
      }

      return new DOMRect(coords.left, coords.top, Math.max(coords.right - coords.left, 1), coords.bottom - coords.top);
    };

    /**
     * 按当前编辑器状态同步菜单显隐、数据与渲染。
     */
    const syncMenuState = (view: any): void => {
      if (!isEditorViewEditable(view)) {
        visibleItems = [];
        menuInteractable = false;
        menuView.updatePositionContext(null);
        menuView.setVisible(false);
        return;
      }

      // 当前菜单状态。
      const nextState = resolveMenuState(view, items);
      visibleItems = nextState.visibleItems;
      menuInteractable = nextState.shouldShow;
      if (nextState.shouldShow && activeIndex >= visibleItems.length) {
        activeIndex = 0;
      }
      if (nextState.shouldShow && !menuView.isVisible()) {
        activeIndex = 0;
      }
      if (!nextState.shouldShow) {
        menuView.updatePositionContext(null);
        menuView.setVisible(false);
        return;
      }

      const anchorRect = resolveAnchorRect(view);
      const editorWrapper = resolveEditorWrapper(view?.dom as HTMLElement | null);
      if (anchorRect && editorWrapper) {
        const placementThreshold = 320;
        const placement = resolvePlacement(anchorRect, placementThreshold);
        const contentAnchor = toContentAnchor(anchorRect, editorWrapper);
        menuView.updatePositionContext({
          editorWrapper,
          anchorTopInContent: contentAnchor.anchorTopInContent,
          anchorBottomInContent: contentAnchor.anchorBottomInContent,
          anchorLeftInContent: contentAnchor.anchorLeftInContent,
          placement,
          offsetY: 8
        });
      }

      menuView.renderIfNeeded(visibleItems, activeIndex);
      if (!menuView.isVisible()) {
        menuView.setVisible(true, () => {
          menuView.updatePosition();
        });
      } else {
        menuView.updatePosition();
      }
    };

    /**
     * 根据索引执行命令。
     */
    const runActiveCommand = async (): Promise<void> => {
      if (!isEditorViewEditable(currentView)) {
        menuInteractable = false;
        menuView.updatePositionContext(null);
        menuView.setVisible(false);
        return;
      }

      if (!currentView || activeIndex < 0 || activeIndex >= visibleItems.length) {
        return;
      }
      // 当前命令项。
      const item = visibleItems[activeIndex];
      // 是否成功删除 slash 查询词。
      const removedSlashQuery = removeSlashQueryAtCursor(currentView);
      if (!removedSlashQuery) {
        return;
      }
      if (item.command === 'image') {
        menuView.setVisible(false);
        if (messages) {
          showImageUploadDialog({
            portalContainer,
            view: currentView,
            messages,
            imageUpload
          });
        }
        return;
      }
      // 当前命令是否执行成功。
      const success = await runSlashCommand(currentView, item.command);
      if (!success) {
        return;
      }

      menuView.setVisible(false);
      if (item.command === 'mathBlock') {
        // 菜单收起后补一次输入框级聚焦，避免浮层交互导致焦点丢失。
        queueMicrotask(() => {
          // 当前公式源码输入控件。
          const sourceInput = currentView?.dom?.querySelector?.(
            '.zt-md-math-block-editing .zt-md-math-block-textarea'
          ) as HTMLTextAreaElement | HTMLInputElement | null;
          if (!sourceInput || document.activeElement === sourceInput) {
            return;
          }
          sourceInput.focus();
        });
      }
    };

    // 菜单点击事件。
    menuView.menu.addEventListener('mousedown', (event) => {
      event.preventDefault();
      // 点击节点。
      const target = event.target as HTMLElement | null;
      // 当前命中的菜单项节点（允许点击子节点时向上查找）。
      const matchedItem = target?.closest('.slash-menu-item') as HTMLElement | null;
      // 点击命令名。
      const clickedCommand = matchedItem?.dataset.command ?? '';
      if (!clickedCommand) {
        return;
      }
      // 命令索引。
      const foundIndex = visibleItems.findIndex((item) => item.command === clickedCommand);
      if (foundIndex < 0) {
        return;
      }
      activeIndex = foundIndex;
      void runActiveCommand();
    });

    // slash 上下文配置器。
    const setup = (ctx: any): void => {
      ctx.set(runtime.key, {
        props: {
          handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
            return handleVisibleMenuKeyDown(event);
          }
        },
        view: () => ({
          update: (view: any) => {
            currentView = view;
            syncMenuState(view);
          },
          destroy: () => {
            menuInteractable = false;
            menuView.destroy();
          }
        })
      });
    };

    return { plugins: runtime.plugins, config: setup };
  } catch (error) {
    console.error('[zt-md/slash] init failed', error);
    return { plugins: [], config: null };
  }
};

