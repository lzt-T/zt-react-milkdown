import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * 删除目录并在控制台输出结果。
 * @param {string} targetPath 要删除的目录路径。
 */
async function removeDir(targetPath) {
  try {
    await rm(targetPath, { recursive: true, force: true });
    console.log(`[dev:reset] removed: ${targetPath}`);
  } catch (error) {
    console.error(`[dev:reset] failed to remove: ${targetPath}`);
    throw error;
  }
}

/**
 * 清理单包模式下开发联调相关的缓存目录。
 */
async function resetDevCaches() {
  // 使用当前工作目录作为路径基准，避免平台路径分隔符差异。
  const rootDir = process.cwd();
  // 根目录 Vite 预构建缓存目录（单包模式默认路径）。
  const rootViteCacheDir = path.join(rootDir, 'node_modules', '.vite');
  // 兼容清理历史多包结构遗留的示例目录缓存。
  const legacyExampleViteCacheDir = path.join(rootDir, 'examples', 'react-playground', 'node_modules', '.vite');

  await removeDir(rootViteCacheDir);
  await removeDir(legacyExampleViteCacheDir);
}

await resetDevCaches();
