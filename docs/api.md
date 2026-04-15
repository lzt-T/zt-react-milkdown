# API

## `MilkdownEditorProps`

- `value?: string`
- `defaultValue?: string`
- `onChange?: (markdown: string) => void`
- `theme?: 'light' | 'dark'`
- `className?: string`
- `placeholder?: string`
- `editable?: boolean`
- `headerSlot?: ReactNode`

## 数学公式语法

- 行内公式：`$a^2+b^2=c^2$`
- 块级公式：

```md
$$
\frac{1}{n}\sum_{i=1}^n x_i
$$
```
