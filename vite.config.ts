import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

/** 判断依赖是否应作为 peer 保留在消费端。 */
const isExternalPeerDependency = (id: string): boolean =>
  id === 'react' ||
  id.startsWith('react/') ||
  id === 'react-dom' ||
  id.startsWith('react-dom/') ||
  id === '@milkdown/kit' ||
  id.startsWith('@milkdown/kit/');

/**
 * 创建 Vite 的库构建配置。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    dts({
      include: ['src'],
      outDir: 'dist',
      insertTypesEntry: true,
      // 修正入口声明文件，避免生成空的 dist/index.d.ts。
      beforeWriteFile: (filePath, content) => {
        if (filePath.endsWith('dist/index.d.ts')) {
          return {
            filePath,
            content: "export * from './src/index';\n"
          };
        }

        return { filePath, content };
      }
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ZtReactMilkdown',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs')
    },
    rollupOptions: {
      external: isExternalPeerDependency,
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css' || assetInfo.name?.endsWith('.css')) {
            return 'style.css';
          }

          return 'assets/[name][extname]';
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts']
  }
});
