import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilkdownEditor } from '../../src/react/components/MilkdownEditor';

const focusEditorMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/react/hooks/useMilkdownEditor', () => {
  return {
    // 模拟编辑器生命周期 Hook，并将 focusEditorRef 绑定到可断言的 mock。
    useMilkdownEditor: (options?: {
      focusEditorRef?: { current: ((coords?: { left: number; top: number }) => void) | null };
    }) => {
      if (options?.focusEditorRef) {
        options.focusEditorRef.current = focusEditorMock;
      }
      return undefined;
    }
  };
});

/** 为编辑器容器与模拟 .ProseMirror 节点挂载可测的几何矩形。 */
function setupEditorGeometry(container: HTMLElement): HTMLElement {
  const editorEl = container.querySelector('.zt-md-editor') as HTMLElement;
  const proseMirror = document.createElement('div');
  proseMirror.className = 'ProseMirror';
  editorEl.appendChild(proseMirror);

  Object.defineProperty(editorEl, 'clientWidth', { value: 1192, configurable: true });
  Object.defineProperty(editorEl, 'clientLeft', { value: 0, configurable: true });
  vi.spyOn(editorEl, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: 1200,
    top: 0,
    bottom: 800,
    width: 1200,
    height: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  vi.spyOn(proseMirror, 'getBoundingClientRect').mockReturnValue({
    left: 150,
    right: 1050,
    top: 0,
    bottom: 500,
    width: 900,
    height: 500,
    x: 150,
    y: 0,
    toJSON: () => ({})
  });

  return editorEl;
}

describe('MilkdownEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应用暗色主题类名', () => {
    // 渲染结果。
    const { container } = render(<MilkdownEditor theme="dark" defaultValue="" />);
    // 根节点元素。
    const root = container.firstElementChild;

    expect(root).toHaveClass('zt-md');
    expect(root).toHaveClass('zt-md-dark');
  });

  it('在空内容时展示占位符', () => {
    render(<MilkdownEditor defaultValue="" placeholder="请输入内容" />);
    // 占位符元素。
    const placeholder = screen.getByText('请输入内容');

    expect(placeholder).toBeInTheDocument();
  });

  it('点击版心左右外侧留白时不阻止失焦也不触发聚焦跳底', () => {
    const { container } = render(<MilkdownEditor defaultValue="" />);
    const editorEl = setupEditorGeometry(container);

    const rightMarginEvent = createEvent.mouseDown(editorEl, { clientX: 1120, clientY: 200 });
    fireEvent(editorEl, rightMarginEvent);
    expect(rightMarginEvent.defaultPrevented).toBe(false);

    const leftMarginEvent = createEvent.mouseDown(editorEl, { clientX: 50, clientY: 200 });
    fireEvent(editorEl, leftMarginEvent);
    expect(leftMarginEvent.defaultPrevented).toBe(false);

    expect(focusEditorMock).not.toHaveBeenCalled();
  });

  it('点击垂直滚动条区域时不拦截鼠标事件', () => {
    const { container } = render(<MilkdownEditor defaultValue="" />);
    const editorEl = setupEditorGeometry(container);

    const scrollbarEvent = createEvent.mouseDown(editorEl, { clientX: 1196, clientY: 200 });
    fireEvent(editorEl, scrollbarEvent);

    expect(scrollbarEvent.defaultPrevented).toBe(false);
    expect(focusEditorMock).not.toHaveBeenCalled();
  });

  it('点击正文水平范围内的下方空白时仍触发聚焦', () => {
    const { container } = render(<MilkdownEditor defaultValue="" />);
    const editorEl = setupEditorGeometry(container);

    const belowContentEvent = createEvent.mouseDown(editorEl, { clientX: 500, clientY: 600 });
    fireEvent(editorEl, belowContentEvent);

    expect(belowContentEvent.defaultPrevented).toBe(true);
    expect(focusEditorMock).toHaveBeenCalledWith({ left: 500, top: 600 });
  });
});
