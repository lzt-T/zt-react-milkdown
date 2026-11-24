/**
 * 静态 SVG 图标名称。
 */
export type StaticSvgIconName =
  | 'AlignCenter'
  | 'AlignLeft'
  | 'AlignRight'
  | 'Bold'
  | 'Check'
  | 'ChevronDown'
  | 'Circle'
  | 'Code'
  | 'Code2'
  | 'Copy'
  | 'Eye'
  | 'Heading1'
  | 'Heading2'
  | 'Heading3'
  | 'Heading4'
  | 'Heading5'
  | 'Heading6'
  | 'Image'
  | 'ImageOff'
  | 'Italic'
  | 'List'
  | 'ListOrdered'
  | 'ListTodo'
  | 'Sigma'
  | 'SquareCode'
  | 'SquareFunction'
  | 'Strikethrough'
  | 'Table'
  | 'TextQuote'
  | 'Trash2'
  | 'Type';

/**
 * 静态 SVG 图标渲染选项。
 */
export interface RenderStaticSvgIconOptions {
  /** 图标尺寸（像素）。 */
  size?: number;
  /** 描边线宽。 */
  strokeWidth?: number;
  /** 是否设置 aria-hidden="true"。 */
  ariaHidden?: boolean;
}

// 单个 SVG 子节点定义：[标签名, 属性映射]。
type SvgElementTuple = readonly [tag: 'path' | 'rect' | 'circle' | 'line', attrs: Readonly<Record<string, string>>];

// 静态图标节点映射表（与 lucide-react 几何路径保持一致，避免运行时引入 react-dom/server）。
const STATIC_SVG_ICON_NODES: Readonly<Record<StaticSvgIconName, readonly SvgElementTuple[]>> = {
  AlignCenter: [
    ['path', { d: 'M21 5H3' }],
    ['path', { d: 'M17 12H7' }],
    ['path', { d: 'M19 19H5' }]
  ],
  AlignLeft: [
    ['path', { d: 'M21 5H3' }],
    ['path', { d: 'M15 12H3' }],
    ['path', { d: 'M17 19H3' }]
  ],
  AlignRight: [
    ['path', { d: 'M21 5H3' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M21 19H7' }]
  ],
  Bold: [['path', { d: 'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8' }]],
  Check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  ChevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
  Circle: [['circle', { cx: '12', cy: '12', r: '10' }]],
  Code: [
    ['path', { d: 'm16 18 6-6-6-6' }],
    ['path', { d: 'm8 6-6 6 6 6' }]
  ],
  Code2: [
    ['path', { d: 'm18 16 4-4-4-4' }],
    ['path', { d: 'm6 8-4 4 4 4' }],
    ['path', { d: 'm14.5 4-5 16' }]
  ],
  Copy: [
    ['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]
  ],
  Eye: [
    [
      'path',
      {
        d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'
      }
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }]
  ],
  Heading1: [
    ['path', { d: 'M4 12h8' }],
    ['path', { d: 'M4 18V6' }],
    ['path', { d: 'M12 18V6' }],
    ['path', { d: 'm17 12 3-2v8' }]
  ],
  Heading2: [
    ['path', { d: 'M4 12h8' }],
    ['path', { d: 'M4 18V6' }],
    ['path', { d: 'M12 18V6' }],
    ['path', { d: 'M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1' }]
  ],
  Heading3: [
    ['path', { d: 'M4 12h8' }],
    ['path', { d: 'M4 18V6' }],
    ['path', { d: 'M12 18V6' }],
    ['path', { d: 'M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2' }],
    ['path', { d: 'M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2' }]
  ],
  Heading4: [
    ['path', { d: 'M12 18V6' }],
    ['path', { d: 'M17 10v3a1 1 0 0 0 1 1h3' }],
    ['path', { d: 'M21 10v8' }],
    ['path', { d: 'M4 12h8' }],
    ['path', { d: 'M4 18V6' }]
  ],
  Heading5: [
    ['path', { d: 'M4 12h8' }],
    ['path', { d: 'M4 18V6' }],
    ['path', { d: 'M12 18V6' }],
    ['path', { d: 'M17 13v-3h4' }],
    ['path', { d: 'M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17' }]
  ],
  Heading6: [
    ['path', { d: 'M4 12h8' }],
    ['path', { d: 'M4 18V6' }],
    ['path', { d: 'M12 18V6' }],
    ['circle', { cx: '19', cy: '16', r: '2' }],
    ['path', { d: 'M20 10c-2 2-3 3.5-3 6' }]
  ],
  Image: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
    ['circle', { cx: '9', cy: '9', r: '2' }],
    ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }]
  ],
  ImageOff: [
    ['line', { x1: '2', x2: '22', y1: '2', y2: '22' }],
    ['path', { d: 'M10.41 10.41a2 2 0 1 1-2.83-2.83' }],
    ['line', { x1: '13.5', x2: '6', y1: '13.5', y2: '21' }],
    ['line', { x1: '18', x2: '21', y1: '12', y2: '15' }],
    ['path', { d: 'M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59' }],
    ['path', { d: 'M21 15V5a2 2 0 0 0-2-2H9' }]
  ],
  Italic: [
    ['line', { x1: '19', x2: '10', y1: '4', y2: '4' }],
    ['line', { x1: '14', x2: '5', y1: '20', y2: '20' }],
    ['line', { x1: '15', x2: '9', y1: '4', y2: '20' }]
  ],
  List: [
    ['path', { d: 'M3 5h.01' }],
    ['path', { d: 'M3 12h.01' }],
    ['path', { d: 'M3 19h.01' }],
    ['path', { d: 'M8 5h13' }],
    ['path', { d: 'M8 12h13' }],
    ['path', { d: 'M8 19h13' }]
  ],
  ListOrdered: [
    ['path', { d: 'M11 5h10' }],
    ['path', { d: 'M11 12h10' }],
    ['path', { d: 'M11 19h10' }],
    ['path', { d: 'M4 4h1v5' }],
    ['path', { d: 'M4 9h2' }],
    ['path', { d: 'M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02' }]
  ],
  ListTodo: [
    ['path', { d: 'M13 5h8' }],
    ['path', { d: 'M13 12h8' }],
    ['path', { d: 'M13 19h8' }],
    ['path', { d: 'm3 17 2 2 4-4' }],
    ['rect', { x: '3', y: '4', width: '6', height: '6', rx: '1' }]
  ],
  Sigma: [
    [
      'path',
      {
        d: 'M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2'
      }
    ]
  ],
  SquareCode: [
    ['path', { d: 'm10 9-3 3 3 3' }],
    ['path', { d: 'm14 15 3-3-3-3' }],
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }]
  ],
  SquareFunction: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
    ['path', { d: 'M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3' }],
    ['path', { d: 'M9 11.2h5.7' }]
  ],
  Strikethrough: [
    ['path', { d: 'M16 4H9a3 3 0 0 0-2.83 4' }],
    ['path', { d: 'M14 12a4 4 0 0 1 0 8H6' }],
    ['line', { x1: '4', x2: '20', y1: '12', y2: '12' }]
  ],
  Table: [
    ['path', { d: 'M12 3v18' }],
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }],
    ['path', { d: 'M3 9h18' }],
    ['path', { d: 'M3 15h18' }]
  ],
  TextQuote: [
    ['path', { d: 'M17 5H3' }],
    ['path', { d: 'M21 12H8' }],
    ['path', { d: 'M21 19H8' }],
    ['path', { d: 'M3 12v7' }]
  ],
  Trash2: [
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]
  ],
  Type: [
    ['path', { d: 'M12 4v16' }],
    ['path', { d: 'M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2' }],
    ['path', { d: 'M9 20h6' }]
  ]
};

// 已渲染 SVG 字符串缓存，避免重复拼接相同图标。
const renderedIconCache = new Map<string, string>();

/**
 * 将属性字典序列化为 HTML 属性字符串。
 */
const serializeSvgAttributes = (attrs: Readonly<Record<string, string>>): string => {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
};

/**
 * 根据字符串名称解析合法的静态图标名，未命中时返回兜底图标。
 */
export const resolveStaticSvgIconName = (
  name: string | undefined,
  fallback: StaticSvgIconName
): StaticSvgIconName => {
  if (name && Object.prototype.hasOwnProperty.call(STATIC_SVG_ICON_NODES, name)) {
    return name as StaticSvgIconName;
  }

  return fallback;
};

/**
 * 生成指定静态 SVG 图标的完整 HTML 字符串。
 */
export const renderStaticSvgIcon = (
  name: StaticSvgIconName,
  options: RenderStaticSvgIconOptions = {}
): string => {
  const size = options.size ?? 16;
  const strokeWidth = options.strokeWidth ?? 2;
  const ariaHidden = options.ariaHidden ?? true;
  const cacheKey = `${name}:${size}:${strokeWidth}:${ariaHidden}`;
  const cachedMarkup = renderedIconCache.get(cacheKey);
  if (cachedMarkup !== undefined) {
    return cachedMarkup;
  }

  // 图标几何节点列表。
  const childrenMarkup = STATIC_SVG_ICON_NODES[name]
    .map(([tag, attrs]) => `<${tag} ${serializeSvgAttributes(attrs)}></${tag}>`)
    .join('');
  const ariaHiddenAttr = ariaHidden ? ' aria-hidden="true"' : '';
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${ariaHiddenAttr}>${childrenMarkup}</svg>`;
  renderedIconCache.set(cacheKey, markup);
  return markup;
};
