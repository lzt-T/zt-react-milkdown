import { gapCursor } from '@milkdown/prose/gapcursor';
import { $prose } from '@milkdown/utils';

/**
 * 块间光标插件。
 */
export const gapCursorPlugin = $prose(() => {
  return gapCursor();
});
