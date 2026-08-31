import { PluginKey } from '@milkdown/prose/state';
import type { InlineCodeBoundarySide } from './inline-code-boundary-dom';

// 行内代码边界导航插件 key。
const INLINE_CODE_BOUNDARY_NAVIGATION_PLUGIN_KEY = 'zt-md-inline-code-boundary-navigation';

/** 行内代码边界视觉位置。 */
export type InlineCodeBoundaryPlacement = 'inside' | 'outside';

/** 行内代码边界视觉状态。 */
export interface InlineCodeBoundaryVisualState {
  /** 边界对应的文档位置。 */
  position: number;
  /** 边界方向。 */
  side: InlineCodeBoundarySide;
  /** 指示光标位于标签内部或外部。 */
  placement: InlineCodeBoundaryPlacement;
}

// 行内代码边界导航插件 key 实例。
export const inlineCodeBoundaryNavigationPluginKey = new PluginKey<
  InlineCodeBoundaryVisualState | null
>(INLINE_CODE_BOUNDARY_NAVIGATION_PLUGIN_KEY);
