---
type: adr
status: 生效
tags: [idea-loop, seo, seo-scan, openseo, mobbin, agents, connector]
summary: 带连接器的 agent 不写 tools 白名单、只写 disallowedTools，连接器被别处配置改了名也拿得到工具
related: ["[[164]]", "[[2026-11-20-connector-tools-grill]]", "[[0020-idea-loop-seo]]"]
---

# ADR-0079 — 带连接器的 agent 只写禁用清单，不写 `tools:` 白名单

> 由 spec `seo-agents-openseo-tool-name` 蒸馏而来，该 spec 已删除。决定过程见 [[164]]，grill 原话见 [[2026-11-20-connector-tools-grill]]。

## 1 背景（why）

idea-loop 插件自带两个连接器（会话里提供工具的 MCP 服务）：OpenSEO（SEO 扫描用）和 Mobbin（设计调研用）。用到它们的 7 个 agent，`tools:` 白名单里写死了插件那份的全名，例如 `mcp__plugin_idea-loop_openseo__*`。

Claude Code 对同一个连接器只连一次：同一地址在几处配了，按本地、项目、用户、插件、claude.ai 连接器的优先级用一份。插件那份被顶掉时，工具名换成手动配置起的名字，白名单按全名逐字匹配，一个工具都拿不到。

真实发生过：一个站点 2026-10-29 的 SEO 扫描（idea-loop 0.1.5），主会话里 OpenSEO 调得通，technical-auditor 却交回「OpenSEO MCP 工具在本会话不可用」，page-optimizer 0 条发现，整次 0 credits；那个会话里工具叫 `mcp__openseo__*`，项目根 `.mcp.json` 也配了同地址的 `openseo`。2026-11-20 用假插件在本机复现：项目用别的名字配同一服务时，写白名单的 agent 一个工具都没有，只写禁用清单的 agent 拿到 `mcp__myecho__ping`。别的插件（PostHog、ChatCut）本来就不写白名单、按工具短名用。

## 2 决策（how）

- **7 个 agent 去掉 `tools:`，改写 `disallowedTools: Edit, NotebookEdit, Agent`**：technical-auditor、page-optimizer、keyword-miner、backlink-analyst、geo-analyst、results-analyst、uiux-researcher。定义里不加「只用某个连接器」的话，以后要禁哪种再往清单里加。原白名单里有 `Write` 的继续能写，所以 `Write` 不进清单。
- **推翻 2026-11-16 的做法**：当时（[[164]] 题 1）定的是「以插件那份为准，被顶替就停下让人删配置」，PR #397 先按它做完；人提起 Mobbin 也碰到同样的事后，题 2 改选「agent 不写白名单、改写 `disallowedTools`」（原话「选 B，起 grill 把方案定下来」）。被顶替的判断表、交回形状、SEO 设置的那段话术整支删掉。
- **skill 和 agent 里一律用工具短名**（「OpenSEO 的 `whoami`」），不写 `mcp__plugin_…` 全名；SEO 扫描开场按短名认 OpenSEO：会话里有连接器同时带 `whoami` 和 `get_project_context` 就算在，一个都没有才停下、交回「去 `/mcp` 连上」。
- **防回退**：agent-builder 的模板改成「用到连接器的 agent 写 `disallowedTools`，不写 `tools:`」，加文档测试：任何 agent 的 `tools:` 行或正文出现 `mcp__plugin_` 就红。
- **版本档**：patch。

没做（取舍）：

- 不按名字禁常见高危连接器（Gmail、Supabase 等）：每人起的名字不同，禁不全。已知代价：agent 手里也有主会话里别的连接器，跟 implementer 等本来就不写白名单的 agent 一样。
- 不折中写「白名单放开所有连接器」：实测 `tools: Read, mcp__*` 让 agent 拿到 0 个连接器工具。
- `seo-scan` 的 `allowed-tools`（预先放行、免确认的清单）保留插件全名：实测它不认中间通配。已知限制：默认权限模式下连接器被改名时，OpenSEO 调用会等确认，定时触发没人在场会卡住；`auto` 模式不受影响。
- 同一服务两个不同地址都连上时选哪一套：本机没有这种配置，记为已知限制。

## 3 结果（result）

- 合并在 PR #397（方向 agent 不认得改了名的 OpenSEO）；issue #164 已 CLOSED（2026-11-20）。
- 对着 `main` c2b43c34 核过：上述 7 个 `idea-loop/agents/*.md` 都只有 `disallowedTools: Edit, NotebookEdit, Agent`，没有 `tools:`，没有 `mcp__plugin_`；`idea-loop/skills/seo/seo-scan/SKILL.md` 第 3 步按短名认 OpenSEO；`seo-setup/references/` 里没有 `openseo-superseded.md`；agent-builder 模板有 `disallowedTools` 一行；`idea-loop/README.md` 的 agents 一节写明了这条规则。
- 守护：`idea-loop/scripts/seo-connector-tools-doc.test.mjs`（12 条，本次对账全过）。
