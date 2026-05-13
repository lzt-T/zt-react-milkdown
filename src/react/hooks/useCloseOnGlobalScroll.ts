import { useEffect, useRef } from 'react';
import { subscribeGlobalScroll } from '../../lib/global-scroll-listener';

/**
 * 在启用时订阅全局滚动并触发关闭回调。
 */
export const useCloseOnGlobalScroll = (enabled: boolean, onClose: () => void): void => {
  // 保存最新关闭回调，避免回调变化导致重复订阅。
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    /**
     * 执行最新关闭回调。
     */
    const handleClose = (): void => {
      onCloseRef.current();
    };

    return subscribeGlobalScroll(handleClose);
  }, [enabled]);
};
