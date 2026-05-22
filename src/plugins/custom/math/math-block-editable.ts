import katex from 'katex';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, Copy, Trash2 } from 'lucide-react';
import { GapCursor } from '@milkdown/prose/gapcursor';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { TextSelection, type Selection } from '@milkdown/prose/state';
import type { EditorView, NodeView, NodeViewConstructor } from '@milkdown/prose/view';
import type { EditorI18nMessages } from '../../../types/editor';
import { resolveEditorMessages } from '../../../local/i18n';

/**
 * math_block 节点类型名。
 */
const MATH_BLOCK_NODE_NAME = 'math_block';
/**
 * 触发拖动判定的最小位移阈值（像素）。
 */
const DRAG_DISTANCE_THRESHOLD = 5;
/**
 * 复制成功态清理延迟（毫秒）。
 */
const COPY_FEEDBACK_DURATION = 1200;
/**
 * GapCursor 构造器类型。
 */
type GapCursorConstructor = typeof GapCursor & {
  /** 判断当前位置是否允许创建 GapCursor。 */
  valid: (position: ResolvedPos) => boolean;
};

/**
 * 基于 lucide-react 组件渲染 SVG 字符串。
 */
const renderLucideIconMarkup = (icon: typeof Copy): string => {
  return renderToStaticMarkup(
    createElement(icon, {
      size: 14,
      strokeWidth: 2,
      'aria-hidden': 'true'
    })
  );
};
// 复制按钮默认图标。
const copyIconMarkup = renderLucideIconMarkup(Copy);
// 复制成功反馈图标。
const checkIconMarkup = renderLucideIconMarkup(Check);

/**
 * 解析 NodeView 的节点位置。
 */
const resolveNodePosition = (getPos: boolean | (() => number)): number | null => {
  if (typeof getPos !== 'function') {
    return null;
  }

  return getPos();
};

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
 * 创建可点击编辑的公式块 NodeView。
 */
class MathBlockEditableNodeView implements NodeView {
  // 当前节点快照。
  node: ProseNode;
  // 节点根容器。
  dom: HTMLDivElement;
  // 编辑器视图。
  private readonly view: EditorView;
  // 节点位置获取器。
  private readonly getPos: boolean | (() => number);
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 源码编辑容器。
  private readonly sourceContainer: HTMLDivElement;
  // 源码输入框。
  private readonly sourceTextarea: HTMLTextAreaElement;
  // 渲染结果容器。
  private readonly previewContainer: HTMLDivElement;
  // 操作区容器。
  private readonly actionsContainer: HTMLDivElement;
  // 复制按钮。
  private readonly copyButton: HTMLButtonElement;
  // 删除按钮。
  private readonly deleteButton: HTMLButtonElement;
  // 渲染错误提示节点。
  private readonly errorContainer: HTMLDivElement;
  // 指针按下时的横坐标。
  private pointerStartX: number | null = null;
  // 指针按下时的纵坐标。
  private pointerStartY: number | null = null;
  // 当前交互是否已判定为拖动。
  private hasDragged = false;
  // 是否由删块触发失焦（用于避免 blur 与回焦互相干扰）。
  private isDeletingByBackspace = false;
  // 复制成功反馈计时器。
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 初始化公式块视图。
   */
  constructor(
    node: ProseNode,
    view: EditorView,
    getPos: boolean | (() => number),
    messages: EditorI18nMessages
  ) {
    // 初始节点快照。
    this.node = node;
    // 编辑器视图引用。
    this.view = view;
    // 节点位置获取器引用。
    this.getPos = getPos;
    // 编辑器文案引用。
    this.messages = messages;

    // 根容器。
    this.dom = document.createElement('div');
    this.dom.dataset.type = MATH_BLOCK_NODE_NAME;
    this.dom.className = 'zt-md-math-block';

    // 源码编辑容器。
    this.sourceContainer = document.createElement('div');
    this.sourceContainer.className = 'zt-md-math-block-source';
    this.sourceContainer.hidden = true;

    // 源码输入框。
    this.sourceTextarea = document.createElement('textarea');
    this.sourceTextarea.className = 'zt-md-math-block-textarea';
    this.sourceTextarea.setAttribute('aria-label', this.messages.mathBlockSourceAriaLabel);
    this.sourceTextarea.spellcheck = false;

    // 渲染结果容器。
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'zt-md-math-block-preview';

    // 公式块悬停操作区。
    this.actionsContainer = document.createElement('div');
    this.actionsContainer.className = 'zt-md-math-block-actions';

    // 复制按钮。
    this.copyButton = document.createElement('button');
    this.copyButton.type = 'button';
    this.copyButton.className = 'zt-md-math-block-action-button';
    this.copyButton.setAttribute('aria-label', this.messages.mathBlockCopyAriaLabel);
    this.copyButton.innerHTML = copyIconMarkup;

    // 删除按钮。
    this.deleteButton = document.createElement('button');
    this.deleteButton.type = 'button';
    this.deleteButton.className = 'zt-md-math-block-action-button zt-md-math-block-action-button-danger';
    this.deleteButton.setAttribute('aria-label', this.messages.mathBlockDeleteAriaLabel);
    this.deleteButton.innerHTML = renderLucideIconMarkup(Trash2);

    // 渲染错误提示节点。
    this.errorContainer = document.createElement('div');
    this.errorContainer.className = 'zt-md-math-block-error';
    this.errorContainer.hidden = true;

    this.actionsContainer.append(this.copyButton, this.deleteButton);
    this.sourceContainer.appendChild(this.sourceTextarea);
    this.previewContainer.appendChild(this.errorContainer);
    this.dom.append(this.actionsContainer, this.sourceContainer, this.previewContainer);

    this.syncFromNode(node);

    this.dom.addEventListener('click', this.handleClick);
    this.dom.addEventListener('pointerdown', this.handlePointerDown);
    this.dom.addEventListener('pointermove', this.handlePointerMove);
    this.dom.addEventListener('pointerup', this.handlePointerUp);
    this.dom.addEventListener('pointercancel', this.handlePointerUp);
    this.copyButton.addEventListener('click', this.handleCopyClick);
    this.deleteButton.addEventListener('click', this.handleDeleteClick);
    this.sourceTextarea.addEventListener('input', this.handleInput);
    this.sourceTextarea.addEventListener('keydown', this.handleKeyDown);
    this.sourceTextarea.addEventListener('blur', this.handleBlur);
  }

  /**
   * 响应公式块点击，进入编辑态。
   */
  private readonly handleClick = (): void => {
    if (this.hasDragged) {
      this.hasDragged = false;
      return;
    }

    this.enterEditMode();
  };

  /**
   * 记录指针按下位置并重置拖动状态。
   */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.hasDragged = false;
  };

  /**
   * 根据位移判断是否发生拖动。
   */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerStartX === null || this.pointerStartY === null) {
      return;
    }

    const deltaX = Math.abs(event.clientX - this.pointerStartX);
    const deltaY = Math.abs(event.clientY - this.pointerStartY);
    if (deltaX >= DRAG_DISTANCE_THRESHOLD || deltaY >= DRAG_DISTANCE_THRESHOLD) {
      this.hasDragged = true;
    }
  };

  /**
   * 清理指针按下位置。
   */
  private readonly handlePointerUp = (): void => {
    this.pointerStartX = null;
    this.pointerStartY = null;
  };

  /**
   * 响应复制按钮点击，复制公式源码。
   */
  private readonly handleCopyClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    // 当前公式源码。
    const sourceValue = typeof this.node.attrs.value === 'string' ? this.node.attrs.value : '';
    // 优先使用现代剪贴板 API。
    const writeClipboardPromise =
      typeof navigator !== 'undefined' && navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(sourceValue)
        : Promise.resolve();

    void writeClipboardPromise
      .then(() => {
        this.copyButton.innerHTML = checkIconMarkup;
        this.copyButton.dataset.copied = 'true';
        if (this.copyFeedbackTimer !== null) {
          clearTimeout(this.copyFeedbackTimer);
        }
        this.copyFeedbackTimer = setTimeout(() => {
          this.copyButton.innerHTML = copyIconMarkup;
          delete this.copyButton.dataset.copied;
          this.copyFeedbackTimer = null;
        }, COPY_FEEDBACK_DURATION);
      })
      .catch(() => {
        // 剪贴板不可用时忽略反馈，不影响编辑流程。
      });
  };

  /**
   * 响应删除按钮点击，删除当前公式块。
   */
  private readonly handleDeleteClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    this.deleteCurrentMathBlock();
  };

  /**
   * 删除当前公式块并将焦点归还编辑器。
   */
  private deleteCurrentMathBlock(): void {
    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    this.isDeletingByBackspace = true;
    // 删除后将光标落在安全位置，保证后续连续编辑。
    const transaction = this.view.state.tr.delete(nodePosition, nodePosition + this.node.nodeSize);
    const safePosition = Math.min(nodePosition, transaction.doc.content.size);
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(safePosition), -1)).scrollIntoView();
    this.view.dispatch(transaction);
    requestAnimationFrame(() => {
      this.view.focus();
      this.isDeletingByBackspace = false;
    });
  }

  /**
   * 响应源码输入，实时更新节点并刷新渲染。
   */
  private readonly handleInput = (): void => {
    // 最新源码。
    const nextValue = this.sourceTextarea.value;
    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);

    if (nodePosition === null) {
      return;
    }

    // 预渲染，保证输入时立即反馈。
    this.renderMath(nextValue);

    // 本次事务对象。
    const transaction = this.view.state.tr.setNodeMarkup(nodePosition, undefined, {
      ...this.node.attrs,
      value: nextValue
    });

    if (transaction.docChanged) {
      this.view.dispatch(transaction);
    }
  };

  /**
   * 处理源码输入框键盘事件。
   */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // 输入框选区起点。
    const selectionStart = this.sourceTextarea.selectionStart;
    // 输入框选区终点。
    const selectionEnd = this.sourceTextarea.selectionEnd;

    // 处理 Backspace：仅在光标位于开头且无选区时删块。
    if (event.key === 'Backspace') {
      // 光标需位于最前且无选区。
      const isCaretAtStart = selectionStart === 0 && selectionEnd === 0;
      if (!isCaretAtStart) {
        return;
      }

      // 当前节点位置。
      const nodePosition = resolveNodePosition(this.getPos);
      if (nodePosition === null) {
        return;
      }

      event.preventDefault();
      this.deleteCurrentMathBlock();
      return;
    }

    // 仅处理上下方向键边界跳出。
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    // 有选区时保留 textarea 原生行为。
    if (selectionStart !== selectionEnd) {
      return;
    }

    // 当前源码文本。
    const sourceValue = this.sourceTextarea.value;
    // 光标前的文本片段。
    const textBeforeCaret = sourceValue.slice(0, selectionStart);
    // 光标后的文本片段。
    const textAfterCaret = sourceValue.slice(selectionEnd);
    // 光标是否位于首行。
    const isCaretOnFirstLine = !textBeforeCaret.includes('\n');
    // 光标是否位于尾行。
    const isCaretOnLastLine = !textAfterCaret.includes('\n');
    // 仅在边界行触发跳出。
    const shouldLeaveTextarea =
      (event.key === 'ArrowUp' && isCaretOnFirstLine) ||
      (event.key === 'ArrowDown' && isCaretOnLastLine);
    if (!shouldLeaveTextarea) {
      return;
    }

    // 当前节点位置。
    const nodePosition = resolveNodePosition(this.getPos);
    if (nodePosition === null) {
      return;
    }

    event.preventDefault();

    // 按方向键选择公式块前/后边界位置。
    const targetPosition =
      event.key === 'ArrowUp'
        ? nodePosition
        : Math.min(nodePosition + this.node.nodeSize, this.view.state.doc.content.size);
    // 上键向前找位点，下键向后找位点。
    const selectionDirection = event.key === 'ArrowUp' ? -1 : 1;
    const transaction = this.view.state.tr
      .setSelection(this.createBoundarySelection(targetPosition, selectionDirection))
      .scrollIntoView();
    this.view.dispatch(transaction);
    // 显式将焦点交还给主编辑器。
    this.view.focus();
  };

  /**
   * 创建公式块边界选择，优先使用 GapCursor。
   */
  private createBoundarySelection(targetPosition: number, selectionDirection: -1 | 1): Selection {
    // 目标解析位置。
    const resolvedPosition = this.view.state.doc.resolve(targetPosition);
    // 带合法性判断的 GapCursor 构造器。
    const gapCursorConstructor = GapCursor as GapCursorConstructor;

    if (gapCursorConstructor.valid(resolvedPosition)) {
      return new GapCursor(resolvedPosition);
    }

    return TextSelection.near(resolvedPosition, selectionDirection);
  }

  /**
   * 源码输入框失焦后退出编辑态。
   */
  private readonly handleBlur = (): void => {
    if (this.isDeletingByBackspace) {
      return;
    }

    this.exitEditMode();
  };

  /**
   * 更新 DOM 与渲染结果。
   */
  private syncFromNode(node: ProseNode): void {
    // 当前公式源码。
    const formulaSource = typeof node.attrs.value === 'string' ? node.attrs.value : '';
    this.dom.dataset.value = formulaSource;
    this.sourceTextarea.value = formulaSource;
    this.renderMath(formulaSource);
  }

  /**
   * 渲染公式预览。
   */
  private renderMath(source: string): void {
    this.errorContainer.hidden = true;
    this.errorContainer.textContent = '';

    try {
      katex.render(source, this.previewContainer, {
        displayMode: true,
        throwOnError: true
      });
      this.previewContainer.appendChild(this.errorContainer);
    } catch {
      // 渲染失败时仅显示错误提示，不中断输入流程。
      this.previewContainer.textContent = source;
      this.errorContainer.hidden = false;
      this.errorContainer.textContent = this.messages.mathRenderError;
      this.previewContainer.appendChild(this.errorContainer);
    }
  }

  /**
   * 进入编辑态并展示源码输入区。
   */
  private enterEditMode(): void {
    if (!isEditorViewEditable(this.view)) {
      return;
    }

    this.sourceContainer.hidden = false;
    this.dom.classList.add('zt-md-math-block-editing');
    this.sourceTextarea.focus();
  }

  /**
   * 退出编辑态并隐藏源码输入区。
   */
  private exitEditMode(): void {
    this.sourceContainer.hidden = true;
    this.dom.classList.remove('zt-md-math-block-editing');
  }

  /**
   * 处理节点更新。
   */
  update(node: ProseNode): boolean {
    if (node.type.name !== MATH_BLOCK_NODE_NAME) {
      return false;
    }

    this.node = node;
    this.syncFromNode(node);
    return true;
  }

  /**
   * 节点被选中时进入编辑态。
   */
  selectNode(): void {
    this.enterEditMode();
  }

  /**
   * 节点取消选中时退出编辑态。
   */
  deselectNode(): void {
    this.exitEditMode();
  }

  /**
   * 允许输入框事件在 NodeView 内部消费。
   */
  stopEvent(event: Event): boolean {
    // 事件目标节点。
    const target = event.target;
    if (!(target instanceof Node)) {
      return false;
    }

    return this.sourceContainer.contains(target) || this.actionsContainer.contains(target);
  }

  /**
   * 忽略 NodeView 内部的 DOM 变更观察。
   */
  ignoreMutation(): boolean {
    return true;
  }

  /**
   * 销毁时解绑监听器。
   */
  destroy(): void {
    this.dom.removeEventListener('click', this.handleClick);
    this.dom.removeEventListener('pointerdown', this.handlePointerDown);
    this.dom.removeEventListener('pointermove', this.handlePointerMove);
    this.dom.removeEventListener('pointerup', this.handlePointerUp);
    this.dom.removeEventListener('pointercancel', this.handlePointerUp);
    this.copyButton.removeEventListener('click', this.handleCopyClick);
    this.deleteButton.removeEventListener('click', this.handleDeleteClick);
    this.sourceTextarea.removeEventListener('input', this.handleInput);
    this.sourceTextarea.removeEventListener('keydown', this.handleKeyDown);
    this.sourceTextarea.removeEventListener('blur', this.handleBlur);
    if (this.copyFeedbackTimer !== null) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }
    this.copyButton.innerHTML = copyIconMarkup;
    delete this.copyButton.dataset.copied;
  }
}

/**
 * 创建 math_block 的 NodeView 构造器。
 */
export const createMathBlockEditableNodeView = (
  messages: EditorI18nMessages = resolveEditorMessages()
): NodeViewConstructor => {
  return (node, view, getPos) => {
    // 将 NodeViewConstructor 的可选 getPos 统一收敛到当前实现可接受的类型范围。
    const resolvedGetPos =
      typeof getPos === 'function'
        ? () => {
            const nextPosition = getPos();
            return typeof nextPosition === 'number' ? nextPosition : 0;
          }
        : false;
    return new MathBlockEditableNodeView(node, view, resolvedGetPos, messages);
  };
};

