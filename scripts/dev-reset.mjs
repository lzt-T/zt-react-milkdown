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
 * 清理示例项目中与本地包联调相关的缓存目录。
 */
async function resetDevCaches() {
  // 使用当前工作目录作为路径基准，避免平台路径分隔符差异。
  const rootDir = process.cwd();
  // 示例项目的 node_modules 目录。
  const exampleNodeModulesDir = path.join(rootDir, 'examples', 'react-playground', 'node_modules');
  // Vite 预构建缓存目录。
  const viteCacheDir = path.join(exampleNodeModulesDir, '.vite');

  await removeDir(viteCacheDir);
}

await resetDevCaches();
