import { editorViewCtx } from '@milkdown/core';
import { GapCursor } from '@milkdown/prose/gapcursor';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { resolveFocusedTable } from '@/plugins/custom/table/table-selection';

// 测试中创建的编辑器运行时，统一在用例结束后销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试挂载的宿主 DOM 节点。
const hosts: HTMLElement[] = [];

/**
 * 创建带真实表格插件的编辑器运行时。
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
 * 在文档第一张表格后插入真实空段落，并将光标置入该空段落行首。
 */
const insertEmptyParagraphAfterTableAndFocus = async (
  view: ReturnType<typeof mountRuntime> extends Promise<infer T> ? T['view'] : never
) => {
  const tableNode = view.state.doc.firstChild!;
  const insertPos = tableNode.nodeSize;
  const emptyParagraph = view.state.schema.nodes.paragraph.create();

  await act(async () => {
    const tr = view.state.tr.insert(insertPos, emptyParagraph);
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    view.dispatch(tr);
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
  '| 方向 | 作用 |',
  '| --- | --- |',
  '| gRPC / RPC | 服务之间高效通信 |',
  '| 熔断限流 | 下游异常时保护当前服务 |'
].join('\n');

describe('表格下方 Backspace 行为', () => {
  it('表格下方有空段落且后续存在标题时，按 Backspace 删除空段落并进入表格末格末尾', async () => {
    const { view } = await mountRuntime(`${SAMPLE_TABLE_MARKDOWN}\n\n## gRPC`);
    await insertEmptyParagraphAfterTableAndFocus(view);
    expect(view.state.doc.childCount).toBe(3);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(0).type.name).toBe('table');
    expect(view.state.doc.child(1).type.name).toBe('heading');
    expect(view.state.doc.child(1).textContent).toBe('gRPC');
    expect(view.state.selection instanceof NodeSelection).toBe(false);

    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parent.textContent).toBe('下游异常时保护当前服务');
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('表格位于文档末尾且紧跟空段落时，按 Backspace 删除空段落并进入表格末格末尾', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    await insertEmptyParagraphAfterTableAndFocus(view);
    expect(view.state.doc.childCount).toBe(2);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('table');
    expect(view.state.selection instanceof NodeSelection).toBe(false);

    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('表格下方紧邻非空段落时，在行首按 Backspace 不删内容且进入表格末格末尾', async () => {
    const { view } = await mountRuntime(`${SAMPLE_TABLE_MARKDOWN}\n\n保留的段落内容`);
    const tableNode = view.state.doc.firstChild!;
    const paragraphTextStart = tableNode.nodeSize + 1;

    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, paragraphTextStart))
      );
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(1).textContent).toBe('保留的段落内容');
    expect(view.state.selection instanceof NodeSelection).toBe(false);

    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('表格下方段落光标不在行首时，按 Backspace 不进入表格', async () => {
    const { view } = await mountRuntime(`${SAMPLE_TABLE_MARKDOWN}\n\nabc`);
    const tableNode = view.state.doc.firstChild!;
    const cursorPos = tableNode.nodeSize + 1 + 2;

    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)));
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(resolveFocusedTable(view.state)).toBeNull();
    expect(view.state.selection instanceof NodeSelection).toBe(false);
    expect(view.state.selection.$from.parent.textContent).toBe('abc');
    expect(view.state.selection.$from.parentOffset).toBe(2);
  });

  it('表格下方紧邻标题时，在标题行首按 Backspace 保持标题降级行为而不进入表格', async () => {
    const { view } = await mountRuntime(`${SAMPLE_TABLE_MARKDOWN}\n\n## gRPC`);
    const tableNode = view.state.doc.firstChild!;
    const headingTextStart = tableNode.nodeSize + 1;

    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, headingTextStart))
      );
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(resolveFocusedTable(view.state)).toBeNull();
    expect(view.state.doc.child(1).type.name).toBe('heading');
    expect(view.state.doc.child(1).attrs.level).toBe(1);
    expect(view.state.doc.child(1).textContent).toBe('gRPC');
  });

  it('GapCursor 位于表格正下方时，按 Backspace 不选中整表并进入表格末格末尾', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
    const tableNode = view.state.doc.firstChild!;
    const gapPosition = tableNode.nodeSize;

    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(gapPosition)))
      );
    });
    expect(view.state.selection instanceof GapCursor).toBe(true);

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.selection instanceof NodeSelection).toBe(false);
    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('只读模式下在表格下方空段落行首按 Backspace 不删除空段落也不移动选区', async () => {
    const { view } = await mountRuntime(SAMPLE_TABLE_MARKDOWN, true);
    await insertEmptyParagraphAfterTableAndFocus(view);
    const selectionFromBefore = view.state.selection.from;

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.childCount).toBe(2);
    expect(resolveFocusedTable(view.state)).toBeNull();
    expect(view.state.selection.from).toBe(selectionFromBefore);
  });
});

/**
 * 构造可插入当前编辑器文档的示例表格节点。
 */
const buildSampleTableNodeForView = async (
  targetView: ReturnType<typeof mountRuntime> extends Promise<infer T> ? T['view'] : never
) => {
  // 借助完整 GFM 解析器生成标准表格结构，再转换到目标视图 Schema。
  const { view: sampleView } = await mountRuntime(SAMPLE_TABLE_MARKDOWN);
  const tableJson = sampleView.state.doc.firstChild!.toJSON();
  return targetView.state.schema.nodeFromJSON(tableJson);
};

/**
 * 查找首个指定类型节点的内部末尾位置。
 */
const findFirstNodeInnerEnd = (
  doc: { descendants: (fn: (node: { type: { name: string }; nodeSize: number }, pos: number) => boolean | void) => void },
  typeName: string
): number => {
  let innerEnd = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && innerEnd === -1) {
      innerEnd = pos + node.nodeSize - 1;
      return false;
    }
    return true;
  });
  if (innerEnd === -1) {
    throw new Error(`未找到节点类型: ${typeName}`);
  }
  return innerEnd;
};

describe('嵌套在引用块与列表末尾的表格 Backspace / ArrowUp 行为', () => {
  it('引用块末尾含表格且下方紧跟空段落时，按 Backspace 删除空段落并进入表格末格末尾', async () => {
    const { view } = await mountRuntime('> 引用文字');
    const tableNode = await buildSampleTableNodeForView(view);
    const blockquoteInnerEnd = findFirstNodeInnerEnd(view.state.doc, 'blockquote');

    await act(async () => {
      const tr = view.state.tr.insert(blockquoteInnerEnd, tableNode);
      const containerAfterPos = tr.doc.firstChild!.nodeSize;
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      tr.insert(containerAfterPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, containerAfterPos + 1));
      view.dispatch(tr);
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.childCount).toBe(1);
    expect(view.state.doc.firstChild?.type.name).toBe('blockquote');
    expect(view.state.doc.textContent).toContain('引用文字');
    expect(view.state.selection instanceof NodeSelection).toBe(false);

    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parent.textContent).toBe('下游异常时保护当前服务');
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('引用块末尾含表格且下方紧跟空段落时，按 ArrowUp 直接进入表格末格末尾', async () => {
    const { view } = await mountRuntime('> 引用文字');
    const tableNode = await buildSampleTableNodeForView(view);
    const blockquoteInnerEnd = findFirstNodeInnerEnd(view.state.doc, 'blockquote');

    await act(async () => {
      const tr = view.state.tr.insert(blockquoteInnerEnd, tableNode);
      const containerAfterPos = tr.doc.firstChild!.nodeSize;
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      tr.insert(containerAfterPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, containerAfterPos + 1));
      view.dispatch(tr);
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowUp' });
    });

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.selection instanceof NodeSelection).toBe(false);
    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('有序列表末尾含表格且下方紧跟非空段落时，在行首按 Backspace 不删内容且进入表格末格末尾', async () => {
    const { view } = await mountRuntime('1. 列表项文字\n\n保留的后续段落');
    const tableNode = await buildSampleTableNodeForView(view);
    const listItemInnerEnd = findFirstNodeInnerEnd(view.state.doc, 'list_item');

    await act(async () => {
      const tr = view.state.tr.insert(listItemInnerEnd, tableNode);
      const listAfterPos = tr.doc.firstChild!.nodeSize;
      tr.setSelection(TextSelection.create(tr.doc, listAfterPos + 1));
      view.dispatch(tr);
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.doc.childCount).toBe(2);
    expect(view.state.doc.child(1).textContent).toBe('保留的后续段落');
    expect(view.state.selection instanceof NodeSelection).toBe(false);
    const focused = resolveFocusedTable(view.state);
    expect(focused).not.toBeNull();
    expect(focused!.rowIndex).toBe(2);
    expect(focused!.columnIndex).toBe(1);
    expect(view.state.selection.$from.parentOffset).toBe('下游异常时保护当前服务'.length);
  });

  it('GapCursor 位于末尾含表格的引用块后方时，按 Backspace 与 ArrowUp 均进入表格末格末尾', async () => {
    const firstCase = await mountRuntime('> 引用文字');
    const tableNode1 = await buildSampleTableNodeForView(firstCase.view);
    const quoteEnd1 = findFirstNodeInnerEnd(firstCase.view.state.doc, 'blockquote');

    await act(async () => {
      const tr = firstCase.view.state.tr.insert(quoteEnd1, tableNode1);
      const gapPos = tr.doc.firstChild!.nodeSize;
      tr.setSelection(new GapCursor(tr.doc.resolve(gapPos)));
      firstCase.view.dispatch(tr);
    });
    expect(firstCase.view.state.selection instanceof GapCursor).toBe(true);

    await act(async () => {
      fireEvent.keyDown(firstCase.view.dom, { key: 'Backspace' });
    });

    expect(firstCase.view.state.selection instanceof NodeSelection).toBe(false);
    expect(resolveFocusedTable(firstCase.view.state)?.rowIndex).toBe(2);
    expect(resolveFocusedTable(firstCase.view.state)?.columnIndex).toBe(1);

    const secondCase = await mountRuntime('> 引用文字');
    const tableNode2 = await buildSampleTableNodeForView(secondCase.view);
    const quoteEnd2 = findFirstNodeInnerEnd(secondCase.view.state.doc, 'blockquote');

    await act(async () => {
      const tr = secondCase.view.state.tr.insert(quoteEnd2, tableNode2);
      const gapPos = tr.doc.firstChild!.nodeSize;
      tr.setSelection(new GapCursor(tr.doc.resolve(gapPos)));
      secondCase.view.dispatch(tr);
    });
    expect(secondCase.view.state.selection instanceof GapCursor).toBe(true);

    await act(async () => {
      fireEvent.keyDown(secondCase.view.dom, { key: 'ArrowUp' });
    });

    expect(secondCase.view.state.selection instanceof NodeSelection).toBe(false);
    expect(resolveFocusedTable(secondCase.view.state)?.rowIndex).toBe(2);
    expect(resolveFocusedTable(secondCase.view.state)?.columnIndex).toBe(1);
  });

  it('引用块末尾为普通段落（无表格）时，下方空段落按 Backspace 与 ArrowUp 不误触发进入表格', async () => {
    const { view } = await mountRuntime('> 普通引用文本');

    await act(async () => {
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      const insertPos = view.state.doc.content.size;
      const tr = view.state.tr.insert(insertPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
      view.dispatch(tr);
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowUp' });
    });
    expect(resolveFocusedTable(view.state)).toBeNull();

    await act(async () => {
      const insertPos = view.state.doc.content.size - 1;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, insertPos)));
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });
    expect(resolveFocusedTable(view.state)).toBeNull();
    expect(view.state.selection instanceof NodeSelection).toBe(false);
  });
});
