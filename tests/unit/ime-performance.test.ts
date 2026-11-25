import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { refractor } from '@/plugins/custom/code-block/code-block-highlighter';
import { resolveEditorMessages } from '@/local/i18n';
import { editorViewCtx } from '@milkdown/core';
import type { EditorView } from '@milkdown/prose/view';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 记录测试期间挂载的运行时实例，便于统一回收。
const runtimes: MilkdownEditorRuntime[] = [];
// 记录测试期间插入的宿主节点，便于逐个清理。
const hosts: HTMLElement[] = [];

/** 挂载带完整默认插件的真实编辑器运行时。 */
const mountRuntime = async (markdown: string, debounceMs = 160) => {
  const host = document.createElement('div');
  host.className = 'zt-md zt-md-light';
  const wrapper = document.createElement('div');
  wrapper.className = 'zt-md-editor';
  const root = document.createElement('div');
  const portal = document.createElement('div');
  const contentPortal = document.createElement('div');
  wrapper.append(root, contentPortal);
  host.append(wrapper, portal);
  document.body.append(host);
  hosts.push(host);

  const onChange = vi.fn();
  const onSearchSnapshotChange = vi.fn();
  const runtime = createMilkdownEditorRuntime({
    root,
    portalContainer: portal,
    contentPortalContainer: contentPortal,
    markdown,
    locale: 'zh-CN',
    messages: resolveEditorMessages('zh-CN'),
    readOnly: false,
    debounceMs,
    shortcutMode: 'modShift',
    onChange,
    onSearchSnapshotChange
  });
  runtimes.push(runtime);

  await act(async () => {
    await runtime.editor.create();
    runtime.installRuntimePlugins();
  });

  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx)) as EditorView;
  return { runtime, view, onChange };
};

/** 模拟编辑器进入或退出 IME 组字状态。 */
const setComposingState = (view: EditorView, composing: boolean): void => {
  const internalView = view as EditorView & { input?: { composing: boolean } };
  if (internalView.input) {
    internalView.input.composing = composing;
  }
  if (composing) {
    fireEvent.compositionStart(view.dom);
  } else {
    fireEvent.compositionEnd(view.dom);
  }
};

/** 读取文档中首段正文末尾的插入位置。 */
const findFirstParagraphEnd = (view: EditorView): number => {
  const firstChild = view.state.doc.firstChild;
  return firstChild ? 1 + firstChild.content.size : 1;
};

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await act(async () => {
    for (const runtime of runtimes.splice(0)) {
      await runtime.editor.destroy();
    }
  });
  hosts.splice(0).forEach((host) => host.remove());
});

describe('ime-performance', () => {
  it('IME 组字期间不触发序列化，组字结束后补齐一次防抖同步', async () => {
    const { view, onChange } = await mountRuntime('初始段落', 160);
    vi.useFakeTimers();

    // 进入中文拼音组字态并模拟拼音预编辑写入。
    setComposingState(view, true);
    await act(async () => {
      const insertPos = findFirstParagraphEnd(view);
      view.dispatch(view.state.tr.insertText('ni', insertPos));
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();

    // 选字上屏结束组字后，应在延迟窗口后触发一次序列化同步。
    await act(async () => {
      const firstEnd = findFirstParagraphEnd(view);
      view.dispatch(view.state.tr.insertText('你', firstEnd - 2, firstEnd));
      setComposingState(view, false);
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toContain('初始段落你');
  });

  it('开启下一轮拼音组字时取消前一轮尚未触发的防抖序列化', async () => {
    const { view, onChange } = await mountRuntime('正文', 160);
    vi.useFakeTimers();

    await act(async () => {
      view.dispatch(view.state.tr.insertText('好', findFirstParagraphEnd(view)));
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(onChange).not.toHaveBeenCalled();

    // 在 160ms 防抖未到期前进入下一轮组字，应取消挂起的序列化任务。
    setComposingState(view, true);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(onChange).not.toHaveBeenCalled();

    // 组字结束后恢复同步，将前面累积修改一并输出。
    await act(async () => {
      setComposingState(view, false);
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toContain('正文好');
  });

  it('非组字态防抖挂起期间失焦时立即同步 Markdown', async () => {
    const { view, onChange } = await mountRuntime('标题', 350);
    vi.useFakeTimers();

    await act(async () => {
      view.dispatch(view.state.tr.insertText('补充', findFirstParagraphEnd(view)));
    });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.blur(view.dom);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toContain('标题补充');
  });

  it('普通正文段落编辑跳过 Prism 全文遍历并保留代码块高亮与位置映射', async () => {
    const markdown = ['普通段落', '', '```javascript', 'const answer = 42;', '```'].join('\n');
    const { view } = await mountRuntime(markdown, 160);

    const prismPlugin = view.state.plugins.find((plugin) =>
      String((plugin as { key?: string }).key ?? '').startsWith('MILKDOWN_PRISM')
    );
    expect(prismPlugin).toBeTruthy();

    const initialPrismState = prismPlugin?.getState(view.state) as
      | { blocks: Array<{ pos: number }> }
      | undefined;
    expect(initialPrismState?.blocks).toHaveLength(1);
    const initialCodeBlockPos = initialPrismState?.blocks[0]?.pos ?? 0;

    const highlightSpy = vi.spyOn(refractor, 'highlight');
    const descendantsSpy = vi.spyOn(Object.getPrototypeOf(view.state.doc), 'descendants');

    // 在代码块之前的普通段落插入汉字，应映射代码块位置且跳过全文遍历与重新高亮。
    await act(async () => {
      view.dispatch(view.state.tr.insertText('中文输入', findFirstParagraphEnd(view)));
    });

    expect(highlightSpy).not.toHaveBeenCalled();
    expect(descendantsSpy).not.toHaveBeenCalled();

    const mappedPrismState = prismPlugin?.getState(view.state) as
      | { blocks: Array<{ pos: number }> }
      | undefined;
    expect(mappedPrismState?.blocks[0]?.pos).toBe(initialCodeBlockPos + 4);

    // 直接修改代码块内部文本时，应触发该代码块的增量高亮刷新。
    const codeBlockStart = mappedPrismState?.blocks[0]?.pos ?? 0;
    await act(async () => {
      view.dispatch(view.state.tr.insertText('let x = 1;\n', codeBlockStart + 1));
    });
    expect(highlightSpy).toHaveBeenCalledTimes(1);
  });
});
