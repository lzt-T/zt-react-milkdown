import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DependencyList } from 'react';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { useMilkdownEditor } from '@/react/hooks/useMilkdownEditor';
import { resolveEditorMessages } from '@/local/i18n';
import type { EditorLocale } from '@/types/editor';

vi.mock('@/core/createEditor', () => ({ createMilkdownEditorRuntime: vi.fn() }));
vi.mock('@milkdown/react', async () => {
  // 用真实 React effect 模拟编辑器异步创建及依赖清理。
  const { useEffect, useState } = await import('react');
  return {
    /** 按创建依赖管理实例，初始化完成后更新 loading。 */
    useEditor: (factory: (root: HTMLElement) => MilkdownEditorRuntime['editor'], dependencies: DependencyList) => {
      // 异步初始化状态。
      const [loading, setLoading] = useState(true);
      useEffect(() => {
        // 模拟 React Milkdown 挂载根。
        const editor = factory(document.createElement('div'));
        // 清理后不再写入加载状态。
        let active = true;
        void editor.create().then(() => { if (active) setLoading(false); });
        return () => { active = false; void editor.destroy(); };
      }, dependencies);
      return { loading };
    }
  };
});

/** 创建支持延迟 ready 的运行时桩。 */
const runtimeStub = (create: () => Promise<void>) => ({
  editor: { create: vi.fn(create), destroy: vi.fn(async () => undefined) },
  updateLocalization: vi.fn(), installRuntimePlugins: vi.fn(), focusEditor: vi.fn(),
  setMarkdown: vi.fn(), searchController: {}
} as unknown as MilkdownEditorRuntime);

/** 挂载 Hook，保持非国际化属性稳定。 */
const HookHost = (props: { locale: EditorLocale; portal: HTMLElement; ready: () => void; label?: string }) => {
  useMilkdownEditor({
    markdown: 'hello', locale: props.locale,
    messages: resolveEditorMessages(props.locale, props.label ? { imageDeleteAriaLabel: props.label } : undefined),
    portalContainer: props.portal, contentPortalContainer: props.portal,
    readOnly: false, shortcutMode: 'modShift', debounceMs: 160,
    onMarkdownChange: () => undefined, onInitReady: props.ready
  });
  return null;
};

beforeEach(() => { vi.clearAllMocks(); });

describe('Hook 国际化同步', () => {
  it('切换语言和同语言文案只同步原实例，不重建或重复 ready', async () => {
    // 就绪运行时。
    const runtime = runtimeStub(async () => undefined);
    vi.mocked(createMilkdownEditorRuntime).mockReturnValue(runtime);
    // 稳定的 Portal。
    const portal = document.createElement('div');
    // 初始化回调。
    const ready = vi.fn();
    // Hook 挂载结果。
    const mounted = render(<HookHost locale="zh-CN" portal={portal} ready={ready} />);
    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    mounted.rerender(<HookHost locale="en-US" portal={portal} ready={ready} />);
    expect(runtime.updateLocalization).toHaveBeenLastCalledWith('en-US', resolveEditorMessages('en-US'));
    mounted.rerender(<HookHost locale="en-US" portal={portal} ready={ready} label="Remove photo" />);
    expect(runtime.updateLocalization).toHaveBeenLastCalledWith('en-US', resolveEditorMessages('en-US', { imageDeleteAriaLabel: 'Remove photo' }));
    expect(createMilkdownEditorRuntime).toHaveBeenCalledTimes(1);
    expect(runtime.editor.destroy).not.toHaveBeenCalled();
    expect(runtime.setMarkdown).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(runtime.editor.destroy).toHaveBeenCalledTimes(1);
  });

  it('初始化期间多次变化，在 ready 后应用最新文案', async () => {
    // 初始化完成控制器。
    let finish!: () => void;
    // 延迟初始化运行时。
    const runtime = runtimeStub(() => new Promise<void>((resolve) => { finish = resolve; }));
    vi.mocked(createMilkdownEditorRuntime).mockReturnValue(runtime);
    // 稳定 Portal。
    const portal = document.createElement('div');
    // 初始化回调。
    const ready = vi.fn();
    // Hook 挂载结果。
    const mounted = render(<HookHost locale="zh-CN" portal={portal} ready={ready} />);
    mounted.rerender(<HookHost locale="en-US" portal={portal} ready={ready} label="Latest" />);
    expect(runtime.updateLocalization).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(runtime.updateLocalization).toHaveBeenLastCalledWith('en-US', resolveEditorMessages('en-US', { imageDeleteAriaLabel: 'Latest' }));
    expect(createMilkdownEditorRuntime).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });
});
