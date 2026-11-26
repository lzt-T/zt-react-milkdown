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
 * 创建带真实插件与 Portal 容器的编辑器实例。
 */
const mountRuntime = async (markdown: string) => {
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
    readOnly: false,
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
  return { runtime, view, portal };
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

describe('slash 菜单方向键导航', () => {
  it('文档最后一行输入 / 后按 ArrowDown 切换菜单高亮，不插入新段落也不跳转光标', async () => {
    const { view, portal } = await mountRuntime('');
    // 模拟真实浏览器中处于文本块末行时的行边界判断。
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    await act(async () => {
      view.dispatch(view.state.tr.insertText('/', 1));
    });

    // 当前菜单元素与菜单项集合。
    const menu = portal.querySelector<HTMLElement>('.slash-menu')!;
    const menuItems = Array.from(menu.querySelectorAll<HTMLElement>('.slash-menu-item'));
    expect(menu.style.display).toBe('block');
    expect(menuItems.length).toBeGreaterThan(1);
    expect(menuItems[0]?.dataset.selected).toBe('true');

    // 按方向键前的文档节点数量与光标位置。
    const beforeChildCount = view.state.doc.childCount;
    const beforeSelectionFrom = view.state.selection.from;

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(menuItems[0]?.dataset.selected).toBe('false');
    expect(menuItems[1]?.dataset.selected).toBe('true');
    expect(view.state.doc.childCount).toBe(beforeChildCount);
    expect(view.state.selection.from).toBe(beforeSelectionFrom);
  });

  it('紧邻分割线下方段落输入 / 后按 ArrowUp 切换菜单高亮，不落入 GapCursor', async () => {
    const { view, portal } = await mountRuntime('---\n\n');
    // 模拟真实浏览器中处于文本块首行时的行边界判断。
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    // 末尾段落起始文本位置。
    let lastParagraphStartPos = 0;
    view.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph') {
        lastParagraphStartPos = offset + 1;
      }
    });

    await act(async () => {
      const tr = view.state.tr.insertText('/', lastParagraphStartPos);
      tr.setSelection(TextSelection.create(tr.doc, lastParagraphStartPos + 1));
      view.dispatch(tr);
    });

    // 当前菜单项集合。
    const menuItems = Array.from(portal.querySelectorAll<HTMLElement>('.slash-menu-item'));
    expect(menuItems.length).toBeGreaterThan(1);
    expect(menuItems[0]?.dataset.selected).toBe('true');

    // 按方向键前的光标位置。
    const beforeSelectionFrom = view.state.selection.from;

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowUp' });
    });

    expect(menuItems[0]?.dataset.selected).toBe('false');
    expect(menuItems[menuItems.length - 1]?.dataset.selected).toBe('true');
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(beforeSelectionFrom);
  });

  it('按 Escape 关闭 slash 菜单后，文档末尾按 ArrowDown 恢复正常边界导航', async () => {
    const { view, portal } = await mountRuntime('');
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    await act(async () => {
      view.dispatch(view.state.tr.insertText('/', 1));
    });

    // 当前菜单元素。
    const menu = portal.querySelector<HTMLElement>('.slash-menu')!;
    expect(menu.style.display).toBe('block');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Escape' });
    });

    expect(menu.style.display).toBe('none');
    // 关闭菜单后文档块数量。
    const childCountAfterEscape = view.state.doc.childCount;

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(view.state.doc.childCount).toBe(childCountAfterEscape + 1);
  });

  it('未打开 slash 菜单时，文档末尾按 ArrowDown 保持原有插入新段落行为', async () => {
    const { view } = await mountRuntime('hello');
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);

    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    });

    // 按方向键前的文档块数量。
    const beforeChildCount = view.state.doc.childCount;

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(view.state.doc.childCount).toBe(beforeChildCount + 1);
  });
});
