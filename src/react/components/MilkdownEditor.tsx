import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import type { MilkdownEditorProps } from '../../types/editor';
import { useControlledState } from '../hooks/useControlledState';
import { useMilkdownEditor } from '../hooks/useMilkdownEditor';
import { isMarkdownEmpty } from '../../utils/markdown';

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
  /** 当前占位符文案。 */
  const placeholder = props.placeholder ?? '请输入 Markdown 内容';
  /** 当前可编辑状态。 */
  const editable = props.editable ?? true;

  /** 统一受控与非受控状态。 */
  const { markdown, setMarkdown } = useControlledState(
    props.value,
    props.defaultValue,
    props.onChange
  );
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
    const nextMessage =
      error instanceof Error ? error.message : '编辑器初始化失败，请刷新页面后重试。';
    setInitErrorMessage(nextMessage);
  }, []);

  useMilkdownEditor({
    container: editorContainer,
    markdown,
    editable,
    onMarkdownChange: handleMarkdownChange,
    onInitReady: handleInitReady,
    onInitError: handleInitError
  });

  /** 是否展示占位提示。 */
  const showPlaceholder = useMemo(() => isMarkdownEmpty(markdown), [markdown]);

  return (
    <div className={clsx('zt-md', theme === 'dark' ? 'zt-md-dark' : 'zt-md-light', props.className)}>
      {props.headerSlot ? <div className="zt-md-header">{props.headerSlot}</div> : null}
      <div className="zt-md-body">
        {showPlaceholder ? <div className="zt-md-placeholder">{placeholder}</div> : null}
        {initErrorMessage ? <div className="zt-md-error">{initErrorMessage}</div> : null}
        <div
          ref={setEditorContainer}
          className={clsx('zt-md-editor', editable ? 'zt-md-editable' : 'zt-md-readonly')}
          aria-label="Milkdown editor"
        />
      </div>
    </div>
  );
};

export default MilkdownEditor;
