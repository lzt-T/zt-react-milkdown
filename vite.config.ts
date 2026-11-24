import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 读取 package.json 声明的运行时与对等依赖，交由消费端打包器统一去重。
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

// 需要作为外部依赖保留的包名集合。
const EXTERNAL_PACKAGE_NAMES = Array.from(
  new Set([
    'react',
    'react-dom',
    '@milkdown/kit',
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.dependencies ?? {})
  ])
);

/** 判断依赖是否应作为外部依赖保留在消费端。 */
const isExternalDependency = (id: string): boolean => {
  if (id.startsWith('.') || id.startsWith('/') || id.startsWith('@/') || id.startsWith('\0')) {
    return false;
  }

  return EXTERNAL_PACKAGE_NAMES.some(
    (packageName) => id === packageName || id.startsWith(`${packageName}/`)
  );
};

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
    // 禁止将 KaTeX 等字体文件 Base64 内联进 CSS，改为独立按需加载资产。
    assetsInlineLimit: 0,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ZtReactMilkdown',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs')
    },
    rollupOptions: {
      external: isExternalDependency,
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
