import type { MilkdownPlugin } from '@milkdown/ctx';
import { prosePluginsCtx } from '@milkdown/core';
import { prismPlugin } from '@milkdown/plugin-prism';
import type { Plugin } from '@milkdown/prose/state';

/**
 * 保留官方插件生命周期，仅补齐未聚焦代码块的文档变更刷新。
 */
export const codeBlockPrismPlugin: MilkdownPlugin = (ctx) => {
  // 官方插件的初始化与清理入口。
  const initialize = prismPlugin(ctx);

  /**
   * 在编辑器状态创建前适配当前实例的刷新策略。
   */
  return async () => {
    // 官方插件的清理函数。
    const cleanup = await initialize();
    // 从当前编辑器上下文取实例，避免官方共享访问器在并发初始化时指向其他编辑器。
    const plugin = ctx.get(prosePluginsCtx).find(
      (candidate) => (candidate as Plugin & { key: string }).key.startsWith('MILKDOWN_PRISM$')
    )!;
    // 官方插件固定提供高亮状态字段。
    const state = plugin.spec.state!;

    /**
     * 文档变化时调用官方高亮生成逻辑，选区变化时仅映射装饰。
     */
    state.apply = (transaction, decorations, _oldState, newState) =>
      transaction.docChanged
        ? state.init.call(plugin, {}, newState)
        : decorations.map(transaction.mapping, transaction.doc);

    return cleanup;
  };
};
