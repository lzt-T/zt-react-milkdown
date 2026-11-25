import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { editorViewCtx } from '@milkdown/core';
import type { EditorView } from '@milkdown/prose/view';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 记录测试期间挂载的运行时实例，便于统一回收。
const runtimes: MilkdownEditorRuntime[] = [];
// 记录测试期间插入的宿主节点，便于逐个清理。
const hosts: HTMLElement[] = [];

/** 挂载带完整默认插件的真实编辑器运行时，用于验证解析与序列化往返行为。 */
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
    shortcutMode: 'modShift',
    onChange,
    onSearchSnapshotChange
  });
  runtimes.push(runtime);
  await act(async () => {
    await runtime.editor.create();
    runtime.installRuntimePlugins();
  });
  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx));
  return { runtime, view, onChange };
};

/** 收集文档中带有指定 mark 的所有文本片段。 */
const collectMarkedTexts = (view: EditorView, markName: string): string[] => {
  const result: string[] = [];
  view.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === markName)) {
      result.push(node.text ?? '');
    }
  });
  return result;
};

afterEach(async () => {
  await act(async () => {
    for (const runtime of runtimes.splice(0)) {
      await runtime.editor.destroy();
    }
  });
  hosts.splice(0).forEach((host) => host.remove());
});

describe('cjk-emphasis', () => {
  it('能正确解析紧邻 CJK 标点与汉字的加粗、斜体和删除线语法', async () => {
    const sourceMarkdown = [
      '**RPC（Remote Procedure Call，远程过程调用）**就是让',
      '',
      '*“斜体”*中文',
      '',
      '~~（已废弃）~~说明'
    ].join('\n');

    const { view } = await mountRuntime(sourceMarkdown);

    expect(collectMarkedTexts(view, 'strong')).toEqual([
      'RPC（Remote Procedure Call，远程过程调用）'
    ]);
    expect(collectMarkedTexts(view, 'emphasis')).toEqual(['“斜体”']);
    expect(collectMarkedTexts(view, 'strike_through')).toEqual(['（已废弃）']);
    expect(view.state.doc.textContent).not.toContain('**');
    expect(view.state.doc.textContent).not.toContain('*');
    expect(view.state.doc.textContent).not.toContain('~~');
  });

  it('将加粗、斜体与删除线选区内的首尾空格移到定界符外侧并支持重新解析', async () => {
    // 验证加粗末尾空格移至 ** 外侧。
    const strongTarget = 'RPC （Remote Procedure Call，远程过程调用） ';
    const strongEditor = await mountRuntime(`${strongTarget}就是让`);
    const strongType = strongEditor.view.state.schema.marks.strong;

    await act(async () => {
      strongEditor.view.dispatch(
        strongEditor.view.state.tr.addMark(1, 1 + strongTarget.length, strongType.create())
      );
    });

    const serializedStrong = strongEditor.onChange.mock.calls.at(-1)?.[0] as string;
    expect(serializedStrong.trim()).toBe('**RPC （Remote Procedure Call，远程过程调用）** 就是让');

    const reparsedStrong = await mountRuntime(serializedStrong);
    expect(collectMarkedTexts(reparsedStrong.view, 'strong')).toEqual([
      'RPC （Remote Procedure Call，远程过程调用）'
    ]);
    expect(reparsedStrong.view.state.doc.textContent).not.toContain('**');

    // 验证斜体前导空格移至 * 外侧。
    const emTarget = ' “斜体”';
    const emEditor = await mountRuntime(`前缀${emTarget}中文`);
    const emType = emEditor.view.state.schema.marks.emphasis;

    await act(async () => {
      emEditor.view.dispatch(emEditor.view.state.tr.addMark(3, 3 + emTarget.length, emType.create()));
    });

    const serializedEm = emEditor.onChange.mock.calls.at(-1)?.[0] as string;
    expect(serializedEm.trim()).toBe('前缀 *“斜体”*中文');

    const reparsedEm = await mountRuntime(serializedEm);
    expect(collectMarkedTexts(reparsedEm.view, 'emphasis')).toEqual(['“斜体”']);
    expect(reparsedEm.view.state.doc.textContent).not.toContain('*');

    // 验证删除线末尾空格移至 ~~ 外侧。
    const strikeTarget = '（已废弃） ';
    const strikeEditor = await mountRuntime(`${strikeTarget}说明`);
    const strikeType = strikeEditor.view.state.schema.marks.strike_through;

    await act(async () => {
      strikeEditor.view.dispatch(
        strikeEditor.view.state.tr.addMark(1, 1 + strikeTarget.length, strikeType.create())
      );
    });

    const serializedStrike = strikeEditor.onChange.mock.calls.at(-1)?.[0] as string;
    expect(serializedStrike.trim()).toBe('~~（已废弃）~~ 说明');

    const reparsedStrike = await mountRuntime(serializedStrike);
    expect(collectMarkedTexts(reparsedStrike.view, 'strike_through')).toEqual(['（已废弃）']);
    expect(reparsedStrike.view.state.doc.textContent).not.toContain('~~');
  });

  it('纯空白选区施加加粗 mark 时不会序列化出孤立的 ** 标记', async () => {
    const { view, onChange } = await mountRuntime('前   后');
    const strongType = view.state.schema.marks.strong;

    await act(async () => {
      view.dispatch(view.state.tr.addMark(2, 5, strongType.create()));
    });

    const serialized = onChange.mock.calls.at(-1)?.[0] as string;
    expect(serialized.trim()).toBe('前   后');
    expect(serialized).not.toContain('**');
  });
});
