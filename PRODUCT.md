# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户是需要编写代码、公式和结构化文档的技术写作者。React 集成开发者负责把编辑器嵌入产品，并可能通过公开 CSS 变量覆盖默认主题。

## Product Purpose

ZT React Milkdown 提供可直接集成的 React Markdown 编辑器，让技术内容的输入、编辑和阅读保持清晰、可靠且一致。

## Positioning

产品以代码、公式、图片、表格和结构化 Markdown 的完整编辑体验区别于通用富文本输入框，并通过明暗主题和国际化适配宿主产品。

## Operating Context

编辑器用于技术文档、知识库、笔记和包含公式或代码的长内容。用户会长时间阅读和输入，也会使用键盘、选区工具、Slash 命令和内容块操作。

## Capabilities and Constraints

- 支持 React 受控与非受控使用方式。
- 支持中英文、明暗主题、只读模式和公开主题变量。
- 支持代码、公式、图片、表格、任务列表和 Slash 命令。
- 保持现有 React Props、主题类型和 `--zt-*` CSS 变量名称兼容。
- 默认主题不依赖外部字体或新增运行时依赖。

## Brand Commitments

保留 ZT React Milkdown 名称。默认主题采用墨黑、中性灰与群青，表达精密、专业、克制的技术写作工具气质。

## Evidence on Hand

仓库包含 React Playground、双主题 token、编辑器组件、国际化文案以及代码、公式、图片和表格等可运行示例。

## Product Principles

- 内容始终比界面装饰更重要。
- 技术写作功能应当准确、可发现且可通过键盘操作。
- 明暗主题必须保持同等信息层级和可读性。
- 默认主题保持鲜明，同时允许宿主通过稳定 token 定制。

## Accessibility & Inclusion

普通文本与交互状态以 WCAG AA 为最低目标，键盘焦点必须可见，触控热区在移动端至少为 44px，并尊重减少动态效果的系统偏好。
