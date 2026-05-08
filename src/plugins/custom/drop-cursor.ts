import { dropCursor } from '@milkdown/prose/dropcursor';
import { $prose } from '@milkdown/utils';

// 拖拽落点指示器宽度。
const DROP_CURSOR_WIDTH = 2;
// 拖拽落点指示器颜色。
const DROP_CURSOR_COLOR = 'var(--zt-primary)';

/**
 * 拖拽落点指示器插件。
 */
export const dropCursorPlugin = $prose(() => {
  return dropCursor({
    color: DROP_CURSOR_COLOR,
    width: DROP_CURSOR_WIDTH
  });
});
