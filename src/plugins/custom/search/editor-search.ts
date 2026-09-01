import { Plugin, TextSelection, type EditorState, type Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import {
  SearchQuery,
  findNext,
  findPrev,
  getSearchState,
  replaceAll,
  replaceNext,
  search,
  setSearchState,
  type SearchResult
} from 'prosemirror-search';
import { resolveEditorWrapper } from '@/lib/editor-overlay-position';
import type {
  EditorSearchActionRunner,
  EditorSearchController,
  EditorSearchOptions,
  EditorSearchSnapshot
} from './types';

// 代码块预览切换按钮选择器。
const CODE_BLOCK_PREVIEW_TOGGLE_SELECTOR =
  ".zt-md-code-block-action-button[data-active='true']";

// 搜索面板选择器。
const SEARCH_PANEL_SELECTOR = '.zt-md-search-panel';

// 当前匹配与滚动视口边界之间的安全距离（像素）。
const SEARCH_SCROLL_MARGIN = 8;

// 空搜索结果快照。
const EMPTY_SEARCH_SNAPSHOT: EditorSearchSnapshot = {
  current: 0,
  total: 0,
  isInvalidExpression: false
};

/**
 * 判断编辑器视图当前是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 根据界面参数创建 ProseMirror 搜索查询。
 */
const createSearchQuery = (options: EditorSearchOptions): SearchQuery => {
  return new SearchQuery({
    search: options.search,
    replace: options.replace,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regexp: options.regexp,
    literal: true
  });
};

/**
 * 收集当前文档内的全部匹配结果。
 */
const collectSearchResults = (state: EditorState, query: SearchQuery): SearchResult[] => {
  if (!query.valid) {
    return [];
  }

  // 当前文档的匹配结果。
  const results: SearchResult[] = [];
  // 下一轮查询的起始位置。
  let position = 0;
  // 当前文档内容结束位置。
  const documentEnd = state.doc.content.size;

  while (position < documentEnd) {
    // 当前找到的下一项匹配。
    const result = query.findNext(state, position, documentEnd);
    if (!result) {
      break;
    }

    results.push(result);
    position = Math.max(result.to, position + 1);
  }

  return results;
};

/**
 * 根据编辑器状态生成搜索结果快照。
 */
const createSearchSnapshot = (state: EditorState): EditorSearchSnapshot => {
  // 当前搜索插件状态。
  const searchState = getSearchState(state);
  if (!searchState) {
    return EMPTY_SEARCH_SNAPSHOT;
  }

  // 当前搜索查询。
  const query = searchState.query;
  // 当前查询是否为无效正则表达式。
  const isInvalidExpression = query.regexp && query.search.length > 0 && !query.valid;
  // 当前文档匹配结果。
  const results = collectSearchResults(state, query);
  // 当前选区对应的匹配索引。
  const currentIndex = results.findIndex((result) => {
    return result.from === state.selection.from && result.to === state.selection.to;
  });

  return {
    current: currentIndex < 0 ? 0 : currentIndex + 1,
    total: results.length,
    isInvalidExpression
  };
};

/**
 * 判断两个搜索快照是否一致。
 */
const isSameSearchSnapshot = (
  previous: EditorSearchSnapshot,
  next: EditorSearchSnapshot
): boolean => {
  return (
    previous.current === next.current &&
    previous.total === next.total &&
    previous.isInvalidExpression === next.isInvalidExpression
  );
};

/**
 * 将当前搜索匹配滚动到编辑器实例的安全可见区域。
 */
const scrollCurrentSearchMatchIntoView = (view: EditorView): void => {
  if (view.state.selection.empty) {
    return;
  }

  // 当前实例的真实内部滚动容器。
  const editorWrapper = resolveEditorWrapper(view.dom);
  if (!editorWrapper) {
    return;
  }

  // 当前匹配起点的视口坐标。
  const startCoords = view.coordsAtPos(view.state.selection.from);
  // 当前匹配终点的视口坐标。
  const endCoords = view.coordsAtPos(view.state.selection.to);
  // 当前匹配覆盖的顶部坐标。
  const matchTop = Math.min(startCoords.top, endCoords.top);
  // 当前匹配覆盖的底部坐标。
  const matchBottom = Math.max(startCoords.bottom, endCoords.bottom);
  // 当前滚动容器的视口边界。
  const wrapperRect = editorWrapper.getBoundingClientRect();
  // 当前实例根节点内的搜索面板。
  const searchPanel = editorWrapper
    .closest<HTMLElement>('.zt-md')
    ?.querySelector<HTMLElement>(SEARCH_PANEL_SELECTOR);
  // 搜索面板的视口边界。
  const searchPanelRect = searchPanel?.getBoundingClientRect();
  // 不受搜索面板遮挡的顶部安全线。
  const visibleTop = Math.max(
    wrapperRect.top + SEARCH_SCROLL_MARGIN,
    (searchPanelRect?.bottom ?? wrapperRect.top) + SEARCH_SCROLL_MARGIN
  );
  // 滚动视口的底部安全线。
  const visibleBottom = wrapperRect.bottom - SEARCH_SCROLL_MARGIN;

  if (matchTop < visibleTop) {
    editorWrapper.scrollTop += matchTop - visibleTop;
    return;
  }

  if (matchBottom > visibleBottom) {
    editorWrapper.scrollTop += matchBottom - visibleBottom;
  }
};

/**
 * 展示当前搜索匹配，并在需要时切换代码块源码视图。
 */
const revealCurrentSearchMatch = (view: EditorView): void => {
  if (view.state.selection.empty) {
    return;
  }

  // 当前匹配起点对应的 DOM 位置。
  const domPosition = view.domAtPos(view.state.selection.from);
  // 可用于向上查找代码块的元素。
  const sourceElement =
    domPosition.node instanceof Element ? domPosition.node : domPosition.node.parentElement;
  // 当前匹配所属的代码块容器。
  const codeBlock = sourceElement?.closest<HTMLElement>('.zt-md-code-block');
  if (codeBlock?.dataset.viewMode !== 'preview') {
    scrollCurrentSearchMatchIntoView(view);
    return;
  }

  // 当前代码块已激活的预览切换按钮。
  const previewToggle = codeBlock.querySelector<HTMLButtonElement>(
    CODE_BLOCK_PREVIEW_TOGGLE_SELECTOR
  );
  previewToggle?.click();
  window.requestAnimationFrame(
    /**
     * 在代码块视图更新后重新定位当前匹配。
     */
    () => {
      scrollCurrentSearchMatchIntoView(view);
    }
  );
};

/**
 * 监听搜索插件状态并向 React 输出轻量快照。
 */
class EditorSearchSnapshotView {
  // 最近一次已输出的搜索快照。
  private snapshot: EditorSearchSnapshot = EMPTY_SEARCH_SNAPSHOT;

  /**
   * 创建搜索快照监听视图。
   */
  constructor(
    view: EditorView,
    private readonly onSnapshotChange: (snapshot: EditorSearchSnapshot) => void
  ) {
    this.emitSnapshot(view.state);
  }

  /**
   * 响应 ProseMirror 状态更新。
   */
  update(view: EditorView): void {
    this.emitSnapshot(view.state);
  }

  /**
   * 销毁时重置外部搜索状态。
   */
  destroy(): void {
    this.onSnapshotChange(EMPTY_SEARCH_SNAPSHOT);
  }

  /**
   * 在快照发生变化时通知外部。
   */
  private emitSnapshot(state: EditorState): void {
    // 最新搜索快照。
    const nextSnapshot = createSearchSnapshot(state);
    if (isSameSearchSnapshot(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.onSnapshotChange(nextSnapshot);
  }
}

/**
 * 创建搜索插件及结果快照监听插件。
 */
export const createEditorSearchPlugins = (
  onSnapshotChange: (snapshot: EditorSearchSnapshot) => void
): ReturnType<typeof $prose>[] => {
  // Milkdown 搜索插件。
  const searchPlugin = $prose(() => search());
  // Milkdown 搜索结果快照监听插件。
  const snapshotPlugin = $prose(() => {
    return new Plugin({
      view: (view) => new EditorSearchSnapshotView(view, onSnapshotChange)
    });
  });

  return [searchPlugin, snapshotPlugin];
};

/**
 * 创建面向 React 的编辑器搜索控制器。
 */
export const createEditorSearchController = (
  runAction: EditorSearchActionRunner
): EditorSearchController => {
  /**
   * 更新搜索查询并定位当前光标之后的首个匹配。
   */
  const updateQuery = (options: EditorSearchOptions): void => {
    /**
     * 在当前编辑器视图中更新查询。
     */
    const executeUpdate = (view: EditorView): void => {
      // 最新搜索查询。
      const query = createSearchQuery(options);
      // 写入搜索状态的事务。
      const transaction = setSearchState(view.state.tr, query);

      if (query.valid) {
        // 当前选区起点之后的首个匹配。
        const forwardMatch = query.findNext(view.state, view.state.selection.from);
        // 循环到文档开头找到的首个匹配。
        const nextMatch =
          forwardMatch ?? query.findNext(view.state, 0, view.state.selection.from);
        if (nextMatch) {
          transaction
            .setSelection(TextSelection.create(transaction.doc, nextMatch.from, nextMatch.to))
            .scrollIntoView();
        }
      }

      view.dispatch(transaction);
      revealCurrentSearchMatch(view);
    };

    runAction(executeUpdate);
  };

  /**
   * 执行搜索导航命令并展示当前匹配。
   */
  const runNavigationCommand = (
    command: typeof findNext | typeof findPrev,
    view: EditorView
  ): void => {
    /**
     * 将命令事务派发到当前视图。
     */
    const dispatchTransaction = (transaction: Transaction): void => {
      view.dispatch(transaction.scrollIntoView());
    };

    if (command(view.state, dispatchTransaction)) {
      revealCurrentSearchMatch(view);
    }
  };

  /**
   * 定位上一项匹配。
   */
  const findPreviousMatch = (): void => {
    /**
     * 在当前视图执行向前导航。
     */
    const executeFindPrevious = (view: EditorView): void => {
      runNavigationCommand(findPrev, view);
    };

    runAction(executeFindPrevious);
  };

  /**
   * 定位下一项匹配。
   */
  const findNextMatch = (): void => {
    /**
     * 在当前视图执行向后导航。
     */
    const executeFindNext = (view: EditorView): void => {
      runNavigationCommand(findNext, view);
    };

    runAction(executeFindNext);
  };

  /**
   * 替换当前匹配并继续导航。
   */
  const replaceCurrentMatch = (): void => {
    /**
     * 在当前可编辑视图中替换匹配。
     */
    const executeReplaceCurrent = (view: EditorView): void => {
      if (!isEditorViewEditable(view)) {
        return;
      }

      runNavigationCommand(replaceNext, view);
    };

    runAction(executeReplaceCurrent);
  };

  /**
   * 在单个事务中替换全部匹配。
   */
  const replaceAllMatches = (): void => {
    /**
     * 在当前可编辑视图中替换全部匹配。
     */
    const executeReplaceAll = (view: EditorView): void => {
      if (!isEditorViewEditable(view)) {
        return;
      }

      // 当前搜索插件状态。
      const searchState = getSearchState(view.state);
      if (!searchState || collectSearchResults(view.state, searchState.query).length === 0) {
        return;
      }

      /**
       * 将全部替换事务派发到当前视图。
       */
      const dispatchTransaction = (transaction: Transaction): void => {
        view.dispatch(transaction);
      };
      replaceAll(view.state, dispatchTransaction);
    };

    runAction(executeReplaceAll);
  };

  /**
   * 清除查询及匹配装饰。
   */
  const clear = (): void => {
    /**
     * 在当前视图中重置查询。
     */
    const executeClear = (view: EditorView): void => {
      // 空搜索查询。
      const emptyQuery = new SearchQuery({ search: '', literal: true });
      view.dispatch(setSearchState(view.state.tr, emptyQuery));
    };

    runAction(executeClear);
  };

  /**
   * 聚焦当前匹配所在的编辑器。
   */
  const focusCurrent = (): void => {
    /**
     * 聚焦并滚动当前编辑器选区。
     */
    const executeFocus = (view: EditorView): void => {
      view.dispatch(view.state.tr.scrollIntoView());
      scrollCurrentSearchMatchIntoView(view);
      view.focus();
    };

    runAction(executeFocus);
  };

  return {
    updateQuery,
    findPrevious: findPreviousMatch,
    findNext: findNextMatch,
    replaceCurrent: replaceCurrentMatch,
    replaceAll: replaceAllMatches,
    clear,
    focusCurrent
  };
};
