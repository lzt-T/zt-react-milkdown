# AGENTS.md

## 1. 放置规则

- 新文件优先放入现有职责最匹配目录，不新增目录层级除非确有必要。
- 不将示例代码、测试辅助逻辑放入 `src` 生产目录。
- 不因“顺手优化”移动无关文件；目录调整需有明确需求驱动。

## 2. 样式组织规则（CSS）

- 模块新增样式必须放在模块独立 css 文件中，按职责就近放置（例如 `src/styles/modules/*.css`）。
- `src/styles/style.css` 仅用于全局基础样式与模块样式导入，不直接编写模块细节样式。
- 修改某个模块样式时，优先修改对应模块 css，避免在全局样式文件产生无关改动。

## 3. 目录结构（当前真实结构）

```text
src/                        # 生产源码主目录
├─ components/              # 全局共享组件
│  └─ ui/
├─ core/                    # 核心能力
├─ lib/                     # 库级封装与适配
├─ local/                   # 国际化文案与解析逻辑
├─ plugins/                 # 插件扩展能力
│  └─ custom/
├─ react/                   # React 相关实现
│  ├─ components/
│  ├─ context/
│  └─ hooks/
├─ styles/                  # 样式与样式模块
│  └─ modules/
├─ theme/                   # 主题相关能力
├─ types/                   # 类型定义
└─ utils/                   # 通用工具函数

examples/                   # 示例与调试入口
└─ react-playground/
```

## 4. 主题色说明与规范

- 主题色单一来源：
  - 基础 token 统一定义在 `src/theme/tokens.css`，使用 `--zt-*` 命名（例如 `--zt-bg`、`--zt-fg`、`--zt-primary`）。
  - 明暗主题值由 `.zt-md-light` 与 `.zt-md-dark` 提供，禁止在其他位置重复定义同语义主色。

- 主题装配关系：
  - `src/styles/style.css` 负责将 `--zt-*` 映射到语义变量（如 `--primary`、`--border`）并供组件层消费。
  - 业务/模块样式优先使用 `var(--zt-*)` 或已映射语义变量，禁止新增硬编码色值（如 `#xxx`）绕过主题变量。

- 修改规范：
  - 调整品牌色或主题色时，优先修改 `src/theme/tokens.css`，避免在组件样式中散点改色。
  - 新增颜色时先补 token，再在 `src/styles/style.css` 完成语义映射后再使用。
  - light/dark 主题需成对维护，避免只改单侧主题导致视觉不一致。

- 范围约束：
  - `src/styles/generated.css` 是构建产物，不作为主题修改入口。
  - 本规范约束生产代码主题体系，不扩展到测试或示例中的临时视觉代码。

## 5. Portal 与滚动裁剪

- 编辑器内部使用两层 Portal：
  - `.zt-md-portal` 位于 `.zt-md-body` 内，用于 Dialog/Modal、Slash 命令菜单等编辑器级浮层，不受编辑区滚动裁剪。
  - `.zt-md-content-portal` 位于 `.zt-md-editor` 内，用于选区工具栏子菜单、代码块语言选择器、表格操作等内容附属浮层，必须受编辑区滚动视口裁剪。
- 所有编辑器浮层必须挂在 `.zt-md` 内部，不要挂到 `document.body`。
- Radix Popover 类内容附属浮层应以 `.zt-md-editor` 作为 `collisionBoundary`，并在触发器脱离边界时隐藏。
- 调整 Portal 策略时，需要同步更新 README 的样式/主题说明。

## 6. 国际化

- 需要满足国际化
