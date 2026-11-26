import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { resolveCellTextPosition, resolveFocusedTable } from '@/plugins/custom/table/table-selection';

// 测试中创建的编辑器运行时，统一在用例结束后销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试挂载的宿主 DOM 节点。
const hosts: HTMLElement[] = [];

/**
 * 创建带真实表格插件与浮层容器的编辑器运行时。
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
  return { runtime, view, portal, contentPortal };
};

/**
 * 将光标定位到表格指定行列的单元格文本位置。
 */
const focusCell = async (
  view: ReturnType<typeof mountRuntime> extends Promise<infer T> ? T['view'] : never,
  rowIndex: number,
  columnIndex: number
) => {
  // 文档首张表格节点。
  const tableNode = view.state.doc.firstChild!;
  // 目标单元格文本起点。
  const cellPos = resolveCellTextPosition(tableNode, 0, rowIndex, columnIndex)!;
  await act(async () => {
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(cellPos), 1)));
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

const SAMPLE_TABLE_MARKDOWN = [
  '| 列1 | 列2 |',
  '| --- | --- |',
  '| a1 | b1 |',
  '| a2 | b2 |'
].join('\n');

describe('表格添加下一行快捷键', () => {
  it('在表格最后一行最后一列按 Tab 时自动追加一行并将光标移到新行第一列', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(view, 2, 1);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab' });
    });

    // 更新后的表格与光标状态。
    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.tableNode.childCount).toBe(4);
    expect(focused!.rowIndex).toBe(3);
    expect(focused!.columnIndex).toBe(0);
    // 确认未落入空格缩进插件往原末格插入空格。
    expect(focused!.tableNode.child(2).child(1).textContent).toBe('b2');
  });

  it('在表格非末尾单元格按 Tab 时仅跳转到下一格而不追加新行', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(view, 1, 0);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab' });
    });

    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.tableNode.childCount).toBe(3);
    expect(focused!.rowIndex).toBe(1);
    expect(focused!.columnIndex).toBe(1);
  });

  it('在表格非首个单元格按 Shift+Tab 时跳转到上一格且不修改单元格文本', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(view, 1, 1);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Tab', shiftKey: true });
    });

    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.tableNode.childCount).toBe(3);
    expect(focused!.rowIndex).toBe(1);
    expect(focused!.columnIndex).toBe(0);
    expect(focused!.tableNode.child(1).child(1).textContent).toBe('b1');
  });

  it('在表头行或中间行按 Ctrl+Enter 时在当前行下方插入一行并定位到新行第一列', async () => {
    const headerCase = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(headerCase.view, 0, 1);

    await act(async () => {
      fireEvent.keyDown(headerCase.view.dom, { key: 'Enter', ctrlKey: true });
    });

    const afterHeaderInsert = resolveFocusedTable(headerCase.view.state);
    expect(afterHeaderInsert).not.toBeNull();
    expect(afterHeaderInsert!.tableNode.childCount).toBe(4);
    expect(afterHeaderInsert!.rowIndex).toBe(1);
    expect(afterHeaderInsert!.columnIndex).toBe(0);
    // 新插入的行应为普通数据行且为空。
    expect(afterHeaderInsert!.tableNode.child(1).type.name).toBe('table_row');
    expect(afterHeaderInsert!.tableNode.child(1).textContent).toBe('');
  });

  it('在表格内单独按 Enter 时保持退出表格行为且不增加表格行', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(view, 1, 0);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Enter' });
    });

    expect(view.state.doc.firstChild?.type.name).toBe('table');
    expect(view.state.doc.firstChild?.childCount).toBe(3);
    expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(resolveFocusedTable(view.state)).toBeNull();
  });

  it('只读模式或组字状态下按 Ctrl+Enter 或末格 Tab 不插入新行', async () => {
    const readonlyCase = await mountRuntime(SAMPLE_TABLE_MARKDOWN, true);
    await focusCell(readonlyCase.view, 2, 1);

    await act(async () => {
      fireEvent.keyDown(readonlyCase.view.dom, { key: 'Tab' });
      fireEvent.keyDown(readonlyCase.view.dom, { key: 'Enter', ctrlKey: true });
    });

    expect(readonlyCase.view.state.doc.firstChild?.childCount).toBe(3);

    const composingCase = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(composingCase.view, 2, 1);

    await act(async () => {
      fireEvent.keyDown(composingCase.view.dom, { key: 'Tab', isComposing: true });
      fireEvent.keyDown(composingCase.view.dom, { key: 'Enter', ctrlKey: true, isComposing: true });
    });

    expect(composingCase.view.state.doc.firstChild?.childCount).toBe(3);
  });

  it('在表格外按 Ctrl+Enter 不影响普通文档', async () => {
    const { view } = await mountRuntime('普通段落');
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    });

    const beforeDocString = view.state.doc.toString();
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Enter', ctrlKey: true });
    });

    expect(view.state.doc.toString()).toBe(beforeDocString);
  });

  it('展开表格更多操作菜单时在下方插入行旁显示快捷键提示', async () => {
    const { view, contentPortal } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await focusCell(view, 1, 0);

    // 点击更多操作按钮展开菜单。
    const moreButton = contentPortal.querySelector<HTMLButtonElement>(
      'button[aria-label="更多表格操作"]'
    );
    expect(moreButton).not.toBeNull();

    await act(async () => {
      fireEvent.click(moreButton!);
    });

    const shortcutElement = contentPortal.querySelector<HTMLElement>(
      '.zt-md-table-action-menu-item-shortcut'
    );
    expect(shortcutElement).not.toBeNull();
    expect(['Ctrl+Enter', '⌘Enter']).toContain(shortcutElement!.textContent);
  });
});
