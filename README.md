# zt-react-milkdown

基于 Milkdown 构建的 React Markdown 编辑器组件库，内置 Tailwind 预编译主题样式。

## 安装

```bash
npm install zt-react-milkdown
```

## 使用

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
      placeholder="请输入 Markdown"
    />
  );
}
```

## 公式支持

- 行内公式：`$E=mc^2$`
- 块级公式：

```md
$$
\int_0^1 x^2 dx
$$
```

## Props

- `value?: string`
- `defaultValue?: string`
- `onChange?: (markdown: string) => void`
- `theme?: 'light' | 'dark'`
- `className?: string`
- `placeholder?: string`
- `editable?: boolean`
- `headerSlot?: ReactNode`

## 开发命令

```bash
npm run dev
npm run dev:example
npm run dev:lib
npm run setup:example
npm run build
npm run typecheck
npm run test
npm run pack:check
```

`npm run dev` 默认启动 `examples/react-playground`，用于本地预览，不再触发根目录库模式的 404 页面。
示例项目通过相对路径直接引用根目录 `src`，不再依赖 `link:../..` 本地包快照链路。
示例项目使用独立的 `examples/react-playground/postcss.config.cjs`，避免继承根目录 Tailwind 构建链路而出现 `content` 警告。
若修改了库源码后预览异常，先执行 `npm run build`，再执行 `npm run dev` 重新启动示例。

### 本地联调推荐流程

```bash
npm run dev:reset
npm run dev
```

### 联调排障

- 若再次出现 `recentlyCreatedOwnerStacks`，优先执行 `npm run dev:reset` 清理 `examples/react-playground/node_modules/.vite` 后重启示例。

## 发布

```bash
npm run build
npm run pack:check
npm publish --access public
```
