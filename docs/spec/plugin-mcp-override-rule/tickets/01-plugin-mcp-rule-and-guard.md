# 01 — idea-loop 维护约定加「插件自带的 MCP」一节，并用文档测试守住白名单

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

维护 idea-loop 的 agent 新写或改一个用插件自带 MCP 服务（插件 `.mcp.json` 里的 design-archive、openseo、mobbin）的 skill 或 agent 时，读 idea-loop 插件目录下的维护约定（`AGENTS.md`）就能找到一节「插件自带的 MCP」，照它做：

- 以插件那份为准，工具名一律是插件名 `mcp__plugin_idea-loop_<服务>__*`；agent 的 `tools` 和 skill 的 `allowed-tools` 只写这个名字。
- Claude Code 对同一个服务只连一份：项目、用户、本地配置里配了同一个服务（远程比 URL，本地比命令），插件那份被顶替，工具换成别的名字。用这个服务的流程开场确认它以插件名加载；被顶替就停下，交回里说清删哪份配置：用户级或本地配置 `claude mcp remove <名字>`，项目配置删项目 `.mcp.json` 里那一项。
- 现存做法可照：Mobbin——调研 agent 的第 0 步「先认 Mobbin 连着没有」，加上 runtime skill 的 claude-desktop 参考「装与设置」里 Mobbin 那一条写的删法。
- 例外：design-archive 不做开场确认。它的七个查询入口命令行也有、输出同一份 JSON（design-archive skill 的查询参考），工具不在就改用命令行。

写法照 writing-for-agents：正向写目标行为（「只写插件名」），不写「不要加别的名字」这种禁令。

再加一个文档测试，放在 idea-loop 的 scripts 目录下（`plugin-mcp-names-doc.test.mjs`，照 `seo-params-doc.test.mjs` 的读法），`node --test` 跑：

- idea-loop 所有 agent 定义的 frontmatter `tools`、所有 `SKILL.md` 的 frontmatter `allowed-tools` 里，每个 `mcp__` 开头的名字都以 `mcp__plugin_` 开头。只读 frontmatter（agent-builder 正文里的模板行 `mcp__<server>__*` 不算）。其他插件自带的名字（`mcp__plugin_excalidrawer_…`、`mcp__plugin_posthog_…`）照样通过。失败时报出文件和那个名字。
- 维护约定有「插件自带的 MCP」这一节，节里出现插件名的写法、`claude mcp remove`、design-archive 改用命令行这三样。

升 `idea-loop/.claude-plugin/plugin.json` 的 `version` 一个 patch 档（只改维护约定和加测试，不改任何 skill、agent 的行为）。README 不改。

## 验收标准

- [x] 维护约定的那一节先在测试里红（节还没写时跑测试，AGENTS.md 那组断言失败），写完转绿。
- [x] 临时给某个 agent 的 `tools` 加 `mcp__openseo__*` 跑测试，红且报出文件和名字；撤掉后绿。
- [x] 那一节写了：插件名为准与白名单只写插件名、开场确认与被顶替停下、两种删法、Mobbin 现存实例、design-archive 例外。
- [x] `plugin.json` 的 `version` 从 main 当前版本升了一个 patch。
- [x] 全量测试 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` 全绿。

- [x] review 第 1 轮 C1（2026-11-20）：维护约定那一节不抄插件自带服务的名单（服务以插件 `.mcp.json` 为准，一个文件就能查到的留给环境）；测试照样全绿。

## 选中的存量回归

- `scripts/plugin-version.test.mjs`：改了插件目录必须升版本。
- `idea-loop/scripts/no-project-leak.test.mjs`：新写的维护约定和测试里不能出现任何项目的信息。
- `idea-loop/scripts/seo-params-doc.test.mjs`：同样读 agent 白名单，新测试不应与它矛盾。
