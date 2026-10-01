import { editorViewCtx } from '@milkdown/core';
import { undo, redo } from '@milkdown/prose/history';
import { TextSelection } from '@milkdown/prose/state';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { openMathInlineEditor } from '@/plugins/custom/math/math-inline-edit-plugin';
import { showImageUploadDialog } from '@/plugins/custom/image/image-upload-dialog';
import { updateEditorMessages } from '@/local/message-updates';
import type { EditorLocale, SlashMenuConfig } from '@/types/editor';

// 测试中创建的实例，按实际生命周期销毁。
const runtimes: MilkdownEditorRuntime[] = [];
// 测试宿主节点。
const hosts: HTMLElement[] = [];

/** 创建带真实 Milkdown 插件和 Portal 的编辑器。 */
const mountRuntime = async (markdown: string, locale: EditorLocale = 'zh-CN', slashMenu?: SlashMenuConfig) => {
  // 编辑器主题宿主。
  const host = document.createElement('div');
  host.className = 'zt-md zt-md-light';
  // 编辑区滚动视口。
  const wrapper = document.createElement('div');
  wrapper.className = 'zt-md-editor';
  // ProseMirror 挂载节点。
  const root = document.createElement('div');
  // 两层浮层宿主。
  const portal = document.createElement('div');
  // 内容附属浮层宿主。
  const contentPortal = document.createElement('div');
  wrapper.append(root, contentPortal);
  host.append(wrapper, portal);
  document.body.append(host);
  hosts.push(host);
  // 内容与搜索状态回调。
  const onChange = vi.fn();
  // 搜索状态回调。
  const onSearchSnapshotChange = vi.fn();
  // 真实运行时。
  const runtime = createMilkdownEditorRuntime({
    root, portalContainer: portal, contentPortalContainer: contentPortal,
    markdown, locale, messages: resolveEditorMessages(locale), slashMenu,
    readOnly: false, shortcutMode: 'modShift', onChange, onSearchSnapshotChange
  });
  runtimes.push(runtime);
  await act(async () => { await runtime.editor.create(); runtime.installRuntimePlugins(); });
  // 实际 ProseMirror 视图。
  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx));
  return { runtime, view, wrapper, portal, onChange, onSearchSnapshotChange };
};

afterEach(async () => {
  await act(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.editor.destroy();
  });
  hosts.splice(0).forEach((host) => host.remove());
});

describe('运行时国际化', () => {
  it('保留真实历史、搜索状态、选区和滚动位置，不产生文档事件', async () => {
    // 真实编辑器及回调。
    const { runtime, view, wrapper, onChange, onSearchSnapshotChange } = await mountRuntime('hello hello');
    view.dispatch(view.state.tr.insertText('!', 1));
    expect(undo(view.state, view.dispatch)).toBe(true);
    runtime.searchController.updateQuery({ search: 'hello', replace: 'world', caseSensitive: false, wholeWord: false, regexp: false });
    wrapper.scrollTop = 123;
    // 切换前完整状态对象及视图。
    const state = view.state;
    // 搜索快照回调次数。
    const snapshotCount = onSearchSnapshotChange.mock.calls.length;
    // 内容事件次数。
    const changeCount = onChange.mock.calls.length;
    await act(async () => runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(runtime.editor.action((ctx) => ctx.get(editorViewCtx))).toBe(view);
    expect(view.state).toBe(state);
    expect(wrapper.scrollTop).toBe(123);
    expect(onChange).toHaveBeenCalledTimes(changeCount);
    expect(onSearchSnapshotChange).toHaveBeenCalledTimes(snapshotCount);
    expect(redo(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.textContent).toBe('!hello hello');
    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.textContent).toBe('hello hello');
    runtime.searchController.findNext();
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe('hello');
  });

  it('更新现有节点的标签并隔离另一实例', async () => {
    // 中文实例。
    const first = await mountRuntime('![photo](https://example.com/photo.png)\n\n```html\n<p>hello</p>\n```\n\n$$\nx+1\n$$');
    // 独立英文实例。
    const second = await mountRuntime('![photo](https://example.com/photo.png)', 'en-US');
    // 切换前图片根和错误提示图标。
    const image = first.view.dom.querySelector('.zt-md-image');
    // 切换前代码源码 DOM。
    const code = first.view.dom.querySelector('code');
    // 新文案。
    const messages = resolveEditorMessages('en-US', { imageDeleteAriaLabel: 'Remove photo' });
    await act(async () => first.runtime.updateLocalization('en-US', messages));
    expect(first.view.dom.querySelector('.zt-md-image')).toBe(image);
    expect(first.view.dom.querySelector('code')).toBe(code);
    expect(image?.querySelector('button')?.getAttribute('aria-label')).toBe('Remove photo');
    expect(second.view.dom.querySelector('.zt-md-image button')?.getAttribute('aria-label')).toBe(resolveEditorMessages('en-US').imageDeleteAriaLabel);
    expect(first.view.dom.querySelector('.zt-md-code-block button[aria-label="' + messages.codeBlockCopyAriaLabel + '"]')).not.toBeNull();
    await act(async () => first.runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(image?.querySelector('button')?.getAttribute('aria-label')).toBe(resolveEditorMessages('en-US').imageDeleteAriaLabel);
  });

  it('已展开 slash 菜单随语言双向刷新，不改变查询', async () => {
    // 斜杠菜单实例。
    const { runtime, view, portal } = await mountRuntime('');
    view.dispatch(view.state.tr.insertText('/', 1));
    expect(portal.querySelector('.slash-menu')?.textContent).toContain('段落');
    await act(async () => runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(portal.querySelector('.slash-menu')?.textContent).toContain('Paragraph');
    expect(view.state.doc.textContent).toBe('/');
    await act(async () => runtime.updateLocalization('zh-CN', resolveEditorMessages('zh-CN')));
    expect(portal.querySelector('.slash-menu')?.textContent).toContain('段落');
  });

  it('自定义菜单保持标签，禁用菜单不被语言切换启用', async () => {
    // 自定义菜单实例。
    const custom = await mountRuntime('', 'zh-CN', { items: [{ id: 'custom', label: 'My paragraph', group: 'My group', command: 'paragraph' }] });
    custom.view.dispatch(custom.view.state.tr.insertText('/', 1));
    await act(async () => custom.runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(custom.portal.textContent).toContain('My paragraph');
    // 禁用 slash 的独立实例。
    const disabled = await mountRuntime('', 'zh-CN', { enabled: false });
    disabled.view.dispatch(disabled.view.state.tr.insertText('/', 1));
    await act(async () => disabled.runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(disabled.portal.querySelector('.slash-menu')).toBeNull();
  });

  it('表格更多操作展开时同步菜单文案，保留选区', async () => {
    // 表格实例。
    const { runtime, view } = await mountRuntime('| a | b |\n| --- | --- |\n| c | d |');
    // 正文单元格的文本位置。
    let cellPosition = 0;
    view.state.doc.descendants((node, pos) => { if (node.isText && node.text === 'c') cellPosition = pos; });
    await act(async () => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPosition))));
    // 更多操作触发器。
    const trigger = document.querySelector<HTMLButtonElement>('.zt-md-table-more-actions-mount button')!;
    fireEvent.click(trigger);
    // 文案刷新前的选区。
    const selection = view.state.selection;
    await act(async () => runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.zt-md-table-action-popover')?.textContent).toContain(resolveEditorMessages('en-US').tableInsertRowBelowLabel);
    expect(view.state.selection).toBe(selection);
  });

  it('保留正在输入的行内公式草稿与焦点', async () => {
    // 行内公式实例。
    const { runtime, view } = await mountRuntime('text $x+1$ end');
    // 实际公式节点位置。
    let position = 0;
    view.state.doc.descendants((node, pos) => { if (node.type.name === 'math_inline') position = pos; });
    openMathInlineEditor(view, position);
    // 既有输入框。
    const input = view.dom.querySelector<HTMLInputElement>('.zt-md-math-inline-editor-input')!;
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.input(input, { target: { value: 'draft+2' } });
    // 尚未提交的文档与选区。
    const state = view.state;
    await act(async () => runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(input.value).toBe('draft+2');
    expect(document.activeElement).toBe(input);
    expect(view.state).toBe(state);
    expect(input.getAttribute('aria-label')).toBe(resolveEditorMessages('en-US').mathBlockSourceAriaLabel);
  });

  it('保留块级公式草稿及代码语言面板中的搜索输入', async () => {
    // 包含块级公式和代码块的实例。
    const { runtime, view } = await mountRuntime('$$\nx+1\n$$\n\n```\nhello\n```');
    // 既有公式节点。
    const math = view.dom.querySelector<HTMLElement>('.zt-md-math-block')!;
    fireEvent.click(math);
    // 既有源码输入框。
    const textarea = math.querySelector<HTMLTextAreaElement>('textarea')!;
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.input(textarea, { target: { value: 'draft+3' } });
    await act(async () => runtime.updateLocalization('en-US', resolveEditorMessages('en-US')));
    expect(textarea.value).toBe('draft+3');
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute('aria-label')).toBe(resolveEditorMessages('en-US').mathBlockSourceAriaLabel);
    // 代码块内的位置。
    let codePosition = 0;
    view.state.doc.descendants((node, pos) => { if (node.type.name === 'code_block') codePosition = pos + 1; });
    await act(async () => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, codePosition))));
    // 语言选择器触发器。
    const trigger = document.querySelector<HTMLButtonElement>('.zt-md-code-language-picker-trigger')!;
    fireEvent.click(trigger);
    // 面板搜索输入。
    const input = document.querySelector<HTMLInputElement>('.zt-md-code-language-picker-panel input')!;
    fireEvent.change(input, { target: { value: 'java' } });
    await act(async () => runtime.updateLocalization('zh-CN', resolveEditorMessages('zh-CN')));
    expect(input.value).toBe('java');
    expect(input.placeholder).toBe(resolveEditorMessages('zh-CN').codeBlockLanguageSearchPlaceholder);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('已打开图片弹层保留输入并更新错误提示，关闭后不再刷新', async () => {
    // 弹层实例文案。
    const messages = resolveEditorMessages('zh-CN');
    // 弹层所在编辑器。
    const { view, portal } = await mountRuntime('');
    await act(async () => showImageUploadDialog({ portalContainer: portal, view, messages }));
    // 已打开的 Dialog。
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === messages.imageUploadUrlTab)!);
    // 链接输入框。
    const input = dialog.querySelector<HTMLInputElement>('input[type="text"]')!;
    fireEvent.change(input, { target: { value: 'bad-url' } });
    await act(async () => updateEditorMessages(messages, resolveEditorMessages('en-US')));
    expect(input.value).toBe('bad-url');
    expect(dialog.textContent).toContain(messages.imageUploadInvalidUrl);
    expect(dialog.textContent).toContain(messages.imageUploadDialogTitle);
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === messages.imageUploadCancelLabel)!);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await act(async () => updateEditorMessages(messages, resolveEditorMessages('zh-CN')));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
