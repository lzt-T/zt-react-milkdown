import { useEffect, useRef } from 'react';
import { subscribeGlobalScroll } from '../../lib/global-scroll-listener';

/**
 * 在启用时订阅全局滚动并触发关闭回调。
 */
export const useCloseOnGlobalScroll = (
  enabled: boolean,
  onClose: () => void,
  shouldIgnoreScroll?: (event: Event) => boolean
): void => {
  // 保存最新关闭回调，避免回调变化导致重复订阅。
  const onCloseRef = useRef(onClose);
  // 保存最新滚动忽略规则，避免规则变化导致重复订阅。
  const shouldIgnoreScrollRef = useRef(shouldIgnoreScroll);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    shouldIgnoreScrollRef.current = shouldIgnoreScroll;
  }, [shouldIgnoreScroll]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    /**
     * 执行最新关闭回调。
     */
    const handleClose = (event: Event): void => {
      if (shouldIgnoreScrollRef.current?.(event)) {
        return;
      }

      onCloseRef.current();
    };

    return subscribeGlobalScroll(handleClose);
  }, [enabled]);
};
