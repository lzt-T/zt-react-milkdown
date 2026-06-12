import type { Config } from 'tailwindcss';

// Scopes generated Tailwind utilities to the editor root so package CSS does not override host apps.
const tailwindConfig = {
  important: '.zt-md'
} satisfies Config;

export default tailwindConfig;
