import type { SlashMenuCommand } from '../../types/editor';

/**
 * slash 命令执行器类型。
 */
type EditorCommandExecutor = (state: unknown, dispatch: unknown, view: unknown) => boolean;

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
 * 执行 ProseMirror 命令。
 */
const runCommand = (command: EditorCommandExecutor, view: any): boolean => command(view.state, view.dispatch, view);

/**
 * 设置当前列表项的任务完成状态。
 */
const setCurrentListItemChecked = (view: any, checked: boolean): boolean => {
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
 * 运行 slash 命令并返回是否成功。
 */
export const runSlashCommand = async (view: any, command: SlashMenuCommand): Promise<boolean> => {
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
    orderedList: 'ordered_list'
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

  if (command === 'mathBlock') {
    // 公式块节点类型。
    const mathBlockType = nodes.math_block;
    if (!mathBlockType) {
      return false;
    }
    // 公式块转换命令（依赖 math_block 默认 attrs.value 为空字符串）。
    const mathBlockCommand = (setBlockType as (type: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(
      mathBlockType
    );
    // 是否成功转换为公式块。
    const converted = runCommand(mathBlockCommand, view);
    if (!converted) {
      return false;
    }

    // prose state 模块导出集合。
    const proseStateModule = (await import('@milkdown/prose/state')) as Record<string, unknown>;
    // NodeSelection 构造器。
    const NodeSelection = getObjectValue(proseStateModule, 'NodeSelection') as
      | { create: (doc: unknown, from: number) => unknown }
      | undefined;
    if (!NodeSelection || typeof NodeSelection.create !== 'function') {
      return true;
    }

    // 当前选区起点（转换后的选区解析对象）。
    const from = view.state.selection?.$from;
    if (!from) {
      return true;
    }

    // 当前 math_block 节点在文档中的真实起始位置。
    let mathBlockPosition: number | null = null;
    for (let depth = from.depth; depth > 0; depth -= 1) {
      // 当前层节点。
      const currentNode = from.node(depth);
      if (currentNode?.type?.name !== 'math_block') {
        continue;
      }
      mathBlockPosition = from.before(depth);
      break;
    }

    if (mathBlockPosition === null) {
      return true;
    }

    // 选中公式块节点，触发 NodeView.selectNode -> enterEditMode -> textarea.focus。
    const nodeSelection = NodeSelection.create(view.state.doc, mathBlockPosition);
    view.dispatch(view.state.tr.setSelection(nodeSelection).scrollIntoView());
    return true;
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
