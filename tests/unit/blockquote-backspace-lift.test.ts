import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';

// 测试中创建的编辑器运行时，统一在用例结束后销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试挂载的宿主 DOM 节点。
const hosts: HTMLElement[] = [];

/**
 * 创建带真实引用块与列表插件的编辑器运行时。
 */
const mountRuntime = async (markdown: string, readOnly = false) => {
  // 编辑器主题宿主。
  const host = document.createElement('div');
  host.className = 'zt-md zt-md-light';
  // 编辑区滚动容器。
  const wrapper = document.createElement('div');
  wrapper.className = 'zt-md-editor';
  // ProseMirror 挂载节点。
  const root = document.createElement('div');
  // 编辑器级浮层容器。
  const portal = document.createElement('div');
  // 内容附属浮层容器。
  const contentPortal = document.createElement('div');

  wrapper.append(root, contentPortal);
  host.append(wrapper, portal);
  document.body.append(host);
  hosts.push(host);

  // 编辑器运行时实例。
  const runtime = createMilkdownEditorRuntime({
    root,
    portalContainer: portal,
    contentPortalContainer: contentPortal,
    markdown,
    locale: 'zh-CN',
    messages: resolveEditorMessages('zh-CN'),
    readOnly,
    shortcutMode: 'modShift',
    onChange: vi.fn(),
    onSearchSnapshotChange: vi.fn()
  });
  runtimes.push(runtime);

  await act(async () => {
    await runtime.editor.create();
    runtime.installRuntimePlugins();
  });

  // ProseMirror 视图实例。
  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx));
  return { runtime, view };
};

// 记录原始 scrollIntoView，避免污染其他测试文件。
let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined;

beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }

  await act(async () => {
    for (const runtime of runtimes.splice(0)) {
      await runtime.editor.destroy();
    }
  });
  hosts.splice(0).forEach((host) => host.remove());
});

describe('引用块 Backspace 提升行为', () => {
  it('引用块嵌套有序列表的末尾空列表项按 Backspace 时不把整棵列表抬出引用块', async () => {
    const { view } = await mountRuntime('> 1. sadasd\n> 2. dasdsa');

    // 先将光标定位到第 2 项末尾并回车创建第 3 个空列表项。
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    });
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Enter' });
    });

    // 验证已生成 3 项有序列表且光标位于空列表项行首。
    const blockquoteBefore = view.state.doc.firstChild!;
    expect(blockquoteBefore.type.name).toBe('blockquote');
    expect(blockquoteBefore.firstChild?.type.name).toBe('ordered_list');
    expect(blockquoteBefore.firstChild?.childCount).toBe(3);
    expect(view.state.selection.$from.parentOffset).toBe(0);
    expect(view.state.selection.$from.parent.textContent).toBe('');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    // 引用块与有序列表应保留，且不再错误把全部列表项抬出引用块。
    const blockquoteAfter = view.state.doc.firstChild!;
    expect(blockquoteAfter.type.name).toBe('blockquote');
    expect(blockquoteAfter.firstChild?.type.name).toBe('ordered_list');
    expect(blockquoteAfter.firstChild?.childCount).toBe(2);
  });

  it('引用块嵌套有序列表的首项行首按 Backspace 时不把整棵列表抬出引用块', async () => {
    const { view } = await mountRuntime('> 1. first\n> 2. second');

    // 光标定位到第 1 项文本开头（doc > blockquote > ordered_list > list_item > paragraph）。
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(4), 1)));
    });
    expect(view.state.selection.$from.parent.textContent).toBe('first');
    expect(view.state.selection.$from.parentOffset).toBe(0);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.firstChild?.type.name).toBe('blockquote');
  });

  it('引用块直接首段行首按 Backspace 时退回普通段落', async () => {
    const { view } = await mountRuntime('> 引用首段');

    // 光标定位到引用块直接首段行首（doc > blockquote > paragraph）。
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(2), 1)));
    });
    expect(view.state.selection.$from.parent.textContent).toBe('引用首段');
    expect(view.state.selection.$from.parentOffset).toBe(0);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.state.doc.firstChild?.textContent).toBe('引用首段');
  });

  it('引用块第二段行首按 Backspace 时不会把第二段误提升出引用块', async () => {
    const { view } = await mountRuntime('> 第一段\n>\n> 第二段');
    const blockquote = view.state.doc.firstChild!;
    const secondParagraphPos = 1 + blockquote.child(0).nodeSize + 1;

    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, secondParagraphPos))
      );
    });
    expect(view.state.selection.$from.parent.textContent).toBe('第二段');
    expect(view.state.selection.$from.parentOffset).toBe(0);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.firstChild?.type.name).toBe('blockquote');
  });

  it('只读模式下引用块首段行首按 Backspace 不改变引用块结构', async () => {
    const { view } = await mountRuntime('> 只读引用', true);

    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(2), 1)));
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.firstChild?.type.name).toBe('blockquote');
    expect(view.state.doc.firstChild?.textContent).toBe('只读引用');
  });
});
