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
 * 示例应用组件。
 */
const App = (): JSX.Element => {
  // 当前主题状态。
  const [theme, setTheme] = useState<PlaygroundTheme>("light");
  // 示例 markdown 状态。
  const [value, setValue] = useState<string>(
    [
      "# Hello Milkdown",
      "",
      "在这里写你的灵感、文档、公式与注释。",
      "",
      "行内公式：$E=mc^2$",
      "",
      "块级公式：",
      "$$",
      "\\int_0^1 x^2 dx",
      "$$",
      "",
      "> 主题切换会保留编辑内容。",
    ].join("\n"),
  );
  // 是否处于深色主题。
  const isDarkTheme = theme === "dark";
  // 主题切换文案。
  const themeButtonLabel = isDarkTheme ? "切换浅色" : "切换深色";
  /**
   * 切换浅色与深色主题。
   */
  const handleThemeToggle = useCallback((): void => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }, []);

  return (
    <div className={`playground-shell ${isDarkTheme ? "playground-dark" : "playground-light"}`}>
      <div className="playground-orb playground-orb-primary" />
      <div className="playground-orb playground-orb-secondary" />
      <main className="playground-main">
        <header className="playground-hero">
          <p className="playground-eyebrow">ZT React Milkdown</p>
          <h1 className="playground-title">Write With Rhythm</h1>
          <p className="playground-description">
            重新设计后的双主题编辑器，兼顾可读性、氛围感与公式输入体验。
          </p>
          <button type="button" className="playground-theme-toggle" onClick={handleThemeToggle}>
            {themeButtonLabel}
          </button>
        </header>
        <section className="playground-editor-wrap">
          <MilkdownEditor value={value} onChange={setValue} theme={theme} />
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
