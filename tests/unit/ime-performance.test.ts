import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { IME_ISOLATION_CLASS_NAME } from '@/core/ime-composition-isolation';
import { refractor } from '@/plugins/custom/code-block/code-block-highlighter';
import { resolveEditorMessages } from '@/local/i18n';
import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
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

  it('关闭浏览器原生 spellcheck 并在 IME 组字期间跳过同步滚动测量', async () => {
    const { view } = await mountRuntime('测试段落', 160);

    expect(view.dom.getAttribute('spellcheck')).toBe('false');
    expect(view.props.handleScrollToSelection?.(view)).toBe(false);

    setComposingState(view, true);
    expect(view.props.handleScrollToSelection?.(view)).toBe(true);

    setComposingState(view, false);
    expect(view.props.handleScrollToSelection?.(view)).toBe(false);
  });

  it('包含标题、有序列表和代码块的文档末尾编辑时跳过全文 descendants 遍历并保持 Prism 状态引用', async () => {
    const markdown = [
      '# 章节一',
      '',
      '1. 列表项一',
      '2. 列表项二',
      '',
      '```ts',
      'const value = 1;',
      '```',
      '',
      '末尾段落'
    ].join('\n');
    const { view } = await mountRuntime(markdown, 160);

    const prismPlugin = view.state.plugins.find((plugin) =>
      String((plugin as { key?: string }).key ?? '').startsWith('MILKDOWN_PRISM')
    );
    expect(prismPlugin).toBeTruthy();
    const initialPrismState = prismPlugin?.getState(view.state);

    const descendantsSpy = vi.spyOn(Object.getPrototypeOf(view.state.doc), 'descendants');

    // 在文档末尾普通段落插入文本，标题、列表和代码块均应走增量快路径。
    await act(async () => {
      view.dispatch(view.state.tr.insertText('追加内容', view.state.doc.content.size - 1));
    });

    expect(descendantsSpy).not.toHaveBeenCalled();
    expect(prismPlugin?.getState(view.state)).toBe(initialPrismState);
  });

  it('修改标题文本时保持标题 ID 更新与重名去重，插入列表项时保持序号递增', async () => {
    const markdown = ['# 重复标题', '', '# 初始标题', '', '1. 第一项', '2. 第二项'].join('\n');
    const { view } = await mountRuntime(markdown, 160);

    let secondHeadingPos = -1;
    let secondHeadingSize = 0;
    let headingCount = 0;
    view.state.doc.forEach((node, offset) => {
      if (node.type.name === 'heading') {
        headingCount += 1;
        if (headingCount === 2) {
          secondHeadingPos = offset;
          secondHeadingSize = node.content.size;
        }
      }
    });
    expect(secondHeadingPos).toBeGreaterThanOrEqual(0);

    // 将第二个标题改写为与第一个标题相同文本，应生成 -#2 去重后缀。
    await act(async () => {
      view.dispatch(
        view.state.tr.insertText(
          '重复标题',
          secondHeadingPos + 1,
          secondHeadingPos + 1 + secondHeadingSize
        )
      );
    });

    const updatedSecondHeading = view.state.doc.nodeAt(secondHeadingPos);
    expect(updatedSecondHeading?.attrs.id).toBe('重复标题-#2');

    // 在有序列表开头插入一个新列表项，后续列表项序号应同步递增。
    let orderedListPos = -1;
    view.state.doc.forEach((node, offset) => {
      if (node.type.name === 'ordered_list' && orderedListPos < 0) {
        orderedListPos = offset;
      }
    });
    expect(orderedListPos).toBeGreaterThanOrEqual(0);

    const orderedListNode = view.state.doc.nodeAt(orderedListPos);
    expect(orderedListNode).toBeTruthy();
    const firstListItem = orderedListNode!.child(0);
    const listItemType = view.state.schema.nodes.list_item;
    const paragraphType = view.state.schema.nodes.paragraph;
    const insertedItem = listItemType.create(
      { ...firstListItem.attrs, label: '1.' },
      paragraphType.create(null, view.state.schema.text('新增前置项'))
    );

    await act(async () => {
      view.dispatch(view.state.tr.insert(orderedListPos + 1, insertedItem));
    });

    const syncedOrderedList = view.state.doc.nodeAt(orderedListPos);
    expect(syncedOrderedList?.child(0).attrs.label).toBe('1.');
    expect(syncedOrderedList?.child(1).attrs.label).toBe('2.');
    expect(syncedOrderedList?.child(2).attrs.label).toBe('3.');
  });

  it('大文档下自动放宽序列化防抖，并在 IME Process 按键时取消挂起同步、失焦时立即同步', async () => {
    const largeParagraph = '中文技术文档长内容测试片段，用于验证大文档自适应防抖策略。'.repeat(350);
    const { view, onChange } = await mountRuntime(largeParagraph, 160);
    expect(view.state.doc.content.size).toBeGreaterThan(8000);

    vi.useFakeTimers();

    // 写入少量变更，大文档下 160ms 窗口不应触发同步。
    await act(async () => {
      view.dispatch(view.state.tr.insertText('新增', view.state.doc.content.size - 1));
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).not.toHaveBeenCalled();

    // 在防抖到期前收到 Windows IME 预按键（Process / 229），应取消挂起的序列化任务。
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Process', keyCode: 229 });
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).not.toHaveBeenCalled();

    // 再次触发非组字变更并等待大文档防抖及空闲调度窗口后，应完成一次同步。
    await act(async () => {
      view.dispatch(view.state.tr.insertText('再改', view.state.doc.content.size - 1));
    });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    // 失焦时无论文档大小仍应立即同步最新内容。
    await act(async () => {
      view.dispatch(view.state.tr.insertText('收尾', view.state.doc.content.size - 1));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.blur(view.dom);
    });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0]).toContain('收尾');
  });

  it('大文档单块空闲预隔离在大/小文档、IME 组字、快捷键及内外部失焦下表现正确', async () => {
    const setCollapsedCaret = (targetNode: Node | null | undefined, offset = 0): void => {
      expect(targetNode).toBeTruthy();
      const range = document.createRange();
      range.setStart(targetNode!, offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    // 1. 小文档不触发空闲预隔离。
    const { view: smallView } = await mountRuntime('第一段\n\n第二段', 160);
    vi.useFakeTimers();
    let currentActiveElement: Element | null = smallView.dom;
    vi.spyOn(document, 'activeElement', 'get').mockImplementation(() => currentActiveElement);
    setCollapsedCaret(smallView.dom.firstElementChild?.firstChild, 0);

    fireEvent.focus(smallView.dom);
    fireEvent.pointerUp(smallView.dom);
    fireEvent.keyUp(smallView.dom, { key: 'a' });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(smallView.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);

    // 2. 大文档（>= 30 块）单块折叠光标触发 pointerUp 后自动进入预隔离，且 IME 组字与 Shift 不退出隔离。
    const largeMarkdown = Array.from({ length: 35 }, (_, index) => `第 ${index + 1} 段正文内容`).join('\n\n');
    const { runtime, view } = await mountRuntime(largeMarkdown, 160);
    expect(view.dom.childElementCount).toBeGreaterThanOrEqual(30);

    const lastParagraph = view.dom.lastElementChild as HTMLElement;
    expect(lastParagraph).toBeTruthy();
    const domFocusSpy = vi.spyOn(view.dom, 'focus').mockImplementation(() => {
      currentActiveElement = view.dom;
    });
    const childFocusSpy = vi.spyOn(lastParagraph, 'focus').mockImplementation(() => {
      currentActiveElement = lastParagraph;
    });

    currentActiveElement = view.dom;
    setCollapsedCaret(lastParagraph.firstChild, 0);
    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);
    expect(childFocusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(currentActiveElement).toBe(lastParagraph);

    // 组字按键（Process/229）、compositionstart/end 及裸 Shift 均保持隔离态不断开。
    fireEvent.keyDown(view.dom, { key: 'Process', keyCode: 229 });
    setComposingState(view, true);
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);
    setComposingState(view, false);
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);
    fireEvent.keyDown(view.dom, { key: 'Shift' });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    // 3. 普通按键立即归还根焦点并在松手后恢复；鼠标按下拖选前归还根焦点且拖选期间不重入隔离。
    fireEvent.keyDown(view.dom, { key: 'Enter' });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
    expect(currentActiveElement).toBe(view.dom);
    fireEvent.keyUp(view.dom, { key: 'Enter' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    fireEvent.keyDown(view.dom, { key: 'Backspace' });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
    fireEvent.keyUp(view.dom, { key: 'Backspace' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    fireEvent.keyDown(view.dom, { key: 'Escape' });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
    fireEvent.keyUp(view.dom, { key: 'Escape' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    // 拖选开始（pointerDown 段落文本）应立即退出隔离并将焦点交回 view.dom。
    domFocusSpy.mockClear();
    currentActiveElement = lastParagraph;
    fireEvent.pointerDown(lastParagraph);
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
    expect(domFocusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(currentActiveElement).toBe(view.dom);

    // 拖选尚未结束（未 pointerUp）期间，即使收到 root focus 也不会重新进入隔离。
    fireEvent.focus(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);

    // 单击松手（折叠光标）恢复预隔离。
    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    // 4. 点击内部交互控件（按钮 / contenteditable="false"）退出隔离但不强抢焦点。
    const interactiveButton = document.createElement('button');
    interactiveButton.type = 'button';
    view.dom.appendChild(interactiveButton);
    domFocusSpy.mockClear();
    currentActiveElement = lastParagraph;
    fireEvent.pointerDown(interactiveButton);
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
    expect(domFocusSpy).not.toHaveBeenCalled();
    fireEvent.pointerUp(document);
    interactiveButton.remove();

    // 5. 段内非折叠 selectionchange（如双击/拖选）触发时，即使焦点留在子段落也能立即交回根焦点，且 pointerUp 不重入。
    currentActiveElement = view.dom;
    setCollapsedCaret(lastParagraph.firstChild, 0);
    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    domFocusSpy.mockClear();
    currentActiveElement = lastParagraph;
    const sameBlockRange = document.createRange();
    sameBlockRange.setStart(lastParagraph.firstChild!, 0);
    sameBlockRange.setEnd(lastParagraph.firstChild!, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(sameBlockRange);
    fireEvent(document, new Event('selectionchange'));
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
    expect(domFocusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(currentActiveElement).toBe(view.dom);

    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);

    // 6. 内部 blur（relatedTarget 仍在 view.dom 内）保持隔离；外部 blur（含子块失焦）彻底退出。
    setCollapsedCaret(lastParagraph.firstChild, 0);
    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    fireEvent.blur(view.dom, { relatedTarget: view.dom.firstElementChild });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);

    fireEvent.blur(lastParagraph, { relatedTarget: null });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);

    // 跨块非折叠选区不进入隔离。
    const firstText = view.dom.children[0]?.firstChild;
    const secondText = view.dom.children[1]?.firstChild;
    expect(firstText).toBeTruthy();
    expect(secondText).toBeTruthy();
    const crossRange = document.createRange();
    crossRange.setStart(firstText!, 0);
    crossRange.setEnd(secondText!, 1);
    selection?.removeAllRanges();
    selection?.addRange(crossRange);

    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);

    // 切回单块折叠选区后处于只读态时，同样不应进入隔离。
    setCollapsedCaret(firstText, 0);
    act(() => {
      runtime.setReadOnly?.(true);
    });
    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(false);
  });

  it('大文档标题中文上屏触发 id 刷新重建 DOM 节点时，自动恢复编辑器焦点并重新预隔离新标题块', async () => {
    const paragraphs = Array.from({ length: 34 }, (_, index) => `第 ${index + 1} 段正文内容`);
    const largeMarkdown = [...paragraphs, '# 初始标题'].join('\n\n');
    const { view } = await mountRuntime(largeMarkdown, 160);
    vi.useFakeTimers();

    const oldHeading = view.dom.lastElementChild as HTMLElement;
    expect(oldHeading.tagName).toBe('H1');

    let currentActiveElement: Element | null = view.dom;
    vi.spyOn(document, 'activeElement', 'get').mockImplementation(() => currentActiveElement);
    vi.spyOn(oldHeading, 'focus').mockImplementation(() => {
      currentActiveElement = oldHeading;
    });
    vi.spyOn(view.dom, 'focus').mockImplementation(() => {
      currentActiveElement = view.dom;
    });
    const origViewFocus = view.focus.bind(view);
    const viewFocusSpy = vi.spyOn(view, 'focus').mockImplementation(() => {
      currentActiveElement = view.dom;
      origViewFocus();
    });
    const rootBlurSpy = vi.fn();
    view.dom.addEventListener('blur', rootBlurSpy);

    const headingTextNode = oldHeading.firstChild;
    expect(headingTextNode).toBeTruthy();
    const range = document.createRange();
    range.setStart(headingTextNode!, headingTextNode!.textContent?.length ?? 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.pointerUp(view.dom);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);
    expect(currentActiveElement).toBe(oldHeading);

    // 复现 Chromium NodeWillBeRemoved 时序：节点脱离 DOM 前先同步触发 blur（isConnected 仍为 true），随后文档重建替换 <h1>。
    const headingEndPos = view.state.doc.content.size - 1;
    await act(async () => {
      currentActiveElement = document.body;
      fireEvent.blur(oldHeading, { relatedTarget: null });
      expect(oldHeading.isConnected).toBe(true);
      const tr = view.state.tr.insertText('啊是高度压缩的', headingEndPos);
      tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size - 1)));
      view.dispatch(tr);
      await Promise.resolve();
    });

    const newHeading = view.dom.lastElementChild as HTMLElement;
    expect(newHeading).not.toBe(oldHeading);
    expect(oldHeading.isConnected).toBe(false);
    expect(newHeading.textContent).toContain('初始标题啊是高度压缩的');
    expect(viewFocusSpy).toHaveBeenCalledTimes(1);
    expect(rootBlurSpy).not.toHaveBeenCalled();

    // 紧接着应在微任务/定时器窗口内重新预隔离新的 <h1>，保证连续输入不退化。
    const newHeadingFocusSpy = vi.spyOn(newHeading, 'focus').mockImplementation(() => {
      currentActiveElement = newHeading;
    });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(view.dom.classList.contains(IME_ISOLATION_CLASS_NAME)).toBe(true);
    expect(newHeadingFocusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(currentActiveElement).toBe(newHeading);

    // 真实外部失焦（节点仍在文档内且焦点移至 body）应在微任务后向根节点补发 blur。
    await act(async () => {
      currentActiveElement = document.body;
      fireEvent.blur(newHeading, { relatedTarget: null });
      await Promise.resolve();
    });
    expect(rootBlurSpy).toHaveBeenCalledTimes(1);

    view.dom.removeEventListener('blur', rootBlurSpy);
  });
});
