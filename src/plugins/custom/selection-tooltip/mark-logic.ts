import { toggleMark } from '@milkdown/prose/commands';
import type { MarkType } from '@milkdown/prose/model';
import type { EditorState } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { MarkCommandContext, SelectionTooltipCommand } from './types';

/**
 * 判断编辑器视图是否可编辑。
 */
export const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 从 schema 中按候选名解析 mark 类型。
 */
export const resolveMarkType = (view: EditorView, markNames: string[]): MarkType | null => {
  // 当前编辑器 mark 集合。
  const marks = view.state.schema.marks as Record<string, MarkType | undefined>;
  // 匹配到的 mark 名称。
  const matchedName = markNames.find((markName) => marks[markName]);

  return matchedName ? marks[matchedName] ?? null : null;
};

/**
 * 判断选区内是否包含目标 mark。
 */
export const isMarkActive = (state: EditorState, markType: MarkType): boolean => {
  // 当前选区范围。
  const { from, to } = state.selection;

  return state.doc.rangeHasMark(from, to, markType);
};

/**
 * 读取选区内已有链接地址。
 */
export const resolveSelectedLinkHref = (state: EditorState, linkType: MarkType): string => {
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
 * 打开链接编辑区。
 */
const applyLinkMark = (context: MarkCommandContext): void => {
  context.toggleLinkPopover(context.view);
};

/**
 * 按命令类型执行菜单动作。
 */
export const runSelectionTooltipCommand = (
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
