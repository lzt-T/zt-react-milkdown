import { StrictMode, useCallback, useState } from "react";
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
 * 示例应用文案结构。
 */
interface PlaygroundTexts {
  /** 示例描述。 */
  description: string;
  /** 切换浅色主题文案。 */
  lightThemeLabel: string;
  /** 切换深色主题文案。 */
  darkThemeLabel: string;
  /** 切换中文文案。 */
  zhLabel: string;
  /** 切换英文文案。 */
  enLabel: string;
}

/**
 * 示例应用语言包。
 */
const playgroundTexts: Record<PlaygroundLocale, PlaygroundTexts> = {
  "zh-CN": {
    description: "重新设计后的双主题编辑器，兼顾可读性、氛围感与公式输入体验。",
    lightThemeLabel: "切换浅色",
    darkThemeLabel: "切换深色",
    zhLabel: "中文",
    enLabel: "英文",
  },
  "en-US": {
    description:
      "A redesigned dual-theme editor for readable notes, atmosphere, and math input.",
    lightThemeLabel: "Light theme",
    darkThemeLabel: "Dark theme",
    zhLabel: "Chinese",
    enLabel: "English",
  },
};

/**
 * 示例应用组件。
 */
const App = (): JSX.Element => {
  // 当前主题状态。
  const [theme, setTheme] = useState<PlaygroundTheme>("light");
  // 当前语言状态。
  const [locale, setLocale] = useState<PlaygroundLocale>("zh-CN");
  // 示例 markdown 状态。
  const [value, setValue] = useState<string>(
    [
      "# Hello Milkdown",
      "",
      "在这里写你的灵感、文档、公式与注释。",
      "块级公式：",
      "$$",
      "\\int_0^1 x^2 dx",
      "$$",
      "",
      "> 主题切换会保留编辑内容。",
      "- [ ] asdf",
    ].join("\n"),
  );
  // 是否处于深色主题。
  const isDarkTheme = theme === "dark";
  // 当前示例文案。
  const texts = playgroundTexts[locale];
  // 主题切换文案。
  const themeButtonLabel = isDarkTheme
    ? texts.lightThemeLabel
    : texts.darkThemeLabel;
  // 语言切换文案。
  const localeButtonLabel = locale === "zh-CN" ? texts.enLabel : texts.zhLabel;
  /**
   * 切换浅色与深色主题。
   */
  const handleThemeToggle = useCallback((): void => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }, []);
  /**
   * 切换中文与英文语言。
   */
  const handleLocaleToggle = useCallback((): void => {
    setLocale((currentLocale) =>
      currentLocale === "zh-CN" ? "en-US" : "zh-CN",
    );
  }, []);

  return (
    <div
      className={`playground-shell ${isDarkTheme ? "playground-dark" : "playground-light"}`}
    >
      <div className="playground-orb playground-orb-primary" />
      <div className="playground-orb playground-orb-secondary" />
      <main className="playground-main">
        <header className="playground-hero">
          <p className="playground-eyebrow">ZT React Milkdown</p>
          <h1 className="playground-title">Write With Rhythm</h1>
          <p className="playground-description">{texts.description}</p>
          <div className="playground-actions">
            <button
              type="button"
              className="playground-theme-toggle"
              onClick={handleThemeToggle}
            >
              {themeButtonLabel}
            </button>
            <button
              type="button"
              className="playground-theme-toggle"
              onClick={handleLocaleToggle}
            >
              {localeButtonLabel}
            </button>
          </div>
        </header>

        <section className="playground-editor-wrap">
          <MilkdownEditor
            value={value}
            onChange={(markdown) => {
              console.log("Markdown changed:", markdown);
              setValue(markdown);
            }}
            theme={theme}
            locale={locale}
            maxHeight={400}
          />
        </section>
      </main>
      <div
        style={{
          height: "900px",
        }}
      ></div>
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
