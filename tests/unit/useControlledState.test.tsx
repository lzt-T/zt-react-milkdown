import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useControlledState } from '../../src/react/hooks/useControlledState';

describe('useControlledState', () => {
  it('在非受控模式下更新内部值并触发回调', () => {
    // 变更监听回调。
    const onChange = vi.fn();
    // Hook 渲染结果。
    const { result } = renderHook(() => useControlledState(undefined, 'init', onChange));

    expect(result.current.markdown).toBe('init');

    act(() => {
      result.current.setMarkdown('next');
    });

    expect(result.current.markdown).toBe('next');
    expect(onChange).toHaveBeenCalledWith('next');
  });

  it('在受控模式下只触发回调不维护内部状态', () => {
    // 变更监听回调。
    const onChange = vi.fn();
    // Hook 渲染结果。
    const { result, rerender } = renderHook(
      ({ value }) => useControlledState(value, undefined, onChange),
      {
        initialProps: {
          value: 'controlled'
        }
      }
    );

    act(() => {
      result.current.setMarkdown('typing');
    });

    expect(onChange).toHaveBeenCalledWith('typing');
    expect(result.current.markdown).toBe('controlled');

    rerender({ value: 'synced' });
    expect(result.current.markdown).toBe('synced');
  });
});
