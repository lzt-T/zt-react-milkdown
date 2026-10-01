## Why

当前编辑器将 `locale` 变化绑定到实例重建，切换中英文会丢失撤销历史；仅修改 `messages` 时，已初始化的插件又不会同步新文案。语言和文案更新应只影响界面，保留用户正在编辑的内容和状态。

## What Changes

- 将语言与文案更新从编辑器初始化生命周期中分离，提供实例级运行时同步路径。
- 同步内置斜杠菜单、选区工具栏、表格操作、代码块、图片、公式及相关弹层的文案。
- 支持相同语言下动态更新 `messages`，继续遵循默认语言包、外部覆盖文案及显式占位文案的优先级。
- 保留编辑器实例、文档、选区、撤销/重做历史、搜索状态和编辑区滚动位置，避免额外内容变更与初始化回调。
- 保持多个编辑器的语言和自定义文案相互隔离。

## Capabilities

### New Capabilities

- `editor-localization`: 编辑器语言与覆盖文案的运行时更新，以及切换期间的编辑状态保留和实例隔离。

### Modified Capabilities

无。既有 `editor-search` 已要求可覆盖的中英文搜索文案；本变更通过通用国际化能力约束切换时的搜索状态保留，不改变搜索功能契约。

## Impact

- 主要涉及 `src/react/hooks/useMilkdownEditor.ts`、`src/core/createEditor.ts`、`src/local/` 及持有文案的自定义插件和 NodeView。
- 保持现有 `MilkdownEditor` 的 `locale`、`messages`、`placeholder` 公共属性兼容；运行时句柄可增加文案同步方法。
- 复用现有 Milkdown、ProseMirror 和 i18next，不新增依赖，不修改构建产物。
- 补充 README 的动态语言切换说明和针对性回归验证；项目脚本与浏览器控制遵守现有限制。
