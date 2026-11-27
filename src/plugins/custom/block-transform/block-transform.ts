import { lift, setBlockType, wrapIn } from '@milkdown/prose/commands';
import type { NodeType, ResolvedPos } from '@milkdown/prose/model';
import { liftListItem } from '@milkdown/prose/schema-list';
import { Selection, type EditorState, type Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { BlockTransformCommand } from '@/types/editor';
import {
  LIST_TRANSFORM_CONFIG_MAP,
  runListTransform,
  type AncestorMatch,
  type EditorCommandExecutor,
  type ListBlockTransformCommand
} from './block-transform-list';

// 表格节点名称集合。
const TABLE_NODE_NAMES = new Set(['table', 'table_cell', 'table_header']);
// 脱出容器循环安全上限，防止异常结构死循环。
const MAX_LIFT_ITERATIONS = 20;

/**
 * 标题命令到层级映射表。
 */
const HEADING_LEVEL_MAP: Record<
  Extract<
    BlockTransformCommand,
    'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
  >,
  number
> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
  heading4: 4,
  heading5: 5,
  heading6: 6
};

/**
 * 标题层级到块转换命令映射表。
 */
const HEADING_COMMAND_BY_LEVEL: Record<number, BlockTransformCommand> = {
  1: 'heading1',
  2: 'heading2',
  3: 'heading3',
  4: 'heading4',
  5: 'heading5',
  6: 'heading6'
};

/**
 * 块级命令主文案优先级。
 */
const BLOCK_TRANSFORM_COMMAND_PRIORITY: BlockTransformCommand[] = [
  'codeBlock',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'taskList',
  'orderedList',
  'bulletList',
  'blockquote',
  'paragraph'
];

/**
 * 在当前累积事务基础上执行子命令并合入步骤与显式选区。
 */
const applyCommandToTransaction = (
  baseState: EditorState,
  tr: Transaction,
  command: EditorCommandExecutor
): boolean => {
  // 基于当前中间事务构建临时状态。
  const nextState = baseState.apply(tr);
  // 子命令是否触发了事务派发。
  let dispatched = false;

  const executed = command(nextState, (subTr) => {
    dispatched = true;
    subTr.steps.forEach((step) => {
      tr.step(step);
    });
    if (subTr.selectionSet) {
      tr.setSelection(Selection.fromJSON(tr.doc, subTr.selection.toJSON()));
    }
  });

  return executed && dispatched;
};

/**
 * 查找指定解析位置向上最近的匹配祖先节点。
 */
const findNearestAncestor = (
  resolvedPos: ResolvedPos,
  names: ReadonlySet<string>
): AncestorMatch | null => {
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    const node = resolvedPos.node(depth);
    if (names.has(node.type.name)) {
      return {
        depth,
        node,
        pos: resolvedPos.before(depth)
      };
    }
  }

  return null;
};

/**
 * 判断选区起点或终点是否位于指定祖先节点内部。
 */
const hasAncestorInSelection = (state: EditorState, names: ReadonlySet<string>): boolean => {
  const { $from, $to } = state.selection;
  return Boolean(findNearestAncestor($from, names) || findNearestAncestor($to, names));
};

/**
 * 脱出选区所在的列表或引用块容器。
 */
const liftOutOfContainers = (
  baseState: EditorState,
  tr: Transaction,
  listItemType: NodeType | undefined,
  includeBlockquote: boolean
): void => {
  // 允许脱出的容器节点名集合。
  const containerNames = includeBlockquote
    ? new Set(['list_item', 'blockquote'])
    : new Set(['list_item']);

  for (let iteration = 0; iteration < MAX_LIFT_ITERATIONS; iteration += 1) {
    const currentState = baseState.apply(tr);
    const { $from, $to } = currentState.selection;
    const nearestContainer =
      findNearestAncestor($from, containerNames) ?? findNearestAncestor($to, containerNames);
    if (!nearestContainer) {
      return;
    }

    // 命中列表项时优先用 liftListItem 脱出一层列表；否则对引用块执行 lift。
    const lifted =
      nearestContainer.node.type.name === 'list_item' && listItemType
        ? applyCommandToTransaction(baseState, tr, liftListItem(listItemType))
        : nearestContainer.node.type.name === 'blockquote'
          ? applyCommandToTransaction(baseState, tr, lift)
          : false;
    if (!lifted) {
      return;
    }
  }
};

/**
 * 判断选区中是否存在非段落类型的文本块。
 */
const hasNonParagraphTextblock = (state: EditorState): boolean => {
  const { from, to } = state.selection;
  if (from === to) {
    return (
      state.selection.$from.parent.isTextblock &&
      state.selection.$from.parent.type.name !== 'paragraph'
    );
  }

  let foundNonParagraph = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isTextblock && node.type.name !== 'paragraph') {
      foundNonParagraph = true;
      return false;
    }
    return !foundNonParagraph;
  });

  return foundNonParagraph;
};

/**
 * 执行正文、标题或代码块转换命令。
 */
const runTextblockTransform = (
  view: EditorView,
  targetType: NodeType,
  targetAttrs?: Record<string, unknown>
): boolean => {
  const baseState = view.state;
  const tr = baseState.tr;
  const listItemType = baseState.schema.nodes.list_item;

  liftOutOfContainers(baseState, tr, listItemType, true);
  applyCommandToTransaction(baseState, tr, setBlockType(targetType, targetAttrs));

  if (tr.docChanged) {
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // 光标原本已在顶层目标块类型时视为幂等成功。
  const currentState = baseState.apply(tr);
  return currentState.selection.$from.parent.hasMarkup(targetType, targetAttrs);
};

/**
 * 执行引用块转换命令（列表先脱出，已在引用内不重复嵌套）。
 */
const runBlockquoteTransform = (view: EditorView): boolean => {
  const baseState = view.state;
  const nodes = baseState.schema.nodes;
  const quoteType = nodes.blockquote;
  const paragraphType = nodes.paragraph;
  if (!quoteType || !paragraphType) {
    return false;
  }

  const tr = baseState.tr;
  if (hasAncestorInSelection(baseState, new Set(['list_item']))) {
    liftOutOfContainers(baseState, tr, nodes.list_item, false);
  }

  const stateAfterLift = baseState.apply(tr);
  if (hasNonParagraphTextblock(stateAfterLift)) {
    applyCommandToTransaction(baseState, tr, setBlockType(paragraphType));
  }

  const stateBeforeWrap = baseState.apply(tr);
  if (!hasAncestorInSelection(stateBeforeWrap, new Set(['blockquote']))) {
    applyCommandToTransaction(baseState, tr, wrapIn(quoteType));
  }

  if (tr.docChanged) {
    view.dispatch(tr.scrollIntoView());
  }

  return tr.docChanged || hasAncestorInSelection(baseState.apply(tr), new Set(['blockquote']));
};

/**
 * 执行块级转换命令。
 */
export const runBlockTransformCommand = (
  view: EditorView,
  command: BlockTransformCommand
): boolean => {
  if (!view?.state || !view?.dispatch) {
    return false;
  }

  if (hasAncestorInSelection(view.state, TABLE_NODE_NAMES)) {
    return false;
  }

  const nodes = view.state.schema.nodes;

  if (command === 'paragraph') {
    return nodes.paragraph ? runTextblockTransform(view, nodes.paragraph) : false;
  }

  if (command in HEADING_LEVEL_MAP) {
    const level = HEADING_LEVEL_MAP[command as keyof typeof HEADING_LEVEL_MAP];
    return nodes.heading ? runTextblockTransform(view, nodes.heading, { level }) : false;
  }

  if (command === 'codeBlock') {
    return nodes.code_block
      ? runTextblockTransform(view, nodes.code_block, { language: 'text' })
      : false;
  }

  if (command === 'blockquote') {
    return runBlockquoteTransform(view);
  }

  if (command in LIST_TRANSFORM_CONFIG_MAP) {
    return runListTransform(view, command as ListBlockTransformCommand, {
      applyCommandToTransaction,
      findNearestAncestor,
      liftOutOfContainers,
      hasNonParagraphTextblock
    });
  }

  return false;
};

/**
 * 解析当前光标所在块的转换命令。
 */
export const resolveActiveBlockTransformCommands = (view: EditorView): Set<BlockTransformCommand> => {
  const from = view.state.selection.$from;
  const activeCommands = new Set<BlockTransformCommand>();
  // 嵌套列表中只识别光标所在最内层列表项及其直接列表类型。
  let hasResolvedListItem = false;
  let hasResolvedList = false;

  for (let depth = from.depth; depth > 0; depth -= 1) {
    const currentNode = from.node(depth);
    const currentNodeName = currentNode.type.name;

    if (currentNodeName === 'code_block') {
      activeCommands.add('codeBlock');
      continue;
    }

    if (currentNodeName === 'blockquote') {
      activeCommands.add('blockquote');
      continue;
    }

    if (currentNodeName === 'heading') {
      const level = Number(currentNode.attrs?.level ?? 0);
      const headingCommand = HEADING_COMMAND_BY_LEVEL[level];
      if (headingCommand) {
        activeCommands.add(headingCommand);
      }
      continue;
    }

    if (currentNodeName === 'list_item') {
      if (!hasResolvedListItem) {
        hasResolvedListItem = true;
        if (typeof currentNode.attrs?.checked === 'boolean') {
          activeCommands.add('taskList');
        }
      }
      continue;
    }

    if (currentNodeName === 'ordered_list') {
      if (!hasResolvedList) {
        hasResolvedList = true;
        activeCommands.add('orderedList');
      }
      continue;
    }

    if (currentNodeName === 'bullet_list') {
      if (!hasResolvedList) {
        hasResolvedList = true;
        activeCommands.add('bulletList');
      }
      continue;
    }

    if (currentNodeName === 'paragraph') {
      activeCommands.add('paragraph');
    }
  }

  // 任务列表与无序列表语义互斥，任务列表优先。
  if (activeCommands.has('taskList')) {
    activeCommands.delete('bulletList');
  }

  if (activeCommands.size === 0) {
    activeCommands.add('paragraph');
  }

  return activeCommands;
};

/**
 * 解析当前光标所在块的主转换命令。
 */
export const resolveCurrentBlockTransformCommand = (view: EditorView): BlockTransformCommand => {
  const activeCommands = resolveActiveBlockTransformCommands(view);
  const primaryCommand = BLOCK_TRANSFORM_COMMAND_PRIORITY.find((command) => activeCommands.has(command));
  return primaryCommand ?? 'paragraph';
};
