import { editorViewCtx } from '@milkdown/core';
import { GapCursor } from '@milkdown/prose/gapcursor';
import { NodeSelection, TextSelection } from '@milkdown/prose/state';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';

// 测试中创建的编辑器运行时，统一在用例结束后销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试挂载的宿主 DOM 节点。
const hosts: HTMLElement[] = [];

/**
 * 创建带真实图片删除选中插件的编辑器运行时。
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
const countNodesByType = (
  doc: { descendants: (fn: (node: { type: { name: string } }) => void) => void },
  typeName: string
): number => {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === typeName) {
      count += 1;
    }
  });
  return count;
};

/**
 * 查找首个指定类型节点的起始、内部末尾与外部结束位置。
 */
const findFirstNodeRange = (
  doc: { descendants: (fn: (node: { type: { name: string }; nodeSize: number }, pos: number) => boolean | void) => void },
  typeName: string
): { start: number; innerEnd: number; after: number } => {
  let start = -1;
  let innerEnd = -1;
  let after = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && start === -1) {
      start = pos;
      innerEnd = pos + node.nodeSize - 1;
      after = pos + node.nodeSize;
      return false;
    }
    return true;
  });

  if (start === -1) {
    throw new Error(`未找到节点类型: ${typeName}`);
  }

  return { start, innerEnd, after };
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

describe('imageDeleteSelectionPlugin 图片两段式退格选中与删除', () => {
  it('有序列表末尾含图片且列表外紧跟空段落时，第一次 Backspace 删空段落并仅选中图片，第二次仅删图片', async () => {
    const { view } = await mountRuntime('1. dasdsadadsa\n\nasudsadgasyudsad');
    // 首个列表项内部末尾位置，用于在列表项末尾插入图片。
    const { innerEnd: listItemInnerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/list-tail.png',
        alt: 'list-tail',
        title: ''
      });
      const tr = view.state.tr.insert(listItemInnerEnd, imageNode);
      const listAfterPos = tr.doc.firstChild!.nodeSize;
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      tr.insert(listAfterPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, listAfterPos + 1));
      view.dispatch(tr);
    });

    // 退格前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount - 1);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image');
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/list-tail.png');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(countNodesByType(view.state.doc, 'image')).toBe(0);
    expect(countNodesByType(view.state.doc, 'ordered_list')).toBe(1);
    expect(view.state.doc.textContent).toContain('dasdsadadsa');
    expect(view.state.doc.textContent).toContain('asudsadgasyudsad');
  });

  it('无序列表末尾含图片且列表外紧跟非空段落时，在行首按 Backspace 不删段落内容且仅选中图片', async () => {
    const { view } = await mountRuntime('- 列表文字\n\n后续正文');
    // 首个列表项内部末尾位置。
    const { innerEnd: listItemInnerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/bullet-tail.png',
        alt: 'bullet-tail',
        title: ''
      });
      const tr = view.state.tr.insert(listItemInnerEnd, imageNode);
      const listAfterPos = tr.doc.firstChild!.nodeSize;
      tr.setSelection(TextSelection.create(tr.doc, listAfterPos + 1));
      view.dispatch(tr);
    });

    // 退格前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image');
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/bullet-tail.png');
    expect(view.state.doc.lastChild?.textContent).toBe('后续正文');
  });

  it('引用块末尾含图片且引用块外紧跟空段落时，按 Backspace 删空段落并仅选中引用块末尾图片', async () => {
    const { view } = await mountRuntime('> 引用文字');
    // 首个引用块内部末尾位置。
    const { innerEnd: blockquoteInnerEnd } = findFirstNodeRange(view.state.doc, 'blockquote');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/quote-tail.png',
        alt: 'quote-tail',
        title: ''
      });
      const tr = view.state.tr.insert(blockquoteInnerEnd, imageNode);
      const blockquoteAfterPos = tr.doc.firstChild!.nodeSize;
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      tr.insert(blockquoteAfterPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, blockquoteAfterPos + 1));
      view.dispatch(tr);
    });

    // 退格前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount - 1);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image');
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/quote-tail.png');
  });

  it('GapCursor 位于末尾含图片的有序列表后方时，按 Backspace 仅选中列表末尾图片', async () => {
    const { view } = await mountRuntime('1. 列表项');
    // 首个列表项内部末尾位置。
    const { innerEnd: listItemInnerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/gap-list.png',
        alt: 'gap-list',
        title: ''
      });
      const tr = view.state.tr.insert(listItemInnerEnd, imageNode);
      const listAfterPos = tr.doc.firstChild!.nodeSize;
      tr.setSelection(new GapCursor(tr.doc.resolve(listAfterPos)));
      view.dispatch(tr);
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image');
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/gap-list.png');
  });

  it('顶层图片紧跟空段落时，按 Backspace 删除空段落并选中该图片', async () => {
    const { view } = await mountRuntime('![top](https://example.com/top.png)');

    await act(async () => {
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      const insertPos = view.state.doc.content.size;
      const tr = view.state.tr.insert(insertPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
      view.dispatch(tr);
    });

    // 退格前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount - 1);
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image');
    expect((view.state.selection as NodeSelection).node.attrs.src).toBe('https://example.com/top.png');
  });

  it('有序列表末尾是普通文本段落时，后方空段落按 Backspace 不触发 NodeSelection', async () => {
    const { view } = await mountRuntime('1. 普通列表项');

    await act(async () => {
      const emptyParagraph = view.state.schema.nodes.paragraph.create();
      const insertPos = view.state.doc.content.size;
      const tr = view.state.tr.insert(insertPos, emptyParagraph);
      tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
      view.dispatch(tr);
    });

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'Backspace' });
    });

    expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
  });
});
