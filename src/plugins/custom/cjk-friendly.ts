import { remarkStringifyOptionsCtx } from '@milkdown/core';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { RemarkPluginRaw } from '@milkdown/transformer';
import { $remark } from '@milkdown/utils';
import type { ConstructName, Handle, Options as ToMarkdownOptions } from 'mdast-util-to-markdown';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough';

/**
 * 匹配段落行首与行尾的水平空白，将其移出强调定界符外侧以避免序列化出无效语法。
 */
const LEADING_HORIZONTAL_SPACE_PATTERN = /^[ \t]+/;
const TRAILING_HORIZONTAL_SPACE_PATTERN = /[ \t]+$/;

/**
 * 行内强调序列化上下文接口，读取并合并 remark-stringify 处理器配置。
 */
interface InlineEmphasisSerializationContext {
  /** 读取当前 remark-stringify 配置。 */
  get: (key: typeof remarkStringifyOptionsCtx) => ToMarkdownOptions;
  /** 写回更新后的 remark-stringify 配置。 */
  set: (key: typeof remarkStringifyOptionsCtx, value: ToMarkdownOptions) => void;
}

/**
 * 行内分隔型强调节点（加粗、斜体、删除线）的序列化规格。
 */
interface DelimitedInlineSpec {
  /** mdast 节点入栈构造名。 */
  constructName: ConstructName;
  /** 根据当前节点与状态解析闭合标记与边界字符。 */
  resolveDelimiters: (
    node: { marker?: string },
    state: Parameters<Handle>[2]
  ) => { delimiter: string; after: string };
  /** 向外层 containerPhrasing 声明本节点的起始探测字符。 */
  peek: Handle;
}

/**
 * remark-cjk-friendly 插件包装器，放宽中文/日文/韩文标点紧邻 `*`/`**` 时的解析限制。
 */
export const remarkCjkFriendlyPlugin = $remark<'remarkCjkFriendly', undefined>(
  'remarkCjkFriendly',
  () => remarkCjkFriendly as unknown as RemarkPluginRaw<undefined>
);

/**
 * remark-cjk-friendly-gfm-strikethrough 插件包装器，放宽 CJK 标点紧邻 `~~` 时的解析限制。
 */
export const remarkCjkFriendlyGfmStrikethroughPlugin = $remark<
  'remarkCjkFriendlyGfmStrikethrough',
  undefined
>(
  'remarkCjkFriendlyGfmStrikethrough',
  () => remarkCjkFriendlyGfmStrikethrough as unknown as RemarkPluginRaw<undefined>
);

/**
 * CJK 标点友好解析插件聚合导出（需注册在 gfm 之后以覆盖其删除线微语法）。
 */
export const cjkFriendly: MilkdownPlugin[] = [
  remarkCjkFriendlyPlugin,
  remarkCjkFriendlyGfmStrikethroughPlugin
].flat();

/**
 * 构造行内强调节点的序列化器，将节点内部首尾水平空白移至定界符外侧。
 */
const createDelimitedInlineHandler = (spec: DelimitedInlineSpec): Handle => {
  const handler = ((node, _parent, state, info) => {
    const { delimiter, after } = spec.resolveDelimiters(node as { marker?: string }, state);
    const exit = state.enter(spec.constructName);
    const tracker = state.createTracker(info);
    // 先用独立位置追踪器试算内部文本，确保移出首尾空白前的转义判定基于真实定界符上下文。
    const innerTracker = state.createTracker(info);
    innerTracker.move(delimiter);
    const inner = state.containerPhrasing(node, {
      before: delimiter,
      after,
      ...innerTracker.current()
    });
    exit();

    const leading = LEADING_HORIZONTAL_SPACE_PATTERN.exec(inner)?.[0] ?? '';
    const trailing = TRAILING_HORIZONTAL_SPACE_PATTERN.exec(inner)?.[0] ?? '';
    const core = inner.slice(leading.length, inner.length - trailing.length);
    if (!core) {
      // 纯空白选区不输出强调定界符，避免产生无法被 CommonMark 解析的孤立标记。
      return tracker.move(inner);
    }

    let output = '';
    if (leading) {
      output += tracker.move(leading);
    }
    output += tracker.move(delimiter);
    output += tracker.move(core);
    output += tracker.move(delimiter);
    if (trailing) {
      output += tracker.move(trailing);
    }
    return output;
  }) as Handle & { peek?: Handle };

  handler.peek = spec.peek;
  return handler;
};

/**
 * 定制 strong、emphasis 与 delete 的序列化处理器，避免选区首尾空格导致切回源码后失效。
 */
export const configureInlineEmphasisSerialization = (
  ctx: InlineEmphasisSerializationContext
): void => {
  const previousOptions = ctx.get(remarkStringifyOptionsCtx) ?? {};

  const strongHandler = createDelimitedInlineHandler({
    constructName: 'strong',
    resolveDelimiters: (node, state) => {
      const marker = node.marker || state.options.strong || '*';
      return { delimiter: marker + marker, after: marker };
    },
    peek: (_node, _parent, state) => state.options.strong || '*'
  });

  const emphasisHandler = createDelimitedInlineHandler({
    constructName: 'emphasis',
    resolveDelimiters: (node, state) => {
      const marker = node.marker || state.options.emphasis || '*';
      return { delimiter: marker, after: marker };
    },
    peek: (_node, _parent, state) => state.options.emphasis || '*'
  });

  const deleteHandler = createDelimitedInlineHandler({
    // mdast-util-gfm-strikethrough 在运行时使用 'strikethrough' 构造名入栈，这里显式兼容其类型。
    constructName: 'strikethrough' as ConstructName,
    resolveDelimiters: () => ({ delimiter: '~~', after: '~' }),
    peek: () => '~'
  });

  ctx.set(remarkStringifyOptionsCtx, {
    ...previousOptions,
    handlers: {
      ...previousOptions.handlers,
      strong: strongHandler,
      emphasis: emphasisHandler,
      delete: deleteHandler
    }
  });
};
