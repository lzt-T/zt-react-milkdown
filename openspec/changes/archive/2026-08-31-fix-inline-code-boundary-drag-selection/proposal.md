## Why

行内代码边界插件会在鼠标按下标签首尾区域时立即阻止原生事件并折叠选区，导致用户无法从标签开头、结尾或内边距开始拖拽选择文本。鼠标点击标签右侧普通文字开头后，插件还会额外吞掉第一次左方向键，用户必须按第二次才能进入标签末尾，造成无反馈的导航停顿。

## What Changes

- 允许用户从行内代码标签的开头、结尾及内边距开始拖拽选择文本。
- 允许拖拽选区穿过行内代码边界并延伸到相邻文字或其他文本块。
- 仅在确认鼠标交互为普通单击且最终选区为空时，应用现有标签内外边界光标、输入 mark 与视觉状态。
- 鼠标点击标签右侧普通文字开头后，第一次按左方向键即进入行内代码末尾，不再增加无位移的确认步骤。
- 保留从标签后首个普通字符之后向左移动时先落到标签外部边界的自然字符导航。
- 保持除鼠标右侧入口首次左键外的方向键导航、标签首尾继续输入及标签外普通文字输入行为不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `inline-code-boundary`: 将鼠标边界行为调整为拖拽选择优先，并移除鼠标进入右侧外部边界后的额外左方向键确认步骤。

## Impact

- 影响行内代码边界的鼠标事件处理和 ProseMirror 选区更新。
- 影响 `src/plugins/custom/inline-code-boundary-mouse.ts`、`src/plugins/custom/inline-code-boundary-navigation.ts`、`src/plugins/custom/inline-code-exit-navigation.ts` 与边界状态类型。
- 不改变 Markdown 解析、序列化、公开 API、主题变量或依赖项。
