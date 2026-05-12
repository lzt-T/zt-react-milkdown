import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

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
      insertTypesEntry: true
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
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@milkdown/kit'
      ],
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
