import { refractor } from 'refractor';
import type { Refractor, Syntax } from 'refractor/core';
import dart from 'refractor/dart';
import docker from 'refractor/docker';
import graphql from 'refractor/graphql';
import groovy from 'refractor/groovy';
import jsx from 'refractor/jsx';
import mermaid from 'refractor/mermaid';
import nginx from 'refractor/nginx';
import powershell from 'refractor/powershell';
import protobuf from 'refractor/protobuf';
import scala from 'refractor/scala';
import toml from 'refractor/toml';
import tsx from 'refractor/tsx';
import zig from 'refractor/zig';

// 在默认 common 语言集基础上按需补充的常用工程语言列表。
const EXTRA_CODE_BLOCK_SYNTAXES: readonly Syntax[] = [
  jsx,
  tsx,
  docker,
  toml,
  graphql,
  powershell,
  nginx,
  mermaid,
  protobuf,
  dart,
  scala,
  groovy,
  zig
];

/**
 * 注册纯文本空语法，避免官方插件将 text 视为不支持的语言。
 */
function plainText(highlighter: Refractor): void {
  highlighter.languages.text = {};
}

plainText.displayName = 'text';

/**
 * 为精简版高亮实例补充常用工程语言与纯文本支持。
 */
export function configureCodeBlockHighlighter(highlighter: Refractor): void {
  EXTRA_CODE_BLOCK_SYNTAXES.forEach((syntax) => {
    if (!highlighter.registered(syntax.displayName)) {
      highlighter.register(syntax);
    }
  });
  highlighter.register(plainText);
}

configureCodeBlockHighlighter(refractor);

export { refractor };
