import { setBlockType, toggleMark } from '@milkdown/prose/commands';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import type { SlashMenuCommand } from '../../../types/editor';
import type { BlockTransformCommand } from '../../../types/editor';
import { runBlockTransformCommand } from '../block-transform';
import { mathInlineEditPluginKey } from '../math/math-inline-edit-plugin';

/**
 * slash 命令执行器类型。
 */
type EditorCommandExecutor = (state: unknown, dispatch: unknown, view: unknown) => boolean;

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

  // 从首个单元格起点向前找最近可编辑文本位置，确保进入单元格内部可输入态。
  const textSelection = TextSelection.near(view.state.doc.resolve(firstCellStartPos), 1);
  view.dispatch(view.state.tr.setSelection(textSelection).scrollIntoView());
  view.focus();
  return true;
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
 * 块级转换命令集合。
 */
const BLOCK_TRANSFORM_COMMAND_SET: ReadonlySet<BlockTransformCommand> = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock'
]);

/**
 * 判断命令是否为块级转换命令。
 */
const isBlockTransformCommand = (command: SlashMenuCommand): command is BlockTransformCommand => {
  return BLOCK_TRANSFORM_COMMAND_SET.has(command as BlockTransformCommand);
};

/**
 * 插入空行内公式并选中该节点。
 */
const insertInlineMath = async (view: any): Promise<boolean> => {
  // 行内公式节点类型。
  const mathInlineType = view?.state?.schema?.nodes?.math_inline;
  if (!mathInlineType || !view?.dispatch) {
    return false;
  }

  // 插入位置。
  const insertPosition = view.state.selection.from;
  // 空行内公式节点。
  const mathInlineNode = mathInlineType.create({ value: '' });
  view.dispatch(
    view.state.tr
      .replaceSelectionWith(mathInlineNode)
      .setMeta(mathInlineEditPluginKey, { type: 'open', position: insertPosition })
      .scrollIntoView()
  );
  return true;
};

/**
 * 运行 slash 命令并返回是否成功。
 */
export const runSlashCommand = async (view: any, command: SlashMenuCommand): Promise<boolean> => {
  if (!view?.state || !view?.dispatch) {
    return false;
  }

  // 编辑器 schema。
  const schema = view.state.schema as Record<string, unknown>;
  // 节点类型集合。
  const nodes = (schema?.nodes ?? {}) as Record<string, unknown>;
  if (isBlockTransformCommand(command)) {
    return runBlockTransformCommand(view, command);
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

  if (command === 'inlineMath') {
    return insertInlineMath(view);
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

  return false;
};

