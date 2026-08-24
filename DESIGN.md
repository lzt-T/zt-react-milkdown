---
name: zt-react-milkdown
description: 一套以灰蓝精密工作台为核心、克制清晰且明暗主题完整的 React Markdown 编辑器设计系统。
colors:
  light-bg: "#F6F8FC"
  light-surface: "#FFFFFF"
  light-elevated: "#F2F5FB"
  light-fg: "#162336"
  light-muted: "#5E7087"
  light-border: "#D4DDE9"
  light-primary: "#3548d4"
  light-primary-fg: "#ffffff"
  light-secondary: "#5a65bc"
  light-destructive: "#b4232d"
  light-destructive-fg: "#ffffff"
  dark-bg: "#0C1220"
  dark-surface: "#131D31"
  dark-elevated: "#1A2740"
  dark-fg: "#E8EFFF"
  dark-muted: "#93A7C3"
  dark-border: "#2F4366"
  dark-primary: "#8c9bff"
  dark-primary-fg: "#111116"
  dark-secondary: "#aab2ff"
  dark-destructive: "#ff7b82"
  dark-destructive-fg: "#1f0b0d"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif"
    fontSize: "2em"
    fontWeight: 700
    lineHeight: 1.28
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif"
    fontSize: "1.25em"
    fontWeight: 700
    lineHeight: 1.28
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1
rounded:
  sm: "6px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  segmented-button:
    backgroundColor: "{colors.light-elevated}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  segmented-button-active:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  editor-container:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.lg}"
  overlay-menu:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
  input:
    backgroundColor: "{colors.light-bg}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.sm}"
    height: "28px"
    padding: "0 10px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.light-muted}"
    rounded: "{rounded.sm}"
    size: "28px"
---

## Overview

**Creative North Star：灰蓝精密工作台 / The Slate-Blue Precision Workbench。**

界面像一张经过校准的专业写作工作台：冷静的灰蓝中性色负责承载内容，群青是唯一的常规交互色。视觉表达安静、准确、克制，让编辑行为和文档结构始终先于装饰；Light 是默认体验，Dark 必须保持同等的信息层级、可读性与完成度。

## Colors

- 背景采用三级冷灰蓝层次：页面背景 `bg`、工作表面 `surface`、轻度抬升区域 `elevated`。层次主要依赖色调差与边框，不依赖大面积阴影。
- 前景使用 `fg`，次级说明使用 `muted`，结构分隔使用 `border`。不要用降低整体透明度代替明确的语义色。
- 群青 `primary` 是链接、选中、聚焦、勾选和主要操作的唯一常规交互色；`secondary` 只作为群青体系的弱化补充，不另起一套强调色。
- `destructive` 仅用于删除、失败和不可逆风险。不要把错误红用于普通提醒，也不要用群青表达破坏性动作。
- 明暗主题成对维护。新增语义颜色时必须同时定义 Light 与 Dark，并检查对比度和状态区分。

## Typography

- 全界面使用系统 Sans：`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', sans-serif`。不引入展示字体，不以字形噱头争夺编辑内容的注意力。
- 正文为 `15.5px / 1.75`，保证长时间写作的稳定节奏；H1–H6 依次使用 `2em`、`1.75em`、`1.5em`、`1.25em`、`1.125em`、`1em`，并通过 600–700 字重和 `1.28` 行高建立清晰层级。控件标签以 13–14px 为主，短而直接。
- 代码、公式源码等技术内容可使用现有等宽字体语义，但导航、按钮、输入和编辑正文仍以系统 Sans 为准。
- 中英文混排必须保持紧凑但不拥挤；不要用全大写、夸张字距或超大标题制造“品牌感”。

## Layout

- Playground 是最大宽度 `1040px` 的单层工作台；编辑器容器是视觉主工作区，外围控件服务于编辑器，不与内容争夺层级。不要在工作台内继续堆叠装饰卡片。
- 间距遵循 4 / 8 / 12 / 16px 的紧凑节奏。菜单项、工具栏和输入行优先使用 8px 左右的内部间距，组间通过 12–16px 拉开。
- 浮层菜单就近依附触发器，并遵循项目既有 Portal 与滚动裁剪边界；内容附属浮层不得逃离编辑区视口。
- 移动端压缩外部留白和横向装饰，但不压缩可操作性：主要菜单项与触控目标最小高度为 44px。窄屏优先换行、滚动或分组，不缩小到难以点击。

## Elevation & Depth

- 默认界面保持平面。页面、编辑器和分段控制依赖灰蓝色调层级与 1px 边框建立结构，不给普通容器添加阴影。
- 阴影只属于需要脱离文档平面的中性浮层与 Dialog，例如选区工具栏、Slash 菜单和表格操作菜单。使用短距离、低扩散的黑色混合阴影，如 `0 10px 24px -14px color-mix(in srgb, black 32%, transparent)` 或 `0 12px 28px -16px color-mix(in srgb, black 28%, transparent)`。
- 浮层背景始终使用主题表面色，阴影不染群青。群青通过状态底色、文字或聚焦环表达交互，不承担“发光”效果。

## Shapes

- 常规控件统一使用 6px 圆角：分段按钮、输入框、图标按钮、菜单项与小型编辑控件都应保持精确、紧凑。
- 编辑器外壳、Dialog、组合浮层和较大容器使用 10px 圆角。
- 不新增胶囊形、夸张圆角或任意半径。圆形仅适用于语义天然要求圆形的控件，不作为通用装饰。
- 边框默认 1px；选中与聚焦优先改变边框、前景和低浓度群青底色，不通过扩大尺寸造成布局跳动。

## Components

- **分段按钮**：作为固定选项切换，容器使用中性层，激活项用群青明确标识；未选项保持中性，hover 只做轻微群青混合。移动端每个选项保证 44px 触控高度。
- **编辑器容器**：Light 使用白色工作表面，Dark 使用深灰蓝表面；10px 圆角、细边框、默认无阴影。内容区是最高视觉优先级。
- **浮层菜单**：10px 圆角、8px 内边距、细边框和中性浮层阴影。条目采用 6px 圆角；hover、selected 和 focus 使用低浓度群青背景并保持文字清晰。
- **输入框**：6px 圆角、中性背景和明确边框。focus 使用群青边框及克制的 2px 聚焦环；placeholder 使用 `muted`，不能代替可见标签。
- **图标按钮**：桌面紧凑尺寸可为 28px；移动端可点击区域扩展到至少 44px。默认透明底和次级前景，hover/active 才进入低浓度群青状态；危险动作改用 `destructive`。
- 所有组件文案必须满足国际化，不依赖固定文本宽度；纯图标按钮必须有可访问名称。

## Do's and Don'ts

- **Do** 让灰蓝中性层级承载大部分界面，只在真实交互状态使用群青。
- **Do** 同步验证 Light、Dark、桌面与移动端；两种主题都应像最终产品，而不是主主题的降级版本。
- **Do** 保持默认平面，仅为真正悬浮的菜单、Popover 和工具栏提供中性阴影。
- **Do** 为 `prefers-reduced-motion: reduce` 移除非必要位移、缩放和过渡，保留即时状态反馈。
- **Don't** 引入橙色、新的品牌色、渐变、彩色阴影、玻璃拟态或装饰性发光。
- **Don't** 把 6px 与 10px 之外的圆角扩展成新的视觉语言，也不要把普通控件做成胶囊。
- **Don't** 使用胶囊按钮、卡片嵌套，或在移动端缩小触控目标来维持桌面密度。
- **Don't** 让动效延迟编辑操作；现有 120–180ms 过渡只用于解释状态变化，并必须尊重 reduced motion。
