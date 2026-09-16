## Why

原代码块使用自定义 Prism 高亮插件，仅加载 refractor 默认语言集，导致已有语法定义的 Dart 无法选择和高亮。官方插件迁移及 Dart 补充已完成；本次将语言范围扩展为当前安装的 refractor 版本提供的全部语法及别名，减少通用 Markdown 编辑器遇到支持缺口的情况。

## What Changes

- 使用与当前 Milkdown 对齐的 `@milkdown/plugin-prism` 替换自定义高亮插件。
- 为官方 7.21.1 补充文档变化刷新适配，解决未聚焦代码块外部修改后残留高亮的问题，继续复用官方 token 与装饰生成逻辑。
- 使用 `refractor/all` 同步加载当前版本提供的全部语法及别名；高亮器与语言选择器共享注册来源，Dart 随全量集合加载。
- 移除手工语言展示名映射，菜单和当前语言按钮直接显示规范化语言标识及别名（如 `javascript`、`dart`、`js`）；纯文本继续使用国际化文案。此调整不改变语言值、Markdown 输出或高亮逻辑。
- 保持纯文本不着色，保留未知语言标识和代码内容。
- 保留代码块编辑、复制、语言切换、HTML/SVG 预览及明暗主题，验证高亮随内容和语言变化更新。
- 删除替换后不再使用的自定义高亮实现及导出，更新 README 的语言支持说明。

## Capabilities

### New Capabilities

- `code-block-highlighting`: 全量语言及别名的搜索、选择与高亮，纯文本行为及高亮更新的一致性。

### Modified Capabilities

无。现有搜索和行内代码边界规格不变。

## Impact

- 影响编辑器插件装配、代码块语言选择器与自定义高亮模块；不新增或修改公共 React API。
- 使用 pnpm 添加 `@milkdown/plugin-prism@7.21.1` 并更新锁文件；保留 `refractor@5.0.0` 作为直接依赖。
- 全量同步加载会增加包体积与初始化开销；实施时记录获授权的构建体积对比，未获授权则明确未测量。
- 不新增依赖或公共 API，不引入异步语言加载或 CodeMirror，不改变主题 token 或 Portal 策略。
