import {
  bulletListSchema,
  listItemSchema,
  orderedListSchema
} from '@milkdown/preset-commonmark';
import type { Node as ProseNode, NodeType } from '@milkdown/prose/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

// 与 @milkdown/preset-commonmark 保持一致的列表序号插件标识。
const KEEP_LIST_ORDER_PLUGIN_KEY = 'MILKDOWN_KEEP_LIST_ORDER';
// 表格节点类型名（内部不可能包含列表，遍历时直接剪枝）。
const TABLE_NODE_NAME = 'table';

/**
 * 校验并更新单个列表项的有序序号标签。
 */
const applyOrderedLabel = (
  attrs: Record<string, unknown>,
  index: number,
  order = 1
): boolean => {
  const expectedLabel = `${index + order}.`;
  if (attrs.label === expectedLabel) {
    return false;
  }

  attrs.label = expectedLabel;
  return true;
};

/**
 * 将指定位置所属的最外层列表节点加入受影响集合。
 */
const addOutermostListAtPos = (
  doc: ProseNode,
  pos: number,
  orderedListType: NodeType,
  bulletListType: NodeType,
  affectedLists: Map<number, ProseNode>
): void => {
  const clampedPos = Math.max(0, Math.min(doc.content.size, pos));
  const resolvedPos = doc.resolve(clampedPos);
  for (let depth = 1; depth <= resolvedPos.depth; depth += 1) {
    const node = resolvedPos.node(depth);
    if (node.type === orderedListType || node.type === bulletListType) {
      affectedLists.set(resolvedPos.before(depth), node);
      return;
    }
  }
};

/**
 * 收集文档差异区间内全部受影响的最外层列表节点。
 */
const collectAffectedLists = (
  prevDoc: ProseNode,
  nextDoc: ProseNode,
  orderedListType: NodeType,
  bulletListType: NodeType
): Map<number, ProseNode> => {
  const affectedLists = new Map<number, ProseNode>();
  const from = prevDoc.content.findDiffStart(nextDoc.content);
  if (from == null) {
    return affectedLists;
  }

  const diffEnd = prevDoc.content.findDiffEnd(nextDoc.content);
  if (!diffEnd) {
    return affectedLists;
  }

  const to = Math.max(diffEnd.b, from);
  addOutermostListAtPos(nextDoc, from, orderedListType, bulletListType, affectedLists);
  if (to > from) {
    addOutermostListAtPos(nextDoc, to, orderedListType, bulletListType, affectedLists);
    nextDoc.nodesBetween(from, to, (node, pos) => {
      if (node.type === orderedListType || node.type === bulletListType) {
        affectedLists.set(pos, node);
        return false;
      }

      if (node.isTextblock || node.type.name === TABLE_NODE_NAME) {
        return false;
      }

      return true;
    });
  }

  return affectedLists;
};

/**
 * 增量列表序号同步插件：仅在文档变更触及列表时同步受影响列表子树。
 */
export const syncListOrderIncrementalPlugin = $prose((ctx) => {
  const orderedListType = orderedListSchema.type(ctx);
  const bulletListType = bulletListSchema.type(ctx);
  const listItemType = listItemSchema.type(ctx);

  /**
   * 递归同步单个列表子树内有序列表类型及序号标签。
   */
  const syncListSubtree = (
    node: ProseNode,
    absPos: number,
    parent: ProseNode | null,
    indexInParent: number,
    getTransaction: () => Transaction
  ): void => {
    if (node.type === bulletListType) {
      const firstItem = node.maybeChild(0);
      if (firstItem?.type === listItemType && firstItem.attrs.listType === 'ordered') {
        const tr = getTransaction();
        tr.setNodeMarkup(absPos, orderedListType, { spread: true });
        node.forEach((child, offset, childIndex) => {
          const childPos = absPos + 1 + offset;
          if (child.type === listItemType) {
            const attrs = { ...child.attrs };
            if (applyOrderedLabel(attrs, childIndex)) {
              tr.setNodeMarkup(childPos, undefined, attrs);
            }
            // 仅继续检查列表项内部的嵌套列表，不重复处理当前列表项本身。
            child.forEach((grandChild, grandOffset, grandIndex) => {
              syncListSubtree(
                grandChild,
                childPos + 1 + grandOffset,
                child,
                grandIndex,
                getTransaction
              );
            });
            return;
          }

          syncListSubtree(child, childPos, node, childIndex, getTransaction);
        });
        return;
      }
    } else if (node.type === listItemType && parent?.type === orderedListType) {
      const attrs = { ...node.attrs };
      let changed = false;
      if (attrs.listType !== 'ordered') {
        attrs.listType = 'ordered';
        changed = true;
      }
      if (parent.maybeChild(0)) {
        const order = typeof parent.attrs.order === 'number' ? parent.attrs.order : 1;
        if (applyOrderedLabel(attrs, indexInParent, order)) {
          changed = true;
        }
      }
      if (changed) {
        getTransaction().setNodeMarkup(absPos, undefined, attrs);
      }
    }

    if (node.isTextblock || node.type.name === TABLE_NODE_NAME) {
      return;
    }

    node.forEach((child, offset, childIndex) => {
      syncListSubtree(child, absPos + 1 + offset, node, childIndex, getTransaction);
    });
  };

  /**
   * 在事务后置阶段按变更区间增量同步列表序号。
   */
  const syncOrderLabel = (
    transactions: readonly Transaction[],
    oldState: EditorState,
    newState: EditorState
  ): Transaction | null => {
    if (
      !newState.selection ||
      !transactions.some((tr) => tr.docChanged) ||
      transactions.some((tr) => tr.getMeta('addToHistory') === false || !tr.isGeneric)
    ) {
      return null;
    }

    const affectedLists = collectAffectedLists(
      oldState.doc,
      newState.doc,
      orderedListType,
      bulletListType
    );
    if (affectedLists.size === 0) {
      return null;
    }

    let tr: Transaction | null = null;
    const getTransaction = (): Transaction => {
      if (!tr) {
        tr = newState.tr;
      }
      return tr;
    };

    affectedLists.forEach((listNode, listPos) => {
      const resolvedList = newState.doc.resolve(listPos);
      syncListSubtree(
        listNode,
        listPos,
        resolvedList.parent,
        resolvedList.index(),
        getTransaction
      );
    });

    return tr ? (tr as Transaction).setMeta('addToHistory', false) : null;
  };

  return new Plugin({
    key: new PluginKey(KEEP_LIST_ORDER_PLUGIN_KEY),
    appendTransaction: syncOrderLabel
  });
});
