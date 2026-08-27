import { GapCursor } from '@milkdown/prose/gapcursor';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type Selection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 向上离开特殊内容块的方向值。
const BLOCK_BOUNDARY_DIRECTION_UP = -1;
// 向下离开特殊内容块的方向值。
const BLOCK_BOUNDARY_DIRECTION_DOWN = 1;
// 支持边界导航的特殊内容块节点名。
const SPECIAL_BLOCK_NODE_NAMES = new Set(['math_block', 'code_block', 'table', 'image', 'hr']);

/** 特殊内容块边界导航方向。 */
type BlockBoundaryDirection =
  | typeof BLOCK_BOUNDARY_DIRECTION_UP
  | typeof BLOCK_BOUNDARY_DIRECTION_DOWN;

/** 特殊内容块在文档中的定位信息。 */
interface SpecialBlockContext {
  /** 特殊内容块节点。 */
  node: ProseNode;
  /** 特殊内容块起始位置。 */
  position: number;
  /** 特殊内容块所在深度。 */
  depth: number;
}

/** GapCursor 构造器补充类型。 */
type GapCursorConstructor = typeof GapCursor & {
  /** 判断指定位置是否允许创建 GapCursor。 */
  valid: (position: ResolvedPos) => boolean;
};

/**
 * 判断编辑器当前是否允许修改内容。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 创建特殊内容块边界选区，优先使用 GapCursor。
 */
const createBoundarySelection = (
  view: EditorView,
  targetPosition: number,
  direction: BlockBoundaryDirection
): Selection => {
  // 目标解析位置。
  const resolvedPosition = view.state.doc.resolve(targetPosition);
  // 带合法性判断的 GapCursor 构造器。
  const gapCursorConstructor = GapCursor as GapCursorConstructor;
  if (gapCursorConstructor.valid(resolvedPosition)) {
    return new GapCursor(resolvedPosition);
  }

  return TextSelection.near(resolvedPosition, direction);
};

/**
 * 判断目标边界的导航方向上是否已有相邻节点。
 */
const hasAdjacentNode = (
  resolvedPosition: ResolvedPos,
  direction: BlockBoundaryDirection
): boolean => {
  return direction === BLOCK_BOUNDARY_DIRECTION_UP
    ? resolvedPosition.nodeBefore !== null
    : resolvedPosition.nodeAfter !== null;
};

/**
 * 尝试在空缺的特殊内容块边界插入普通段落并聚焦。
 */
const insertBoundaryParagraph = (
  view: EditorView,
  targetPosition: number
): boolean => {
  // 普通段落节点类型。
  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) {
    return false;
  }

  // 目标解析位置。
  const resolvedPosition = view.state.doc.resolve(targetPosition);
  // 目标位置在父节点中的插入索引。
  const insertionIndex = resolvedPosition.index();
  if (!resolvedPosition.parent.canReplaceWith(insertionIndex, insertionIndex, paragraphType)) {
    return false;
  }

  // 待插入的空段落节点。
  const paragraphNode = paragraphType.createAndFill();
  if (!paragraphNode) {
    return false;
  }

  // 插入段落后的事务。
  const transaction = view.state.tr.insert(targetPosition, paragraphNode);
  // 新段落内部的文本光标位置。
  const selectionPosition = targetPosition + 1;
  transaction
    .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition), 1))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 按指定方向离开特殊内容块。
 */
const moveSelectionFromBlockBoundary = (
  view: EditorView,
  blockPosition: number,
  blockNode: ProseNode,
  direction: BlockBoundaryDirection
): boolean => {
  if (!SPECIAL_BLOCK_NODE_NAMES.has(blockNode.type.name)) {
    return false;
  }

  // 特殊内容块目标边界位置。
  const targetPosition =
    direction === BLOCK_BOUNDARY_DIRECTION_UP
      ? blockPosition
      : blockPosition + blockNode.nodeSize;
  if (targetPosition < 0 || targetPosition > view.state.doc.content.size) {
    return false;
  }

  // 目标边界解析位置。
  const resolvedPosition = view.state.doc.resolve(targetPosition);
  if (!hasAdjacentNode(resolvedPosition, direction) && insertBoundaryParagraph(view, targetPosition)) {
    return true;
  }

  // 相邻内容存在或无法插入段落时，回退到合法边界选区。
  const transaction = view.state.tr
    .setSelection(createBoundarySelection(view, targetPosition, direction))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
};

/**
 * 解析当前文本选区所在的特殊内容块。
 */
const resolveSpecialBlockContext = (resolvedPosition: ResolvedPos): SpecialBlockContext | null => {
  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    // 当前深度节点。
    const currentNode = resolvedPosition.node(depth);
    if (!SPECIAL_BLOCK_NODE_NAMES.has(currentNode.type.name)) {
      continue;
    }

    return {
      node: currentNode,
      position: resolvedPosition.before(depth),
      depth
    };
  }

  return null;
};

/**
 * 判断选区是否位于特殊内容块指定方向的首个或末个内容分支。
 */
const isSelectionOnDirectionalBranch = (
  resolvedPosition: ResolvedPos,
  blockDepth: number,
  direction: BlockBoundaryDirection
): boolean => {
  for (let depth = blockDepth; depth < resolvedPosition.depth; depth += 1) {
    // 当前层级父节点。
    const parentNode = resolvedPosition.node(depth);
    // 选区所在的子节点索引。
    const childIndex = resolvedPosition.index(depth);
    // 当前方向要求命中的边界子节点索引。
    const boundaryIndex =
      direction === BLOCK_BOUNDARY_DIRECTION_UP ? 0 : parentNode.childCount - 1;
    if (childIndex !== boundaryIndex) {
      return false;
    }
  }

  return true;
};

/**
 * 处理主编辑器中指定方向的特殊内容块边界导航。
 */
const handleDirectionalBoundary = (
  view: EditorView,
  direction: BlockBoundaryDirection
): boolean => {
  // 当前编辑器选区。
  const { selection } = view.state;
  if (selection instanceof NodeSelection) {
    return moveSelectionFromBlockBoundary(view, selection.from, selection.node, direction);
  }
  if (!selection.empty) {
    return false;
  }

  // 当前文本选区所在的特殊内容块。
  const blockContext = resolveSpecialBlockContext(selection.$from);
  if (!blockContext || !isSelectionOnDirectionalBranch(selection.$from, blockContext.depth, direction)) {
    return false;
  }

  // ProseMirror 基于实际排版判断光标是否位于首个或末个视觉行。
  const isAtTextblockEdge = view.endOfTextblock(
    direction === BLOCK_BOUNDARY_DIRECTION_UP ? 'up' : 'down'
  );
  if (!isAtTextblockEdge) {
    return false;
  }

  return moveSelectionFromBlockBoundary(
    view,
    blockContext.position,
    blockContext.node,
    direction
  );
};

/**
 * 在文档最终文本分支按向下键时插入下一行。
 */
const insertTrailingParagraphOnArrowDown = (view: EditorView): boolean => {
  // 当前文档与选区。
  const { doc, selection } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  // 当前选区是否位于文档最终内容分支。
  const isOnLastDocumentBranch =
    selection.$from.after(1) === doc.content.size &&
    isSelectionOnDirectionalBranch(selection.$from, 1, BLOCK_BOUNDARY_DIRECTION_DOWN);
  if (!isOnLastDocumentBranch || !view.endOfTextblock('down')) {
    return false;
  }

  return insertBoundaryParagraph(view, doc.content.size);
};

/**
 * 处理向上离开特殊内容块。
 */
const handleArrowUpBoundary = (view: EditorView): boolean => {
  return handleDirectionalBoundary(view, BLOCK_BOUNDARY_DIRECTION_UP);
};

/**
 * 处理向下边界导航。
 */
const handleArrowDownBoundary = (view: EditorView): boolean => {
  return (
    handleDirectionalBoundary(view, BLOCK_BOUNDARY_DIRECTION_DOWN) ||
    insertTrailingParagraphOnArrowDown(view)
  );
};

// 方向键到边界导航策略的固定映射表。
const BLOCK_BOUNDARY_KEY_STRATEGY_MAP: Readonly<Record<string, (view: EditorView) => boolean>> = {
  ArrowUp: handleArrowUpBoundary,
  ArrowDown: handleArrowDownBoundary
};

/**
 * 判断键盘事件是否应跳过内容块边界导航。
 */
const shouldSkipBoundaryKeydown = (view: EditorView, event: KeyboardEvent): boolean => {
  return (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !isEditorViewEditable(view)
  );
};

/**
 * 供 NodeView 内部编辑控件按方向键离开特殊内容块。
 */
export const moveSelectionFromSpecialBlock = (
  view: EditorView,
  blockPosition: number,
  blockNode: ProseNode,
  key: string
): boolean => {
  // 按键对应的导航方向。
  const direction = key === 'ArrowUp'
    ? BLOCK_BOUNDARY_DIRECTION_UP
    : key === 'ArrowDown'
      ? BLOCK_BOUNDARY_DIRECTION_DOWN
      : null;
  if (direction === null || !isEditorViewEditable(view)) {
    return false;
  }

  return moveSelectionFromBlockBoundary(view, blockPosition, blockNode, direction);
};

/**
 * 内容块边界导航插件。
 */
export const blockBoundaryNavigationPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey('zt-md-block-boundary-navigation'),
    props: {
      handleKeyDown: (view, event) => {
        // 当前按键对应的边界导航策略。
        const navigationStrategy = BLOCK_BOUNDARY_KEY_STRATEGY_MAP[event.key];
        if (!navigationStrategy || shouldSkipBoundaryKeydown(view as EditorView, event)) {
          return false;
        }

        // 当前按键是否完成边界导航。
        const handled = navigationStrategy(view as EditorView);
        if (handled) {
          event.preventDefault();
        }
        return handled;
      }
    }
  });
});
