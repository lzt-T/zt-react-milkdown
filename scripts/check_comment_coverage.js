#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';

/** 需要忽略的目录名称。 */
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.git']);
/** 支持检查的文件后缀。 */
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * 读取命令行参数。
 */
function parseArgs() {
  // 原始参数列表。
  const argv = process.argv.slice(2);
  // 目标根目录。
  const root = path.resolve(process.cwd(), argv[0] || '.');
  // 是否输出 JSON。
  const json = argv.includes('--json');

  return { root, json };
}

/**
 * 递归收集目标源文件。
 */
function collectFiles(dirPath) {
  // 目录下的实体列表。
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  // 当前目录的文件收集结果。
  const files = [];

  for (const entry of entries) {
    // 当前实体绝对路径。
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      files.push(...collectFiles(fullPath));
      continue;
    }

    // 当前文件后缀。
    const extname = path.extname(entry.name);
    if (TARGET_EXTENSIONS.has(extname)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 检查某一行上方是否存在紧邻注释。
 */
function hasAdjacentComment(lines, lineIndex) {
  // 上一行索引。
  const prevIndex = lineIndex - 1;

  if (prevIndex < 0) {
    return false;
  }

  // 紧邻上一行内容。
  const prevLine = lines[prevIndex].trim();
  if (prevLine.startsWith('//') || prevLine.endsWith('*/')) {
    return true;
  }

  return false;
}

/**
 * 检查某一行上方是否存在紧邻 JSDoc。
 */
function hasAdjacentJsDoc(lines, lineIndex) {
  // 上一行索引。
  const prevIndex = lineIndex - 1;

  if (prevIndex < 0) {
    return false;
  }

  // 紧邻上一行内容。
  const prevLine = lines[prevIndex].trim();
  if (prevLine.endsWith('*/')) {
    return true;
  }

  return false;
}

/**
 * 对文件做注释覆盖检查。
 */
function checkFile(filePath) {
  // 文件文本内容。
  const content = fs.readFileSync(filePath, 'utf8');
  // 按行拆分内容。
  const lines = content.split(/\r?\n/);
  // 当前文件发现的问题。
  const issues = [];

  lines.forEach((line, index) => {
    // 去掉首尾空白后的当前行。
    const trimmed = line.trim();

    if (/^(const|let|var)\s+/.test(trimmed)) {
      if (!hasAdjacentComment(lines, index)) {
        issues.push({
          file: filePath,
          line: index + 1,
          rule: 'variable-comment',
          code: trimmed
        });
      }
    }

    if (/^(async\s+)?function\s+/.test(trimmed) || /^(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/.test(trimmed) || /^(const|let|var)\s+\w+\s*=\s*(async\s*)?[\w$]+\s*=>/.test(trimmed)) {
      if (!hasAdjacentJsDoc(lines, index)) {
        issues.push({
          file: filePath,
          line: index + 1,
          rule: 'function-jsdoc',
          code: trimmed
        });
      }
    }

    if (/^(export\s+)?(const\s+)?enum\s+/.test(trimmed)) {
      if (!hasAdjacentJsDoc(lines, index)) {
        issues.push({
          file: filePath,
          line: index + 1,
          rule: 'enum-jsdoc',
          code: trimmed
        });
      }
    }
  });

  return issues;
}

/**
 * 主执行入口。
 */
function main() {
  // 命令行参数。
  const args = parseArgs();
  // 目标文件列表。
  const files = collectFiles(args.root);
  // 全量问题列表。
  const allIssues = files.flatMap((filePath) => checkFile(filePath));

  if (args.json) {
    console.log(JSON.stringify(allIssues, null, 2));
    return;
  }

  if (allIssues.length === 0) {
    console.log('Comment coverage looks good.');
    return;
  }

  allIssues.forEach((issue) => {
    console.log(`${issue.file}:${issue.line} [${issue.rule}] ${issue.code}`);
  });

  process.exitCode = 1;
}

main();
