import { access, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import postcssCascadeLayers from '@csstools/postcss-cascade-layers';

// 当前脚本所在目录。
const scriptDir = dirname(fileURLToPath(import.meta.url));

// Vite 库构建输出的样式文件路径。
const cssFilePath = resolve(scriptDir, '../dist/style.css');

// Vite 库构建输出的静态资产目录。
const assetsDirPath = resolve(scriptDir, '../dist/assets');

// 匹配仅用于兼容旧浏览器的 woff/ttf 字体资源后缀。
const LEGACY_FONT_SOURCE_PATTERN = /\.(?:woff|ttf)(?:$|[)"'?])/i;

/**
 * 裁剪 @font-face 中冗余的 woff 与 ttf 声明，仅保留现代浏览器普遍支持的 woff2。
 */
const stripLegacyFontFacesPlugin = () => ({
  postcssPlugin: 'zt-strip-legacy-font-faces',
  Once(root) {
    root.walkAtRules('font-face', (atRule) => {
      atRule.walkDecls('src', (decl) => {
        const sources = postcss.list.comma(decl.value);
        const woff2Sources = sources.filter((source) => !LEGACY_FONT_SOURCE_PATTERN.test(source));
        if (woff2Sources.length > 0) {
          decl.value = woff2Sources.join(', ');
        }
      });
    });
  }
});

/**
 * 清理构建产物中未被 CSS 引用的旧版 woff/ttf 字体文件。
 */
async function removeUnusedLegacyFontAssets() {
  try {
    await access(assetsDirPath);
  } catch {
    return;
  }

  const entries = await readdir(assetsDirPath, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.(?:woff|ttf)$/i.test(entry.name))
      .map((entry) => unlink(resolve(assetsDirPath, entry.name)))
  );
}

/**
 * 将发布 CSS 中的 cascade layers 转成 Tailwind 3 可处理的普通 CSS，并瘦身字体资产。
 */
async function transformCssForTailwind3() {
  // 构建生成的 CSS 内容。
  const css = await readFile(cssFilePath, 'utf8');

  // PostCSS 处理后的兼容 CSS。
  const result = await postcss([postcssCascadeLayers(), stripLegacyFontFacesPlugin()]).process(css, {
    from: cssFilePath,
    to: cssFilePath
  });

  await writeFile(cssFilePath, result.css, 'utf8');
  await removeUnusedLegacyFontAssets();
}

await transformCssForTailwind3();
