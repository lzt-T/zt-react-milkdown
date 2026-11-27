import { setBlockType } from '@milkdown/prose/commands';
import type { Node as ProseNode, NodeType, ResolvedPos } from '@milkdown/prose/model';
import { wrapInList } from '@milkdown/prose/schema-list';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import { canJoin } from '@milkdown/prose/transform';
import type { EditorView } from '@milkdown/prose/view';
import type { BlockTransformCommand } from '@/types/editor';

/**
 * ProseMirror 命令执行器类型。
 */
export type EditorCommandExecutor = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void
) => boolean;

/**
 * 列表块转换命令类型。
 */
export type ListBlockTransformCommand = Extract<
  BlockTransformCommand,
  'bulletList' | 'orderedList' | 'taskList'
>;

/**
 * 祖先节点查询结果。
 */
export interface AncestorMatch {
  /** 祖先层级深度。 */
  depth: number;
  /** 祖先节点实例。 */
  node: ProseNode;
  /** 祖先节点起始文档位置。 */
  pos: number;
}

/**
 * 列表转换目标属性配置。
 */
interface ListTransformConfig {
  /** 目标列表节点名称。 */
  listNodeName: 'bullet_list' | 'ordered_list';
  /** 列表项 listType 属性值。 */
  listTypeAttr: 'bullet' | 'ordered';
  /** 列表项默认标签。 */
  defaultLabel: string;
  /** 列表项 checked 属性处理模式。 */
  checkedMode: 'clear' | 'ensure';
}

/**
 * 选区命中的单一列表子项条目。
 */
interface ListItemEntry {
  /** 列表项起始文档位置。 */
  itemPos: number;
  /** 列表项节点实例。 */
  itemNode: ProseNode;
  /** 在所属列表中的索引。 */
  itemIndex: number;
}

/**
 * 选区共同归属的单一列表范围。
 */
interface UniformListRange {
  /** 所属列表起始文档位置。 */
  listPos: number;
  /** 所属列表节点实例。 */
  listNode: ProseNode;
  /** 起始子项索引（含）。 */
  startIndex: number;
  /** 结束子项索引（不含）。 */
  endIndex: number;
  /** 选区覆盖的直接列表项条目。 */
  itemEntries: ListItemEntry[];
}

/**
 * 列表转换所需的共享事务与文档辅助依赖。
 */
export interface ListTransformDependencies {
  applyCommandToTransaction: (
    baseState: EditorState,
    tr: Transaction,
    command: EditorCommandExecutor
  ) => boolean;
  findNearestAncestor: (
    resolvedPos: ResolvedPos,
    names: ReadonlySet<string>
  ) => AncestorMatch | null;
  liftOutOfContainers: (
    baseState: EditorState,
    tr: Transaction,
    listItemType: NodeType | undefined,
    includeBlockquote: boolean
  ) => void;
  hasNonParagraphTextblock: (state: EditorState) => boolean;
}

// 列表节点名称集合。
const LIST_NODE_NAMES = new Set(['ordered_list', 'bullet_list']);

/**
 * 列表转换命令配置映射表。
 */
export const LIST_TRANSFORM_CONFIG_MAP: Record<ListBlockTransformCommand, ListTransformConfig> = {
  bulletList: {
    listNodeName: 'bullet_list',
    listTypeAttr: 'bullet',
    defaultLabel: '•',
    checkedMode: 'clear'
  },
  orderedList: {
    listNodeName: 'ordered_list',
    listTypeAttr: 'ordered',
    defaultLabel: '1.',
    checkedMode: 'clear'
  },
  taskList: {
    listNodeName: 'bullet_list',
    listTypeAttr: 'bullet',
    defaultLabel: '•',
    checkedMode: 'ensure'
  }
};

/**
 * 判断节点是否为列表容器节点。
 */
const isListNode = (node: ProseNode): boolean => LIST_NODE_NAMES.has(node.type.name);

/**
 * 判断选区是否全部归属于同一个列表容器，并解析命中的子项范围。
 */
const resolveUniformSelectedListRange = (
  doc: ProseNode,
  from: number,
  to: number
): UniformListRange | null => {
  const range = doc.resolve(from).blockRange(doc.resolve(to), isListNode);
  if (!range || range.depth <= 0 || range.endIndex <= range.startIndex) {
    return null;
  }

  const listPos = range.$from.before(range.depth);
  const listNode = range.parent;
  const itemEntries: ListItemEntry[] = [];

  listNode.forEach((child, offset, index) => {
    if (index >= range.startIndex && index < range.endIndex) {
      itemEntries.push({
        itemPos: listPos + 1 + offset,
        itemNode: child,
        itemIndex: index
      });
    }
  });

  return itemEntries.length > 0
    ? {
        listPos,
        listNode,
        startIndex: range.startIndex,
        endIndex: range.endIndex,
        itemEntries
      }
    : null;
};

/**
 * 根据目标列表配置构建列表项的新属性对象。
 */
const buildNextListItemAttrs = (
  itemNode: ProseNode,
  config: ListTransformConfig
): Record<string, unknown> | null => {
  const currentAttrs = itemNode.attrs as Record<string, unknown>;
  const attrsSpec = itemNode.type.spec.attrs as Record<string, unknown> | undefined;
  const supportsChecked = Boolean(attrsSpec?.checked);
  // 同为有序列表项时保留既有序号标签，避免在第 2 项及之后重复触发无效修改。
  const nextLabel =
    config.listTypeAttr === 'ordered' &&
    currentAttrs.listType === 'ordered' &&
    typeof currentAttrs.label === 'string' &&
    currentAttrs.label.length > 0
      ? currentAttrs.label
      : config.defaultLabel;

  const nextAttrs: Record<string, unknown> = {
    ...currentAttrs,
    listType: config.listTypeAttr,
    label: nextLabel
  };

  if (supportsChecked) {
    nextAttrs.checked =
      config.checkedMode === 'ensure'
        ? typeof currentAttrs.checked === 'boolean'
          ? currentAttrs.checked
          : false
        : null;
  }

  const hasChanged =
    nextAttrs.listType !== currentAttrs.listType ||
    nextAttrs.label !== currentAttrs.label ||
    (supportsChecked && nextAttrs.checked !== currentAttrs.checked);

  return hasChanged ? nextAttrs : null;
};

/**
 * 构建目标列表容器的节点属性。
 */
const buildListNodeAttrs = (
  listNode: ProseNode | null,
  config: ListTransformConfig
): Record<string, unknown> => {
  const spread = Boolean(listNode?.attrs?.spread);
  return config.listNodeName === 'ordered_list' ? { order: 1, spread } : { spread };
};

/**
 * 同步指定列表节点全部直接子项的属性。
 */
const syncDirectListItemsAttrs = (
  tr: Transaction,
  listPos: number,
  config: ListTransformConfig
): void => {
  const listNode = tr.doc.nodeAt(listPos);
  if (!listNode || !isListNode(listNode)) {
    return;
  }

  listNode.forEach((child, offset) => {
    if (child.type.name !== 'list_item') {
      return;
    }

    const nextAttrs = buildNextListItemAttrs(child, config);
    if (nextAttrs) {
      tr.setNodeMarkup(listPos + 1 + offset, undefined, nextAttrs);
    }
  });
};

/**
 * 将列表容器与前后相邻的同类型兄弟列表合并。
 */
const joinAdjacentSameLists = (
  tr: Transaction,
  listPos: number,
  targetListType: NodeType
): void => {
  const currentListNode = tr.doc.nodeAt(listPos);
  if (!currentListNode) {
    return;
  }

  // 先尝试合并后方兄弟列表，保证 listPos 本身偏移不失效。
  const afterPos = listPos + currentListNode.nodeSize;
  if (afterPos <= tr.doc.content.size) {
    const resolvedAfter = tr.doc.resolve(afterPos);
    if (resolvedAfter.nodeAfter?.type === targetListType && canJoin(tr.doc, afterPos)) {
      tr.join(afterPos);
    }
  }

  // 再尝试合并前方兄弟列表。
  if (listPos > 0 && listPos <= tr.doc.content.size) {
    const resolvedBefore = tr.doc.resolve(listPos);
    if (resolvedBefore.nodeBefore?.type === targetListType && canJoin(tr.doc, listPos)) {
      tr.join(listPos);
    }
  }
};

/**
 * 同步当前选区范围内所有最内层列表项的属性。
 */
const syncSelectedListItemsAttrs = (
  tr: Transaction,
  config: ListTransformConfig,
  findNearestAncestor: ListTransformDependencies['findNearestAncestor']
): void => {
  const { from, to } = tr.selection;
  const itemPositions = new Set<number>();
  const listItemNames = new Set(['list_item']);

  if (from === to) {
    const nearestItem = findNearestAncestor(tr.doc.resolve(from), listItemNames);
    if (nearestItem) {
      itemPositions.add(nearestItem.pos);
    }
  } else {
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) {
        return true;
      }

      const nearestItem = findNearestAncestor(tr.doc.resolve(pos + 1), listItemNames);
      if (nearestItem) {
        itemPositions.add(nearestItem.pos);
      }
      return false;
    });
  }

  Array.from(itemPositions)
    .sort((a, b) => a - b)
    .forEach((itemPos) => {
      const itemNode = tr.doc.nodeAt(itemPos);
      if (!itemNode || itemNode.type.name !== 'list_item') {
        return;
      }

      const nextAttrs = buildNextListItemAttrs(itemNode, config);
      if (nextAttrs) {
        tr.setNodeMarkup(itemPos, undefined, nextAttrs);
      }
    });
};

/**
 * 在单一列表容器内部执行列表类型互转。
 */
const transformWithinUniformList = (
  tr: Transaction,
  uniformRange: UniformListRange,
  targetListType: NodeType,
  config: ListTransformConfig,
  findNearestAncestor: ListTransformDependencies['findNearestAncestor']
): boolean => {
  const { listPos, listNode, startIndex, endIndex, itemEntries } = uniformRange;
  const isSameContainerType = listNode.type === targetListType;
  const allItemsMatchTarget =
    isSameContainerType &&
    itemEntries.every((entry) => buildNextListItemAttrs(entry.itemNode, config) === null);

  if (allItemsMatchTarget) {
    return true;
  }

  // 容器节点类型不变（如无序 <-> 任务）时原地更新选中项属性即可，不拆分列表。
  if (isSameContainerType) {
    itemEntries.forEach((entry) => {
      const nextAttrs = buildNextListItemAttrs(entry.itemNode, config);
      if (nextAttrs) {
        tr.setNodeMarkup(entry.itemPos, undefined, nextAttrs);
      }
    });
    return tr.docChanged;
  }

  // 先切后界再切前界，保证前方偏移在切分期间稳定。
  if (endIndex < listNode.childCount) {
    let splitAfterPos = -1;
    listNode.forEach((_child, offset, index) => {
      if (index === endIndex) {
        splitAfterPos = listPos + 1 + offset;
      }
    });
    if (splitAfterPos > 0) {
      tr.split(splitAfterPos, 1);
    }
  }

  if (startIndex > 0) {
    tr.split(itemEntries[0].itemPos, 1);
  }

  const splitListRange = tr.selection.$from.blockRange(tr.selection.$to, isListNode);
  const splitListMatch =
    splitListRange && splitListRange.depth > 0
      ? {
          pos: splitListRange.$from.before(splitListRange.depth),
          node: splitListRange.parent
        }
      : findNearestAncestor(tr.selection.$from, LIST_NODE_NAMES);
  if (!splitListMatch) {
    return false;
  }

  tr.setNodeMarkup(
    splitListMatch.pos,
    targetListType,
    buildListNodeAttrs(splitListMatch.node, config)
  );
  syncDirectListItemsAttrs(tr, splitListMatch.pos, config);
  joinAdjacentSameLists(tr, splitListMatch.pos, targetListType);
  return tr.docChanged;
};

/**
 * 执行列表类（无序列表 / 有序列表 / 任务列表）块级转换命令。
 */
export const runListTransform = (
  view: EditorView,
  command: ListBlockTransformCommand,
  deps: ListTransformDependencies
): boolean => {
  const baseState = view.state;
  const nodes = baseState.schema.nodes;
  const config = LIST_TRANSFORM_CONFIG_MAP[command];
  const targetListType = nodes[config.listNodeName];
  const paragraphType = nodes.paragraph;
  if (!targetListType || !paragraphType) {
    return false;
  }

  const tr = baseState.tr;
  const uniformRange = resolveUniformSelectedListRange(
    baseState.doc,
    baseState.selection.from,
    baseState.selection.to
  );

  if (uniformRange) {
    const transformed = transformWithinUniformList(
      tr,
      uniformRange,
      targetListType,
      config,
      deps.findNearestAncestor
    );
    if (tr.docChanged) {
      view.dispatch(tr.scrollIntoView());
    }
    return transformed;
  }

  // 非列表或跨块混合选区：先脱出外层容器并归正为段落，再包裹目标列表并同步属性。
  deps.liftOutOfContainers(baseState, tr, nodes.list_item, true);
  if (deps.hasNonParagraphTextblock(baseState.apply(tr))) {
    deps.applyCommandToTransaction(baseState, tr, setBlockType(paragraphType));
  }

  if (!deps.applyCommandToTransaction(baseState, tr, wrapInList(targetListType))) {
    return false;
  }

  syncSelectedListItemsAttrs(tr, config, deps.findNearestAncestor);
  if (tr.docChanged) {
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  return false;
};
