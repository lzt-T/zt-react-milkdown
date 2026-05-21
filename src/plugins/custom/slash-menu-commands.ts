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
 * 判断当前选区是否位于表格节点内。
 */
const isSelectionInsideTable = (view: any): boolean => {
  // 当前选区起点。
  const from = view?.state?.selection?.$from;
  if (!from) {
    return false;
  }

  for (let depth = from.depth; depth > 0; depth -= 1) {
    // 当前层级节点。
    const currentNode = from.node(depth);
    if (currentNode?.type?.name === 'table') {
      return true;
    }
  }

  return false;
};

/**
 * 从给定位置向上查找表格起始位置。
 */
const findTableStartPos = (view: any, startPos: number): number => {
  // 当前文档对象。
  const doc = view?.state?.doc;
  if (!doc || typeof startPos !== 'number') {
    return -1;
  }

  const boundedPos = Math.min(Math.max(startPos, 0), doc.content.size);
  // 解析后的文档位置对象。
  const resolvedPos = doc.resolve(boundedPos);
  for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
    // 当前层级节点。
    const currentNode = resolvedPos.node(depth);
    if (currentNode?.type?.name === 'table') {
      return resolvedPos.before(depth);
    }
  }

  return -1;
};

/**
 * 构建目标尺寸的表格节点。
 */
const createTableNode = (view: any, rows: number, cols: number, withHeaderRow: boolean): any | null => {
  // 当前 schema。
  const schema = view?.state?.schema;
  // 节点类型集合。
  const nodes = schema?.nodes as Record<string, any> | undefined;
  if (!nodes) {
    return null;
  }

  // 表格相关节点类型。
  const tableType = nodes.table;
  const tableHeaderRowType = nodes.table_header_row;
  const tableRowType = nodes.table_row;
  const tableHeaderType = nodes.table_header;
  const tableCellType = nodes.table_cell;
  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  // 基础单元格数量。
  const normalizedRows = Math.max(1, rows);
  const normalizedCols = Math.max(1, cols);
  // 表格行节点集合。
  const tableRows = Array.from({ length: normalizedRows }, (_rowValue, rowIndex) => {
    // 当前行是否为表头行。
    const useHeaderCell = withHeaderRow && rowIndex === 0;
    // 当前行节点类型。
    const rowType = useHeaderCell ? tableHeaderRowType : tableRowType;
    // 当前行使用的单元格节点类型。
    const cellType = useHeaderCell ? tableHeaderType : tableCellType;
    // 当前行的单元格节点集合。
    const cells = Array.from({ length: normalizedCols }, () => cellType.createAndFill()).filter(Boolean);
    return rowType.create(null, cells);
  });

  return tableType.create(null, tableRows);
};

/**
 * 插入默认表格并将光标定位到首个单元格。
 */
const insertDefaultTable = async (view: any): Promise<boolean> => {
  if (!view?.state || !view?.dispatch) {
    return false;
  }

  if (isSelectionInsideTable(view)) {
    return false;
  }

  // 默认插入起点。
  const insertPos = view.state.selection.from;
  // 默认 3x3 含表头。
  const tableNode = createTableNode(view, 3, 3, true);
  if (!tableNode) {
    return false;
  }

  view.dispatch(view.state.tr.replaceSelectionWith(tableNode).scrollIntoView());

  // 当前表格节点起始位置。
  let tableStart = findTableStartPos(view, insertPos);
  if (tableStart < 0 && insertPos > 0) {
    tableStart = findTableStartPos(view, insertPos - 1);
  }
  if (tableStart < 0) {
    return true;
  }

  // 表格首个单元格节点起点：table > row > cell => tableStart + 2。
  const firstCellStartPos = tableStart + 2;
  if (firstCellStartPos > view.state.doc.content.size) {
    return true;
  }

  // prose state 模块导出集合。
  const proseStateModule = (await import('@milkdown/prose/state')) as Record<string, unknown>;
  // TextSelection 构造器。
  const TextSelection = getObjectValue(proseStateModule, 'TextSelection') as
    | {
        create: (doc: unknown, from: number, to?: number) => unknown;
        near: (resolvedPos: unknown, bias?: number) => unknown;
      }
    | undefined;
  if (!TextSelection || typeof TextSelection.near !== 'function') {
    return true;
  }

  // 从首个单元格起点向前找最近可编辑文本位置，确保进入单元格内部可输入态。
  const textSelection = TextSelection.near(view.state.doc.resolve(firstCellStartPos), 1);
  view.dispatch(view.state.tr.setSelection(textSelection).scrollIntoView());
  view.focus();
  return true;
};

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
 * 从 schema marks 中按候选名解析 mark 类型。
 */
const resolveMarkType = (view: any, markNames: string[]): unknown | null => {
  // 当前 schema mark 集合。
  const marks = (view?.state?.schema?.marks ?? {}) as Record<string, unknown>;
  // 命中的 mark 名称。
  const matchedName = markNames.find((markName) => marks[markName]);
  return matchedName ? marks[matchedName] ?? null : null;
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
  // toggleMark 命令工厂。
  const toggleMark = getObjectValue(proseCommandsModule, 'toggleMark');
  // wrapInList 命令工厂。
  const wrapInList = getObjectValue(proseListModule, 'wrapInList');
  if (
    typeof setBlockType !== 'function' ||
    typeof wrapIn !== 'function' ||
    typeof wrapInList !== 'function' ||
    typeof toggleMark !== 'function'
  ) {
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
    heading3: 3,
    heading4: 4,
    heading5: 5,
    heading6: 6
  };
  // 列表节点映射。
  const listTypeMap: Partial<Record<SlashMenuCommand, string>> = {
    bulletList: 'bullet_list',
    orderedList: 'ordered_list'
  };

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

  if (command === 'inlineCode') {
    // inline code mark 类型（兼容不同命名）。
    const inlineCodeMarkType = resolveMarkType(view, ['inlineCode', 'code_inline']);
    if (!inlineCodeMarkType) {
      return false;
    }
    // 行内代码切换命令。
    const inlineCodeCommand = (toggleMark as (markType: unknown, attrs?: Record<string, unknown>) => EditorCommandExecutor)(
      inlineCodeMarkType
    );
    return runCommand(inlineCodeCommand, view);
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

  if (command === 'table') {
    return insertDefaultTable(view);
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
