import type { SlashMenuCommand, SlashMenuConfig, SlashMenuItem } from '../../types/editor';

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
 * 默认 slash 菜单项。
 */
const DEFAULT_SLASH_MENU_ITEMS: SlashMenuItem[] = [
  { id: 'heading-1', label: '标题 1', group: '标题', command: 'heading1' },
  { id: 'heading-2', label: '标题 2', group: '标题', command: 'heading2' },
  { id: 'heading-3', label: '标题 3', group: '标题', command: 'heading3' },
  { id: 'bullet-list', label: '无序列表', group: '列表', command: 'bulletList' },
  { id: 'ordered-list', label: '有序列表', group: '列表', command: 'orderedList' },
  { id: 'task-list', label: '任务列表', group: '列表', command: 'taskList' },
  { id: 'blockquote', label: '引用块', group: '插入', command: 'blockquote' }
];

/**
 * slash 命令执行器类型。
 */
type EditorCommandExecutor = (state: unknown, dispatch: unknown, view: unknown) => boolean;

/**
 * slash 插件运行时解析结果。
 */
interface SlashRuntime {
  /** slash 插件列表。 */
  plugins: unknown[];
  /** slash key。 */
  key: unknown;
  /** slash provider 构造器。 */
  Provider: new (options: Record<string, unknown>) => any;
}

/**
 * slash 菜单当前状态。
 */
interface SlashMenuState {
  /** 当前过滤后的菜单项。 */
  visibleItems: SlashMenuItem[];
  /** 当前是否应显示菜单。 */
  shouldShow: boolean;
}

/**
 * 从 unknown 值中安全读取对象字段。
 */
const getObjectValue = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return (value as Record<string, unknown>)[key];
};

/**
 * 递归解包模块 default 导出，兼容多层互操作包装。
 */
const unwrapModuleExports = (value: unknown): Record<string, unknown> => {
  // 当前层对象。
  let current = value;
  // 最多尝试解包层数，避免异常循环。
  let depth = 0;

  while (current && typeof current === 'object' && depth < 6) {
    // 当前层对象键集合。
    const keys = Object.keys(current as Record<string, unknown>);
    // 当前层 default 字段值。
    const nestedDefault = getObjectValue(current, 'default');
    if (!nestedDefault || typeof nestedDefault !== 'object') {
      break;
    }
    if (keys.length <= 2 || (keys.length === 3 && keys.includes('__esModule'))) {
      current = nestedDefault;
      depth += 1;
      continue;
    }
    break;
  }

  if (!current || typeof current !== 'object') {
    return {};
  }

  return current as Record<string, unknown>;
};

/**
 * 构建最终菜单项配置。
 */
const resolveSlashMenuItems = (config?: SlashMenuConfig): SlashMenuItem[] => {
  if (config?.items && config.items.length > 0) {
    return config.items;
  }

  return DEFAULT_SLASH_MENU_ITEMS;
};

/**
 * 判断是否处于不应展示 slash 菜单的节点。
 */
const shouldBlockSlashMenu = (view: any): boolean => {
  // 当前选区起点。
  const from = view?.state?.selection?.$from;
  if (!from) {
    return false;
  }

  // 当前父节点类型名。
  const parentTypeName = String(from.parent?.type?.name ?? '');
  return parentTypeName.includes('code') || parentTypeName === 'math_block';
};

/**
 * 读取光标前的文本块内容。
 */
const getTextBeforeCursor = (view: any): string => {
  // 当前编辑器状态。
  const state = view?.state;
  // 当前选区起点。
  const from = state?.selection?.$from;
  if (!state || !from) {
    return '';
  }

  // 当前文本块起始位置。
  const blockStart = from.start();
  // 当前光标位置。
  const cursorPos = from.pos;
  return state.doc.textBetween(blockStart, cursorPos, '\n', '\n');
};

/**
 * 读取当前光标所在文本块的 slash 查询词。
 */
const getSlashQueryAtCursor = (view: any): string | null => {
  // 光标前文本。
  const textBeforeCursor = getTextBeforeCursor(view);
  // 本次触发 slash 在块内的起始偏移。
  const slashOffset = textBeforeCursor.lastIndexOf('/');
  if (slashOffset < 0) {
    return null;
  }

  // slash 到光标之间的查询词（不包含 slash）。
  const query = textBeforeCursor.slice(slashOffset + 1);
  // 若查询中包含空白，说明已脱离当前 slash 查询态。
  if (/\s/.test(query)) {
    return null;
  }

  return query;
};

/**
 * 按查询词过滤 slash 菜单项（前缀匹配）。
 */
const filterSlashMenuItems = (items: SlashMenuItem[], query: string | null): SlashMenuItem[] => {
  if (query === null || query.length === 0) {
    return items;
  }

  // 统一小写查询词。
  const normalizedQuery = query.toLowerCase();
  return items.filter((item) => {
    // 可匹配字段集合（仅做前缀匹配）。
    const candidates = [item.label, item.group, item.command, item.id];
    return candidates.some((candidate) => String(candidate).toLowerCase().startsWith(normalizedQuery));
  });
};

/**
 * 删除当前光标所在文本块中最后一个 slash 查询词。
 */
const removeSlashQueryAtCursor = (view: any): boolean => {
  // 当前编辑器状态。
  const state = view?.state;
  // 当前选区起点。
  const from = state?.selection?.$from;
  if (!state || !from || !view?.dispatch) {
    return false;
  }

  // 当前文本块起始位置。
  const blockStart = from.start();
  // 当前光标位置。
  const cursorPos = from.pos;
  // 光标前文本。
  const textBeforeCursor = state.doc.textBetween(blockStart, cursorPos, '\n', '\n');
  // 本次触发 slash 在块内的起始偏移。
  const slashOffset = textBeforeCursor.lastIndexOf('/');
  if (slashOffset < 0) {
    return false;
  }

  // slash 在文档中的绝对位置。
  const slashFrom = blockStart + slashOffset;
  // 删除事务。
  const tr = state.tr.delete(slashFrom, cursorPos);
  view.dispatch(tr.scrollIntoView());
  return true;
};

/**
 * 执行 ProseMirror 命令。
 */
const runCommand = (command: EditorCommandExecutor, view: any): boolean => command(view.state, view.dispatch, view);

/**
 * 计算当前菜单状态。
 */
const resolveMenuState = (view: any, items: SlashMenuItem[]): SlashMenuState => {
  // 当前 slash 查询词。
  const query = getSlashQueryAtCursor(view);
  // 当前过滤后的菜单项。
  const visibleItems = filterSlashMenuItems(items, query);
  // 当前是否应展示菜单。
  const shouldShow = !shouldBlockSlashMenu(view) && query !== null && visibleItems.length > 0;
  return { visibleItems, shouldShow };
};

/**
 * 规范化 slash 工厂返回值。
 */
const resolveSlashRuntime = async (): Promise<SlashRuntime | null> => {
  // slash 插件原始导出集合。
  const rawModule = (await import('@milkdown/plugin-slash')) as Record<string, unknown>;
  // 统一后的导出集合。
  const slashModule = unwrapModuleExports(rawModule);
  // slash 工厂函数。
  const slashFactory = getObjectValue(slashModule, 'slashFactory');
  // slash provider 构造函数。
  const Provider = getObjectValue(slashModule, 'SlashProvider');
  if (typeof slashFactory !== 'function' || typeof Provider !== 'function') {
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
    getObjectValue(tupleSpec, 'key') ??
    getObjectValue(tuplePlugin, 'key') ??
    getObjectValue(tupleThird, 'key') ??
    getObjectValue(tuple, 'key');
  if (plugins.length === 0 || typeof key === 'undefined') {
    return null;
  }

  return {
    plugins,
    key,
    Provider: Provider as new (options: Record<string, unknown>) => any
  };
};

/**
 * 运行 slash 命令并返回是否成功。
 */
const runSlashCommand = async (view: any, command: SlashMenuCommand): Promise<boolean> => {
  if (!view?.state || !view?.dispatch) {
    return false;
  }

  // prose commands 模块导出集合。
  const proseCommandsModule = (await import('@milkdown/prose/commands')) as Record<string, unknown>;
  // prose schema-list 模块导出集合。
  const proseListModule = (await import('@milkdown/prose/schema-list')) as Record<string, unknown>;
  // setBlockType 命令工厂。
  const setBlockType = getObjectValue(proseCommandsModule, 'setBlockType');
  // wrapIn 命令工厂。
  const wrapIn = getObjectValue(proseCommandsModule, 'wrapIn');
  // wrapInList 命令工厂。
  const wrapInList = getObjectValue(proseListModule, 'wrapInList');
  if (typeof setBlockType !== 'function' || typeof wrapIn !== 'function' || typeof wrapInList !== 'function') {
    return false;
  }

  // 编辑器 schema。
  const schema = view.state.schema as Record<string, unknown>;
  // 节点类型集合。
  const nodes = (schema?.nodes ?? {}) as Record<string, unknown>;
  // 标题层级映射。
  const headingLevelMap: Partial<Record<SlashMenuCommand, number>> = {
    heading1: 1,
    heading2: 2,
    heading3: 3
  };
  // 列表节点映射。
  const listTypeMap: Partial<Record<SlashMenuCommand, string>> = {
    bulletList: 'bullet_list',
    orderedList: 'ordered_list',
    taskList: 'task_list'
  };

  if (command in headingLevelMap) {
    // heading 节点类型。
    const headingType = nodes.heading;
    // heading 层级。
    const level = headingLevelMap[command];
    if (!headingType || typeof level !== 'number') {
      return false;
    }
    // heading 转换命令。
    const headingCommand = (setBlockType as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(
      headingType,
      { level }
    );
    return runCommand(headingCommand, view);
  }

  if (command === 'blockquote') {
    // blockquote 节点类型。
    const quoteType = nodes.blockquote;
    if (!quoteType) {
      return false;
    }
    // 引用包裹命令。
    const quoteCommand = (wrapIn as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(quoteType);
    return runCommand(quoteCommand, view);
  }

  if (command in listTypeMap) {
    // 列表节点类型。
    const listType = nodes[listTypeMap[command] as string];
    if (!listType) {
      return false;
    }
    // 列表包裹命令。
    const listCommand = (wrapInList as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(listType);
    return runCommand(listCommand, view);
  }

  return false;
};

/**
 * 创建菜单 DOM 容器。
 */
const createMenuContainer = (): HTMLDivElement => {
  // 菜单容器节点。
  const menu = document.createElement('div');
  menu.className = 'slash-menu';
  menu.style.display = 'none';
  return menu;
};

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
 * 创建 slash 菜单插件。
 */
export const createSlashMenuPlugin = async (config?: SlashMenuConfig): Promise<SlashPluginSetup> => {
  if (config?.enabled === false) {
    return { plugins: [], config: null };
  }

  try {
    // slash 插件运行时能力。
    const runtime = await resolveSlashRuntime();
    if (!runtime) {
      return { plugins: [], config: null };
    }

    // 最终菜单项配置。
    const items = resolveSlashMenuItems(config);
    // 菜单容器节点。
    const menu = createMenuContainer();
    // 当前高亮索引。
    let activeIndex = 0;
    // 当前是否展示菜单。
    let menuVisible = false;
    // 当前编辑器视图引用。
    let currentView: any = null;
    // 当前过滤后的菜单项。
    let visibleItems: SlashMenuItem[] = items;
    // 上次渲染签名。
    let lastRenderSignature = '';

    /**
     * 仅在状态变化时切换菜单显示。
     */
    const setMenuVisible = (visible: boolean): void => {
      if (menuVisible === visible) {
        return;
      }
      menuVisible = visible;
      menu.style.display = visible ? 'block' : 'none';
    };

    /**
     * 仅在渲染输入变化时重绘菜单。
     */
    const renderIfNeeded = (): void => {
      const commandsSignature = visibleItems.map((item) => item.command).join('|');
      const renderSignature = `${commandsSignature}::${activeIndex}`;
      if (lastRenderSignature === renderSignature) {
        return;
      }
      renderMenuItems(menu, visibleItems, activeIndex);
      lastRenderSignature = renderSignature;
    };

    /**
     * 按当前编辑器状态同步菜单显隐、数据与渲染。
     */
    const syncMenuState = (view: any): void => {
      // 当前菜单状态。
      const nextState = resolveMenuState(view, items);
      visibleItems = nextState.visibleItems;
      if (nextState.shouldShow && activeIndex >= visibleItems.length) {
        activeIndex = 0;
      }
      if (nextState.shouldShow && !menuVisible) {
        activeIndex = 0;
      }
      setMenuVisible(nextState.shouldShow);
      if (!menuVisible) {
        return;
      }
      renderIfNeeded();
      provider.update(view);
    };

    /**
     * 根据索引执行命令。
     */
    const runActiveCommand = async (): Promise<void> => {
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
      // 当前命令是否执行成功。
      const success = await runSlashCommand(currentView, item.command);
      if (!success) {
        return;
      }
      setMenuVisible(false);
    };

    // slash provider 实例。
    const provider = new runtime.Provider({
      content: menu,
      shouldShow: (view: any) => resolveMenuState(view, items).shouldShow,
      offset: { mainAxis: 8, crossAxis: 0 },
      floatingUIOptions: {
        strategy: 'fixed',
        placement: 'bottom-start'
      }
    });

    // 菜单点击事件。
    menu.addEventListener('mousedown', (event) => {
      event.preventDefault();
      // 点击节点。
      const target = event.target as HTMLElement | null;
      // 点击命令名。
      const clickedCommand = target?.dataset.command ?? '';
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
            if (!menuVisible) {
              return false;
            }
            if (event.key === 'ArrowDown') {
              if (visibleItems.length === 0) {
                return true;
              }
              activeIndex = (activeIndex + 1) % visibleItems.length;
              renderIfNeeded();
              return true;
            }
            if (event.key === 'ArrowUp') {
              if (visibleItems.length === 0) {
                return true;
              }
              activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
              renderIfNeeded();
              return true;
            }
            if (event.key === 'Enter') {
              void runActiveCommand();
              return true;
            }
            if (event.key === 'Escape') {
              setMenuVisible(false);
              return true;
            }
            return false;
          }
        },
        view: () => ({
          update: (view: any) => {
            currentView = view;
            syncMenuState(view);
          },
          destroy: () => {
            provider.destroy();
            menu.remove();
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
