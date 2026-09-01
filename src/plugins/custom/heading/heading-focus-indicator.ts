import type { EditorState } from '@milkdown/prose/state';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 标题节点名称。
const HEADING_NODE_NAME = 'heading';
// 标题聚焦提示类名。
const HEADING_FOCUS_CLASS_NAME = 'zt-md-heading-focused';
// 标题聚焦提示插件标识。
const HEADING_FOCUS_INDICATOR_PLUGIN_KEY = 'zt-md-heading-focus-indicator';

/**
 * 创建当前选区所在标题的节点装饰。
 */
const createHeadingFocusDecorations = (state: EditorState): DecorationSet => {
  // 当前选区起点。
  const selectionStart = state.selection.$from;

  for (let depth = selectionStart.depth; depth > 0; depth -= 1) {
    // 当前层级节点。
    const currentNode = selectionStart.node(depth);
    if (currentNode.type.name !== HEADING_NODE_NAME) {
      continue;
    }

    // 当前标题起始位置。
    const headingStart = selectionStart.before(depth);
    // 当前标题层级。
    const headingLevel = Number(currentNode.attrs.level);
    // 当前标题节点装饰。
    const headingDecoration = Decoration.node(
      headingStart,
      headingStart + currentNode.nodeSize,
      {
        class: HEADING_FOCUS_CLASS_NAME,
        'data-heading-level': `H${headingLevel}`
      }
    );
    return DecorationSet.create(state.doc, [headingDecoration]);
  }

  return DecorationSet.empty;
};

/** 标题聚焦层级提示插件。 */
export const headingFocusIndicatorPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey(HEADING_FOCUS_INDICATOR_PLUGIN_KEY),
    props: {
      /**
       * 根据当前选区提供标题层级装饰。
       */
      decorations: createHeadingFocusDecorations
    }
  });
});
