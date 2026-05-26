import { setBlockType, wrapIn } from '@milkdown/prose/commands';
import { wrapInList } from '@milkdown/prose/schema-list';
import type { EditorView } from '@milkdown/prose/view';
import type { BlockTransformCommand } from '../../../types/editor';

/**
 * ProseMirror 命令执行器类型。
 */
type EditorCommandExecutor = (state: unknown, dispatch: unknown, view: unknown) => boolean;

/**
 * 执行 ProseMirror 命令。
 */
const runCommand = (command: EditorCommandExecutor, view: EditorView): boolean => {
  return command(view.state, view.dispatch, view);
};

/**
 * 设置当前列表项的任务完成状态。
 */
const setCurrentListItemChecked = (view: EditorView, checked: boolean): boolean => {
  // 当前选区起点。
  const from = view?.state?.selection?.$from;
  if (!from || !view?.dispatch) {
    return false;
  }

  for (let depth = from.depth; depth > 0; depth -= 1) {
    // 当前层级节点。
    const node = from.node(depth);
    if (node?.type?.name !== 'list_item') {
      continue;
    }

    // 当前列表项 attrs 定义。
    const attrsSpec = node.type?.spec?.attrs as Record<string, unknown> | undefined;
    if (!attrsSpec?.checked) {
      return false;
    }

    // 当前列表项位置。
    const itemPosition = from.before(depth);
    view.dispatch(
      view.state.tr.setNodeMarkup(itemPosition, undefined, {
        ...node.attrs,
        checked
      })
    );
    return true;
  }

  return false;
};

/**
 * 构建 heading 层级映射表。
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
 * 列表命令到 schema 节点名映射表。
 */
const LIST_TYPE_MAP: Record<Extract<BlockTransformCommand, 'bulletList' | 'orderedList'>, 'bullet_list' | 'ordered_list'> =
  {
    bulletList: 'bullet_list',
    orderedList: 'ordered_list'
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
 * 执行块级转换命令。
 */
export const runBlockTransformCommand = async (view: EditorView, command: BlockTransformCommand): Promise<boolean> => {
  if (!view?.state || !view?.dispatch) {
    return false;
  }

  // 编辑器 schema 节点集合。
  const nodes = view.state.schema.nodes as Record<string, unknown>;

  if (command === 'paragraph') {
    // paragraph 节点类型。
    const paragraphType = nodes.paragraph;
    if (!paragraphType) {
      return false;
    }

    // paragraph 转换命令。
    const paragraphCommand = (setBlockType as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(
      paragraphType
    );
    return runCommand(paragraphCommand, view);
  }

  if (command in HEADING_LEVEL_MAP) {
    // heading 节点类型。
    const headingType = nodes.heading;
    // heading 层级。
    const level = HEADING_LEVEL_MAP[command as keyof typeof HEADING_LEVEL_MAP];
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

  if (command === 'taskList') {
    // 任务列表基于无序列表和 list_item checked 属性实现。
    const listType = nodes.bullet_list;
    if (!listType) {
      return false;
    }

    // 无序列表包裹命令。
    const listCommand = (wrapInList as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(listType);
    if (!runCommand(listCommand, view)) {
      return false;
    }
    return setCurrentListItemChecked(view, false);
  }

  if (command === 'codeBlock') {
    // 代码块节点类型。
    const codeBlockType = nodes.code_block;
    if (!codeBlockType) {
      return false;
    }

    // 代码块转换命令。
    const codeBlockCommand = (setBlockType as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(
      codeBlockType,
      { language: 'text' }
    );
    return runCommand(codeBlockCommand, view);
  }

  if (command in LIST_TYPE_MAP) {
    // 列表节点类型。
    const listType = nodes[LIST_TYPE_MAP[command as keyof typeof LIST_TYPE_MAP]];
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
 * 解析当前光标所在块的转换命令。
 */
export const resolveActiveBlockTransformCommands = (view: EditorView): Set<BlockTransformCommand> => {
  // 当前选区起点。
  const from = view.state.selection.$from;
  // 当前激活命令集合。
  const activeCommands = new Set<BlockTransformCommand>();

  for (let depth = from.depth; depth > 0; depth -= 1) {
    // 当前层级节点。
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
      const headingCommandMap: Record<number, BlockTransformCommand> = {
        1: 'heading1',
        2: 'heading2',
        3: 'heading3',
        4: 'heading4',
        5: 'heading5',
        6: 'heading6'
      };
      const headingCommand = headingCommandMap[level];
      if (headingCommand) {
        activeCommands.add(headingCommand);
      }
      continue;
    }

    if (currentNodeName === 'list_item') {
      if (typeof currentNode.attrs?.checked === 'boolean') {
        activeCommands.add('taskList');
      }
      continue;
    }

    if (currentNodeName === 'ordered_list') {
      activeCommands.add('orderedList');
      continue;
    }

    if (currentNodeName === 'bullet_list') {
      activeCommands.add('bulletList');
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
  // 当前激活命令集合。
  const activeCommands = resolveActiveBlockTransformCommands(view);
  // 主命令。
  const primaryCommand = BLOCK_TRANSFORM_COMMAND_PRIORITY.find((command) => activeCommands.has(command));
  if (primaryCommand) {
    return primaryCommand;
  }
  
  return 'paragraph';
};
