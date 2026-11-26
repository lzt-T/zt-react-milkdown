import { editorViewCtx } from '@milkdown/core';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { insertImageNode } from '@/plugins/custom/image/image-insert';

// 测试中创建的编辑器运行时，统一在用例结束后销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试挂载的宿主 DOM 节点。
const hosts: HTMLElement[] = [];

/**
 * 创建带真实 schema 与插件的编辑器运行时。
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
  return { runtime, view };
};

/**
 * 统计文档中指定节点类型数量。
 */
const countNodesByType = (doc: { descendants: (fn: (node: { type: { name: string } }) => void) => void }, typeName: string): number => {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === typeName) {
      count += 1;
    }
  });
  return count;
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

describe('insertImageNode 图片插入', () => {
  it('在文档末尾插入图片时选中图片节点并在后方补充空段落', async () => {
    const { view } = await mountRuntime('hello');

    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    });

    // 插入结果。
    let inserted = false;
    await act(async () => {
      inserted = insertImageNode(view, {
        src: 'https://example.com/end.png',
        alt: 'end',
        title: ''
      });
    });

    expect(inserted).toBe(true);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image');
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/end.png');
    expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(view.state.doc.lastChild?.content.size).toBe(0);
  });

  it('在列表项内部第二空段落且后方存在下一列表项时能正常插入并选中图片', async () => {
    const { view } = await mountRuntime('### 微服务全景\n\n- 一套微服务系统由哪些零件组成\n- 下一项');

    // 第一个列表项内部结尾偏移。
    let firstListItemEndPos = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' && firstListItemEndPos === 0) {
        firstListItemEndPos = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    await act(async () => {
      const paragraph = view.state.schema.nodes.paragraph.create();
      const tr = view.state.tr.insert(firstListItemEndPos, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, firstListItemEndPos + 1));
      view.dispatch(tr);
    });

    // 插入前段落总数。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    let inserted = false;
    await act(async () => {
      inserted = insertImageNode(view, {
        src: 'https://example.com/list-next-item.png',
        alt: 'list-item',
        title: ''
      });
    });

    expect(inserted).toBe(true);
    expect(countNodesByType(view.state.doc, 'image')).toBe(1);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/list-next-item.png');
    // 列表项原空段落被替换为图片，且不会向下一列表项多插空段落。
    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount - 1);
  });

  it('在列表项内部第二空段落且列表外存在后续空段落时能正常插入且不冗余插段', async () => {
    const { view } = await mountRuntime('### 微服务全景\n\n- 一套微服务系统由哪些零件组成');

    // 首个列表项末尾位置。
    let listItemEndPos = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' && listItemEndPos === 0) {
        listItemEndPos = pos + node.nodeSize - 1;
        return false;
      }
      return true;
    });

    await act(async () => {
      const innerParagraph = view.state.schema.nodes.paragraph.create();
      const outerParagraph = view.state.schema.nodes.paragraph.create();
      const tr = view.state.tr.insert(listItemEndPos, innerParagraph);
      tr.insert(tr.doc.content.size, outerParagraph);
      tr.setSelection(TextSelection.create(tr.doc, listItemEndPos + 1));
      view.dispatch(tr);
    });

    // 插入前文档总块数与段落数。
    const beforeDocChildCount = view.state.doc.childCount;
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    let inserted = false;
    await act(async () => {
      inserted = insertImageNode(view, {
        src: 'https://example.com/list-outer-para.png',
        alt: 'list-outer',
        title: ''
      });
    });

    expect(inserted).toBe(true);
    expect(countNodesByType(view.state.doc, 'image')).toBe(1);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/list-outer-para.png');
    expect(view.state.doc.childCount).toBe(beforeDocChildCount);
    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount - 1);
  });

  it('在紧邻列表、引用块、表格前方的块中插入图片时都能成功插入并选中', async () => {
    // 场景 1：标题末尾后紧跟无序列表。
    const listCase = await mountRuntime('## 集成清单\n\n- 第一项');
    await act(async () => {
      const headingEndPos = listCase.view.state.doc.firstChild!.content.size + 1;
      listCase.view.dispatch(
        listCase.view.state.tr.setSelection(TextSelection.create(listCase.view.state.doc, headingEndPos))
      );
    });

    let insertedBeforeList = false;
    await act(async () => {
      insertedBeforeList = insertImageNode(listCase.view, {
        src: 'https://example.com/before-list.png',
        alt: 'before-list',
        title: ''
      });
    });
    expect(insertedBeforeList).toBe(true);
    expect(listCase.view.state.selection).toBeInstanceOf(NodeSelection);
    expect((listCase.view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/before-list.png');

    // 场景 2：紧邻引用块前的空段落。
    const quoteCase = await mountRuntime('> 引用内容');
    await act(async () => {
      const paragraph = quoteCase.view.state.schema.nodes.paragraph.create();
      const tr = quoteCase.view.state.tr.insert(0, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, 1));
      quoteCase.view.dispatch(tr);
    });

    let insertedBeforeQuote = false;
    await act(async () => {
      insertedBeforeQuote = insertImageNode(quoteCase.view, {
        src: 'https://example.com/before-quote.png',
        alt: 'before-quote',
        title: ''
      });
    });
    expect(insertedBeforeQuote).toBe(true);
    expect(quoteCase.view.state.selection).toBeInstanceOf(NodeSelection);
    expect((quoteCase.view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/before-quote.png');

    // 场景 3：紧邻表格前的空段落。
    const tableCase = await mountRuntime('| A | B |\n| --- | --- |\n| 1 | 2 |');
    await act(async () => {
      const paragraph = tableCase.view.state.schema.nodes.paragraph.create();
      const tr = tableCase.view.state.tr.insert(0, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, 1));
      tableCase.view.dispatch(tr);
    });

    let insertedBeforeTable = false;
    await act(async () => {
      insertedBeforeTable = insertImageNode(tableCase.view, {
        src: 'https://example.com/before-table.png',
        alt: 'before-table',
        title: ''
      });
    });
    expect(insertedBeforeTable).toBe(true);
    expect(tableCase.view.state.selection).toBeInstanceOf(NodeSelection);
    expect((tableCase.view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/before-table.png');
  });

  it('在引用块末尾且后方仍有正文块时插入图片不会向后续正文误插空段落', async () => {
    const { view } = await mountRuntime('> 引用文字\n\n正文段落');

    // 引用块内部段落末尾位置。
    const quoteParagraphEndPos = view.state.doc.firstChild!.firstChild!.content.size + 2;
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, quoteParagraphEndPos)));
    });

    const beforeDocChildCount = view.state.doc.childCount;
    let inserted = false;
    await act(async () => {
      inserted = insertImageNode(view, {
        src: 'https://example.com/in-quote.png',
        alt: 'in-quote',
        title: ''
      });
    });

    expect(inserted).toBe(true);
    expect(view.state.doc.childCount).toBe(beforeDocChildCount);
    expect(view.state.doc.firstChild?.lastChild?.type.name).toBe('image');
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/in-quote.png');
  });

  it('文档已存在其他图片时，插入新图片仍能准确选中新图片节点', async () => {
    const { view } = await mountRuntime('![existing](https://example.com/old.png)\n\n正文');

    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    });

    let inserted = false;
    await act(async () => {
      inserted = insertImageNode(view, {
        src: 'https://example.com/new.png',
        alt: 'new',
        title: ''
      });
    });

    expect(inserted).toBe(true);
    expect(countNodesByType(view.state.doc, 'image')).toBe(2);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/new.png');
  });
});
