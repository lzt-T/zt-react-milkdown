# 实施验证记录

## 移除展示名映射阶段

- 删除 LANGUAGE_LABEL_MAP 和 resolveLanguageLabel；生产源码引用搜索无残留。菜单普通项 label 直接使用规范化语言值，当前按钮在非 text 情况下使用 normalizedCurrentLanguage。
- 静态核对 javascript、typescript、dart、js、sh 均直接显示其标识；搜索仍对输入、标签和值执行 toLowerCase，因此 DART 可以命中 dart。
- text 菜单项仍先从普通列表排除再单独添加，保持唯一；菜单和按钮均读取 codeBlockLanguagePlainText。当前 zh-CN 与 en-US 的该字段均为 `text`，本次保留其内容及国际化入口。
- 变更仅涉及选择器展示：语言写回、排序、Markdown 序列化和高亮逻辑未修改，无公共 API 变化。保留已有有效注释，新增函数及变量注释均为 0。
- `git diff --check` 通过。此次为简单展示清理，采用静态验证，未新增测试；未运行 package.json 脚本，未控制浏览器，实际菜单点击和视觉表现未验证。

## 全量语言阶段

- 共享模块已改用 `refractor/all`，移除单独 Dart 导入和注册；保留纯文本支持与官方刷新适配。README 已同步说明当前版本全部语法及别名的同步加载范围。本阶段没有新增依赖或公共 API。
- 独立 Node 诊断确认默认入口、全量入口和项目共享模块为同一 refractor 实例，全部 400 个语言标识及别名均已注册（计数包含别名，不等于 400 种独立语言）。Dart、Scala、Elixir 示例均产生语法 token，text 仅返回文本节点。
- 菜单静态检查：读取共享实例的 listLanguages，规范化后去重并排除 text，再添加唯一的本地化 text 选项；标签和值均采用不区分大小写的搜索。实际菜单点击及视觉表现未验证。
- 在全量配置下重新执行独立 JSDOM/Milkdown 双实例并发诊断：两个编辑器均通过 Dart 初始化、真实搜索全部替换、undo/redo、第二个未聚焦代码块的 text/Dart/Scala/Elixir 切换，以及 Dart、Scala、Elixir、js、text、未知语言和默认语言的 parser/serializer 往返；刷新后的装饰与同文档新建状态一致。两个实例销毁正常。
- 修改入口前已确认没有构建脚本授权，因此基线 ES/CJS 原始及 gzip 体积未测量；全量产物体积、增量和初始化耗时同样未测量。未运行项目 build/typecheck/test 脚本，也没有直接运行其内容绕过限制。
- 本阶段更新 1 处已有函数 JSDoc，新增函数/变量注释均为 0；修改源码限于共享高亮模块的入口和冗余注册清理。

以下记录为先前“默认语言集 + Dart”阶段的实施历史；本阶段实际验证以上述结果为准。

## 已完成的修改

- pnpm 添加 `@milkdown/plugin-prism@7.21.1`，使用 `--ignore-scripts`，未执行 package.json 脚本。锁文件中官方插件与项目均解析为 refractor 5.0.0。
- 官方 prism 插件集合已接入原装配入口，配置回调注册 Dart 和 text 空语法；语言选择器使用同一注册模块。
- 删除原 129 行自定义高亮实现和导出；更新 README。复制、预览、schema、主题 CSS 未修改。
- 新增高亮注册与刷新适配两个模块，共补充 5 处函数 JSDoc、4 处变量行注释，均为简体中文。选择器约 724 行，本次只调整导入和 Dart 标签，按手术性修改原则不拆分无关 UI。

## 已执行的验证

- 独立 Node 诊断直接导入新增 TypeScript 注册模块及安装的官方插件，不运行项目检查脚本，也未控制浏览器。
- Dart 注册成功；`final x = "ok"; // note` 产生关键字、字符串和注释 token。
- text 高亮结果仅包含原始文本，无语法 token；未出现纯文本不支持警告。
- 静态确认菜单搜索将标签和值转为小写，Dart 标签和 dart 值均可被大小写查询命中；既有纯文本国际化标签保持原样。
- 静态确认仍导入默认 refractor 入口，未减少原有语法及别名；没有残留的旧插件符号引用。
- `git diff --check` 通过。

## 已修复：官方插件外部事务刷新遗漏

构造包含开头段落、两个 Dart 代码块的 ProseMirror 文档，选区位于段落。第二个代码块内容为 `final y = 2;`，使用 `insertText('hello', secondPosition + 1, secondPosition + 6)` 替换关键字。

原始官方插件应用事务后仍为 `hello` 保留 `token keyword` 装饰；以同一新文档重新初始化官方插件时，`hello` 没有该装饰。两组结果不一致，确认属于增量刷新遗漏。

已新增 `code-block-prism-refresh.ts`，保留官方生命周期与装饰生成，在 docChanged 时调用官方 init 重算。proposal、design、spec、tasks 已同步记录方案与复现场景。

## 刷新适配后的集成诊断

使用独立 Node 命令，在 JSDOM 中创建真实 Milkdown 编辑器，装配 commonmark、官方历史插件、官方高亮适配、项目语言 schema 及 prosemirror-search；未调用项目 test/typecheck/build 脚本。首次命令缺少全局 addEventListener，补齐诊断 DOM 事件接口后通过。随后以两个编辑器并发创建重复验证，每个实例均通过以下检查：

- Dart 初始高亮、实际 SearchQuery + replaceAll 修改两个未聚焦代码块后，装饰与同文档重新初始化结果一致；DOM 不残留 keyword token。
- undo 和 redo 后，装饰与重新初始化结果一致。
- 第二个未聚焦代码块切换 text 再切回 dart 后，装饰正确。
- dart、js、text、未知语言及无语言 Markdown 经过项目 parser/serializer 往返，源码和规范化语言值一致。
- 编辑器 destroy 完成，另一个实例仍可正常执行上述流程。

复制、HTML/SVG 预览、只读及明暗主题完成静态兼容检查：对应 NodeView、编辑权限配置、主题 CSS 和 schema 行为未修改，官方仍输出现有 token 类名。此项不代表浏览器实际交互或视觉验证通过。

## 未验证

- 未执行 typecheck、build、test：用户未明确授权 package.json 脚本，也未绕过限制直接运行脚本内容。
- 菜单实际点击、复制、HTML/SVG 预览、只读模式及明暗主题未完成动态集成验证。
- 浏览器视觉检查未执行，遵守项目浏览器控制禁令。现有 NodeView、主题和 schema 未改动仅为静态兼容证据，不等于运行通过。
