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
 * 创建带真实列表与缩进插件的编辑器运行时。
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

/**
 * 在指定文本的列表项末尾追加一个段落并把光标定位进去。
 */
const appendParagraphToListItemAndFocus = async (
  view: ReturnType<typeof mountRuntime> extends Promise<infer T> ? T['view'] : never,
  targetItemText: string,
  paragraphText = ''
) => {
  let insertPos: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'list_item' && node.textContent === targetItemText) {
      insertPos = pos + node.nodeSize - 1;
      return false;
    }
    return true;
  });

  expect(insertPos).not.toBeNull();
  const paragraphNode = view.state.schema.nodes.paragraph.create(
    null,
    paragraphText ? [view.state.schema.text(paragraphText)] : []
  );

  await act(async () => {
    const tr = view.state.tr.insert(insertPos!, paragraphNode);
    tr.setSelection(TextSelection.create(tr.doc, insertPos! + 1));
    view.dispatch(tr);
  });
};

/**
 * 将光标定位到指定文本段落的开头。
 */
const focusParagraphByText = async (
  view: ReturnType<typeof mountRuntime> extends Promise<infer T> ? T['view'] : never,
  paragraphText: string
) => {
  let textStartPos: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent === paragraphText) {
      textStartPos = pos + 1;
      return false;
    }
    return true;
  });

  expect(textStartPos).not.toBeNull();
  await act(async () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textStartPos!)));
  });
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

describe('列表 Shift+Tab 反缩进与提升行为', () => {
  it('引用块内列表项多段落的空段落按 Shift+Tab 时仅移出当前空段落，保留首段列表符号', async () => {
    const { view } = await mountRuntime('> - asdsad\n> - adasdasd\n> - asdasd');
    await appendParagraphToListItemAndFocus(view, 'asdasd');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab', shiftKey: true });
    });

    const blockquote = view.state.doc.firstChild!;
    expect(blockquote.type.name).toBe('blockquote');
    expect(blockquote.childCount).toBe(2);

    const bulletList = blockquote.child(0);
    expect(bulletList.type.name).toBe('bullet_list');
    expect(bulletList.childCount).toBe(3);
    expect(bulletList.child(2).childCount).toBe(1);
    expect(bulletList.child(2).textContent).toBe('asdasd');

    const liftedParagraph = blockquote.child(1);
    expect(liftedParagraph.type.name).toBe('paragraph');
    expect(liftedParagraph.textContent).toBe('');
    expect(view.state.selection.$from.parent).toBe(liftedParagraph);
  });

  it('列表项后续还有兄弟项时，在多段落列表项第 2 段按 Shift+Tab 仅移出第 2 段', async () => {
    const { view } = await mountRuntime('- first\n- next');
    await appendParagraphToListItemAndFocus(view, 'first', 'second');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab', shiftKey: true });
    });

    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(0).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).textContent).toBe('first');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).textContent).toBe('second');
    expect(view.state.doc.child(2).type.name).toBe('bullet_list');
    expect(view.state.doc.child(2).textContent).toBe('next');
  });

  it('嵌套子列表中的多段落列表项第 2 段按 Shift+Tab 时逐级提升到外层列表项', async () => {
    const { view } = await mountRuntime('- outer\n  - inner1');
    await appendParagraphToListItemAndFocus(view, 'inner1', 'inner2');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab', shiftKey: true });
    });

    const outerList = view.state.doc.firstChild!;
    expect(outerList.type.name).toBe('bullet_list');
    expect(outerList.childCount).toBe(1);

    const outerItem = outerList.firstChild!;
    expect(outerItem.childCount).toBe(3);
    expect(outerItem.child(0).textContent).toBe('outer');
    expect(outerItem.child(1).type.name).toBe('bullet_list');
    expect(outerItem.child(1).textContent).toBe('inner1');
    expect(outerItem.child(2).type.name).toBe('paragraph');
    expect(outerItem.child(2).textContent).toBe('inner2');
  });

  it('嵌套子列表首段按 Shift+Tab 时正常提升为一级列表项', async () => {
    const { view } = await mountRuntime('- outer\n  - inner');
    await focusParagraphByText(view, 'inner');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab', shiftKey: true });
    });

    const outerList = view.state.doc.firstChild!;
    expect(outerList.type.name).toBe('bullet_list');
    expect(outerList.childCount).toBe(2);
    expect(outerList.child(0).textContent).toBe('outer');
    expect(outerList.child(1).textContent).toBe('inner');
  });

  it('一级列表单段落项按 Shift+Tab 时正常退出列表变为普通段落', async () => {
    const { view } = await mountRuntime('- item1\n- item2');
    await focusParagraphByText(view, 'item2');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab', shiftKey: true });
    });

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('bullet_list');
    expect(view.state.doc.child(0).textContent).toBe('item1');
    expect(view.state.doc.child(1).type.name).toBe('paragraph');
    expect(view.state.doc.child(1).textContent).toBe('item2');
  });
});
