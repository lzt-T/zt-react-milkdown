import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { Milkdown, MilkdownProvider } from '@milkdown/react';
import clsx from 'clsx';
import type { FocusEditorCoordinates } from '../../core/createEditor';
import type {
  EditorSearchBooleanOption,
  EditorSearchController,
  EditorSearchOptions,
  EditorSearchSnapshot
} from '@/plugins/custom/search';
import type { MilkdownEditorProps } from '@/types/editor';
import { SearchPanel } from './SearchPanel';
import { useControlledState } from '../hooks/useControlledState';
import { useMilkdownEditor } from '../hooks/useMilkdownEditor';
import { resolveEditorMessages } from '../../local/i18n';
// 默认防抖时长（毫秒）。
const DEFAULT_DEBOUNCE_MS = 160;

// 默认编辑器搜索参数。
const DEFAULT_SEARCH_OPTIONS: EditorSearchOptions = {
  search: '',
  replace: '',
  caseSensitive: false,
  wholeWord: false,
  regexp: false
};

// 空编辑器搜索结果快照。
const EMPTY_SEARCH_SNAPSHOT: EditorSearchSnapshot = {
  current: 0,
  total: 0,
  isInvalidExpression: false
};

// 只读状态展示文案。
const READ_ONLY_LABELS: Record<NonNullable<MilkdownEditorProps['locale']>, string> = {
  'zh-CN': '只读',
  'en-US': 'Read only'
};

/**
 * 将占位文案转为 CSS content 可消费的字符串。
 */
const toCssContentString = (value: string): string => {
  if (value.length === 0) {
    return '""';
  }

  // 转义后的占位文案。
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '\\A ');

  return `"${escaped}"`;
};

/**
 * 渲染 Milkdown 运行时并完成实例同步。
 */
const MilkdownRuntime = (props: {
  markdown: string;
  locale: MilkdownEditorProps['locale'];
  readOnly: boolean;
  debounceMs: number;
  messages: ReturnType<typeof resolveEditorMessages>;
  slashMenu: MilkdownEditorProps['slashMenu'];
  imageUpload: MilkdownEditorProps['imageUpload'];
  shortcutMode: NonNullable<MilkdownEditorProps['shortcutMode']>;
  portalContainer: HTMLElement;
  contentPortalContainer: HTMLElement;
  focusEditorRef: MutableRefObject<((coordinates?: FocusEditorCoordinates) => void) | null>;
  searchControllerRef: MutableRefObject<EditorSearchController | null>;
  onMarkdownChange: (markdown: string) => void;
  onInitReady: () => void;
  onInitError: (error: unknown) => void;
  onSearchSnapshotChange: (snapshot: EditorSearchSnapshot) => void;
}): JSX.Element => {
  useMilkdownEditor({
    markdown: props.markdown,
    portalContainer: props.portalContainer,
    contentPortalContainer: props.contentPortalContainer,
    focusEditorRef: props.focusEditorRef,
    searchControllerRef: props.searchControllerRef,
    readOnly: props.readOnly,
    debounceMs: props.debounceMs,
    messages: props.messages,
    locale: props.locale,
    slashMenu: props.slashMenu,
    imageUpload: props.imageUpload,
    shortcutMode: props.shortcutMode,
    onMarkdownChange: props.onMarkdownChange,
    onInitReady: props.onInitReady,
    onInitError: props.onInitError,
    onSearchSnapshotChange: props.onSearchSnapshotChange
  });

  return <Milkdown />;
};

/**
 * React 版 Milkdown 编辑器组件。
 */
export const MilkdownEditor = (props: MilkdownEditorProps): JSX.Element => {
  /** 初始化失败提示。 */
  const [initErrorMessage, setInitErrorMessage] = useState<string>('');
  /** 编辑器内部浮层 Portal 容器。 */
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  /** 编辑器内容附属浮层 Portal 容器。 */
  const [contentPortalContainer, setContentPortalContainer] = useState<HTMLDivElement | null>(null);
  /** 搜索面板是否打开。 */
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  /** 替换区域是否展开。 */
  const [isReplaceExpanded, setIsReplaceExpanded] = useState<boolean>(false);
  /** 当前搜索表单参数。 */
  const [searchOptions, setSearchOptions] = useState<EditorSearchOptions>(DEFAULT_SEARCH_OPTIONS);
  /** 当前搜索结果快照。 */
  const [searchSnapshot, setSearchSnapshot] =
    useState<EditorSearchSnapshot>(EMPTY_SEARCH_SNAPSHOT);
  /** 编辑器聚焦方法引用。 */
  const focusEditorRef = useRef<((coordinates?: FocusEditorCoordinates) => void) | null>(null);
  /** 编辑器搜索控制器引用。 */
  const searchControllerRef = useRef<EditorSearchController | null>(null);
  /** 搜索输入框引用。 */
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  /** 当前主题。 */
  const theme = props.theme ?? 'light';
  /** 当前只读状态。 */
  const readOnly = props.readOnly ?? false;
  /** 当前只读状态展示文案。 */
  const readOnlyLabel = READ_ONLY_LABELS[props.locale ?? 'zh-CN'];
  /** 内容变更防抖时长。 */
  const debounceMs = props.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  /** 当前内置快捷键修饰键模式。 */
  const shortcutMode = props.shortcutMode ?? 'modShift';

  /** 统一受控与非受控状态。 */
  const { markdown, setMarkdown } = useControlledState(
    props.value,
    props.defaultValue,
    props.onChange
  );
  /** 当前编辑器文案。 */
  const messages = useMemo(
    () => resolveEditorMessages(props.locale, props.messages, props.placeholder),
    [props.locale, props.messages, props.placeholder]
  );
  /** 编辑器容器样式变量。 */
  const editorStyle = {
    '--zt-gap-placeholder-content': toCssContentString(messages.placeholder),
    ...(props.maxHeight !== undefined
      ? {
          // 传入 maxHeight 时限制编辑区最大高度并在内部滚动。
          maxHeight: props.maxHeight,
          overflowY: 'auto'
        }
      : {})
  } as CSSProperties & Record<'--zt-gap-placeholder-content', string>;
  /** 稳定的 markdown 变更处理器，避免触发编辑器重建。 */
  const handleMarkdownChange = useCallback(
    (nextMarkdown: string): void => {
      setMarkdown(nextMarkdown);
    },
    [setMarkdown]
  );
  /** 稳定的初始化成功回调。 */
  const handleInitReady = useCallback((): void => {
    setInitErrorMessage('');
    if (isSearchOpen) {
      searchControllerRef.current?.updateQuery(searchOptions);
    }
  }, [isSearchOpen, searchOptions]);
  /** 稳定的初始化失败回调。 */
  const handleInitError = useCallback((error: unknown): void => {
    /** 失败时展示的错误文案。 */
    const nextMessage = error instanceof Error ? error.message : messages.initError;
    setInitErrorMessage(nextMessage);
  }, [messages.initError]);
  /**
   * 点击编辑器空白区域时将焦点交给 ProseMirror。
   */
  const handleEditorMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (readOnly) {
      return;
    }

    // 当前鼠标按下目标。
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    // 当前点击所属的 ProseMirror 根节点。
    const proseMirror = target.closest('.ProseMirror');
    if (
      target.closest('.zt-md-content-portal') ||
      (proseMirror !== null && target !== proseMirror)
    ) {
      return;
    }

    event.preventDefault();
    focusEditorRef.current?.({
      left: event.clientX,
      top: event.clientY
    });
  }, [readOnly]);
  /**
   * 同步编辑器内部浮层 Portal 容器。
   */
  const handlePortalContainerRef = useCallback((node: HTMLDivElement | null): void => {
    setPortalContainer(node);
  }, []);
  /**
   * 同步编辑器内容附属浮层 Portal 容器。
   */
  const handleContentPortalContainerRef = useCallback((node: HTMLDivElement | null): void => {
    setContentPortalContainer(node);
  }, []);

  /**
   * 聚焦并选中搜索输入框内容。
   */
  const focusSearchInput = (): void => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  };

  /**
   * 打开当前编辑器实例的搜索面板。
   */
  const openSearchPanel = (): void => {
    setIsSearchOpen(true);
    searchControllerRef.current?.updateQuery(searchOptions);
    requestAnimationFrame(focusSearchInput);
  };

  /**
   * 关闭搜索面板并将焦点返回当前匹配。
   */
  const closeSearchPanel = (): void => {
    // 关闭前可用的搜索控制器。
    const searchController = searchControllerRef.current;
    searchController?.clear();
    setSearchSnapshot(EMPTY_SEARCH_SNAPSHOT);
    setIsSearchOpen(false);
    setIsReplaceExpanded(false);
    if (searchController) {
      requestAnimationFrame(searchController.focusCurrent);
    }
  };

  /**
   * 应用下一组搜索参数。
   */
  const applySearchOptions = (nextOptions: EditorSearchOptions): void => {
    setSearchOptions(nextOptions);
    searchControllerRef.current?.updateQuery(nextOptions);
  };

  /**
   * 更新搜索文本。
   */
  const handleSearchChange = (value: string): void => {
    applySearchOptions({ ...searchOptions, search: value });
  };

  /**
   * 更新替换文本。
   */
  const handleReplaceChange = (value: string): void => {
    applySearchOptions({ ...searchOptions, replace: value });
  };

  /**
   * 切换指定搜索选项。
   */
  const handleSearchOptionToggle = (option: EditorSearchBooleanOption): void => {
    applySearchOptions({ ...searchOptions, [option]: !searchOptions[option] });
  };

  /**
   * 切换替换区域展开状态。
   */
  const handleReplaceExpandedToggle = (): void => {
    setIsReplaceExpanded((currentIsExpanded) => !currentIsExpanded);
  };

  /**
   * 定位上一项搜索结果。
   */
  const handleFindPrevious = (): void => {
    searchControllerRef.current?.findPrevious();
  };

  /**
   * 定位下一项搜索结果。
   */
  const handleFindNext = (): void => {
    searchControllerRef.current?.findNext();
  };

  /**
   * 替换当前搜索结果。
   */
  const handleReplaceCurrent = (): void => {
    searchControllerRef.current?.replaceCurrent();
  };

  /**
   * 替换全部搜索结果。
   */
  const handleReplaceAll = (): void => {
    searchControllerRef.current?.replaceAll();
  };

  /**
   * 同步编辑器搜索结果快照。
   */
  const handleSearchSnapshotChange = (snapshot: EditorSearchSnapshot): void => {
    setSearchSnapshot(snapshot);
  };

  /**
   * 处理当前编辑器实例内的搜索快捷键。
   */
  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // 当前按键是否为实例内搜索快捷键。
    const isSearchShortcut =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'f';
    if (isSearchShortcut) {
      event.preventDefault();
      openSearchPanel();
      return;
    }

    if (!isSearchOpen || event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel();
      return;
    }

    // 当前按键来源是否为搜索面板输入框。
    const isSearchInput =
      event.target instanceof HTMLInputElement &&
      event.target.closest('.zt-md-search-panel') !== null;
    if (!isSearchInput || event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (event.shiftKey) {
      handleFindPrevious();
      return;
    }

    handleFindNext();
  };

  return (
    <div
      className={clsx('zt-md', theme === 'dark' ? 'zt-md-dark' : 'zt-md-light', props.className)}
      data-readonly={readOnly ? 'true' : 'false'}
      data-search-open={isSearchOpen ? 'true' : 'false'}
      data-search-replace-expanded={!readOnly && isReplaceExpanded ? 'true' : 'false'}
      data-readonly-label={readOnlyLabel}
      onKeyDownCapture={handleEditorKeyDown}
    >
      {props.headerSlot ? <div className="zt-md-header">{props.headerSlot}</div> : null}
      <div className="zt-md-body">
        {initErrorMessage ? <div className="zt-md-error">{initErrorMessage}</div> : null}
        {isSearchOpen ? (
          <SearchPanel
            options={searchOptions}
            snapshot={searchSnapshot}
            messages={messages}
            readOnly={readOnly}
            isReplaceExpanded={isReplaceExpanded}
            searchInputRef={searchInputRef}
            onSearchChange={handleSearchChange}
            onReplaceChange={handleReplaceChange}
            onOptionToggle={handleSearchOptionToggle}
            onReplaceExpandedToggle={handleReplaceExpandedToggle}
            onFindPrevious={handleFindPrevious}
            onFindNext={handleFindNext}
            onReplaceCurrent={handleReplaceCurrent}
            onReplaceAll={handleReplaceAll}
            onClose={closeSearchPanel}
          />
        ) : null}
        <div
          className={clsx('zt-md-editor', readOnly ? 'zt-md-readonly' : 'zt-md-editable')}
          aria-label={messages.editorAriaLabel}
          aria-readonly={readOnly}
          onMouseDown={handleEditorMouseDown}
          style={editorStyle}
        >
          {portalContainer && contentPortalContainer ? (
            <MilkdownProvider>
              <MilkdownRuntime
                markdown={markdown}
                locale={props.locale}
                portalContainer={portalContainer}
                contentPortalContainer={contentPortalContainer}
                focusEditorRef={focusEditorRef}
                searchControllerRef={searchControllerRef}
                readOnly={readOnly}
                debounceMs={debounceMs}
                messages={messages}
                slashMenu={props.slashMenu}
                imageUpload={props.imageUpload}
                shortcutMode={shortcutMode}
                onMarkdownChange={handleMarkdownChange}
                onInitReady={handleInitReady}
                onInitError={handleInitError}
                onSearchSnapshotChange={handleSearchSnapshotChange}
              />
            </MilkdownProvider>
          ) : null}
          <div ref={handleContentPortalContainerRef} className="zt-md-content-portal" />
        </div>
        <div ref={handlePortalContainerRef} className="zt-md-portal" />
      </div>
    </div>
  );
};

export default MilkdownEditor;
