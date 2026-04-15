/**
 * 定义 Milkdown 插件的通用描述结构。
 */
export interface EditorPluginDescriptor {
  /** 插件唯一名称。 */
  name: string;
  /** 插件实例。 */
  plugin: unknown;
}
