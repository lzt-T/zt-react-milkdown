import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { editorViewCtx } from '@milkdown/core';
import type { EditorView } from '@milkdown/prose/view';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 记录测试期间挂载的运行时实例，便于统一销毁回收。
const runtimes: MilkdownEditorRuntime[] = [];
// 记录测试期间插入的宿主节点，便于逐个清理。
const hosts: HTMLElement[] = [];

/** 挂载带完整默认插件的编辑器运行时用于表格节点视图测试。 */
const mountRuntime = async (markdown: string) => {
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

  const runtime = createMilkdownEditorRuntime({
    root,
    portalContainer: portal,
    contentPortalContainer: contentPortal,
    markdown,
    locale: 'zh-CN',
    messages: resolveEditorMessages('zh-CN'),
    readOnly: false,
    debounceMs: 160,
    shortcutMode: 'modShift',
    onChange: vi.fn(),
    onSearchSnapshotChange: vi.fn()
  });
  runtimes.push(runtime);

  await act(async () => {
    await runtime.editor.create();
    runtime.installRuntimePlugins();
  });

  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx)) as EditorView;
  return { runtime, view };
};

afterEach(async () => {
  await act(async () => {
    for (const runtime of runtimes.splice(0)) {
      await runtime.editor.destroy();
    }
  });
  hosts.splice(0).forEach((host) => host.remove());
});

describe('table-scroll-node-view', () => {
  it('渲染 GFM 表格时包裹 .tableWrapper 容器，且修改单元格文本后原地复用同一容器', async () => {
    const markdown = ['| 列一 | 列二 |', '| --- | --- |', '| 内容A | 内容B |'].join('\n');
    const { view } = await mountRuntime(markdown);

    const wrapper = view.dom.querySelector(':scope > .tableWrapper');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.querySelector('table > tbody > tr')).toBeTruthy();

    // 查找首个普通单元格（table_cell）内的文本起始位置并修改文本。
    let cellTextPos = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table_cell' && cellTextPos < 0) {
        cellTextPos = pos + 2;
        return false;
      }
      return true;
    });
    expect(cellTextPos).toBeGreaterThan(0);

    await act(async () => {
      view.dispatch(view.state.tr.insertText('追加', cellTextPos));
    });

    const wrapperAfterEdit = view.dom.querySelector(':scope > .tableWrapper');
    expect(wrapperAfterEdit).toBe(wrapper);
    expect(wrapperAfterEdit?.textContent).toContain('追加内容A');
  });
});
