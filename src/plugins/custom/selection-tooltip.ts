import { TooltipProvider } from '@milkdown/plugin-tooltip';
import { toggleMark } from '@milkdown/prose/commands';
import type { MarkType } from '@milkdown/prose/model';
import { Plugin, PluginKey, type EditorState, type PluginView } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

/**
 * 选区菜单命令键名。
 */
type SelectionTooltipCommand = 'strong' | 'em' | 'strike' | 'inlineCode' | 'link';

/**
 * 选区菜单项配置。
 */
interface SelectionTooltipItem {
  /** 命令键名。 */
  command: SelectionTooltipCommand;
  /** 按钮展示文本。 */
  label: string;
  /** 无障碍标题。 */
  title: string;
  /** schema mark 候选名。 */
  markNames: string[];
}

/**
 * mark 命令上下文。
 */
interface MarkCommandContext {
  /** 编辑器视图。 */
  view: EditorView;
  /** mark 类型。 */
  markType: MarkType;
}

// 选区 tooltip 插件唯一标识。
const SELECTION_TOOLTIP_ID = 'zt-md-selection-tooltip';

// 选区菜单项固定配置。
const SELECTION_TOOLTIP_ITEMS: SelectionTooltipItem[] = [
  { command: 'strong', label: 'B', title: '加粗', markNames: ['strong'] },
  { command: 'em', label: 'I', title: '斜体', markNames: ['em', 'emphasis'] },
  { command: 'strike', label: 'S', title: '删除线', markNames: ['strike_through', 'strikeThrough'] },
  { command: 'inlineCode', label: '<>', title: '行内代码', markNames: ['inlineCode', 'code_inline'] },
  { command: 'link', label: 'Link', title: '链接', markNames: ['link'] }
];

/**
 * 判断编辑器视图是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 从 schema 中按候选名解析 mark 类型。
 */
const resolveMarkType = (view: EditorView, markNames: string[]): MarkType | null => {
  // 当前编辑器 mark 集合。
  const marks = view.state.schema.marks as Record<string, MarkType | undefined>;
  // 匹配到的 mark 名称。
  const matchedName = markNames.find((markName) => marks[markName]);

  return matchedName ? marks[matchedName] ?? null : null;
};

/**
 * 判断选区内是否包含目标 mark。
 */
const isMarkActive = (state: EditorState, markType: MarkType): boolean => {
  // 当前选区范围。
  const { from, to } = state.selection;

  return state.doc.rangeHasMark(from, to, markType);
};

/**
 * 读取选区内已有链接地址。
 */
const resolveSelectedLinkHref = (state: EditorState, linkType: MarkType): string => {
  // 当前选区范围。
  const { from, to } = state.selection;
  // 当前找到的链接地址。
  let href = '';

  state.doc.nodesBetween(from, to, (node) => {
    // 当前文本节点上的链接 mark。
    const linkMark = node.marks.find((mark) => mark.type === linkType);
    if (!linkMark) {
      return true;
    }

    href = typeof linkMark.attrs.href === 'string' ? linkMark.attrs.href : '';
    return false;
  });

  return href;
};

/**
 * 切换普通行内 mark。
 */
const toggleInlineMark = (context: MarkCommandContext): void => {
  // 普通 mark 切换命令。
  const command = toggleMark(context.markType);
  command(context.view.state, context.view.dispatch, context.view);
  context.view.focus();
};

/**
 * 设置或移除选区链接。
 */
const applyLinkMark = (context: MarkCommandContext): void => {
  // 当前编辑器状态。
  const { state } = context.view;
  // 当前选区范围。
  const { from, to } = state.selection;
  // 当前已有链接地址。
  const currentHref = resolveSelectedLinkHref(state, context.markType);
  // 用户输入的链接地址。
  const nextHref = window.prompt('请输入链接地址，留空则移除链接', currentHref);
  if (nextHref === null) {
    context.view.focus();
    return;
  }

  // 去除首尾空格后的链接地址。
  const normalizedHref = nextHref.trim();
  // 链接更新事务。
  const transaction = state.tr.removeMark(from, to, context.markType);
  if (normalizedHref) {
    transaction.addMark(from, to, context.markType.create({ href: normalizedHref }));
  }

  context.view.dispatch(transaction.scrollIntoView());
  context.view.focus();
};

/**
 * 按命令类型执行菜单动作。
 */
const runSelectionTooltipCommand = (
  command: SelectionTooltipCommand,
  context: MarkCommandContext
): void => {
  // 命令执行分发表。
  const commandHandlers: Record<SelectionTooltipCommand, (commandContext: MarkCommandContext) => void> = {
    strong: toggleInlineMark,
    em: toggleInlineMark,
    strike: toggleInlineMark,
    inlineCode: toggleInlineMark,
    link: applyLinkMark
  };

  commandHandlers[command](context);
};

/**
 * 创建选区菜单按钮。
 */
const createSelectionTooltipButton = (
  item: SelectionTooltipItem,
  markType: MarkType,
  getCurrentView: () => EditorView | null
): HTMLButtonElement => {
  // 菜单按钮节点。
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zt-md-selection-tooltip-button';
  button.dataset.command = item.command;
  button.title = item.title;
  button.setAttribute('aria-label', item.title);
  button.textContent = item.label;
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
      markType
    });
  });

  return button;
};

/**
 * 创建选区菜单 DOM。
 */
const createSelectionTooltipElement = (
  view: EditorView,
  getCurrentView: () => EditorView | null
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

    tooltip.append(createSelectionTooltipButton(item, markType, getCurrentView));
  });

  return tooltip;
};

/**
 * 刷新菜单按钮激活态。
 */
const updateSelectionTooltipActiveState = (tooltip: HTMLElement, view: EditorView): void => {
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
const createSelectionTooltipShouldShow = (tooltip: HTMLElement): ((view: EditorView) => boolean) => {
  /**
   * 判断 tooltip 是否应该展示。
   */
  return (view: EditorView): boolean => {
    // 当前选区。
    const { selection, doc } = view.state;
    // 当前焦点是否位于菜单内。
    const isTooltipFocused = tooltip.contains(document.activeElement);
    if (!isEditorViewEditable(view) || selection.empty || (!view.hasFocus() && !isTooltipFocused)) {
      return false;
    }

    return tooltip.childElementCount > 0 && doc.textBetween(selection.from, selection.to).trim().length > 0;
  };
};

/**
 * 创建选区 tooltip 插件视图。
 */
const createSelectionTooltipPluginView = (
  view: EditorView,
  portalContainer: HTMLElement
): PluginView => {
  // 当前编辑器视图引用。
  let currentView: EditorView | null = view;
  // 选区菜单 DOM。
  const tooltip = createSelectionTooltipElement(view, () => currentView);
  // tooltip 浮层提供器。
  const provider = new TooltipProvider({
    content: tooltip,
    debounce: 80,
    offset: 8,
    root: portalContainer,
    shouldShow: createSelectionTooltipShouldShow(tooltip),
    floatingUIOptions: {
      placement: 'top'
    }
  });

  return {
    update: (nextView, previousState) => {
      currentView = nextView as EditorView;
      updateSelectionTooltipActiveState(tooltip, currentView);
      provider.update(currentView, previousState);
    },
    destroy: () => {
      currentView = null;
      provider.destroy();
      tooltip.remove();
    }
  };
};

/**
 * 创建选区 tooltip 菜单插件。
 */
export const createSelectionTooltipPlugin = (portalContainer: HTMLElement): ReturnType<typeof $prose> => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey(SELECTION_TOOLTIP_ID),
      view: (view) => createSelectionTooltipPluginView(view as EditorView, portalContainer)
    });
  });
};
