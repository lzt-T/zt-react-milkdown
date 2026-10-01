import type { EditorI18nMessages } from '@/types/editor';

// 每份实例文案直接持有其视图刷新观察者，弱引用避免延长实例生命周期。
const messageObservers = new WeakMap<EditorI18nMessages, Set<() => void>>();

/** 注册文案刷新，并返回供视图销毁时调用的解除函数。 */
export const observeEditorMessages = (messages: EditorI18nMessages, refresh: () => void): (() => void) => {
  // 当前实例的刷新集合。
  const observers = messageObservers.get(messages) ?? new Set<() => void>();
  messageObservers.set(messages, observers);
  observers.add(refresh);
  return () => {
    observers.delete(refresh);
  };
};

/** 原位更新完整文案，并仅在字段变化时通知现有视图。 */
export const updateEditorMessages = (messages: EditorI18nMessages, next: EditorI18nMessages): void => {
  // 完整语言包的字段列表。
  const keys = Object.keys(next) as Array<keyof EditorI18nMessages>;
  if (keys.every((key) => messages[key] === next[key])) return;
  Object.assign(messages, next);
  messageObservers.get(messages)?.forEach((refresh) => refresh());
};
