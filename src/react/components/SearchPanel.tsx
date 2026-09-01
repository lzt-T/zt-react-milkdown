import { ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react';
import type { ChangeEvent, MutableRefObject } from 'react';
import { Button } from '@/components/ui/button';
import type { EditorI18nMessages } from '@/types/editor';
import type {
  EditorSearchBooleanOption,
  EditorSearchOptions,
  EditorSearchSnapshot
} from '@/plugins/custom/search';

/**
 * 定义搜索面板属性。
 */
interface SearchPanelProps {
  /** 当前搜索参数。 */
  options: EditorSearchOptions;
  /** 当前搜索结果快照。 */
  snapshot: EditorSearchSnapshot;
  /** 当前编辑器文案。 */
  messages: EditorI18nMessages;
  /** 当前编辑器是否只读。 */
  readOnly: boolean;
  /** 替换区域是否展开。 */
  isReplaceExpanded: boolean;
  /** 搜索输入框引用。 */
  searchInputRef: MutableRefObject<HTMLInputElement | null>;
  /** 搜索文本变化回调。 */
  onSearchChange: (value: string) => void;
  /** 替换文本变化回调。 */
  onReplaceChange: (value: string) => void;
  /** 搜索选项切换回调。 */
  onOptionToggle: (option: EditorSearchBooleanOption) => void;
  /** 替换区域展开状态切换回调。 */
  onReplaceExpandedToggle: () => void;
  /** 定位上一项回调。 */
  onFindPrevious: () => void;
  /** 定位下一项回调。 */
  onFindNext: () => void;
  /** 替换当前项回调。 */
  onReplaceCurrent: () => void;
  /** 全部替换回调。 */
  onReplaceAll: () => void;
  /** 关闭面板回调。 */
  onClose: () => void;
}

/**
 * 渲染编辑器搜索与替换面板。
 */
export const SearchPanel = (props: SearchPanelProps): JSX.Element => {
  // 搜索导航与替换操作是否不可用。
  const isActionDisabled = props.snapshot.total === 0 || props.snapshot.isInvalidExpression;

  /**
   * 处理搜索文本输入。
   */
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    props.onSearchChange(event.target.value);
  };

  /**
   * 处理替换文本输入。
   */
  const handleReplaceChange = (event: ChangeEvent<HTMLInputElement>): void => {
    props.onReplaceChange(event.target.value);
  };

  /**
   * 切换区分大小写选项。
   */
  const handleCaseSensitiveToggle = (): void => {
    props.onOptionToggle('caseSensitive');
  };

  /**
   * 切换全词匹配选项。
   */
  const handleWholeWordToggle = (): void => {
    props.onOptionToggle('wholeWord');
  };

  /**
   * 切换正则表达式选项。
   */
  const handleRegexpToggle = (): void => {
    props.onOptionToggle('regexp');
  };

  return (
    <section
      className="zt-md-search-panel"
      role="search"
      aria-label={props.messages.searchPanelAriaLabel}
    >
      <div className="zt-md-search-row zt-md-search-main-row">
        {!props.readOnly ? (
          <Button
            className="zt-md-search-icon-button zt-md-search-replace-toggle"
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.messages.searchReplaceLabel}
            aria-expanded={props.isReplaceExpanded}
            title={props.messages.searchReplaceLabel}
            onClick={props.onReplaceExpandedToggle}
          >
            <ChevronRight />
          </Button>
        ) : null}
        <input
          ref={props.searchInputRef}
          className="zt-md-search-input"
          type="text"
          value={props.options.search}
          placeholder={props.messages.searchInputPlaceholder}
          aria-label={props.messages.searchInputPlaceholder}
          aria-invalid={props.snapshot.isInvalidExpression}
          onChange={handleSearchChange}
        />
        <div
          className="zt-md-search-options"
          role="group"
          aria-label={props.messages.searchPanelAriaLabel}
        >
          <Button
            className="zt-md-search-option"
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={props.options.caseSensitive}
            aria-label={props.messages.searchCaseSensitiveLabel}
            title={props.messages.searchCaseSensitiveLabel}
            onClick={handleCaseSensitiveToggle}
          >
            Aa
          </Button>
          <Button
            className="zt-md-search-option"
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={props.options.wholeWord}
            aria-label={props.messages.searchWholeWordLabel}
            title={props.messages.searchWholeWordLabel}
            onClick={handleWholeWordToggle}
          >
            W
          </Button>
          <Button
            className="zt-md-search-option"
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={props.options.regexp}
            aria-label={props.messages.searchRegexpLabel}
            title={props.messages.searchRegexpLabel}
            onClick={handleRegexpToggle}
          >
            .*
          </Button>
        </div>
        <output className="zt-md-search-count" aria-live="polite">
          {props.snapshot.current} / {props.snapshot.total}
        </output>
        <div className="zt-md-search-navigation">
          <div className="zt-md-search-navigation-buttons">
            <Button
              className="zt-md-search-icon-button"
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={props.messages.searchPreviousAriaLabel}
              title={props.messages.searchPreviousAriaLabel}
              disabled={isActionDisabled}
              onClick={props.onFindPrevious}
            >
              <ChevronUp />
            </Button>
            <Button
              className="zt-md-search-icon-button"
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={props.messages.searchNextAriaLabel}
              title={props.messages.searchNextAriaLabel}
              disabled={isActionDisabled}
              onClick={props.onFindNext}
            >
              <ChevronDown />
            </Button>
          </div>
          <Button
            className="zt-md-search-icon-button zt-md-search-close-button"
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.messages.searchCloseAriaLabel}
            title={props.messages.searchCloseAriaLabel}
            onClick={props.onClose}
          >
            <X />
          </Button>
        </div>
      </div>

      {props.snapshot.isInvalidExpression ? (
        <span className="zt-md-search-error" role="alert">
          {props.messages.searchInvalidRegexp}
        </span>
      ) : null}

      {!props.readOnly && props.isReplaceExpanded ? (
        <div className="zt-md-search-row zt-md-search-replace-row">
          <input
            className="zt-md-search-input"
            type="text"
            value={props.options.replace}
            placeholder={props.messages.searchReplaceInputPlaceholder}
            aria-label={props.messages.searchReplaceInputPlaceholder}
            onChange={handleReplaceChange}
          />
          <Button
            className="zt-md-search-action-button zt-md-search-action-primary"
            type="button"
            variant="default"
            size="sm"
            disabled={isActionDisabled}
            onClick={props.onReplaceCurrent}
          >
            {props.messages.searchReplaceLabel}
          </Button>
          <Button
            className="zt-md-search-action-button"
            type="button"
            variant="outline"
            size="sm"
            disabled={isActionDisabled}
            onClick={props.onReplaceAll}
          >
            {props.messages.searchReplaceAllLabel}
          </Button>
        </div>
      ) : null}
    </section>
  );
};
