import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import type { MilkdownEditorProps } from '../../types/editor';
import { useControlledState } from '../hooks/useControlledState';
import { useMilkdownEditor } from '../hooks/useMilkdownEditor';
import { resolveEditorMessages } from '../../local/i18n';

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
 * React 版 Milkdown 编辑器组件。
 */
export const MilkdownEditor = (props: MilkdownEditorProps): JSX.Element => {
  /** 编辑器挂载容器。 */
  const [editorContainer, setEditorContainer] = useState<HTMLDivElement | null>(null);
  /** 初始化失败提示。 */
  const [initErrorMessage, setInitErrorMessage] = useState<string>('');
  /** 当前主题。 */
  const theme = props.theme ?? 'light';
  /** 当前可编辑状态。 */
  const editable = props.editable ?? true;

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

  useMilkdownEditor({
    container: editorContainer,
    markdown,
    editable,
    messages,
    slashMenu: props.slashMenu,
    onMarkdownChange: handleMarkdownChange,
    onInitReady: handleInitReady,
    onInitError: handleInitError
  });

  return (
    <div className={clsx('zt-md', theme === 'dark' ? 'zt-md-dark' : 'zt-md-light', props.className)}>
      {props.headerSlot ? <div className="zt-md-header">{props.headerSlot}</div> : null}
      <div className="zt-md-body">
        {initErrorMessage ? <div className="zt-md-error">{initErrorMessage}</div> : null}
        <div
          ref={setEditorContainer}
          className={clsx('zt-md-editor', editable ? 'zt-md-editable' : 'zt-md-readonly')}
          aria-label={messages.editorAriaLabel}
          style={editorStyle}
        />
      </div>
    </div>
  );
};

export default MilkdownEditor;
