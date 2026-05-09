import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Trash2 } from 'lucide-react';
import type { EditorState } from '@milkdown/prose/state';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView, PluginView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { EditorI18nMessages } from '../../types/editor';
import { resolveEditorMessages } from '../../local/i18n';
import {
  createOverlayRepositionScheduler,
  resolveEditorWrapper,
  toContentAnchor,
  toViewportPosition,
  type OverlayContentAnchor,
  type OverlayPlacement
} from '../../lib/editor-overlay-position';

// 表格节点类型名。
const TABLE_NODE_NAME = 'table';
// 表格操作插件唯一键。
const TABLE_FOCUS_ACTIONS_PLUGIN_KEY = 'zt-md-table-focus-actions';
// 按钮与表格边缘的视觉间距（像素）。
const ACTION_BUTTON_OFFSET = 4;
// 浮层边界内边距（像素）。
const OVERLAY_BOUNDARY_INSET = 4;
// 表格按钮使用上方锚定位。
const TABLE_ACTION_PLACEMENT: OverlayPlacement = 'top';

/**
 * 基于 lucide-react 组件渲染 SVG 字符串。
 */
const renderLucideIconMarkup = (): string => {
  return renderToStaticMarkup(
    createElement(Trash2, {
      size: 14,
      strokeWidth: 2,
      'aria-hidden': 'true'
    })
  );
};

// 删除按钮图标。
const deleteIconMarkup = renderLucideIconMarkup();

/**
 * 判断当前编辑器是否可编辑。
 */
const isEditorViewEditable = (view: EditorView): boolean => {
  if (typeof view.props.editable === 'function') {
    return view.props.editable(view.state);
  }

  return view.editable;
};

/**
 * 解析当前选区所在表格节点与起始位置。
 */
const resolveFocusedTable = (state: EditorState): { tableStart: number; tableNodeSize: number } | null => {
  const selectionStart = state.selection.$from;

  for (let depth = selectionStart.depth; depth >= 0; depth -= 1) {
    const currentNode = selectionStart.node(depth);
    if (currentNode.type.name !== TABLE_NODE_NAME) {
      continue;
    }

    return {
      tableStart: depth === 0 ? 0 : selectionStart.before(depth),
      tableNodeSize: currentNode.nodeSize
    };
  }

  return null;
};

/**
 * 创建并维护“聚焦表格删除按钮”插件视图。
 */
class TableFocusActionsView implements PluginView {
  // 编辑器视图。
  private view: EditorView;
  // 删除按钮 DOM。
  private readonly deleteButton: HTMLButtonElement;
  // 编辑器滚动容器。
  private readonly editorWrapper: HTMLElement | null;
  // 当前聚焦表格起始位置。
  private currentTableStart: number | null = null;
  // 当前聚焦表格节点大小。
  private currentTableNodeSize: number | null = null;
  // 当前聚焦表格 DOM。
  private currentTableElement: HTMLElement | null = null;
  // 当前按钮锚点（内容坐标）。
  private currentAnchor: OverlayContentAnchor | null = null;
  // 当前锚点位置是否有效。
  private hasPositionContext = false;
  // 浮层重定位调度器。
  private readonly repositionScheduler = createOverlayRepositionScheduler(() => {
    if (!this.hasPositionContext) {
      return;
    }
    this.updateOverlayPosition();
  });

  /**
   * 初始化插件视图。
   */
  constructor(view: EditorView, messages: EditorI18nMessages) {
    this.view = view;
    this.editorWrapper = resolveEditorWrapper(view.dom);
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className =
      'zt-md-table-action-button zt-md-table-action-button-overlay zt-md-table-action-button-danger';
    this.deleteButton.style.display = 'inline-flex';
    this.deleteButton.setAttribute('aria-label', messages.tableDeleteAriaLabel);
    this.deleteButton.innerHTML = deleteIconMarkup;
    this.deleteButton.addEventListener('mousedown', this.handleDeleteMouseDown);
    this.deleteButton.addEventListener('click', this.handleDeleteClick);
    this.repositionScheduler.bindGlobal();
    this.repositionScheduler.bindWrapper(this.editorWrapper);
    this.update(view);
  }

  /**
   * 阻止按钮点击导致编辑器选区丢失。
   */
  private readonly handleDeleteMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /**
   * 删除当前聚焦表格。
   */
  private readonly handleDeleteClick = (event: MouseEvent): void => {
    event.preventDefault();

    if (this.currentTableStart === null || this.currentTableNodeSize === null) {
      return;
    }

    const deleteFrom = this.currentTableStart;
    const deleteTo = this.currentTableStart + this.currentTableNodeSize;
    const transaction = this.view.state.tr.delete(deleteFrom, deleteTo).scrollIntoView();
    this.view.dispatch(transaction);
    this.view.focus();
  };

  /**
   * 解析可定位的 table DOM 节点。
   */
  private resolveTableElement(tableDomNode: HTMLElement): HTMLTableElement | null {
    if (tableDomNode instanceof HTMLTableElement) {
      return tableDomNode;
    }

    const nestedTable = tableDomNode.querySelector('table');
    if (nestedTable instanceof HTMLTableElement) {
      return nestedTable;
    }

    return null;
  }

  /**
   * 解析当前表格对应的浮层锚点。
   */
  private resolveTableAnchor(tableElement: HTMLTableElement): OverlayContentAnchor | null {
    if (!this.editorWrapper) {
      return null;
    }

    const buttonWidth = this.deleteButton.offsetWidth || 28;
    const tableRect = tableElement.getBoundingClientRect();
    const rawAnchor = toContentAnchor(tableRect, this.editorWrapper);
    const tableWidth = tableRect.width;
    const tableRightInContent = rawAnchor.anchorLeftInContent + tableWidth;
    const desiredLeftInContent = tableRightInContent - buttonWidth - ACTION_BUTTON_OFFSET;
    const desiredTopInContent = rawAnchor.anchorTopInContent + ACTION_BUTTON_OFFSET;

    return {
      anchorLeftInContent: desiredLeftInContent,
      anchorTopInContent: desiredTopInContent,
      anchorBottomInContent: desiredTopInContent
    };
  }

  /**
   * 更新按钮定位（fixed 视口坐标）。
   */
  private updateOverlayPosition(): void {
    if (!this.editorWrapper || !this.currentAnchor || this.deleteButton.parentElement !== document.body) {
      return;
    }

    const viewportPosition = toViewportPosition({
      wrapper: this.editorWrapper,
      anchor: this.currentAnchor,
      overlaySize: { width: this.deleteButton.offsetWidth || 28 },
      placement: TABLE_ACTION_PLACEMENT,
      offsetY: 0,
      boundaryInset: OVERLAY_BOUNDARY_INSET
    });
    this.deleteButton.style.left = `${viewportPosition.left}px`;
    this.deleteButton.style.top = `${viewportPosition.top}px`;
  }

  /**
   * 更新按钮显示与绑定目标。
   */
  update(view: EditorView): void {
    this.view = view;

    if (!this.editorWrapper || !isEditorViewEditable(view)) {
      this.detach();
      return;
    }

    const focusedTable = resolveFocusedTable(view.state);
    if (!focusedTable) {
      this.detach();
      return;
    }

    const tableDomNode = view.nodeDOM(focusedTable.tableStart);
    if (!(tableDomNode instanceof HTMLElement)) {
      this.detach();
      return;
    }
    const tableElement = this.resolveTableElement(tableDomNode);
    if (!tableElement) {
      this.detach();
      return;
    }
    const tableAnchor = this.resolveTableAnchor(tableElement);
    if (!tableAnchor) {
      this.detach();
      return;
    }

    if (this.deleteButton.parentElement !== document.body) {
      document.body.append(this.deleteButton);
    }

    this.currentTableElement = tableElement;
    this.currentAnchor = tableAnchor;
    this.currentTableStart = focusedTable.tableStart;
    this.currentTableNodeSize = focusedTable.tableNodeSize;
    this.hasPositionContext = true;
    this.updateOverlayPosition();
    this.repositionScheduler.schedule();
  }

  /**
   * 卸载按钮与容器状态。
   */
  private detach(): void {
    this.deleteButton.remove();
    this.currentAnchor = null;
    this.currentTableElement = null;
    this.currentTableStart = null;
    this.currentTableNodeSize = null;
    this.hasPositionContext = false;
  }

  /**
   * 销毁插件视图。
   */
  destroy(): void {
    this.detach();
    this.repositionScheduler.destroy();
    this.deleteButton.removeEventListener('mousedown', this.handleDeleteMouseDown);
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
  }
}

/**
 * 表格聚焦操作插件：聚焦表格时显示删除按钮。
 */
export const createTableFocusActionsPlugin = (
  messages?: EditorI18nMessages
): ReturnType<typeof $prose> => {
  const resolvedMessages = resolveEditorMessages(undefined, messages);

  return $prose(() => {
    return new Plugin({
      key: new PluginKey(TABLE_FOCUS_ACTIONS_PLUGIN_KEY),
      view: (view) => new TableFocusActionsView(view as EditorView, resolvedMessages)
    });
  });
};
