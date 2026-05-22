# zt-react-milkdown

基于 Milkdown 的 React Markdown 编辑器组件库。  
提供开箱即用的编辑能力、主题切换与国际化支持。
GitHub 仓库：[lzt-T/zt-react-milkdown](https://github.com/lzt-T/zt-react-milkdown)

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

- 国际化
  - 内置 `zh-CN` / `en-US` 两种语言。
  - 可通过 `messages` 对内置文案进行局部覆盖。

- 主题切换
  - 支持 `light` / `dark` 两种主题。
  - 通过 `theme` 属性切换主题。

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
  - 未提供 `upload` 时，默认走内置本地读取流程（返回 data URL）。

## 本地开发

```bash
# 启动示例 playground
npm run dev

# 构建组件库
npm run build

# 类型检查
npm run typecheck
```
