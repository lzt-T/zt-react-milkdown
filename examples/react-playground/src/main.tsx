import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MilkdownEditor } from "../../../src/react/components/MilkdownEditor";
import "../../../src/styles/editor.css";

/**
 * 示例应用组件。
 */
const App = (): JSX.Element => {
  // 示例 markdown 状态。
  const [value, setValue] = useState<string>(
    [
      "# Hello Milkdown",
      "",
      "行内公式：$E=mc^2$",
      "",
      "块级公式：",
      "$$",
      "\\int_0^1 x^2 dx",
      "$$",
    ].join("\n"),
  );

  return (
    <div style={{ margin: "24px auto", maxWidth: 880 }}>
      <MilkdownEditor value={value} onChange={setValue} theme="light" />
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
