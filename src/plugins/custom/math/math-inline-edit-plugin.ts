import katex from 'katex';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import type { EditorI18nMessages } from '../../../types/editor';

/**
 * math_inline 节点类型名。
 */
const MATH_INLINE_NODE_NAME = 'math_inline';
/**
 * 行内公式编辑插件 key。
 */
const MATH_INLINE_EDIT_PLUGIN_KEY = 'zt-md-math-inline-edit';
/**
 * 行内公式编辑插件元数据。
 */
interface MathInlineEditMeta {
  /** 操作类型。 */
  type: 'open' | 'close';
  /** 目标节点位置。 */
  position?: number;
  /** 进入输入框后的光标落点。 */
  caret?: 'start' | 'end';
}

/**
 * 行内公式编辑插件状态。
 */
interface MathInlineEditState {
  /** 当前编辑节点位置。 */
  position: number | null;
  /** 当前进入输入框的光标落点。 */
  caret: 'start' | 'end';
}

/**
 * 行内公式编辑插件 key 实例。
 */
export const mathInlineEditPluginKey = new PluginKey<MathInlineEditState>(MATH_INLINE_EDIT_PLUGIN_KEY);

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
 * 判断节点是否为行内公式。
 */
const isMathInlineNode = (node: ProseNode | null | undefined): node is ProseNode => {
  return node?.type.name === MATH_INLINE_NODE_NAME;
};

/**
 * 读取行内公式源码。
 */
const resolveInlineMathSource = (node: ProseNode): string => {
  return String(node.attrs.value ?? node.textContent ?? '');
};

/**
 * 打开指定行内公式节点编辑器。
 */
export const openMathInlineEditor = (
  view: EditorView,
  position: number,
  options?: { caret?: 'start' | 'end' }
): void => {
  if (!isEditorViewEditable(view)) {
    return;
  }

  view.dispatch(
    view.state.tr.setMeta(mathInlineEditPluginKey, {
      type: 'open',
      position,
      // 默认将光标置于末尾，兼容点击进入编辑的既有行为。
      caret: options?.caret === 'start' ? 'start' : 'end'
    } as MathInlineEditMeta)
  );
};

/**
 * 管理行内公式编辑器的插件视图。
 */
class MathInlineEditPluginView {
  // 编辑器视图。
  private view: EditorView;
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // 编辑器宿主节点。
  private readonly host: HTMLSpanElement;
  // 源码输入框。
  private readonly sourceInput: HTMLInputElement;
  // 渲染结果容器。
  private readonly previewContainer: HTMLSpanElement;
  // 渲染错误提示节点。
  private readonly errorContainer: HTMLSpanElement;
  // 当前编辑节点位置。
  private currentPosition: number | null = null;
  // 当前承载编辑器的行内公式 DOM。
  private currentMathInlineElement: HTMLElement | null = null;
  // 当前是否正在提交。
  private isCommitting = false;
  // 当前进入输入框的光标落点。
  private currentCaret: 'start' | 'end' = 'end';

  /**
   * 创建稳定的文本选区，避免极端位置构造失败。
   */
  private createSafeTextSelection(doc: ProseNode, position: number): TextSelection {
    try {
      return TextSelection.create(doc, position);
    } catch {
      return TextSelection.near(doc.resolve(position), -1);
    }
  }

  /**
   * 判断当前 input 光标是否位于可回退编辑器的边界。
   */
  private resolveArrowExitTarget(event: KeyboardEvent): number | null {
    if (this.currentPosition === null) {
      return null;
    }

    // 当前节点。
    const node = this.resolveCurrentNode();
    if (!node) {
      return null;
    }

    const selectionStart = this.sourceInput.selectionStart;
    const selectionEnd = this.sourceInput.selectionEnd;
    if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) {
      return null;
    }

    if (event.key === 'ArrowLeft' && selectionStart === 0) {
      return this.currentPosition;
    }

    const sourceLength = this.sourceInput.value.length;
    if (event.key === 'ArrowRight' && selectionStart === sourceLength) {
      return this.currentPosition + node.nodeSize;
    }

    return null;
  }

  /**
   * 判断当前 input 是否命中首位 Backspace 删除整节点。
   */
  private shouldDeleteMathInlineOnBackspace(event: KeyboardEvent): boolean {
    if (event.key !== 'Backspace' || this.currentPosition === null) {
      return false;
    }

    const selectionStart = this.sourceInput.selectionStart;
    const selectionEnd = this.sourceInput.selectionEnd;
    if (selectionStart === null || selectionEnd === null) {
      return false;
    }

    if (selectionStart !== 0 || selectionEnd !== 0) {
      return false;
    }

    return Boolean(this.resolveCurrentNode());
  }

  /**
   * 删除当前行内公式并将焦点回退到编辑器文本光标。
   */
  private deleteCurrentMathInlineAndFocusEditor(): void {
    if (this.currentPosition === null) {
      return;
    }

    // 当前节点。
    const node = this.resolveCurrentNode();
    if (!node) {
      this.closeEditor(false);
      return;
    }

    const deleteFrom = this.currentPosition;
    const deleteTo = this.currentPosition + node.nodeSize;
    const transaction = this.view.state.tr.delete(deleteFrom, deleteTo);
    transaction
      .setSelection(this.createSafeTextSelection(transaction.doc, deleteFrom))
      .setMeta(mathInlineEditPluginKey, { type: 'close' } as MathInlineEditMeta)
      .scrollIntoView();
    this.view.dispatch(transaction);
    this.view.focus();
  }

  /**
   * 初始化行内公式编辑器插件视图。
   */
  constructor(view: EditorView, messages: EditorI18nMessages) {
    this.view = view;
    this.messages = messages;
    this.host = document.createElement('span');
    this.host.className = 'zt-md-math-inline-editor';
    this.host.style.display = 'none';

    this.sourceInput = document.createElement('input');
    this.sourceInput.type = 'text';
    this.sourceInput.className = 'zt-md-math-inline-editor-input';
    this.sourceInput.setAttribute('aria-label', this.messages.mathBlockSourceAriaLabel);
    this.sourceInput.spellcheck = false;

    this.previewContainer = document.createElement('span');
    this.previewContainer.className = 'zt-md-math-inline-editor-preview';

    this.errorContainer = document.createElement('span');
    this.errorContainer.className = 'zt-md-math-inline-editor-error';
    this.errorContainer.hidden = true;

    this.host.append(this.sourceInput, this.previewContainer, this.errorContainer);
    this.sourceInput.addEventListener('input', this.handleInput);
    this.sourceInput.addEventListener('beforeinput', this.handleBeforeInput);
    this.sourceInput.addEventListener('keydown', this.handleKeyDown);
    this.sourceInput.addEventListener('blur', this.handleBlur);
    this.host.addEventListener('mousedown', this.handleMouseDown);
    this.update(view);
  }

  /**
   * 阻止编辑器控件点击抢走 ProseMirror 选区。
   */
  private readonly handleMouseDown = (event: MouseEvent): void => {
    event.stopPropagation();
  };

  /**
   * 阻止原生输入事件冒泡到 ProseMirror。
   */
  private readonly handleBeforeInput = (event: InputEvent): void => {
    event.stopPropagation();
  };

  /**
   * 响应源码输入，更新本地预览。
   */
  private readonly handleInput = (event: Event): void => {
    event.stopPropagation();
    this.renderMath(this.sourceInput.value);
  };

  /**
   * 响应键盘提交或取消。
   */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation();

    // 在 input 首位按 Backspace 时删除整条行内公式。
    if (this.shouldDeleteMathInlineOnBackspace(event)) {
      event.preventDefault();
      this.deleteCurrentMathInlineAndFocusEditor();
      return;
    }

    // 在 input 首尾按方向键时，提交并回到编辑器文本光标。
    const arrowExitTarget = this.resolveArrowExitTarget(event);
    if (arrowExitTarget !== null) {
      event.preventDefault();
      this.commitCurrentValue(arrowExitTarget);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitCurrentValue();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeEditor(true);
    }
  };

  /**
   * 失焦时提交当前输入。
   */
  private readonly handleBlur = (): void => {
    if (this.isCommitting || this.currentPosition === null) {
      return;
    }

    this.commitCurrentValue();
  };

  /**
   * 渲染公式预览。
   */
  private renderMath(source: string): void {
    this.errorContainer.hidden = true;
    this.errorContainer.textContent = '';
    this.previewContainer.textContent = '';

    try {
      katex.render(source, this.previewContainer, {
        displayMode: false,
        throwOnError: true
      });
    } catch {
      // 渲染失败时保留源码与错误提示，不中断继续输入。
      this.previewContainer.textContent = source;
      this.errorContainer.hidden = false;
      this.errorContainer.textContent = this.messages.mathRenderError;
    }
  }

  /**
   * 读取当前编辑的行内公式节点。
   */
  private resolveCurrentNode(): ProseNode | null {
    if (this.currentPosition === null) {
      return null;
    }

    // 当前节点。
    const node = this.view.state.doc.nodeAt(this.currentPosition);
    return isMathInlineNode(node) ? node : null;
  }

  /**
   * 打开编辑器并载入源码。
   */
  private openEditor(position: number): void {
    if (!isEditorViewEditable(this.view)) {
      this.closeEditor(false);
      return;
    }

    // 当前节点。
    const node = this.view.state.doc.nodeAt(position);
    if (!isMathInlineNode(node)) {
      this.closeEditor(false);
      return;
    }

    this.currentPosition = position;
    this.sourceInput.value = resolveInlineMathSource(node);
    this.renderMath(this.sourceInput.value);
    // 当前公式 DOM。
    const mathInlineElement = this.resolveMathInlineElement(position);
    if (!mathInlineElement) {
      this.closeEditor(false);
      return;
    }

    this.currentMathInlineElement = mathInlineElement;
    mathInlineElement.dataset.editing = 'true';
    mathInlineElement.append(this.host);
    this.host.style.display = 'inline-flex';
    requestAnimationFrame(() => {
      if (this.currentPosition !== position) {
        return;
      }

      this.sourceInput.focus();
      const sourceLength = this.sourceInput.value.length;
      // 按进入方向设置光标位置，避免默认整段选中影响连续输入体验。
      if (this.currentCaret === 'start') {
        this.sourceInput.setSelectionRange(0, 0);
        return;
      }

      this.sourceInput.setSelectionRange(sourceLength, sourceLength);
    });
  }

  /**
   * 提交当前输入值。
   */
  private commitCurrentValue(targetSelectionPosition?: number): void {
    if (this.currentPosition === null) {
      return;
    }

    // 当前节点。
    const node = this.resolveCurrentNode();
    if (!node) {
      this.closeEditor(false);
      return;
    }

    // 最新公式源码。
    const nextValue = this.sourceInput.value;
    // 公式节点后的光标位置。
    const nextSelectionPosition =
      typeof targetSelectionPosition === 'number' ? targetSelectionPosition : this.currentPosition + node.nodeSize;
    // 提交公式的事务。
    const transaction = this.view.state.tr.setNodeMarkup(this.currentPosition, undefined, {
      ...node.attrs,
      value: nextValue
    });
    transaction
      .setSelection(this.createSafeTextSelection(transaction.doc, nextSelectionPosition))
      .setMeta(mathInlineEditPluginKey, { type: 'close' } as MathInlineEditMeta)
      .scrollIntoView();
    this.isCommitting = true;
    this.view.dispatch(transaction);
    this.isCommitting = false;
    this.view.focus();
  }

  /**
   * 关闭编辑器。
   */
  private closeEditor(shouldDispatch: boolean): void {
    if (this.currentMathInlineElement) {
      this.currentMathInlineElement.dataset.editing = 'false';
    }
    this.currentPosition = null;
    this.currentMathInlineElement = null;
    this.host.style.display = 'none';
    this.host.remove();
    if (shouldDispatch) {
      this.view.dispatch(this.view.state.tr.setMeta(mathInlineEditPluginKey, { type: 'close' } as MathInlineEditMeta));
    }
  }

  /**
   * 解析当前行内公式 DOM。
   */
  private resolveMathInlineElement(position: number): HTMLElement | null {
    // 当前公式 DOM。
    const nodeDom = this.view.nodeDOM(position);
    return nodeDom instanceof HTMLElement ? nodeDom : null;
  }

  /**
   * 同步插件状态与视图。
   */
  update(view: EditorView): void {
    this.view = view;
    if (!isEditorViewEditable(view)) {
      this.closeEditor(false);
      return;
    }

    // 当前插件状态。
    const pluginState = mathInlineEditPluginKey.getState(view.state);
    if (!pluginState || pluginState.position === null) {
      if (this.currentPosition !== null) {
        this.closeEditor(false);
      }
      return;
    }

    if (this.currentPosition !== pluginState.position) {
      this.currentCaret = pluginState.caret;
      this.openEditor(pluginState.position);
      return;
    }

    if (!this.resolveCurrentNode()) {
      this.closeEditor(true);
      return;
    }
  }

  /**
   * 销毁插件视图。
   */
  destroy(): void {
    this.sourceInput.removeEventListener('input', this.handleInput);
    this.sourceInput.removeEventListener('beforeinput', this.handleBeforeInput);
    this.sourceInput.removeEventListener('keydown', this.handleKeyDown);
    this.sourceInput.removeEventListener('blur', this.handleBlur);
    this.host.removeEventListener('mousedown', this.handleMouseDown);
    if (this.currentMathInlineElement) {
      this.currentMathInlineElement.dataset.editing = 'false';
    }
    this.host.remove();
  }
}

/**
 * 创建行内公式编辑插件。
 */
export const createMathInlineEditPlugin = (
  messages: EditorI18nMessages,
  // 保留 Portal 参数以维持创建入口签名与其他浮层插件一致。
  _portalContainer: HTMLElement
): ReturnType<typeof $prose> => {
  return $prose(() => {
    return new Plugin<MathInlineEditState>({
      key: mathInlineEditPluginKey,
      state: {
        init: () => {
          return { position: null, caret: 'end' };
        },
        apply: (transaction, previousState) => {
          // 当前插件元数据。
          const meta = transaction.getMeta(mathInlineEditPluginKey) as MathInlineEditMeta | undefined;
          if (meta?.type === 'open' && typeof meta.position === 'number') {
            return { position: meta.position, caret: meta.caret === 'start' ? 'start' : 'end' };
          }
          if (meta?.type === 'close') {
            return { position: null, caret: 'end' };
          }
          if (previousState.position === null || !transaction.docChanged) {
            return previousState;
          }

          // 映射后的节点位置。
          const mappedPosition = transaction.mapping.map(previousState.position, -1);
          // 映射后节点。
          const mappedNode = transaction.doc.nodeAt(mappedPosition);
          if (!isMathInlineNode(mappedNode)) {
            return { position: null, caret: 'end' };
          }

          return { position: mappedPosition, caret: previousState.caret };
        }
      },
      view: (view) => new MathInlineEditPluginView(view as EditorView, messages)
    });
  });
};
