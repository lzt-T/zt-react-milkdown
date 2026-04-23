import { beforeEach, describe, expect, it, vi } from 'vitest';
import katex from 'katex';
import { createMathBlockEditableNodeView } from '../../src/plugins/custom/math-block-editable';

vi.mock('katex', () => {
  return {
    default: {
      render: vi.fn()
    }
  };
});

/**
 * 构造 math_block 节点桩对象。
 */
const createMathNodeStub = (value: string) => {
  return {
    attrs: {
      value
    },
    type: {
      name: 'math_block'
    }
  };
};

/**
 * 构造编辑器视图桩对象。
 */
const createEditorViewStub = () => {
  // setNodeMarkup 调用桩函数。
  const setNodeMarkup = vi.fn();
  // 事务桩对象。
  const transaction = {
    docChanged: true
  } as {
    docChanged: boolean;
    setNodeMarkup: (pos: number, type: unknown, attrs: Record<string, unknown>) => unknown;
  };
  transaction.setNodeMarkup = vi.fn((pos: number, _type: unknown, attrs: Record<string, unknown>) => {
    setNodeMarkup(pos, attrs);
    return transaction;
  });

  return {
    view: {
      state: {
        tr: transaction
      },
      props: {
        editable: () => true
      },
      editable: true,
      dispatch: vi.fn()
    },
    setNodeMarkup
  };
};

describe('math-block-editable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('点击后展示源码输入区并进入编辑态', () => {
    // 节点构造器。
    const createNodeView = createMathBlockEditableNodeView();
    // 初始公式节点。
    const node = createMathNodeStub('x^2');
    // 编辑器视图桩。
    const editorViewStub = createEditorViewStub();
    // 节点视图实例。
    const nodeView = createNodeView(node as never, editorViewStub.view as never, (() => 3) as never);
    // 源码编辑容器。
    const sourceContainer = nodeView.dom.querySelector('.zt-md-math-block-source') as HTMLDivElement;

    expect(sourceContainer.hidden).toBe(true);

    nodeView.dom.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(sourceContainer.hidden).toBe(false);
    expect(nodeView.dom.classList.contains('zt-md-math-block-editing')).toBe(true);
  });

  it('输入源码时实时更新节点并触发渲染', () => {
    // 节点构造器。
    const createNodeView = createMathBlockEditableNodeView();
    // 初始公式节点。
    const node = createMathNodeStub('x');
    // 编辑器视图桩。
    const editorViewStub = createEditorViewStub();
    // 节点视图实例。
    const nodeView = createNodeView(node as never, editorViewStub.view as never, (() => 8) as never);
    // 源码输入框。
    const textarea = nodeView.dom.querySelector('.zt-md-math-block-textarea') as HTMLTextAreaElement;

    textarea.value = 'x+1';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(editorViewStub.setNodeMarkup).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        value: 'x+1'
      })
    );
    expect(editorViewStub.view.dispatch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(katex.render)).toHaveBeenCalledWith(
      'x+1',
      expect.any(HTMLElement),
      expect.objectContaining({
        displayMode: true,
        throwOnError: true
      })
    );
  });

  it('取消选中后隐藏源码输入区', () => {
    // 节点构造器。
    const createNodeView = createMathBlockEditableNodeView();
    // 初始公式节点。
    const node = createMathNodeStub('x');
    // 编辑器视图桩。
    const editorViewStub = createEditorViewStub();
    // 节点视图实例。
    const nodeView = createNodeView(node as never, editorViewStub.view as never, (() => 2) as never);
    // 源码编辑容器。
    const sourceContainer = nodeView.dom.querySelector('.zt-md-math-block-source') as HTMLDivElement;

    nodeView.selectNode?.();
    expect(sourceContainer.hidden).toBe(false);

    nodeView.deselectNode?.();
    expect(sourceContainer.hidden).toBe(true);
  });

  it('公式渲染异常时显示错误提示且不中断输入', () => {
    // katex 渲染异常。
    vi.mocked(katex.render).mockImplementation(() => {
      throw new Error('katex parse failed');
    });
    // 节点构造器。
    const createNodeView = createMathBlockEditableNodeView();
    // 初始公式节点。
    const node = createMathNodeStub('x');
    // 编辑器视图桩。
    const editorViewStub = createEditorViewStub();
    // 节点视图实例。
    const nodeView = createNodeView(node as never, editorViewStub.view as never, (() => 9) as never);
    // 源码输入框。
    const textarea = nodeView.dom.querySelector('.zt-md-math-block-textarea') as HTMLTextAreaElement;
    // 错误提示节点。
    const errorContainer = nodeView.dom.querySelector('.zt-md-math-block-error') as HTMLDivElement;

    textarea.value = '\\bad';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(errorContainer.hidden).toBe(false);
    expect(errorContainer.textContent).toContain('katex parse failed');
    expect(editorViewStub.view.dispatch).toHaveBeenCalledTimes(1);
  });
});
