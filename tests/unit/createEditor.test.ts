import { describe, expect, it, vi } from 'vitest';
import type { CreateEditorOptions } from '../../src/types/editor';

/**
 * 约束 mock 编辑器实例需要满足的最小接口。
 */
interface MockEditor {
  config: (handler: (ctx: unknown) => void) => MockEditor;
  use: (plugin: unknown) => MockEditor;
  create: () => Promise<void>;
  action: (handler: unknown) => void;
  destroy: () => Promise<void>;
}

/**
 * 构造 createEditor 的默认输入参数。
 */
function createOptions(onChange?: (markdown: string) => void): CreateEditorOptions {
  // 默认变更回调。
  const defaultOnChange = vi.fn();

  return {
    root: document.createElement('div'),
    markdown: '# init',
    editable: true,
    onChange: onChange ?? defaultOnChange
  };
}

/**
 * 初始化模块 mock，并返回 createEditor 的可测试上下文。
 */
async function setupCreateEditorMocks(): Promise<{
  createEditor: (options: CreateEditorOptions) => Promise<{
    destroy: () => Promise<void>;
    setMarkdown: (markdown: string) => Promise<void>;
    setEditable: (editable: boolean) => Promise<void>;
  }>;
  editor: MockEditor;
  listenerManager: {
    markdownUpdated: (handler: (ctx: unknown, markdown: string) => void) => void;
  };
  nodeViewCtxSymbol: symbol;
  ctxSet: ReturnType<typeof vi.fn>;
  markdownUpdatedSpy: ReturnType<typeof vi.fn>;
  replaceAll: ReturnType<typeof vi.fn>;
}> {
  // listenerCtx 上下文符号。
  const listenerCtxSymbol = Symbol('listenerCtx');
  // nodeViewCtx 上下文符号。
  const nodeViewCtxSymbol = Symbol('nodeViewCtx');
  // markdownUpdated 调用桩函数。
  const markdownUpdatedSpy = vi.fn((handler: (ctx: unknown, markdown: string) => void) => {
    return handler;
  });
  // listener 管理器桩对象。
  const listenerManager: {
    markdownUpdated: (handler: (ctx: unknown, markdown: string) => void) => void;
  } = {
    markdownUpdated: markdownUpdatedSpy as (handler: (ctx: unknown, markdown: string) => void) => void
  };
  // 上下文取值表。
  const ctxValueMap = new Map<unknown, unknown>([
    [listenerCtxSymbol, listenerManager],
    [nodeViewCtxSymbol, []]
  ]);
  // 上下文 set 调用桩函数。
  const ctxSet = vi.fn((key: unknown, value: unknown) => {
    ctxValueMap.set(key, value);
  });
  // 编辑器实例桩对象。
  const editor: MockEditor = {
    config: vi.fn((handler: (ctx: unknown) => void) => {
      handler({
        set: ctxSet,
        get: (key: unknown) => ctxValueMap.get(key)
      });

      return editor;
    }),
    use: vi.fn((_plugin: unknown) => editor),
    create: vi.fn(async () => undefined),
    action: vi.fn((_handler: unknown) => undefined),
    destroy: vi.fn(async () => undefined)
  };
  // replaceAll 命令桩函数。
  const replaceAll = vi.fn((markdown: string) => ({ type: 'replace-all', markdown }));

  vi.resetModules();

  vi.doMock('@milkdown/kit/core', () => {
    return {
      Editor: {
        make: () => editor
      },
      rootCtx: Symbol('rootCtx'),
      defaultValueCtx: Symbol('defaultValueCtx'),
      editorViewOptionsCtx: Symbol('editorViewOptionsCtx'),
      nodeViewCtx: nodeViewCtxSymbol
    };
  });

  vi.doMock('@milkdown/kit/plugin/listener', () => {
    return {
      listenerCtx: listenerCtxSymbol,
      listener: Symbol('listenerPlugin')
    };
  });

  vi.doMock('@milkdown/kit/preset/commonmark', () => {
    return {
      commonmark: Symbol('commonmarkPlugin')
    };
  });

  vi.doMock('@milkdown/kit/preset/gfm', () => {
    return {
      gfm: Symbol('gfmPlugin')
    };
  });

  vi.doMock('@milkdown/plugin-math', () => {
    return {
      math: Symbol('mathPlugin')
    };
  });

  vi.doMock('@milkdown/kit/utils', () => {
    return {
      replaceAll
    };
  });

  // createEditor 模块。
  const createEditorModule = await import('../../src/core/createEditor');

  return {
    createEditor: createEditorModule.createEditor,
    editor,
    listenerManager,
    nodeViewCtxSymbol,
    ctxSet,
    markdownUpdatedSpy,
    replaceAll
  };
}

describe('createEditor', () => {
  it('能够初始化并注册默认插件与监听器', async () => {
    // 变更回调桩函数。
    const onChange = vi.fn();
    // 模块测试上下文。
    const testContext = await setupCreateEditorMocks();

    await testContext.createEditor(createOptions(onChange));

    // 监听器回调参数。
    const markdownUpdatedHandler = testContext.markdownUpdatedSpy.mock.calls[0]?.[0];
    if (markdownUpdatedHandler) {
      markdownUpdatedHandler({}, '# after-init');
    }

    expect(testContext.editor.use).toHaveBeenCalledTimes(4);
    expect(testContext.listenerManager.markdownUpdated).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('# after-init');

    // nodeViewCtx 的 set 调用参数。
    const nodeViewSetCall = testContext.ctxSet.mock.calls.find((call) => {
      return call[0] === testContext.nodeViewCtxSymbol;
    });

    expect(nodeViewSetCall).toBeTruthy();
    expect(nodeViewSetCall?.[1]).toEqual(
      expect.arrayContaining([
        ['math_block', expect.any(Function)]
      ])
    );
  });

  it('setMarkdown 会通过 replaceAll 下发编辑命令', async () => {
    // 模块测试上下文。
    const testContext = await setupCreateEditorMocks();
    // 控制器对象。
    const controller = await testContext.createEditor(createOptions());

    await controller.setMarkdown('# changed');

    expect(testContext.replaceAll).toHaveBeenCalledWith('# changed');
    expect(testContext.editor.action).toHaveBeenCalledWith({
      type: 'replace-all',
      markdown: '# changed'
    });
  });

  it('缺失 Editor 导出时会抛出可读错误', async () => {
    vi.resetModules();

    vi.doMock('@milkdown/kit/core', () => {
      return {
        rootCtx: Symbol('rootCtx'),
        defaultValueCtx: Symbol('defaultValueCtx'),
        editorViewOptionsCtx: Symbol('editorViewOptionsCtx')
      };
    });

    vi.doMock('@milkdown/kit/plugin/listener', () => {
      return {
        listenerCtx: Symbol('listenerCtx'),
        listener: Symbol('listenerPlugin')
      };
    });

    vi.doMock('@milkdown/kit/preset/commonmark', () => {
      return {
        commonmark: Symbol('commonmarkPlugin')
      };
    });

    vi.doMock('@milkdown/kit/preset/gfm', () => {
      return {
        gfm: Symbol('gfmPlugin')
      };
    });

    vi.doMock('@milkdown/plugin-math', () => {
      return {
        math: Symbol('mathPlugin')
      };
    });

    vi.doMock('@milkdown/kit/utils', () => {
      return {
        replaceAll: vi.fn()
      };
    });

    // createEditor 模块。
    const createEditorModule = await import('../../src/core/createEditor');

    await expect(createEditorModule.createEditor(createOptions())).rejects.toThrow(
      'Milkdown API 缺少必需导出: Editor'
    );
  });
});
