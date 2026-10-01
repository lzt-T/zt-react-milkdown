import { describe, expect, it, vi } from 'vitest';
import { resolveEditorMessages } from '@/local/i18n';
import { observeEditorMessages, updateEditorMessages } from '@/local/message-updates';

describe('实例文案同步', () => {
  it('更新、移除覆盖并隔离其他实例及共享语言包', () => {
    // 带有覆盖的实例文案。
    const first = resolveEditorMessages('zh-CN', { imageDeleteAriaLabel: '自定义删除' });
    // 独立英文实例。
    const second = resolveEditorMessages('en-US');
    // 刷新观察者。
    const refresh = vi.fn();
    // 观察解除函数。
    const stop = observeEditorMessages(first, refresh);
    updateEditorMessages(first, resolveEditorMessages('en-US'));
    expect(first.imageDeleteAriaLabel).toBe(second.imageDeleteAriaLabel);
    expect(refresh).toHaveBeenCalledTimes(1);
    updateEditorMessages(first, resolveEditorMessages('en-US'));
    expect(refresh).toHaveBeenCalledTimes(1);
    updateEditorMessages(first, resolveEditorMessages('en-US', { imageDeleteAriaLabel: 'Remove photo' }));
    expect(first.imageDeleteAriaLabel).toBe('Remove photo');
    expect(second.imageDeleteAriaLabel).toBe(resolveEditorMessages('en-US').imageDeleteAriaLabel);
    expect(resolveEditorMessages('zh-CN').imageDeleteAriaLabel).not.toBe('自定义删除');
    stop();
    updateEditorMessages(first, resolveEditorMessages('zh-CN'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('显式 placeholder 优先，移除覆盖后恢复默认值', () => {
    // 完整解析后的文案。
    const messages = resolveEditorMessages('en-US', { placeholder: 'Custom' }, 'Explicit');
    expect(messages.placeholder).toBe('Explicit');
    updateEditorMessages(messages, resolveEditorMessages('en-US', { placeholder: 'Custom' }));
    expect(messages.placeholder).toBe('Custom');
    updateEditorMessages(messages, resolveEditorMessages('en-US'));
    expect(messages.placeholder).toBe(resolveEditorMessages('en-US').placeholder);
  });
});
