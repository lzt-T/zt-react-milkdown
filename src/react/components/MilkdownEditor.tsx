import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { Milkdown, MilkdownProvider } from '@milkdown/react';
import clsx from 'clsx';
import type { FocusEditorCoordinates } from '../../core/createEditor';
import type { MilkdownEditorProps } from '../../types/editor';
import { useControlledState } from '../hooks/useControlledState';
import { useMilkdownEditor } from '../hooks/useMilkdownEditor';
import { resolveEditorMessages } from '../../local/i18n';
// 默认防抖时长（毫秒）。
const DEFAULT_DEBOUNCE_MS = 160;

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
  portalContainer: HTMLElement;
  contentPortalContainer: HTMLElement;
  focusEditorRef: MutableRefObject<((coordinates?: FocusEditorCoordinates) => void) | null>;
  onMarkdownChange: (markdown: string) => void;
  onInitReady: () => void;
  onInitError: (error: unknown) => void;
}): JSX.Element => {
  useMilkdownEditor({
    markdown: props.markdown,
    portalContainer: props.portalContainer,
    contentPortalContainer: props.contentPortalContainer,
    focusEditorRef: props.focusEditorRef,
    readOnly: props.readOnly,
    debounceMs: props.debounceMs,
    messages: props.messages,
    locale: props.locale,
    slashMenu: props.slashMenu,
    imageUpload: props.imageUpload,
    onMarkdownChange: props.onMarkdownChange,
    onInitReady: props.onInitReady,
    onInitError: props.onInitError
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
  /** 编辑器聚焦方法引用。 */
  const focusEditorRef = useRef<((coordinates?: FocusEditorCoordinates) => void) | null>(null);
  /** 当前主题。 */
  const theme = props.theme ?? 'light';
  /** 当前只读状态。 */
  const readOnly = props.readOnly ?? false;
  /** 内容变更防抖时长。 */
  const debounceMs = props.debounceMs ?? DEFAULT_DEBOUNCE_MS;

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
  }, []);
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

    if (target.closest('.ProseMirror') || target.closest('.zt-md-content-portal')) {
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

  return (
    <div className={clsx('zt-md', theme === 'dark' ? 'zt-md-dark' : 'zt-md-light', props.className)}>
      {props.headerSlot ? <div className="zt-md-header">{props.headerSlot}</div> : null}
      <div className="zt-md-body">
        {initErrorMessage ? <div className="zt-md-error">{initErrorMessage}</div> : null}
        <div
          className={clsx('zt-md-editor', readOnly ? 'zt-md-readonly' : 'zt-md-editable')}
          aria-label={messages.editorAriaLabel}
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
                readOnly={readOnly}
                debounceMs={debounceMs}
                messages={messages}
                slashMenu={props.slashMenu}
                imageUpload={props.imageUpload}
                onMarkdownChange={handleMarkdownChange}
                onInitReady={handleInitReady}
                onInitError={handleInitError}
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
