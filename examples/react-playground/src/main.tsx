import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MilkdownEditor } from "../../../src/react/components/MilkdownEditor";
import "katex/dist/katex.min.css";
import "../../../src/styles/style.css";
import "./playground.css";

/**
 * 可选主题类型。
 */
type PlaygroundTheme = "light" | "dark";

/**
 * 可选语言类型。
 */
type PlaygroundLocale = "zh-CN" | "en-US";

/**
 * 可选编辑模式。
 */
type PlaygroundMode = "editable" | "readonly";

// 文档根节点使用的主题类。
const DOCUMENT_THEME_CLASSES: Record<PlaygroundTheme, string> = {
  light: "zt-md-light",
  dark: "zt-md-dark",
};

// Playground 使用的本地技术结构示意图地址。
const PLAYGROUND_IMAGE_URL = new URL(
  "./technical-workbench.svg?no-inline",
  import.meta.url,
).href;

/**
 * 分段控件选项。
 */
interface SegmentedControlOption<T extends string> {
  /** 选项值。 */
  value: T;
  /** 选项文案。 */
  label: string;
}

/**
 * 分段控件属性。
 */
interface SegmentedControlProps<T extends string> {
  /** 控件组标签。 */
  label: string;
  /** 当前选中值。 */
  value: T;
  /** 可选项。 */
  options: SegmentedControlOption<T>[];
  /** 选项变化回调。 */
  onChange: (value: T) => void;
}

/**
 * 示例应用文案结构。
 */
interface PlaygroundTexts {
  /** 示例描述。 */
  description: string;
  /** Slash 命令提示。 */
  commandHint: string;
  /** 选区工具提示。 */
  selectionHint: string;
  /** 控制区标签。 */
  controlsLabel: string;
  /** 编辑器预览区标签。 */
  editorPreviewLabel: string;
  /** 主题控件标签。 */
  themeLabel: string;
  /** 浅色主题文案。 */
  lightLabel: string;
  /** 深色主题文案。 */
  darkLabel: string;
  /** 语言控件标签。 */
  localeLabel: string;
  /** 中文文案。 */
  zhLabel: string;
  /** 英文文案。 */
  enLabel: string;
  /** 模式控件标签。 */
  modeLabel: string;
  /** 可编辑模式文案。 */
  editableLabel: string;
  /** 只读模式文案。 */
  readOnlyLabel: string;
}

/**
 * 示例应用语言包。
 */
const playgroundTexts: Record<PlaygroundLocale, PlaygroundTexts> = {
  "zh-CN": {
    description: "面向代码、公式与结构化内容的技术写作工作台。",
    commandHint: "插入内容块",
    selectionHint: "选中文本显示格式工具",
    controlsLabel: "编辑器设置",
    editorPreviewLabel: "Milkdown 编辑器预览",
    themeLabel: "主题",
    lightLabel: "浅色",
    darkLabel: "深色",
    localeLabel: "语言",
    zhLabel: "中文",
    enLabel: "英文",
    modeLabel: "模式",
    editableLabel: "编辑",
    readOnlyLabel: "只读",
  },
  "en-US": {
    description: "A technical writing workbench for code, math, and structured content.",
    commandHint: "Insert content blocks",
    selectionHint: "Select text to open formatting tools",
    controlsLabel: "Editor settings",
    editorPreviewLabel: "Milkdown editor preview",
    themeLabel: "Theme",
    lightLabel: "Light",
    darkLabel: "Dark",
    localeLabel: "Language",
    zhLabel: "Chinese",
    enLabel: "English",
    modeLabel: "Mode",
    editableLabel: "Edit",
    readOnlyLabel: "Read only",
  },
};

/**
 * 创建覆盖编辑器核心能力的 Playground 示例内容。
 */
const createPlaygroundMarkdown = (imageUrl: string): string => {
  return [
    "# 构建可靠的 Markdown 工作流",
    "",
    "ZT React Milkdown 将代码、公式、表格和媒体内容组织在同一个可扩展编辑环境中。",
    "",
    "## 集成清单",
    "",
    "- [x] 连接受控内容",
    "- [x] 配置主题与国际化",
    "- [ ] 接入生产环境图片上传",
    "",
    "&nbsp;",
    "",
    "## React 示例",
    "",
    "```tsx",
    "<MilkdownEditor",
    "  value={markdown}",
    "  onChange={setMarkdown}",
    "  theme=\"light\"",
    "/>",
    "```",
    "",
    "## 公式与结构化数据",
    "",
    "行内公式：$\\sum_{n=1}^\\infty \\frac{1}{n^2} = \\frac{\\pi^2}{6}$",
    "",
    "$$",
    "\\int_0^1 x^2 dx = \\frac{1}{3}",
    "$$",
    "",
    "| 内容类型 | 编辑方式 | 状态 |",
    "| --- | --- | --- |",
    "| 代码 | 语法高亮与语言切换 | 可编辑 |",
    "| 公式 | 源码与预览 | 可编辑 |",
    "| 图片 | 上传、缩放与替换 | 可编辑 |",
    "",
    "## 编辑器结构视图",
    "",
    `![灰蓝技术写作工作台结构示意](${imageUrl})`,
    "",
    "> 输入 `/` 打开命令菜单，选中文本即可显示格式工具。",
  ].join("\n");
};

// Playground 默认示例内容。
const INITIAL_PLAYGROUND_MARKDOWN = createPlaygroundMarkdown(
  PLAYGROUND_IMAGE_URL,
);

/**
 * 渲染紧凑分段控件。
 */
const SegmentedControl = <T extends string>(
  props: SegmentedControlProps<T>,
): JSX.Element => {
  return (
    <div className="playground-control">
      <span className="playground-control-label">{props.label}</span>
      <div className="playground-segmented" role="group" aria-label={props.label}>
        {props.options.map((option) => (
          <button
            type="button"
            className="playground-segmented-button"
            aria-pressed={props.value === option.value}
            key={option.value}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * 返回 Playground 使用的示例图片地址。
 */
const resolvePlaygroundImageUrl = (): string => {
  return PLAYGROUND_IMAGE_URL;
};

/**
 * 示例应用组件。
 */
const App = (): JSX.Element => {
  // 当前主题状态。
  const [theme, setTheme] = useState<PlaygroundTheme>("light");
  // 当前语言状态。
  const [locale, setLocale] = useState<PlaygroundLocale>("zh-CN");
  // 当前编辑模式。
  const [mode, setMode] = useState<PlaygroundMode>("editable");
  // 示例 markdown 状态。
  const [value, setValue] = useState<string>(INITIAL_PLAYGROUND_MARKDOWN);
  // 是否处于深色主题。
  const isDarkTheme = theme === "dark";
  // 是否处于只读模式。
  const isReadOnly = mode === "readonly";
  // 当前示例文案。
  const texts = playgroundTexts[locale];
  // 主题分段选项。
  const themeOptions: SegmentedControlOption<PlaygroundTheme>[] = [
    { value: "light", label: texts.lightLabel },
    { value: "dark", label: texts.darkLabel },
  ];
  // 语言分段选项。
  const localeOptions: SegmentedControlOption<PlaygroundLocale>[] = [
    { value: "zh-CN", label: texts.zhLabel },
    { value: "en-US", label: texts.enLabel },
  ];
  // 模式分段选项。
  const modeOptions: SegmentedControlOption<PlaygroundMode>[] = [
    { value: "editable", label: texts.editableLabel },
    { value: "readonly", label: texts.readOnlyLabel },
  ];

  // 同步文档语言，确保辅助技术获得当前语言信息。
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // 同步根画布主题，避免页面边缘露出错误主题背景。
  useEffect(() => {
    document.documentElement.classList.remove(
      ...Object.values(DOCUMENT_THEME_CLASSES),
    );
    document.documentElement.classList.add(DOCUMENT_THEME_CLASSES[theme]);
  }, [theme]);

  return (
    <div
      className={`playground-shell zt-md ${isDarkTheme ? "zt-md-dark" : "zt-md-light"}`}
    >
      <main className="playground-main">
        <section
          className="playground-workbench"
          aria-label={texts.editorPreviewLabel}
        >
          <header className="playground-toolbar">
            <div className="playground-brand">
              <h1 className="playground-product-name">ZT React Milkdown</h1>
              <p className="playground-description">{texts.description}</p>
            </div>
            <div
              className="playground-controls"
              aria-label={texts.controlsLabel}
            >
              <SegmentedControl
                label={texts.themeLabel}
                value={theme}
                options={themeOptions}
                onChange={setTheme}
              />
              <SegmentedControl
                label={texts.localeLabel}
                value={locale}
                options={localeOptions}
                onChange={setLocale}
              />
              <SegmentedControl
                label={texts.modeLabel}
                value={mode}
                options={modeOptions}
                onChange={setMode}
              />
            </div>
          </header>

          <div className="playground-editor">
            <MilkdownEditor
              value={value}
              onChange={setValue}
              // imageUpload={{
              //   upload: resolvePlaygroundImageUrl,
              // }}

              // shortcutMode="modAlt"
              headerSlot={
                <div className="playground-editor-context" role="note">
                  <span className="playground-editor-context-item">
                    <kbd>/</kbd>
                    {texts.commandHint}
                  </span>
                  <span className="playground-editor-context-item">
                    {texts.selectionHint}
                  </span>
                </div>
              }
              theme={theme}
              locale={locale}
              readOnly={isReadOnly}
              maxHeight={640}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

// 根容器节点。
const container = document.getElementById("root");

if (!container) {
  throw new Error("缺少 root 节点");
}

// 应用根实例。
const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
