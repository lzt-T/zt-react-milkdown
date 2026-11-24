import { createMilkdownEditorRuntime, type MilkdownEditorRuntime } from '@/core/createEditor';
import { resolveEditorMessages } from '@/local/i18n';
import { FRONTMATTER_NODE_NAME } from '@/plugins/custom/frontmatter';
import type { EditorLocale } from '@/types/editor';
import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';
import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 记录测试期间挂载的运行时实例，便于统一回收。
const runtimes: MilkdownEditorRuntime[] = [];
// 记录测试期间插入的宿主节点，便于逐个清理。
const hosts: HTMLElement[] = [];

/** 挂载带完整默认插件与 Frontmatter NodeView 的真实编辑器运行时。 */
const mountRuntime = async (markdown: string, locale: EditorLocale = 'zh-CN', readOnly = false) => {
  // 编辑器主题宿主容器。
  const host = document.createElement('div');
  host.className = 'zt-md zt-md-light';
  // 编辑区滚动容器。
  const wrapper = document.createElement('div');
  wrapper.className = 'zt-md-editor';
  // ProseMirror 挂载根节点。
  const root = document.createElement('div');
  // 编辑器级浮层容器。
  const portal = document.createElement('div');
  // 内容附属浮层容器。
  const contentPortal = document.createElement('div');
  wrapper.append(root, contentPortal);
  host.append(wrapper, portal);
  document.body.append(host);
  hosts.push(host);

  // Markdown 变更回调桩。
  const onChange = vi.fn();
  // 搜索快照变更回调桩。
  const onSearchSnapshotChange = vi.fn();
  // 真实运行时实例。
  const runtime = createMilkdownEditorRuntime({
    root,
    portalContainer: portal,
    contentPortalContainer: contentPortal,
    markdown,
    locale,
    messages: resolveEditorMessages(locale),
    readOnly,
    shortcutMode: 'modShift',
    onChange,
    onSearchSnapshotChange
  });
  runtimes.push(runtime);
  await act(async () => {
    await runtime.editor.create();
    runtime.installRuntimePlugins();
  });
  // ProseMirror 编辑器视图。
  const view = runtime.editor.action((ctx) => ctx.get(editorViewCtx));
  return { runtime, view, onChange };
};

afterEach(async () => {
  await act(async () => {
    for (const runtime of runtimes.splice(0)) {
      await runtime.editor.destroy();
    }
  });
  hosts.splice(0).forEach((host) => host.remove());
});

describe('frontmatter-plugin', () => {
  it('解析多行中文 YAML Frontmatter，且编辑正文后序列化无损保留', async () => {
    // 典型多行 YAML Frontmatter（含中文描述）。
    const sourceMarkdown = [
      '---',
      'name: go-backend-architecture',
      'description: 编写或重构 Go 后端功能时使用。按业务模块组织 Gin 入口与 Service。',
      '---',
      '',
      '# Go 后端通用开发规范',
      '',
      '正文段落'
    ].join('\n');

    const { view, onChange } = await mountRuntime(sourceMarkdown);
    // 文档首节点应为 frontmatter，而非 hr 或误解析出的 Setext 标题。
    const firstNode = view.state.doc.firstChild;
    expect(firstNode?.type.name).toBe(FRONTMATTER_NODE_NAME);
    expect(firstNode?.attrs.format).toBe('yaml');
    expect(firstNode?.textContent).toBe(
      'name: go-backend-architecture\ndescription: 编写或重构 Go 后端功能时使用。按业务模块组织 Gin 入口与 Service。'
    );

    // 验证文档内不存在 hr 且仅有一个一级标题。
    const nodeTypes: string[] = [];
    view.state.doc.forEach((node) => {
      nodeTypes.push(node.type.name);
    });
    expect(nodeTypes).toEqual([FRONTMATTER_NODE_NAME, 'heading', 'paragraph']);

    // 在末尾正文插入内容触发 markdownUpdated 序列化。
    let paragraphTextPos = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === '正文段落') {
        paragraphTextPos = pos + node.nodeSize;
      }
    });
    await act(async () => {
      view.dispatch(view.state.tr.insertText('！', paragraphTextPos));
    });

    // 最新一次序列化的 Markdown 文本。
    const serialized = onChange.mock.calls.at(-1)?.[0] as string;
    expect(serialized).toContain(
      '---\nname: go-backend-architecture\ndescription: 编写或重构 Go 后端功能时使用。按业务模块组织 Gin 入口与 Service。\n---'
    );
    expect(serialized).toContain('# Go 后端通用开发规范');
    expect(serialized).toContain('正文段落！');
  });

  it('支持 TOML Frontmatter 与空 YAML Frontmatter 的解析和序列化', async () => {
    // TOML Frontmatter 示例。
    const tomlSource = '+++\ntitle = "Inkdown"\n+++\n\n正文';
    const tomlEditor = await mountRuntime(tomlSource);
    // TOML 首节点。
    const tomlNode = tomlEditor.view.state.doc.firstChild;
    expect(tomlNode?.type.name).toBe(FRONTMATTER_NODE_NAME);
    expect(tomlNode?.attrs.format).toBe('toml');
    expect(tomlNode?.textContent).toBe('title = "Inkdown"');

    // 修改正文并验证 TOML 分隔符保持 +++。
    let tomlParagraphPos = 0;
    tomlEditor.view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === '正文') {
        tomlParagraphPos = pos + node.nodeSize;
      }
    });
    await act(async () => {
      tomlEditor.view.dispatch(tomlEditor.view.state.tr.insertText('1', tomlParagraphPos));
    });
    expect(tomlEditor.onChange.mock.calls.at(-1)?.[0]).toBe('+++\ntitle = "Inkdown"\n+++\n\n正文1');

    // 空 YAML Frontmatter 示例。
    const emptyYamlSource = '---\n---\n\n内容';
    const emptyYamlEditor = await mountRuntime(emptyYamlSource);
    // 空 YAML 首节点。
    const emptyNode = emptyYamlEditor.view.state.doc.firstChild;
    expect(emptyNode?.type.name).toBe(FRONTMATTER_NODE_NAME);
    expect(emptyNode?.attrs.format).toBe('yaml');
    expect(emptyNode?.textContent).toBe('');

    let emptyParagraphPos = 0;
    emptyYamlEditor.view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === '内容') {
        emptyParagraphPos = pos + node.nodeSize;
      }
    });
    await act(async () => {
      emptyYamlEditor.view.dispatch(emptyYamlEditor.view.state.tr.insertText('2', emptyParagraphPos));
    });
    expect(emptyYamlEditor.onChange.mock.calls.at(-1)?.[0]).toBe('---\n---\n\n内容2');
  });

  it('支持折叠展开、删除节点、只读隐藏删除按钮与语言切换热更新', async () => {
    const { runtime, view } = await mountRuntime('---\ntitle: Demo\n---\n\n正文');
    // Frontmatter 根节点。
    const container = view.dom.querySelector<HTMLElement>('.zt-md-frontmatter')!;
    // 折叠切换按钮。
    const toggleButton = container.querySelector<HTMLButtonElement>('.zt-md-frontmatter-toggle')!;
    // 内容编辑区。
    const bodyElement = container.querySelector<HTMLElement>('.zt-md-frontmatter-body')!;
    // 标题文本。
    const titleSpan = container.querySelector<HTMLElement>('.zt-md-frontmatter-title')!;
    // 删除按钮。
    const deleteButton = container.querySelector<HTMLButtonElement>(
      '.zt-md-frontmatter-action-button-danger'
    )!;

    expect(container.dataset.collapsed).toBe('false');
    expect(container.dataset.editable).toBe('true');
    expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
    expect(bodyElement.hidden).toBe(false);
    expect(titleSpan.textContent).toBe(resolveEditorMessages('zh-CN').frontmatterYamlLabel);

    // 点击折叠后内容区隐藏且状态更新。
    fireEvent.click(toggleButton);
    expect(container.dataset.collapsed).toBe('true');
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    expect(bodyElement.hidden).toBe(true);

    // 切换为英文，验证标签与无障碍文案原地刷新。
    await act(async () => {
      runtime.updateLocalization('en-US', resolveEditorMessages('en-US'));
    });
    expect(titleSpan.textContent).toBe(resolveEditorMessages('en-US').frontmatterYamlLabel);
    expect(toggleButton.getAttribute('aria-label')).toBe(
      resolveEditorMessages('en-US').frontmatterExpandAriaLabel
    );
    expect(deleteButton.getAttribute('aria-label')).toBe(
      resolveEditorMessages('en-US').frontmatterDeleteAriaLabel
    );

    // 点击再次展开。
    fireEvent.click(toggleButton);
    expect(container.dataset.collapsed).toBe('false');
    expect(bodyElement.hidden).toBe(false);

    // 点击删除后，Frontmatter 节点应被移除。
    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(view.dom.querySelector('.zt-md-frontmatter')).toBeNull();

    // 只读模式下容器标记为不可编辑，用于隐藏删除按钮。
    const readOnlyEditor = await mountRuntime('---\ntitle: ReadOnly\n---\n\n正文', 'zh-CN', true);
    const readOnlyContainer =
      readOnlyEditor.view.dom.querySelector<HTMLElement>('.zt-md-frontmatter')!;
    expect(readOnlyContainer.dataset.editable).toBe('false');
  });

  it('光标位于 Frontmatter 开头按 ArrowUp 时不会在其上方插入新段落', async () => {
    const { view } = await mountRuntime('---\ntitle: Guard\n---\n\n正文');
    // 将光标置于 Frontmatter 文本开头。
    await act(async () => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    });

    // 模拟 jsdom 下处于文本块首行时的行边界判断。
    vi.spyOn(view, 'endOfTextblock').mockReturnValue(true);
    const beforeChildCount = view.state.doc.childCount;

    await act(async () => {
      fireEvent.keyDown(view.dom, { key: 'ArrowUp' });
    });

    expect(view.state.doc.childCount).toBe(beforeChildCount);
    expect(view.state.doc.firstChild?.type.name).toBe(FRONTMATTER_NODE_NAME);
  });
});
