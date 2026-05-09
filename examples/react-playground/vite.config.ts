import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/**
 * 创建示例项目的 Vite 配置。
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 对齐主工程别名，确保示例工程可解析 "@/..." 导入。
    alias: {
      "@": resolve(__dirname, "../../src"),
    },
    // 在 link 包联调时强制复用同一份 React 运行时，避免双实例问题。
    dedupe: ["react", "react-dom"],
  },
});
