import type { ResolvedPos } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 代码块节点类型名。
const CODE_BLOCK_NODE_NAME = 'code_block';
// 仅处理 A 按键。
const KEY_A = 'a';
// 代码块内 Mod-A 处理插件 key。
const CODE_BLOCK_MOD_A_SELECT_PLUGIN_KEY = 'zt-md-code-block-mod-a-select';

/**
 * 判断是否应跳过本插件处理。
 */
const shouldSkipKeydown = (event: KeyboardEvent): boolean => {
  // 当前按键的小写值。
  const lowerCaseKey = event.key.toLowerCase();
  return (
    lowerCaseKey !== KEY_A ||
    event.defaultPrevented ||
    event.altKey ||
    event.shiftKey ||
    (!event.ctrlKey && !event.metaKey)
  );
};

/**
 * 解析“当前选区所在代码块”的位置信息。
 */
const resolveCodeBlockRange = (
  resolvedPosition: ResolvedPos
): { codeBlockStart: number; codeBlockEnd: number } | null => {
  for (let depth = resolvedPosition.depth; depth >= 0; depth -= 1) {
    // 当前深度节点。
    const currentNode = resolvedPosition.node(depth);
    if (currentNode.type.name !== CODE_BLOCK_NODE_NAME) {
      continue;
    }

    // 代码块节点起始位置。
    const codeBlockStart = depth === 0 ? 0 : resolvedPosition.before(depth);
    // 代码块内容起始位置。
    const codeBlockContentStart = codeBlockStart + 1;
    // 代码块内容结束位置。
    const codeBlockContentEnd = codeBlockStart + currentNode.nodeSize - 1;
    return {
      codeBlockStart: codeBlockContentStart,
      codeBlockEnd: codeBlockContentEnd
    };
  }

  return null;
};

/**
 * 处理代码块内 Mod-A：仅选中当前代码块文本内容。
 */
const handleCodeBlockModASelect = (view: EditorView, event: KeyboardEvent): boolean => {
  // 当前选区起点。
  const selectionFrom = view.state.selection.$from;
  // 命中的代码块内容范围。
  const codeBlockRange = resolveCodeBlockRange(selectionFrom);
  if (!codeBlockRange) {
    return false;
  }

  // 下一次选区事务。
  const transaction = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, codeBlockRange.codeBlockStart, codeBlockRange.codeBlockEnd)
  );
  event.preventDefault();
  view.dispatch(transaction);
  return true;
};

/**
 * 代码块内 Mod-A 全选插件：拦截默认全文档全选，改为仅选中当前代码块内容。
 */
export const codeBlockModASelectPlugin = $prose(() => {
  return new Plugin({
    key: new PluginKey(CODE_BLOCK_MOD_A_SELECT_PLUGIN_KEY),
    props: {
      handleKeyDown: (view, event) => {
        if (shouldSkipKeydown(event)) {
          return false;
        }

        return handleCodeBlockModASelect(view as EditorView, event);
      }
    }
  });
});
