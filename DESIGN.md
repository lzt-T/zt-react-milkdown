---
name: zt-react-milkdown
description: 一套以极简中性现代风为核心、低侵略高通用性的 React Markdown 编辑器设计系统。
colors:
  light-bg: "#FAFAFA"
  light-surface: "#FFFFFF"
  light-elevated: "#F4F4F5"
  light-popover: "#FFFFFF"
  light-hover: "#F4F4F5"
  light-fg: "#18181B"
  light-muted: "#63636C"
  light-border: "#E4E4E7"
  light-border-strong: "#D4D4D8"
  light-primary: "#18181B"
  light-primary-fg: "#FFFFFF"
  light-secondary: "#52525B"
  light-accent: "#2563EB"
  light-destructive: "#DC2626"
  light-destructive-fg: "#FFFFFF"
  dark-bg: "#09090B"
  dark-surface: "#111113"
  dark-elevated: "#18181B"
  dark-popover: "#1C1C20"
  dark-hover: "#27272A"
  dark-fg: "#F4F4F5"
  dark-muted: "#A1A1AA"
  dark-border: "#27272A"
  dark-border-strong: "#3F3F46"
  dark-primary: "#FAFAFA"
  dark-primary-fg: "#09090B"
  dark-secondary: "#A1A1AA"
  dark-accent: "#60A5FA"
  dark-destructive: "#F87171"
  dark-destructive-fg: "#180909"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif"
    fontSize: "1.85em"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif"
    fontSize: "1.22em"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif"
    fontSize: "13px"
    fontWeight: 500
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
    textColor: "{colors.light-muted}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
  segmented-button-active:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
  editor-container:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.lg}"
  overlay-menu:
    backgroundColor: "{colors.light-popover}"
    textColor: "{colors.light-fg}"
    rounded: "{rounded.lg}"
    padding: "6px"
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

**Creative North Star：极简中性现代风 / Minimalist Neutral Modern。**

作为面向外部项目的 npm 组件库，默认皮肤应当克制、中性、无侵入性：Light 与 Dark 统一采用纯中性 Zinc 灰阶，主按钮与任务勾选态保持高质感黑白对比，链接、文本光标、选区与聚焦环使用收敛的中性技术蓝（`--zt-accent`），代码块则提供独立的高可读语义语法色板。

## Colors

- **中性表面层级**：Light 使用 `#FAFAFA` / `#FFFFFF` / `#F4F4F5`，Dark 使用 `#09090B` / `#111113` / `#18181B`，浮层独立使用 `--zt-popover`（Dark 下为 `#1C1C20`，确保浮层与画布明显分离）。
- **中性交互态**：普通悬停、菜单选中与列表高亮统一使用 `--zt-hover` / `--zt-active`，不再将高饱和品牌色铺满普通菜单与引用块。
- **主色与强调色分工**：`--zt-primary`（墨黑/纯白）用于主提交按钮、任务勾选框等确定性动作；`--zt-accent`（克制技术蓝）仅用于链接、光标、文本选区、拖拽手柄与焦点轮廓。
- **搜索高亮与语义红**：搜索命中采用独立暖黄高亮 token（`--zt-highlight` / `--zt-highlight-active`），与文本选区清晰区分；`--zt-destructive` 仅用于删除与错误校验。
- **独立语法色板**：代码块高亮全部使用 `--zt-syntax-*` token，明暗双主题成对维护。

## Typography

- 正文为 `15px / 1.75` 系统 Sans；代码块、行内代码、快捷键标识及等宽数值使用 `--zt-font-mono`。
- H1–H6 采用紧凑优雅比例（`1.85em`、`1.45em`、`1.22em`、`1.08em`、`1em`、`0.92em`）配合轻微负字距，并通过单向 `margin-top` 流式间距（4px/rem 网格）消除 BFC 块的上下间距双倍叠加。

## Layout & Elevation

- Playground 采用 `920px` 居中单层布局，顶部控制栏与下方独立编辑器卡片层次清晰。
- 浮层（Slash 菜单、选区工具栏、语言选择器、表格菜单、搜索面板、上传弹窗）统一使用 `--zt-popover` 背景与真黑色半透明双层阴影（`--zt-shadow-md` / `--zt-shadow-lg`），修复暗色模式阴影发白问题。

## Shapes & Controls

- 常规控件统一使用 `6px` 圆角（`--zt-radius`），编辑器容器、浮层面板、代码块与弹窗使用 `10px` 圆角（`--zt-radius-lg`）。
- 移动端保持 `min-height: 44px` 触控热区，并在 `prefers-reduced-motion: reduce` 下移除过渡与位移动画。
