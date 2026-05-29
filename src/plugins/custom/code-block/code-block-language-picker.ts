import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Fragment, createElement, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { refractor } from 'refractor';
import type { EditorI18nMessages } from '../../../types/editor';
import { FloatingPortalPanel, useFloatingPortalPanel } from '../floating-portal-panel';
import {
  createOverlayRepositionScheduler,
  resolveEditorWrapper,
  toContentAnchor,
  toPortalPosition
} from '../../../lib/editor-overlay-position';

// 代码块节点名称。
const CODE_BLOCK_NODE_NAME = 'code_block';
// 代码块语言选择器插件 key。
const CODE_BLOCK_LANGUAGE_PICKER_PLUGIN_KEY = 'ZT_MD_CODE_BLOCK_LANGUAGE_PICKER';
// 右下角横向偏移（像素）。
const CODE_BLOCK_LANGUAGE_PICKER_OFFSET_X = 104;
// 右下角纵向偏移（像素）。
const CODE_BLOCK_LANGUAGE_PICKER_OFFSET_Y = 36;
// 纯文本语言值。
const PLAIN_TEXT_LANGUAGE_VALUE = 'text';
// 语言面板首帧定位宽度兜底。
const CODE_BLOCK_LANGUAGE_PICKER_PANEL_WIDTH = 224;
// 语言面板首帧定位高度兜底。
const CODE_BLOCK_LANGUAGE_PICKER_PANEL_HEIGHT = 220;
// 语言展示名映射表。
const LANGUAGE_LABEL_MAP: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  markdown: 'Markdown',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  sql: 'SQL',
  xml: 'XML'
};

/**
 * 规范化代码块语言值。
 */
const normalizeCodeBlockLanguage = (language: string): string => {
  const normalizedLanguage = language.trim().toLowerCase();
  if (!normalizedLanguage) {
    return PLAIN_TEXT_LANGUAGE_VALUE;
  }

  return normalizedLanguage;
};

/**
 * 可选语言项。
 */
interface CodeLanguageOption {
  /** 语言值。 */
  value: string;
  /** 展示文本。 */
  label: string;
}

/**
 * 当前聚焦代码块信息。
 */
interface FocusedCodeBlock {
  /** 代码块节点位置。 */
  position: number;
  /** 代码块节点。 */
  node: ProseNode;
}

/**
 * 解析语言展示文本。
 */
const resolveLanguageLabel = (language: string): string => {
  const normalizedLanguage = normalizeCodeBlockLanguage(language);

  return LANGUAGE_LABEL_MAP[normalizedLanguage] ?? normalizedLanguage;
};

/**
 * 解析语言下拉项列表。
 */
const resolveLanguageOptions = (messages: EditorI18nMessages): CodeLanguageOption[] => {
  // refractor 支持的语言值集合。
  const supportedLanguages = refractor.listLanguages();
  // 语言去重集合。
  const languageSet = new Set(
    supportedLanguages
      .map((language) => normalizeCodeBlockLanguage(language))
      .filter((language) => language !== PLAIN_TEXT_LANGUAGE_VALUE)
  );
  // 排序后的语言集合。
  const sortedLanguages = [...languageSet].sort((left, right) => left.localeCompare(right));

  return [
    {
      value: PLAIN_TEXT_LANGUAGE_VALUE,
      label: messages.codeBlockLanguagePlainText
    },
    ...sortedLanguages.map((language) => ({
      value: language,
      label: resolveLanguageLabel(language)
    }))
  ];
};

/**
 * 解析当前选区所在代码块。
 */
const resolveFocusedCodeBlock = (view: EditorView): FocusedCodeBlock | null => {
  // 当前选区起点。
  const selectionFrom = view.state.selection.$from;
  for (let depth = selectionFrom.depth; depth >= 0; depth -= 1) {
    // 当前深度节点。
    const node = selectionFrom.node(depth);
    if (node.type.name !== CODE_BLOCK_NODE_NAME) {
      continue;
    }

    return {
      position: depth === 0 ? 0 : selectionFrom.before(depth),
      node
    };
  }

  return null;
};

/**
 * 解析代码块对应 pre 元素。
 */
const resolveCodeBlockPreElement = (view: EditorView, nodePosition: number): HTMLPreElement | null => {
  // 当前代码块节点 DOM。
  const nodeDom = view.nodeDOM(nodePosition);
  if (nodeDom instanceof HTMLPreElement) {
    return nodeDom;
  }
  if (!(nodeDom instanceof HTMLElement)) {
    return null;
  }

  return nodeDom.querySelector('pre');
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
 * 代码块语言选择器视图属性。
 */
interface CodeBlockLanguagePickerProps {
  /** 当前语言值。 */
  currentLanguage: string;
  /** 编辑器文案。 */
  messages: EditorI18nMessages;
  /** 编辑器浮层容器。 */
  portalContainer: HTMLElement;
  /** 浮层碰撞边界。 */
  collisionBoundary: HTMLElement | null;
  /** 语言切换回调。 */
  onSelectLanguage: (language: string) => void;
}

/**
 * 渲染代码块语言选择器。
 */
const CodeBlockLanguagePicker = (props: CodeBlockLanguagePickerProps): ReactElement => {
  // 面板展开状态。
  const [open, setOpen] = useState(false);
  // 搜索关键字。
  const [keyword, setKeyword] = useState('');
  // 当前规范化语言值。
  const normalizedCurrentLanguage = normalizeCodeBlockLanguage(props.currentLanguage);
  // 当前语言显示文本。
  const currentLanguageLabel = resolveLanguageLabel(normalizedCurrentLanguage);
  // 语言选项列表。
  const languageOptions = useMemo(() => resolveLanguageOptions(props.messages), [props.messages]);
  // 过滤后的语言列表。
  const filteredOptions = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return languageOptions;
    }

    return languageOptions.filter((option) => {
      const optionLabel = option.label.toLowerCase();
      const optionValue = option.value.toLowerCase();
      return optionLabel.includes(normalizedKeyword) || optionValue.includes(normalizedKeyword);
    });
  }, [keyword, languageOptions]);
  // 语言面板浮层定位。
  const panel = useFloatingPortalPanel({
    open,
    portalContainer: props.portalContainer,
    editorWrapper: props.collisionBoundary,
    horizontalAlign: 'end',
    offsetY: 6,
    fallbackWidth: CODE_BLOCK_LANGUAGE_PICKER_PANEL_WIDTH,
    fallbackHeight: CODE_BLOCK_LANGUAGE_PICKER_PANEL_HEIGHT,
    onOutside: () => setOpen(false)
  });

  /**
   * 判断事件目标是否允许保留默认聚焦行为。
   */
  const isFocusAllowedTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null;
  };

  /**
   * 阻止非输入控件点击导致编辑器选区丢失。
   */
  const handleMouseDown = (event: ReactMouseEvent): void => {
    if (isFocusAllowedTarget(event.target)) {
      return;
    }

    event.preventDefault();
  };

  /**
   * 切换语言面板展开状态。
   */
  const handleTriggerClick = (): void => {
    if (open) {
      setOpen(false);
      return;
    }

    panel.updatePosition();
    setOpen(true);
  };

  /**
   * 选择目标语言。
   */
  const handleSelectLanguage = (language: string): void => {
    props.onSelectLanguage(language);
    setOpen(false);
    setKeyword('');
  };

  useEffect(() => {
    setOpen(false);
    setKeyword('');
  }, [props.currentLanguage]);

  return createElement(
    Fragment,
    null,
    createElement(
      'div',
      {
        className: 'zt-md-code-language-picker',
        onMouseDown: handleMouseDown
      },
      createElement(
        'button',
        {
          ref: panel.triggerRef,
          type: 'button',
          className: 'zt-md-code-language-picker-trigger',
          'aria-expanded': open,
          'aria-label': currentLanguageLabel,
          onClick: handleTriggerClick
        },
        createElement('span', { className: 'zt-md-code-language-picker-trigger-label' }, currentLanguageLabel),
        createElement(ChevronDown, {
          className: 'zt-md-code-language-picker-trigger-icon',
          size: 14,
          strokeWidth: 2,
          'aria-hidden': 'true'
        })
      )
    ),
    createElement(
      FloatingPortalPanel,
      {
        panel,
        portalContainer: props.portalContainer,
        className: 'zt-md-code-language-picker-panel',
        onMouseDown: handleMouseDown
      },
      createElement(
        'label',
        {
          className: 'zt-md-code-language-picker-search'
        },
        createElement(Search, {
          className: 'zt-md-code-language-picker-search-icon',
          size: 14,
          strokeWidth: 2,
          'aria-hidden': 'true'
        }),
        createElement('input', {
          value: keyword,
          onChange: (event) => setKeyword(event.currentTarget.value),
          placeholder: props.messages.codeBlockLanguageSearchPlaceholder,
          className: 'zt-md-code-language-picker-search-input'
        })
      ),
      createElement(
        'div',
        {
          className: 'zt-md-code-language-picker-options',
          role: 'listbox'
        },
        filteredOptions.length > 0
          ? filteredOptions.map((option) =>
              createElement(
                'button',
                {
                  key: option.value || '__plain_text__',
                  type: 'button',
                  className: 'zt-md-code-language-picker-option',
                  'data-selected': option.value === normalizedCurrentLanguage ? 'true' : 'false',
                  onClick: () => handleSelectLanguage(option.value)
                },
                createElement('span', null, option.label),
                option.value === normalizedCurrentLanguage
                  ? createElement(Check, {
                      className: 'zt-md-code-language-picker-option-check',
                      size: 14,
                      strokeWidth: 2,
                      'aria-hidden': 'true'
                    })
                  : null
              )
            )
          : createElement(
              'div',
              {
                className: 'zt-md-code-language-picker-empty'
              },
              '-'
            )
        )
      )
    );
};

/**
 * 管理代码块语言选择器的插件视图。
 */
class CodeBlockLanguagePickerView {
  // 编辑器视图。
  private view: EditorView;
  // 编辑器文案。
  private readonly messages: EditorI18nMessages;
  // Portal 容器。
  private readonly portalContainer: HTMLElement;
  // 编辑器滚动容器。
  private readonly editorWrapper: HTMLElement | null;
  // 选择器宿主节点。
  private readonly host: HTMLSpanElement;
  // React 挂载根节点。
  private readonly hostRoot: Root;
  // 当前绑定代码块位置。
  private currentCodeBlockPosition: number | null = null;
  // 当前绑定 pre 元素。
  private currentPreElement: HTMLPreElement | null = null;
  // 当前渲染的语言值。
  private currentRenderedLanguage: string | null = null;
  // 当前定位上下文是否有效。
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
    this.host = document.createElement('span');
    this.host.className = 'zt-md-code-language-picker-host';
    this.hostRoot = createRoot(this.host);
    this.repositionScheduler.bindGlobal();
    this.repositionScheduler.bindWrapper(this.editorWrapper);
    this.update(view);
  }

  /**
   * 写回代码块语言属性。
   */
  private applyLanguage(language: string): void {
    if (this.currentCodeBlockPosition === null) {
      return;
    }

    // 当前代码块节点。
    const codeBlockNode = this.view.state.doc.nodeAt(this.currentCodeBlockPosition);
    if (!codeBlockNode || codeBlockNode.type.name !== CODE_BLOCK_NODE_NAME) {
      return;
    }

    // 规范化后的目标语言值。
    const normalizedLanguage = normalizeCodeBlockLanguage(language);
    // 下一版属性。
    const nextAttrs = {
      ...codeBlockNode.attrs,
      language: normalizedLanguage
    };
    const currentLanguage = normalizeCodeBlockLanguage(String(codeBlockNode.attrs.language ?? ''));
    if (currentLanguage === normalizedLanguage) {
      return;
    }

    const transaction = this.view.state.tr.setNodeMarkup(
      this.currentCodeBlockPosition,
      codeBlockNode.type,
      nextAttrs,
      codeBlockNode.marks
    );
    this.view.dispatch(transaction);
    this.view.focus();
  }

  /**
   * 刷新选择器渲染。
   */
  private render(language: string): void {
    if (this.currentRenderedLanguage !== null && this.currentRenderedLanguage === language) {
      return;
    }

    this.hostRoot.render(
      createElement(CodeBlockLanguagePicker, {
        currentLanguage: language,
        messages: this.messages,
        portalContainer: this.portalContainer,
        collisionBoundary: this.editorWrapper,
        onSelectLanguage: (nextLanguage) => this.applyLanguage(nextLanguage)
      })
    );
    this.host.dataset.mounted = 'true';
    this.currentRenderedLanguage = language;
  }

  /**
   * 卸载当前选择器。
   */
  private detach(): void {
    this.hostRoot.render(null);
    delete this.host.dataset.mounted;
    this.host.remove();
    this.currentCodeBlockPosition = null;
    this.currentPreElement = null;
    this.currentRenderedLanguage = null;
    this.hasPositionContext = false;
  }

  /**
   * 更新选择器浮层定位。
   */
  private updateOverlayPosition(): void {
    if (!this.editorWrapper || !this.currentPreElement || this.host.parentElement !== this.portalContainer) {
      return;
    }

    const preRect = this.currentPreElement.getBoundingClientRect();
    const anchor = toContentAnchor(preRect, this.editorWrapper);
    const portalPosition = toPortalPosition(
      {
        wrapper: this.editorWrapper,
        anchor: {
          anchorLeftInContent: anchor.anchorLeftInContent + preRect.width - CODE_BLOCK_LANGUAGE_PICKER_OFFSET_X,
          anchorTopInContent: anchor.anchorTopInContent + preRect.height - CODE_BLOCK_LANGUAGE_PICKER_OFFSET_Y,
          anchorBottomInContent: anchor.anchorTopInContent + preRect.height - CODE_BLOCK_LANGUAGE_PICKER_OFFSET_Y
        },
        overlaySize: { width: 96 },
        placement: 'top',
        offsetY: 0,
        boundaryInset: 2
      },
      this.portalContainer
    );

    this.host.style.left = `${portalPosition.left}px`;
    this.host.style.top = `${portalPosition.top}px`;
  }

  /**
   * 更新插件视图。
   */
  update(view: EditorView): void {
    this.view = view;
    if (!isEditorViewEditable(view) || !this.editorWrapper) {
      this.detach();
      return;
    }

    // 当前聚焦代码块。
    const focusedCodeBlock = resolveFocusedCodeBlock(view);
    if (!focusedCodeBlock) {
      this.detach();
      return;
    }

    const preElement = resolveCodeBlockPreElement(view, focusedCodeBlock.position);
    if (!preElement) {
      this.detach();
      return;
    }

    if (this.host.parentElement !== this.portalContainer) {
      this.portalContainer.append(this.host);
    }

    const currentLanguage = normalizeCodeBlockLanguage(String(focusedCodeBlock.node.attrs.language ?? ''));
    const shouldSkipRender =
      this.currentCodeBlockPosition === focusedCodeBlock.position &&
      this.currentPreElement === preElement &&
      this.currentRenderedLanguage !== null &&
      this.currentRenderedLanguage === currentLanguage;
    this.currentCodeBlockPosition = focusedCodeBlock.position;
    this.currentPreElement = preElement;
    this.hasPositionContext = true;
    this.updateOverlayPosition();
    this.repositionScheduler.schedule();
    if (shouldSkipRender) {
      return;
    }

    this.render(currentLanguage);
  }

  /**
   * 销毁插件视图。
   */
  destroy(): void {
    this.detach();
    this.repositionScheduler.destroy();
    this.hostRoot.unmount();
  }
}

/**
 * 创建代码块语言选择器插件。
 */
export const createCodeBlockLanguagePickerPlugin = (
  messages: EditorI18nMessages,
  portalContainer: HTMLElement
): ReturnType<typeof $prose> => {
  return $prose(() => {
    return new Plugin({
      key: new PluginKey(CODE_BLOCK_LANGUAGE_PICKER_PLUGIN_KEY),
      view: (view) => new CodeBlockLanguagePickerView(view as EditorView, messages, portalContainer)
    });
  });
};

