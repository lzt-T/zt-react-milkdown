import { editorViewCtx } from '@milkdown/core';
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
 * 创建带真实边界导航与图片插件的编辑器运行时。
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
 * 查找首个指定类型节点的起始与内部末尾位置。
 */
const findFirstNodeRange = (
  doc: { descendants: (fn: (node: { type: { name: string }; nodeSize: number }, pos: number) => boolean | void) => void },
  typeName: string
): { start: number; innerEnd: number } => {
  let start = -1;
  let innerEnd = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === typeName && start === -1) {
      start = pos;
      innerEnd = pos + node.nodeSize - 1;
      return false;
    }
    return true;
  });

  if (start === -1) {
    throw new Error(`未找到节点类型: ${typeName}`);
  }

  return { start, innerEnd };
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

describe('blockBoundaryNavigationPlugin 嵌套块边界导航', () => {
  it('列表项末尾图片被选中且列表外存在后续段落时，按 ArrowDown 不插空段并跳到后续段落开头', async () => {
    const { view } = await mountRuntime('- 一套微服务系统由哪些零件组成\n\n**gRPC**');
    // 首个列表项内部末尾位置。
    const { innerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/in-list.png',
        alt: 'in-list',
        title: ''
      });
      const tr = view.state.tr.insert(innerEnd, imageNode);
      tr.setSelection(NodeSelection.create(tr.doc, innerEnd));
      view.dispatch(tr);
    });

    // 按键前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('gRPC');
    expect(view.state.selection.$from.parentOffset).toBe(0);
  });

  it('列表项末尾图片被选中且后方存在下一列表项时，按 ArrowDown 不插空段并跳到下一列表项开头', async () => {
    const { view } = await mountRuntime('- 第一项\n- 第二项');
    // 首个列表项内部末尾位置。
    const { innerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/list-next.png',
        alt: 'list-next',
        title: ''
      });
      const tr = view.state.tr.insert(innerEnd, imageNode);
      tr.setSelection(NodeSelection.create(tr.doc, innerEnd));
      view.dispatch(tr);
    });

    // 按键前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('第二项');
    expect(view.state.selection.$from.parentOffset).toBe(0);
  });

  it('列表项末尾图片被选中且位于文档末尾时，按 ArrowDown 在列表项内插入空段落并聚焦', async () => {
    const { view } = await mountRuntime('- 唯一列表项');
    // 首个列表项内部末尾位置。
    const { innerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/list-end.png',
        alt: 'list-end',
        title: ''
      });
      const tr = view.state.tr.insert(innerEnd, imageNode);
      tr.setSelection(NodeSelection.create(tr.doc, innerEnd));
      view.dispatch(tr);
    });

    // 按键前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount + 1);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(view.state.selection.$from.parent.textContent).toBe('');
  });

  it('引用块首部图片被选中且引用块上方存在前置段落时，按 ArrowUp 不插空段并跳到前置段落末尾', async () => {
    const { view } = await mountRuntime('前置段落\n\n> 引用文字');
    // 引用块起始位置。
    const { start: blockquoteStart } = findFirstNodeRange(view.state.doc, 'blockquote');
    // 引用块首部图片插入位置。
    const insertPosition = blockquoteStart + 1;

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/in-quote.png',
        alt: 'in-quote',
        title: ''
      });
      const tr = view.state.tr.insert(insertPosition, imageNode);
      tr.setSelection(NodeSelection.create(tr.doc, insertPosition));
      view.dispatch(tr);
    });

    // 按键前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowUp' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('前置段落');
    expect(view.state.selection.$from.parentOffset).toBe(4);
  });

  it('列表项内图片后方已有同级段落时，按 ArrowDown 不插空段并跳到同级段落开头', async () => {
    const { view } = await mountRuntime('- 列表文字');
    // 首个列表项内部末尾位置。
    const { innerEnd } = findFirstNodeRange(view.state.doc, 'list_item');

    await act(async () => {
      const imageNode = view.state.schema.nodes.image.create({
        src: 'https://example.com/sibling-image.png',
        alt: 'sibling-image',
        title: ''
      });
      const siblingParagraph = view.state.schema.nodes.paragraph.create(
        undefined,
        view.state.schema.text('同级后续')
      );
      const tr = view.state.tr.insert(innerEnd, [imageNode, siblingParagraph]);
      tr.setSelection(NodeSelection.create(tr.doc, innerEnd));
      view.dispatch(tr);
    });

    // 按键前段落数量。
    const beforeParagraphCount = countNodesByType(view.state.doc, 'paragraph');
    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowDown' });
    });

    expect(countNodesByType(view.state.doc, 'paragraph')).toBe(beforeParagraphCount);
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.$from.parent.textContent).toBe('同级后续');
    expect(view.state.selection.$from.parentOffset).toBe(0);
  });
});
