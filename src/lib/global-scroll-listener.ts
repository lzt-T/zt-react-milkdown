/**
 * 全局滚动订阅回调。
 */
export type GlobalScrollListener = (event: Event) => void;

// 当前全局滚动订阅者集合。
const globalScrollListeners = new Set<GlobalScrollListener>();
// 当前是否已经绑定 document 滚动监听。
let isGlobalScrollListening = false;

/**
 * 判断当前环境是否可以访问 document。
 */
const canUseDocument = (): boolean => {
  return typeof document !== 'undefined';
};

/**
 * 分发全局滚动事件给当前订阅者。
 */
const handleGlobalScroll = (event: Event): void => {
  // 固化本轮订阅者快照，避免回调中取消订阅影响迭代。
  const listeners = Array.from(globalScrollListeners);
  listeners.forEach((listener) => listener(event));
};

/**
 * 绑定唯一的 document 滚动监听。
 */
const bindGlobalScroll = (): void => {
  if (isGlobalScrollListening || !canUseDocument()) {
    return;
  }

  document.addEventListener('scroll', handleGlobalScroll, {
    capture: true,
    passive: true
  });
  isGlobalScrollListening = true;
};

/**
 * 解绑唯一的 document 滚动监听。
 */
const unbindGlobalScroll = (): void => {
  if (!isGlobalScrollListening || !canUseDocument()) {
    return;
  }

  document.removeEventListener('scroll', handleGlobalScroll, true);
  isGlobalScrollListening = false;
};

/**
 * 订阅全局滚动事件，并返回取消订阅函数。
 */
export const subscribeGlobalScroll = (listener: GlobalScrollListener): (() => void) => {
  if (!canUseDocument()) {
    return () => undefined;
  }

  // 当前订阅是否仍有效。
  let isSubscribed = true;
  globalScrollListeners.add(listener);
  bindGlobalScroll();

  return () => {
    if (!isSubscribed) {
      return;
    }

    isSubscribed = false;
    globalScrollListeners.delete(listener);
    if (globalScrollListeners.size === 0) {
      unbindGlobalScroll();
    }
  };
};
