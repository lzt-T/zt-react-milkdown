# zt-react-milkdown

基于 Milkdown 的 React Markdown 编辑器组件库。提供开箱即用的编辑能力、主题切换与国际化支持。

GitHub 仓库：[lzt-T/zt-react-milkdown](https://github.com/lzt-T/zt-react-milkdown)

在线示例：[https://markdown.xjoker.top/](https://markdown.xjoker.top/)


## 安装

```bash
npm install zt-react-milkdown
```

依赖要求：
- `react >= 18`
- `react-dom >= 18`

## 快速开始

```tsx
import { useState } from 'react';
import { MilkdownEditor } from 'zt-react-milkdown';
import 'zt-react-milkdown/style.css';

export default function Demo() {
  const [value, setValue] = useState('# Hello\n\n行内公式：$E=mc^2$');

  return (
    <MilkdownEditor
      value={value}
      onChange={setValue}
      theme="light"
      locale="zh-CN"
      placeholder="请输入 Markdown"
    />
  );
}
```

说明：引入 `zt-react-milkdown/style.css` 后会同时包含编辑器样式与公式渲染所需样式（KaTeX）。

## 功能说明

- 基础编辑能力
  - 支持受控（`value`）与非受控（`defaultValue`）两种模式。
  - 支持只读/可编辑切换（`readOnly`）与占位文案（`placeholder`）。

- Markdown 能力
  - 基于 CommonMark + GFM，支持任务列表、表格等常用语法。

- 公式支持
  - 行内公式：
    ```md
    爱因斯坦质能方程：$E=mc^2$
    ```
  - 块级公式：
    ```md
    $$
    \int_0^1 x^2 dx
    $$
    ```
  
- 代码块能力
  - 支持代码块编辑、语言选择与语法高亮。

- 图片能力
  - 支持图片插入。
  - 支持拖拽、文件选择、URL 输入三种方式。
  - 支持通过 `imageUpload` 配置上传处理策略。

- Slash 菜单
  - 支持通过 `/` 触发快捷命令。
  - 支持段落、标题、列表、代码块、公式、表格、图片等插入与格式操作。

- 表格增强
  - 支持表格插入后光标定位与表格相关快捷交互。

- 选区工具栏
  - 选中文本后支持常用格式操作：加粗、斜体、删除线、行内代码、链接。

- 文档搜索与替换
  - 编辑器实例内按 `Ctrl+F`（macOS 为 `Cmd+F`）打开搜索栏；焦点在编辑器外时保留浏览器默认查找。
  - 支持普通文本、区分大小写、全词和正则表达式搜索，并高亮全部匹配与当前匹配。
  - `Enter` 定位下一项，`Shift+Enter` 定位上一项，`Escape` 关闭搜索栏，结果支持首尾循环；导航后会根据匹配坐标显式调整当前 `.zt-md-editor` 的内部滚动位置，不滚动页面或其他编辑器实例。
  - 搜索输入保持主要宽度，大小写、全词和正则选项使用紧凑分段控制，上一项、下一项与关闭操作按职责分组。
  - 可编辑模式的替换区域默认收起，可按需展开；支持替换当前项和全部替换，两个操作具有明确主次层级，正则替换支持 `$1`、`$2` 等捕获组引用。
  - 只读模式保留搜索和导航，但不提供替换操作。
  - 搜索范围为 ProseMirror 文档文本，包括代码块源码；不搜索图片、公式渲染结果或代码预览 iframe 内容。

- 国际化
  - 内置 `zh-CN` / `en-US` 两种语言。
  - 可通过 `messages` 对内置文案进行局部覆盖。

- 主题切换
  - 支持 `light` / `dark` 两种主题。
  - 通过 `theme` 属性切换主题。

- 浮层隔离
  - 搜索栏作为编辑器固定控件直接位于 `.zt-md-body`，不使用 Portal，且不受 `maxHeight` 编辑区滚动裁剪；导航定位会将搜索栏实际底部作为顶部安全线，替换区域展开或窄屏换行后仍避免遮挡当前匹配。
  - Slash 命令菜单等编辑器级锚点浮层挂载到编辑器内部 `.zt-md-portal`，继承当前主题且不受编辑区滚动裁剪。
  - 全屏 Dialog/Modal 类浮层挂载到 `document.body` 下的隔离宿主，宿主会同步编辑器主题类名与主题变量，避免被父级 `overflow` 或 `transform` 裁切。
  - 选区工具栏子菜单、代码块语言选择器、表格操作等内容附属浮层挂载到 `.zt-md-editor` 内部 `.zt-md-content-portal`，会随 `maxHeight` 编辑区滚动视口裁剪。

## API

`MilkdownEditor` Props：

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `value` | `string` | 受控值 |
| `defaultValue` | `string` | 非受控初始值 |
| `onChange` | `(markdown: string) => void` | 内容变化回调 |
| `theme` | `'light' \| 'dark'` | 主题，默认 `light` |
| `locale` | `'zh-CN' \| 'en-US'` | 语言，默认 `zh-CN` |
| `messages` | `Partial<EditorI18nMessages>` | 自定义文案 |
| `className` | `string` | 根节点类名 |
| `placeholder` | `string` | 输入占位文案 |
| `readOnly` | `boolean` | 是否只读 |
| `maxHeight` | `CSSProperties['maxHeight']` | 编辑区最大高度，超出后在编辑区内部滚动 |
| `debounceMs` | `number` | 内容变更回调防抖时长（毫秒） |
| `headerSlot` | `ReactNode` | 头部插槽 |
| `slashMenu` | `SlashMenuConfig` | slash 菜单配置 |
| `imageUpload` | `ImageUploadConfig` | 图片上传配置 |

说明：
- `placeholder` 优先级高于 `messages.placeholder`。
- 未传 `locale` 时默认使用 `zh-CN`。
- 未传 `readOnly` 时默认使用 `false`。
- 未传 `debounceMs` 时默认使用 `160`（毫秒）。
- `slashMenu` 对应 Slash 菜单行为配置。
- `imageUpload` 对应图片上传策略配置。
- `messages` 对应内置文案覆盖。
- 搜索相关文案可通过 `messages.searchPanelAriaLabel`、`messages.searchInputPlaceholder`、`messages.searchReplaceInputPlaceholder`、搜索选项与操作标签字段进行局部覆盖。
- `debounceMs` / `maxHeight` / `readOnly` 对应编辑交互行为控制。

类型详情：

- `SlashMenuConfig`
  - `enabled?: boolean`：是否启用 slash 菜单（默认启用）。
  - `items?: SlashMenuItem[]`：自定义菜单项列表。
- `SlashMenuItem`
  - `id: string`：菜单项唯一标识。
  - `label: string`：菜单项展示文案。
  - `group: string`：菜单项分组文案。
  - `icon?: string`：菜单项图标键名（对应 `lucide-react` 图标）。
  - `command: SlashMenuCommand`：菜单项执行命令。
- `SlashMenuCommand`
  - `'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote' | 'inlineCode' | 'codeBlock' | 'mathBlock' | 'table' | 'image'`
- `ImageUploadConfig`
  - `upload?: (file: File) => string | Promise<string>`：自定义上传函数，返回最终图片 URL。
  - `maxFileSize?: number`：允许上传的最大文件体积（字节）。
  - `allowedProtocols?: string[]`：图片解析与序列化额外允许的 URL 协议，协议名需包含末尾冒号，例如 `inkdown-file:`。仅配置受信任且由宿主应用安全处理的协议。
  - 未提供 `upload` 时，默认走内置本地读取流程（返回 data URL）。

Electron 应用可为受主进程权限校验保护的本地图片协议显式放行：

```tsx
<MilkdownEditor
  imageUpload={{
    upload: importImage,
    allowedProtocols: ['inkdown-file:']
  }}
/>
```

## 本地开发

```bash
# 启动示例 playground
npm run dev

# 构建组件库
npm run build

# 类型检查
npm run typecheck
```
