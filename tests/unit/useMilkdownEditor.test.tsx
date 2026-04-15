import { render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMilkdownEditor } from '../../src/react/hooks/useMilkdownEditor';
import { createEditor } from '../../src/core/createEditor';

vi.mock('../../src/core/createEditor', () => {
  return {
    createEditor: vi.fn()
  };
});

/**
 * 构造可复用的编辑器控制器桩对象。
 */
const createControllerStub = () => {
  return {
    destroy: vi.fn(async () => undefined),
    setMarkdown: vi.fn(async () => undefined),
    setEditable: vi.fn(async () => undefined)
  };
};

/**
 * 创建用于验证初始化流程的测试组件。
 */
const HookHost = (props: {
  markdown: string;
  editable?: boolean;
  onMarkdownChange?: (markdown: string) => void;
  onInitError?: (error: unknown) => void;
  onInitReady?: () => void;
}): JSX.Element => {
  // 编辑器容器节点状态。
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useMilkdownEditor({
    container,
    markdown: props.markdown,
    editable: props.editable ?? true,
    onMarkdownChange: props.onMarkdownChange ?? (() => undefined),
    onInitError: props.onInitError,
    onInitReady: props.onInitReady
  });

  return <div ref={setContainer} data-testid="editor-root" />;
};

describe('useMilkdownEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在容器节点就绪后触发编辑器初始化', async () => {
    // 控制器桩对象。
    const controllerStub = createControllerStub();
    vi.mocked(createEditor).mockResolvedValue(controllerStub);

    render(<HookHost markdown="# hello" />);

    await waitFor(() => {
      expect(createEditor).toHaveBeenCalledTimes(1);
    });
  });

  it('初始化失败时触发错误回调', async () => {
    // 初始化失败错误。
    const initError = new Error('init failed');
    // 失败回调桩函数。
    const onInitError = vi.fn();
    vi.mocked(createEditor).mockRejectedValue(initError);

    render(<HookHost markdown="# hello" onInitError={onInitError} />);

    await waitFor(() => {
      expect(onInitError).toHaveBeenCalledWith(initError);
    });
  });

  it('父组件重渲染且回调引用变化时不重复初始化，并使用最新回调', async () => {
    // 第一次内容变更回调。
    const onMarkdownChangeA = vi.fn();
    // 第二次内容变更回调。
    const onMarkdownChangeB = vi.fn();
    // 初始化成功回调 A。
    const onInitReadyA = vi.fn();
    // 初始化成功回调 B。
    const onInitReadyB = vi.fn();
    // 控制器桩对象。
    const controllerStub = createControllerStub();
    vi.mocked(createEditor).mockResolvedValue(controllerStub);

    const { rerender } = render(
      <HookHost
        markdown="# hello"
        onMarkdownChange={onMarkdownChangeA}
        onInitReady={onInitReadyA}
      />
    );

    await waitFor(() => {
      expect(createEditor).toHaveBeenCalledTimes(1);
    });

    rerender(
      <HookHost
        markdown="# hello"
        onMarkdownChange={onMarkdownChangeB}
        onInitReady={onInitReadyB}
      />
    );

    await waitFor(() => {
      expect(createEditor).toHaveBeenCalledTimes(1);
    });

    // 首次创建参数。
    const firstCreateOptions = vi.mocked(createEditor).mock.calls[0]?.[0];
    firstCreateOptions?.onChange('# from-editor');

    expect(onMarkdownChangeA).not.toHaveBeenCalled();
    expect(onMarkdownChangeB).toHaveBeenCalledWith('# from-editor');
  });

  it('仅 markdown 变化时同步内容且不重建编辑器', async () => {
    // 控制器桩对象。
    const controllerStub = createControllerStub();
    vi.mocked(createEditor).mockResolvedValue(controllerStub);

    const { rerender } = render(<HookHost markdown="# before" />);

    await waitFor(() => {
      expect(createEditor).toHaveBeenCalledTimes(1);
    });

    rerender(<HookHost markdown="# after" />);

    await waitFor(() => {
      expect(controllerStub.setMarkdown).toHaveBeenCalledWith('# after');
    });
    expect(createEditor).toHaveBeenCalledTimes(1);
  });

  it('editable 变化时销毁旧实例并重建新实例', async () => {
    // 第一版控制器桩对象。
    const firstControllerStub = createControllerStub();
    // 第二版控制器桩对象。
    const secondControllerStub = createControllerStub();
    vi.mocked(createEditor)
      .mockResolvedValueOnce(firstControllerStub)
      .mockResolvedValueOnce(secondControllerStub);

    const { rerender } = render(<HookHost markdown="# hello" editable />);

    await waitFor(() => {
      expect(createEditor).toHaveBeenCalledTimes(1);
    });

    rerender(<HookHost markdown="# hello" editable={false} />);

    await waitFor(() => {
      expect(createEditor).toHaveBeenCalledTimes(2);
    });
    expect(firstControllerStub.destroy).toHaveBeenCalledTimes(1);
  });
});
