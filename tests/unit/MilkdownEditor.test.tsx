import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MilkdownEditor } from '../../src/react/components/MilkdownEditor';

vi.mock('../../src/react/hooks/useMilkdownEditor', () => {
  return {
    // 模拟编辑器生命周期 Hook，避免依赖真实 Milkdown 运行环境。
    useMilkdownEditor: () => undefined
  };
});

describe('MilkdownEditor', () => {
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
});
