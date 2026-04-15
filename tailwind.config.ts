import type { Config } from 'tailwindcss';

/**
 * 定义 Tailwind 的扫描范围与主题令牌映射。
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'zt-bg': 'var(--zt-bg)',
        'zt-fg': 'var(--zt-fg)',
        'zt-muted': 'var(--zt-muted)',
        'zt-border': 'var(--zt-border)',
        'zt-primary': 'var(--zt-primary)'
      },
      borderRadius: {
        zt: 'var(--zt-radius)'
      },
      fontFamily: {
        sans: ['var(--zt-font)']
      }
    }
  },
  corePlugins: {
    preflight: false
  }
};

export default config;
