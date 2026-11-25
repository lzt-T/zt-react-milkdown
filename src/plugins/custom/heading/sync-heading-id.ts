import { headingIdGenerator, headingSchema } from '@milkdown/preset-commonmark';
import type { Node as ProseNode, NodeType } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 与 @milkdown/preset-commonmark 保持一致的标题 ID 插件标识。
const HEADING_ID_PLUGIN_KEY = 'MILKDOWN_HEADING_ID';
// 表格节点类型名（内部不可能包含标题，遍历时直接剪枝）。
const TABLE_NODE_NAME = 'table';

/**
 * 判断指定文档位置及其祖先链或子区间是否触及标题节点。
 */
const doesRangeTouchHeading = (
  doc: ProseNode,
  rangeFrom: number,
  rangeTo: number,
  headingType: NodeType
): boolean => {
  const clampedFrom = Math.max(0, Math.min(doc.content.size, rangeFrom));
  const clampedTo = Math.max(clampedFrom, Math.min(doc.content.size, rangeTo));

  const resolvedFrom = doc.resolve(clampedFrom);
  for (let depth = resolvedFrom.depth; depth > 0; depth -= 1) {
    if (resolvedFrom.node(depth).type === headingType) {
      return true;
    }
  }

  if (clampedTo > clampedFrom) {
    const resolvedTo = doc.resolve(clampedTo);
    for (let depth = resolvedTo.depth; depth > 0; depth -= 1) {
      if (resolvedTo.node(depth).type === headingType) {
        return true;
      }
    }

    let touched = false;
    doc.nodesBetween(clampedFrom, clampedTo, (node) => {
      if (node.type === headingType) {
        touched = true;
        return false;
      }

      if (node.isTextblock || node.type.name === TABLE_NODE_NAME) {
        return false;
      }

      return !touched;
    });
    if (touched) {
      return true;
    }
  }

  return false;
};

/**
 * 判断本次文档变更是否触及任何标题节点。
 */
const didDocChangeTouchHeading = (
  prevDoc: ProseNode,
  nextDoc: ProseNode,
  headingType: NodeType
): boolean => {
  const from = prevDoc.content.findDiffStart(nextDoc.content);
  if (from == null) {
    return false;
  }

  const diffEnd = prevDoc.content.findDiffEnd(nextDoc.content);
  if (!diffEnd) {
    return false;
  }

  const prevTo = Math.max(diffEnd.a, from);
  const nextTo = Math.max(diffEnd.b, from);
  return (
    doesRangeTouchHeading(prevDoc, from, prevTo, headingType) ||
    doesRangeTouchHeading(nextDoc, from, nextTo, headingType)
  );
};

/**
 * 增量标题 ID 同步插件：仅在标题相关变更时刷新 ID，避免每次击键全文扫描。
 */
export const syncHeadingIdIncrementalPlugin = $prose((ctx) => {
  const headingIdPluginKey = new PluginKey(HEADING_ID_PLUGIN_KEY);
  const headingType = headingSchema.type(ctx);

  /**
   * 同步文档中全部标题节点的 ID（跳过非标题文本块与表格子树）。
   */
  const updateHeadingIds = (view: EditorView): void => {
    if (view.composing) {
      return;
    }

    const getId = ctx.get(headingIdGenerator.key);

    const tr = view.state.tr.setMeta('addToHistory', false);
    let found = false;
    const idMap: Record<string, number> = {};

    view.state.doc.descendants((node, pos) => {
      if (node.type === headingType) {
        if (node.textContent.trim().length === 0) {
          return false;
        }

        const attrs = node.attrs;
        let id = getId(node);
        if (idMap[id]) {
          idMap[id] += 1;
          id += `-#${idMap[id]}`;
        } else {
          idMap[id] = 1;
        }

        if (attrs.id !== id) {
          found = true;
          tr.setMeta(headingIdPluginKey, true).setNodeMarkup(pos, undefined, {
            ...attrs,
            id
          });
        }
        return false;
      }

      if (node.isTextblock || node.type.name === TABLE_NODE_NAME) {
        return false;
      }

      return true;
    });

    if (found) {
      view.dispatch(tr);
    }
  };

  return new Plugin({
    key: headingIdPluginKey,
    view: (initialView) => {
      let hasPendingHeadingSync = false;
      updateHeadingIds(initialView);

      return {
        update: (view, prevState) => {
          if (view.state.doc === prevState.doc) {
            if (!view.composing && hasPendingHeadingSync) {
              hasPendingHeadingSync = false;
              updateHeadingIds(view);
            }
            return;
          }

          if (!didDocChangeTouchHeading(prevState.doc, view.state.doc, headingType)) {
            return;
          }

          if (view.composing) {
            hasPendingHeadingSync = true;
            return;
          }

          hasPendingHeadingSync = false;
          updateHeadingIds(view);
        }
      };
    }
  });
});
