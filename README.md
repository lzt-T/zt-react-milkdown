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
      locale="zh-CN"
      placeholder="请输入 Markdown"
    />
  );
}
```

### 覆盖内置文案

```tsx
<MilkdownEditor
  locale="en-US"
  messages={{
    placeholder: 'Start writing...',
    mathRenderError: 'Math preview failed.'
  }}
/>
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
- `locale?: 'zh-CN' | 'en-US'`
- `messages?: Partial<EditorI18nMessages>`
- `className?: string`
- `placeholder?: string`
- `editable?: boolean`
- `headerSlot?: ReactNode`

`placeholder` 会覆盖 `messages.placeholder`，未传 `locale` 时默认使用 `zh-CN`。
