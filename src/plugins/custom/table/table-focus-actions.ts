import { observeEditorMessages } from '@/local/message-updates';
import { renderStaticSvgIcon } from '@/lib/static-svg-icons';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { EditorI18nMessages } from '../../../types/editor';
import { resolveEditorMessages } from '../../../local/i18n';
import { TableMoreActions } from './table-more-actions';
import { deleteFocusedTableColumn, deleteFocusedTableRow } from './table-deletion-actions';
import {
  alignTableColumn,
  insertTableColumn,
  insertTableRow,
  type TableCellAlignment,
  type TableColumnInsertDirection
} from './table-row-insertion';
import { isFocusedTableColumnValid, resolveFocusedTable } from './table-selection';
import {
  createOverlayRepositionScheduler,
  resolveEditorWrapper,
  toContentAnchor,
  toPortalPosition,
  type OverlayPlacement
} from '../../../lib/editor-overlay-position';

// 表格操作插件唯一键。
const TABLE_FOCUS_ACTIONS_PLUGIN_KEY = 'zt-md-table-focus-actions';
// 浮层与当前聚焦单元格的垂直间距（像素）。
const OVERLAY_OFFSET_Y = 8;
// 浮层距离滚动容器边缘的安全内边距（像素）。
const OVERLAY_BOUNDARY_INSET = 8;
// 表格列默认对齐方式。
const DEFAULT_TABLE_ALIGNMENT: TableCellAlignment = 'left';

// 删除按钮图标。
const deleteIconMarkup = renderStaticSvgIcon('Trash2', { size: 15, strokeWidth: 2 });
// 左对齐按钮图标。
const alignLeftIconMarkup = renderStaticSvgIcon('AlignLeft', { size: 15, strokeWidth: 2 });
// 居中按钮图标。
const alignCenterIconMarkup = renderStaticSvgIcon('AlignCenter', { size: 15, strokeWidth: 2 });
// 右对齐按钮图标。
const alignRightIconMarkup = renderStaticSvgIcon('AlignRight', { size: 15, strokeWidth: 2 });

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
 * 判断当前是否存在非空文本选区，用于让位给选区工具栏。
 */
const hasNonEmptyTextSelection = (view: EditorView): boolean => {
  const { selection, doc } = view.state;
  if (selection.empty || !(selection instanceof TextSelection)) {
    return false;
  }

  return doc.textBetween(selection.from, selection.to).trim().length > 0;
};

/**
 * 创建操作栏分组分隔线节点。
 */
const createActionsDivider = (): HTMLSpanElement => {
  const divider = document.createElement('span');
  divider.className = 'zt-md-table-actions-divider';
  divider.setAttribute('aria-hidden', 'true');
  return divider;
};

/**
 * 解析当前聚焦单元格 DOM，找不到时返回 null。
 */
const resolveFocusedCellElement = (
  tableElement: HTMLTableElement,
  rowIndex: number,
  columnIndex: number
): HTMLElement | null => {
  if (rowIndex < 0 || columnIndex < 0) {
    return null;
  }

  return tableElement.rows.item(rowIndex)?.cells.item(columnIndex) ?? null;
};

/**
 * 创建并维护“聚焦表格操作胶囊”插件视图。
 */
class TableFocusActionsView {
  // 视图销毁时解除文案观察。
  private readonly stopObservingMessages: () => void;
  // 编辑器视图。
  private view: EditorView;
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 操作区容器 DOM。
  private readonly actionsContainer: HTMLDivElement;
  // 删除按钮 DOM。
  private readonly deleteButton: HTMLButtonElement;
  // 左对齐按钮 DOM。
  private readonly alignLeftButton: HTMLButtonElement;
  // 居中按钮 DOM。
  private readonly alignCenterButton: HTMLButtonElement;
  // 右对齐按钮 DOM。
  private readonly alignRightButton: HTMLButtonElement;
  // 更多菜单挂载 DOM。
  private readonly moreActionsMount: HTMLSpanElement;
  // 更多菜单 React Root。
  private readonly moreActionsRoot: Root;
  // 编辑器滚动容器。
  private readonly editorWrapper: HTMLElement | null;
  // 编辑器内部浮层 Portal 容器。
  private readonly portalContainer: HTMLElement;
  // 当前胶囊是否已挂载显示。
  private isAttached = false;
  // 文案更新版本号，用于语言切换后触发更多菜单重渲染。
  private messageVersion = 0;
  // 上一次更多菜单渲染状态签名，用于跳过无效重渲染。
  private lastMoreActionsKey = '';
  // 当前聚焦表格起始位置。
  private currentTableStart: number | null = null;
  // 当前聚焦表格节点大小。
  private currentTableNodeSize: number | null = null;
  // 当前聚焦列索引。
  private currentColumnIndex: number | null = null;
  // 当前聚焦列对齐方式。
  private currentColumnAlignment: TableCellAlignment = DEFAULT_TABLE_ALIGNMENT;
  // 当前定位锚点 DOM（优先聚焦单元格，兜底表格节点）。
  private currentAnchorElement: HTMLElement | null = null;
  // 当前绑定横向滚动监听的表格外层滚动容器。
  private currentTableWrapper: HTMLElement | null = null;
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
  constructor(view: EditorView, messages: EditorI18nMessages, portalContainer: HTMLElement) {
    this.view = view;
    this.messages = messages;
    this.portalContainer = portalContainer;
    this.editorWrapper = resolveEditorWrapper(view.dom);
    this.actionsContainer = document.createElement('div');
    this.actionsContainer.className = 'zt-md-table-actions-overlay';
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'zt-md-table-action-button zt-md-table-action-button-danger';
    this.deleteButton.style.display = 'inline-flex';
    this.deleteButton.setAttribute('aria-label', messages.tableDeleteAriaLabel);
    this.deleteButton.innerHTML = deleteIconMarkup;
    this.alignLeftButton = this.createColumnAlignmentButton(messages.tableAlignLeftAriaLabel, alignLeftIconMarkup);
    this.alignCenterButton = this.createColumnAlignmentButton(messages.tableAlignCenterAriaLabel, alignCenterIconMarkup);
    this.alignRightButton = this.createColumnAlignmentButton(messages.tableAlignRightAriaLabel, alignRightIconMarkup);
    this.moreActionsMount = document.createElement('span');
    this.moreActionsMount.className = 'zt-md-table-more-actions-mount';
    this.moreActionsRoot = createRoot(this.moreActionsMount);
    this.actionsContainer.append(
      this.moreActionsMount,
      createActionsDivider(),
      this.alignLeftButton,
      this.alignCenterButton,
      this.alignRightButton,
      createActionsDivider(),
      this.deleteButton
    );
    this.actionsContainer.addEventListener('mousedown', this.handleActionsMouseDown);
    this.deleteButton.addEventListener('click', this.handleDeleteClick);
    this.alignLeftButton.addEventListener('click', this.handleAlignLeftClick);
    this.alignCenterButton.addEventListener('click', this.handleAlignCenterClick);
    this.alignRightButton.addEventListener('click', this.handleAlignRightClick);
    this.update(view);
    this.stopObservingMessages = observeEditorMessages(messages, () => {
      this.messageVersion += 1;
      this.deleteButton.setAttribute('aria-label', messages.tableDeleteAriaLabel);
      this.alignLeftButton.setAttribute('aria-label', messages.tableAlignLeftAriaLabel);
      this.alignCenterButton.setAttribute('aria-label', messages.tableAlignCenterAriaLabel);
      this.alignRightButton.setAttribute('aria-label', messages.tableAlignRightAriaLabel);
      if (this.isAttached) {
        this.update(this.view);
      }
    });
  }

  /**
   * 阻止按钮点击导致编辑器选区丢失。
   */
  private readonly handleActionsMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /**
   * 表格横向滚动时触发浮层重定位。
   */
  private readonly handleTableWrapperScroll = (): void => {
    this.repositionScheduler.schedule();
  };

  /**
   * 绑定当前表格横向滚动容器的滚动监听。
   */
  private bindTableWrapperScroll(tableElement: HTMLTableElement): void {
    const nextWrapper = tableElement.closest('.tableWrapper') as HTMLElement | null;
    if (this.currentTableWrapper === nextWrapper) {
      return;
    }

    this.unbindTableWrapperScroll();
    this.currentTableWrapper = nextWrapper;
    if (this.currentTableWrapper) {
      this.currentTableWrapper.addEventListener('scroll', this.handleTableWrapperScroll, { passive: true });
    }
  }

  /**
   * 解绑当前表格横向滚动容器的滚动监听。
   */
  private unbindTableWrapperScroll(): void {
    if (!this.currentTableWrapper) {
      return;
    }

    this.currentTableWrapper.removeEventListener('scroll', this.handleTableWrapperScroll);
    this.currentTableWrapper = null;
  }

  /**
   * 创建列对齐按钮。
   */
  private createColumnAlignmentButton(ariaLabel: string, iconMarkup: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'zt-md-table-action-button';
    button.style.display = 'inline-flex';
    button.setAttribute('aria-label', ariaLabel);
    button.innerHTML = iconMarkup;
    return button;
  }

  /**
   * 解析列对齐状态。
   */
  private resolveColumnAlignment(alignment: unknown): TableCellAlignment {
    if (alignment === 'center' || alignment === 'right') {
      return alignment;
    }

    return DEFAULT_TABLE_ALIGNMENT;
  }

  /**
   * 刷新列对齐按钮可用性与激活态。
   */
  private updateAlignmentButtonsState(canAlignColumn: boolean): void {
    this.alignLeftButton.disabled = !canAlignColumn;
    this.alignCenterButton.disabled = !canAlignColumn;
    this.alignRightButton.disabled = !canAlignColumn;

    this.alignLeftButton.classList.toggle(
      'zt-md-table-action-button-active',
      canAlignColumn && this.currentColumnAlignment === 'left'
    );
    this.alignCenterButton.classList.toggle(
      'zt-md-table-action-button-active',
      canAlignColumn && this.currentColumnAlignment === 'center'
    );
    this.alignRightButton.classList.toggle(
      'zt-md-table-action-button-active',
      canAlignColumn && this.currentColumnAlignment === 'right'
    );
  }

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
   * 将当前聚焦列设置为目标对齐方式。
   */
  private applyColumnAlignment(alignment: TableCellAlignment): void {
    // 当前聚焦表格信息。
    const focusedTable = resolveFocusedTable(this.view.state);
    if (!focusedTable || focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
      return;
    }

    alignTableColumn(this.view, focusedTable, alignment);
  }

  /**
   * 将当前列设置为左对齐。
   */
  private readonly handleAlignLeftClick = (): void => {
    this.applyColumnAlignment('left');
  };

  /**
   * 将当前列设置为居中对齐。
   */
  private readonly handleAlignCenterClick = (): void => {
    this.applyColumnAlignment('center');
  };

  /**
   * 将当前列设置为右对齐。
   */
  private readonly handleAlignRightClick = (): void => {
    this.applyColumnAlignment('right');
  };

  /**
   * 在当前行下方插入一行。
   */
  private readonly handleInsertRowBelow = (): void => {
    // 当前聚焦表格信息。
    const focusedTable = resolveFocusedTable(this.view.state);
    if (!focusedTable || focusedTable.rowIndex < 0) {
      return;
    }

    insertTableRow(this.view, focusedTable, 'below');
  };

  /**
   * 在当前行上方插入一行。
   */
  private readonly handleInsertRowAbove = (): void => {
    // 当前聚焦表格信息。
    const focusedTable = resolveFocusedTable(this.view.state);
    if (!focusedTable || focusedTable.rowIndex <= 0) {
      return;
    }

    insertTableRow(this.view, focusedTable, 'above');
  };

  /**
   * 在当前列附近插入一列。
   */
  private insertColumn(direction: TableColumnInsertDirection): void {
    // 当前聚焦表格信息。
    const focusedTable = resolveFocusedTable(this.view.state);
    if (!focusedTable || focusedTable.rowIndex < 0 || focusedTable.columnIndex < 0) {
      return;
    }

    insertTableColumn(this.view, focusedTable, direction);
  }

  /**
   * 在当前列左侧插入一列。
   */
  private readonly handleInsertColumnLeft = (): void => {
    this.insertColumn('left');
  };

  /**
   * 在当前列右侧插入一列。
   */
  private readonly handleInsertColumnRight = (): void => {
    this.insertColumn('right');
  };

  /**
   * 删除当前普通表格行。
   */
  private readonly handleDeleteRow = (): void => {
    deleteFocusedTableRow(this.view);
  };

  /**
   * 删除当前表格列。
   */
  private readonly handleDeleteColumn = (): void => {
    deleteFocusedTableColumn(this.view);
  };

  /**
   * 渲染更多操作菜单（操作权限与文案未变化时跳过 React 重渲染）。
   */
  private renderMoreActions(canInsertRowAbove: boolean, canInsertColumn: boolean, canDeleteRow: boolean, canDeleteColumn: boolean): void {
    const nextKey = `${this.messageVersion}:${canInsertRowAbove}:${canInsertColumn}:${canDeleteRow}:${canDeleteColumn}`;
    if (this.lastMoreActionsKey === nextKey) {
      return;
    }
    this.lastMoreActionsKey = nextKey;

    this.moreActionsRoot.render(
      createElement(TableMoreActions, {
        messages: this.messages,
        portalContainer: this.portalContainer,
        collisionBoundary: this.editorWrapper,
        canInsertRowAbove,
        canInsertColumn,
        canDeleteRow,
        canDeleteColumn,
        onInsertRowAbove: this.handleInsertRowAbove,
        onInsertRowBelow: this.handleInsertRowBelow,
        onInsertColumnLeft: this.handleInsertColumnLeft,
        onInsertColumnRight: this.handleInsertColumnRight,
        onDeleteRow: this.handleDeleteRow,
        onDeleteColumn: this.handleDeleteColumn
      })
    );
  }

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
   * 解析操作栏容器实时尺寸。
   */
  private resolveActionsContainerSize(): { width: number; height: number } | null {
    // 优先使用真实布局宽高，避免首次渲染读取 0 导致定位偏移。
    const rect = this.actionsContainer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return { width: rect.width, height: rect.height };
  }

  /**
   * 基于当前实时几何信息更新胶囊定位（优先单元格上方居中，空间不足时向下翻转）。
   */
  private updateOverlayPosition(): void {
    if (
      !this.editorWrapper ||
      !this.currentAnchorElement ||
      this.actionsContainer.parentElement !== this.portalContainer
    ) {
      return;
    }

    const size = this.resolveActionsContainerSize();
    if (!size) {
      return;
    }

    const anchorRect = this.currentAnchorElement.getBoundingClientRect();
    const wrapperRect = this.editorWrapper.getBoundingClientRect();
    const spaceAbove = anchorRect.top - wrapperRect.top;
    const spaceBelow = wrapperRect.bottom - anchorRect.bottom;
    const placement: OverlayPlacement =
      spaceAbove >= size.height + OVERLAY_OFFSET_Y + OVERLAY_BOUNDARY_INSET || spaceAbove >= spaceBelow
        ? 'top'
        : 'bottom';
    const currentAnchor = toContentAnchor(anchorRect, this.editorWrapper, wrapperRect);

    // 操作胶囊在编辑器 Portal 内的定位坐标。
    const portalPosition = toPortalPosition(
      {
        wrapper: this.editorWrapper,
        anchor: currentAnchor,
        overlaySize: size,
        placement,
        horizontalAlign: 'center',
        offsetY: OVERLAY_OFFSET_Y,
        boundaryInset: OVERLAY_BOUNDARY_INSET
      },
      this.portalContainer,
      wrapperRect
    );
    this.actionsContainer.style.left = `${portalPosition.left}px`;
    this.actionsContainer.style.top = `${portalPosition.top}px`;
  }

  /**
   * 更新按钮显示与绑定目标。
   */
  update(view: EditorView): void {
    this.view = view;

    if (!this.editorWrapper || !isEditorViewEditable(view) || hasNonEmptyTextSelection(view)) {
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

    const wasAttached = this.isAttached;
    if (!this.isAttached) {
      this.isAttached = true;
      this.repositionScheduler.bindGlobal();
      this.repositionScheduler.bindWrapper(this.editorWrapper);
    }

    if (this.actionsContainer.parentElement !== this.portalContainer) {
      this.portalContainer.append(this.actionsContainer);
    }
    // 当前聚焦列是否可用于列操作。
    const canInsertColumn = isFocusedTableColumnValid(focusedTable);
    // 当前聚焦列是否可删除。
    const canDeleteColumn = canInsertColumn && focusedTable.tableNode.child(0).childCount > 1;
    const canInsertRowAbove = focusedTable.rowIndex > 0;
    const canDeleteRow = focusedTable.rowIndex > 0;
    const headerRow = focusedTable.tableNode.childCount > 0 ? focusedTable.tableNode.child(0) : null;
    this.currentColumnIndex = canInsertColumn ? focusedTable.columnIndex : null;
    this.currentColumnAlignment = this.resolveColumnAlignment(
      this.currentColumnIndex === null ? null : headerRow?.maybeChild(this.currentColumnIndex)?.attrs?.alignment
    );
    this.updateAlignmentButtonsState(canInsertColumn);
    this.renderMoreActions(canInsertRowAbove, canInsertColumn, canDeleteRow, canDeleteColumn);

    this.bindTableWrapperScroll(tableElement);
    this.currentAnchorElement =
      resolveFocusedCellElement(tableElement, focusedTable.rowIndex, focusedTable.columnIndex) ?? tableElement;
    this.currentTableStart = focusedTable.tableStart;
    this.currentTableNodeSize = focusedTable.tableNodeSize;
    this.hasPositionContext = true;

    if (!wasAttached) {
      this.updateOverlayPosition();
    } else {
      this.repositionScheduler.schedule();
    }
  }

  /**
   * 卸载按钮与容器状态，并解绑滚动监听。
   */
  private detach(): void {
    if (!this.isAttached) {
      return;
    }

    this.isAttached = false;
    this.repositionScheduler.unbindGlobal();
    this.repositionScheduler.bindWrapper(null);
    this.unbindTableWrapperScroll();
    this.lastMoreActionsKey = '';
    this.moreActionsRoot.render(null);
    this.actionsContainer.remove();
    this.currentAnchorElement = null;
    this.currentTableStart = null;
    this.currentTableNodeSize = null;
    this.currentColumnIndex = null;
    this.currentColumnAlignment = DEFAULT_TABLE_ALIGNMENT;
    this.updateAlignmentButtonsState(false);
    this.hasPositionContext = false;
  }

  /**
   * 销毁插件视图。
   */
  destroy(): void {
    this.stopObservingMessages();
    this.detach();
    this.repositionScheduler.destroy();
    this.moreActionsRoot.unmount();
    this.actionsContainer.removeEventListener('mousedown', this.handleActionsMouseDown);
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
    this.alignLeftButton.removeEventListener('click', this.handleAlignLeftClick);
    this.alignCenterButton.removeEventListener('click', this.handleAlignCenterClick);
    this.alignRightButton.removeEventListener('click', this.handleAlignRightClick);
  }
}

/**
 * 表格聚焦操作插件：聚焦表格时显示操作胶囊。
 */
export const createTableFocusActionsPlugin = (portalContainer: HTMLElement, messages?: EditorI18nMessages): ReturnType<typeof $prose> => {
  // 保留运行时文案引用，让视图接收同一实例的更新。
  const resolvedMessages = messages ?? resolveEditorMessages();

  return $prose(() => {
    return new Plugin({
      key: new PluginKey(TABLE_FOCUS_ACTIONS_PLUGIN_KEY),
      view: (view) => new TableFocusActionsView(view as EditorView, resolvedMessages, portalContainer)
    });
  });
};
