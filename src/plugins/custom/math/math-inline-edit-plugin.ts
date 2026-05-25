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
}

/**
 * 行内公式编辑插件状态。
 */
interface MathInlineEditState {
  /** 当前编辑节点位置。 */
  position: number | null;
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
export const openMathInlineEditor = (view: EditorView, position: number): void => {
  if (!isEditorViewEditable(view)) {
    return;
  }

  view.dispatch(view.state.tr.setMeta(mathInlineEditPluginKey, { type: 'open', position } as MathInlineEditMeta));
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
      this.sourceInput.select();
    });
  }

  /**
   * 提交当前输入值。
   */
  private commitCurrentValue(): void {
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
    const nextSelectionPosition = this.currentPosition + node.nodeSize;
    // 提交公式的事务。
    const transaction = this.view.state.tr.setNodeMarkup(this.currentPosition, undefined, {
      ...node.attrs,
      value: nextValue
    });
    transaction
      .setSelection(TextSelection.create(transaction.doc, nextSelectionPosition))
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
          return { position: null };
        },
        apply: (transaction, previousState) => {
          // 当前插件元数据。
          const meta = transaction.getMeta(mathInlineEditPluginKey) as MathInlineEditMeta | undefined;
          if (meta?.type === 'open' && typeof meta.position === 'number') {
            return { position: meta.position };
          }
          if (meta?.type === 'close') {
            return { position: null };
          }
          if (previousState.position === null || !transaction.docChanged) {
            return previousState;
          }

          // 映射后的节点位置。
          const mappedPosition = transaction.mapping.map(previousState.position, -1);
          // 映射后节点。
          const mappedNode = transaction.doc.nodeAt(mappedPosition);
          if (!isMathInlineNode(mappedNode)) {
            return { position: null };
          }

          return { position: mappedPosition };
        }
      },
      view: (view) => new MathInlineEditPluginView(view as EditorView, messages)
    });
  });
};
