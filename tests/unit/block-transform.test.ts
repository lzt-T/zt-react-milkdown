import { editorViewCtx } from '@milkdown/core';
import { undo } from '@milkdown/prose/history';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import {
  resolveCurrentBlockTransformCommand,
  runBlockTransformCommand
} from '@/plugins/custom/block-transform';

// 测试中创建的编辑器运行时，统一在用例结束后销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试挂载的宿主 DOM 节点。
const hosts: HTMLElement[] = [];

/**
 * 创建带完整内置插件的编辑器运行时。
 */
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
    shortcutMode: 'modShift',
    onChange: vi.fn(),
    onSearchSnapshotChange: vi.fn()
  });
  runtimes.push(runtime);

  await act(async () => {
    await runtime.editor.create();
    runtime.installRuntimePlugins();
  });

  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx));
  return { runtime, view };
};

/**
 * 在文档中查找目标文本片段的起止偏移。
 */
const findTextRange = (doc: ProseNode, targetText: string): { from: number; to: number } => {
  let matchedRange: { from: number; to: number } | null = null;

  doc.descendants((node, pos) => {
    if (matchedRange || !node.isText || !node.text) {
      return !matchedRange;
    }

    const offset = node.text.indexOf(targetText);
    if (offset >= 0) {
      matchedRange = {
        from: pos + offset,
        to: pos + offset + targetText.length
      };
      return false;
    }

    return true;
  });

  if (!matchedRange) {
    throw new Error(`未找到目标文本: ${targetText}`);
  }

  return matchedRange;
};

/**
 * 选中文档中从起始片段到结束片段的文本范围。
 */
const selectTextSpan = async (
  view: EditorView,
  startText: string,
  endText = startText
): Promise<void> => {
  const startRange = findTextRange(view.state.doc, startText);
  const endRange = startText === endText ? startRange : findTextRange(view.state.doc, endText);

  await act(async () => {
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, startRange.from, endRange.to))
    );
  });
};

/**
 * 读取当前选区对应的纯文本内容。
 */
const getSelectedText = (view: EditorView): string => {
  const { from, to } = view.state.selection;
  return view.state.doc.textBetween(from, to);
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

describe('块级转换 runBlockTransformCommand 与状态识别', () => {
  it('有序列表选中单项可转换为正文、标题、代码块与引用，且后续列表项序号自动重排', async () => {
    for (const target of [
      { command: 'paragraph', nodeName: 'paragraph', level: undefined },
      { command: 'heading2', nodeName: 'heading', level: 2 },
      { command: 'codeBlock', nodeName: 'code_block', level: undefined },
      { command: 'blockquote', nodeName: 'blockquote', level: undefined }
    ] as const) {
      const { view } = await mountRuntime('1. first\n2. second');
      await selectTextSpan(view, 'irs');

      let ok = false;
      await act(async () => {
        ok = runBlockTransformCommand(view, target.command);
      });

      expect(ok).toBe(true);
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.doc.child(0).type.name).toBe(target.nodeName);
      if (target.level !== undefined) {
        expect(view.state.doc.child(0).attrs.level).toBe(target.level);
      }
      expect(view.state.doc.child(0).textContent).toBe('first');

      const remainingList = view.state.doc.child(1);
      expect(remainingList.type.name).toBe('ordered_list');
      expect(remainingList.childCount).toBe(1);
      expect(remainingList.firstChild?.attrs.label).toBe('1.');
      expect(remainingList.firstChild?.textContent).toBe('second');

      expect(getSelectedText(view)).toBe('irs');
      expect(resolveCurrentBlockTransformCommand(view)).toBe(target.command);
    }
  });

  it('有序列表选中单项转为无序列表与任务列表后不会被 syncListOrder 还原', async () => {
    const { view: bulletView } = await mountRuntime('1. first\n2. second');
    await selectTextSpan(bulletView, 'irs');

    await act(async () => {
      expect(runBlockTransformCommand(bulletView, 'bulletList')).toBe(true);
    });

    const firstBulletList = bulletView.state.doc.child(0);
    expect(firstBulletList.type.name).toBe('bullet_list');
    expect(firstBulletList.firstChild?.attrs.listType).toBe('bullet');
    expect(firstBulletList.firstChild?.attrs.checked).toBeNull();
    expect(bulletView.state.doc.child(1).type.name).toBe('ordered_list');
    expect(bulletView.state.doc.child(1).firstChild?.attrs.label).toBe('1.');
    expect(getSelectedText(bulletView)).toBe('irs');
    expect(resolveCurrentBlockTransformCommand(bulletView)).toBe('bulletList');

    const { view: taskView } = await mountRuntime('1. first\n2. second');
    await selectTextSpan(taskView, 'irs');

    await act(async () => {
      expect(runBlockTransformCommand(taskView, 'taskList')).toBe(true);
    });

    const firstTaskList = taskView.state.doc.child(0);
    expect(firstTaskList.type.name).toBe('bullet_list');
    expect(firstTaskList.firstChild?.attrs.listType).toBe('bullet');
    expect(firstTaskList.firstChild?.attrs.checked).toBe(false);
    expect(getSelectedText(taskView)).toBe('irs');
    expect(resolveCurrentBlockTransformCommand(taskView)).toBe('taskList');
  });

  it('列表家族支持无序、任务、有序互转，保留已勾选状态并支持相邻同类型合并', async () => {
    const { view } = await mountRuntime('- alpha\n- beta');
    await selectTextSpan(view, 'alpha');

    await act(async () => {
      expect(runBlockTransformCommand(view, 'taskList')).toBe(true);
    });
    expect(view.state.doc.firstChild?.type.name).toBe('bullet_list');
    expect(view.state.doc.firstChild?.child(0).attrs.checked).toBe(false);
    expect(view.state.doc.firstChild?.child(1).attrs.checked).toBeNull();

    // 将第 1 项设为已勾选后再次执行 taskList，应保留勾选状态。
    await act(async () => {
      const firstItemPos = 1;
      const firstItem = view.state.doc.nodeAt(firstItemPos)!;
      view.dispatch(
        view.state.tr.setNodeMarkup(firstItemPos, undefined, {
          ...firstItem.attrs,
          checked: true
        })
      );
      expect(runBlockTransformCommand(view, 'taskList')).toBe(true);
    });
    expect(view.state.doc.firstChild?.child(0).attrs.checked).toBe(true);

    // 任务列表转回无序列表时应清除 checked 属性。
    await act(async () => {
      expect(runBlockTransformCommand(view, 'bulletList')).toBe(true);
    });
    expect(view.state.doc.firstChild?.child(0).attrs.checked).toBeNull();

    // 跨多条列表项选区转为有序列表。
    await selectTextSpan(view, 'alpha', 'beta');
    await act(async () => {
      expect(runBlockTransformCommand(view, 'orderedList')).toBe(true);
    });
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('ordered_list');
    expect(view.state.doc.firstChild?.childCount).toBe(2);
    expect(view.state.doc.firstChild?.child(0).attrs.listType).toBe('ordered');
    expect(view.state.doc.firstChild?.child(1).attrs.label).toBe('2.');

    // 相邻有序列表与无序列表：将有序列表项转为无序列表时应自动合并。
    const { view: mergeView } = await mountRuntime('1. one\n\n- two');
    await selectTextSpan(mergeView, 'one');
    await act(async () => {
      expect(runBlockTransformCommand(mergeView, 'bulletList')).toBe(true);
    });
    expect(mergeView.state.doc.childCount).toBe(1);
    expect(mergeView.state.doc.firstChild?.type.name).toBe('bullet_list');
    expect(mergeView.state.doc.firstChild?.childCount).toBe(2);
  });

  it('嵌套列表原地转换保持缩进层级，并准确识别最内层列表类型', async () => {
    const { view } = await mountRuntime('1. outer\n   1. inner-1\n   2. inner-2');
    await selectTextSpan(view, 'inner-1');

    expect(resolveCurrentBlockTransformCommand(view)).toBe('orderedList');

    await act(async () => {
      expect(runBlockTransformCommand(view, 'bulletList')).toBe(true);
    });

    const outerList = view.state.doc.firstChild!;
    expect(outerList.type.name).toBe('ordered_list');
    const outerItem = outerList.firstChild!;
    expect(outerItem.childCount).toBe(3);
    expect(outerItem.child(1).type.name).toBe('bullet_list');
    expect(outerItem.child(1).firstChild?.textContent).toBe('inner-1');
    expect(outerItem.child(2).type.name).toBe('ordered_list');
    expect(outerItem.child(2).firstChild?.attrs.label).toBe('1.');
    expect(resolveCurrentBlockTransformCommand(view)).toBe('bulletList');
  });

  it('标题与代码块可直接转为无序列表、有序列表、任务列表与引用', async () => {
    for (const listTarget of ['bulletList', 'orderedList', 'taskList'] as const) {
      const { view } = await mountRuntime('## Title');
      await selectTextSpan(view, 'Title');

      await act(async () => {
        expect(runBlockTransformCommand(view, listTarget)).toBe(true);
      });

      const expectedNodeName = listTarget === 'orderedList' ? 'ordered_list' : 'bullet_list';
      expect(view.state.doc.firstChild?.type.name).toBe(expectedNodeName);
      expect(view.state.doc.firstChild?.textContent).toBe('Title');
      expect(resolveCurrentBlockTransformCommand(view)).toBe(listTarget);
    }

    const { view: codeView } = await mountRuntime('```ts\nconst x = 1;\n```');
    await selectTextSpan(codeView, 'const x = 1;');

    await act(async () => {
      expect(runBlockTransformCommand(codeView, 'orderedList')).toBe(true);
    });
    expect(codeView.state.doc.firstChild?.type.name).toBe('ordered_list');
    expect(codeView.state.doc.firstChild?.textContent).toBe('const x = 1;');
  });

  it('引用块可脱出转换为各类块，且重复执行引用不会套娃', async () => {
    for (const target of [
      { command: 'paragraph', nodeName: 'paragraph' },
      { command: 'heading1', nodeName: 'heading' },
      { command: 'bulletList', nodeName: 'bullet_list' },
      { command: 'orderedList', nodeName: 'ordered_list' },
      { command: 'taskList', nodeName: 'bullet_list' },
      { command: 'codeBlock', nodeName: 'code_block' }
    ] as const) {
      const { view } = await mountRuntime('> quoted text');
      await selectTextSpan(view, 'quoted');

      await act(async () => {
        expect(runBlockTransformCommand(view, target.command)).toBe(true);
      });

      expect(view.state.doc.firstChild?.type.name).toBe(target.nodeName);
      expect(view.state.doc.firstChild?.textContent).toBe('quoted text');
      expect(resolveCurrentBlockTransformCommand(view)).toBe(target.command);
    }

    const { view: quoteView } = await mountRuntime('> quoted text');
    await selectTextSpan(quoteView, 'quoted');
    await act(async () => {
      expect(runBlockTransformCommand(quoteView, 'blockquote')).toBe(true);
    });

    expect(quoteView.state.doc.firstChild?.type.name).toBe('blockquote');
    expect(quoteView.state.doc.firstChild?.firstChild?.type.name).toBe('paragraph');
  });

  it('复杂转换在单事务内完成，支持一次 Undo 完整还原', async () => {
    const { view } = await mountRuntime('1. first\n2. second');
    await selectTextSpan(view, 'first');

    await act(async () => {
      expect(runBlockTransformCommand(view, 'heading2')).toBe(true);
    });
    expect(view.state.doc.child(0).type.name).toBe('heading');

    await act(async () => {
      expect(undo(view.state, view.dispatch)).toBe(true);
    });
    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('ordered_list');
    expect(view.state.doc.firstChild?.childCount).toBe(2);
  });
});
