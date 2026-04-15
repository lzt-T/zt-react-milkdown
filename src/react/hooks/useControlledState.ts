import { useCallback, useMemo, useState } from 'react';
import { normalizeMarkdown } from '../../utils/markdown';

/**
 * 管理编辑器受控与非受控双模式状态。
 */
export const useControlledState = (
  value: string | undefined,
  defaultValue: string | undefined,
  onChange: ((markdown: string) => void) | undefined
): {
  markdown: string;
  setMarkdown: (markdown: string) => void;
  isControlled: boolean;
} => {
  /** 是否处于受控模式。 */
  const isControlled = typeof value === 'string';
  /** 非受控初始化值。 */
  const initialValue = normalizeMarkdown(defaultValue);
  /** 非受控内部状态。 */
  const [innerValue, setInnerValue] = useState<string>(initialValue);

  /** 当前对外使用的 markdown 值。 */
  const markdown = useMemo(() => {
    return isControlled ? normalizeMarkdown(value) : innerValue;
  }, [innerValue, isControlled, value]);

  /**
   * 统一设置 markdown，并在需要时触发回调。
   */
  const setMarkdown = useCallback(
    (nextMarkdown: string): void => {
      if (!isControlled) {
        setInnerValue(nextMarkdown);
      }

      onChange?.(nextMarkdown);
    },
    [isControlled, onChange]
  );

  return {
    markdown,
    setMarkdown,
    isControlled
  };
};
