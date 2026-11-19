---
type: spec
tags: [idea-loop, plugin-mcp-override-rule]
summary: idea-loop/AGENTS.md 加一条插件自带 MCP 以插件那份为准的规则，并用文档测试守住白名单只写插件名
related: []
issues: [345]
---

# 插件自带的 MCP 被顶替时的插件级规则

> #345 存在：`idea-loop/AGENTS.md` 里没有一条写「插件自带的 MCP 被别处配置顶替时怎么办」的规则，详情在「问题陈述」

## 问题陈述

### 下一个用插件自带 MCP 的 skill 或 agent 没有规则可照

idea-loop 在自己的 `.mcp.json` 里带了三个 MCP 服务：`design-archive`（本地命令）、`openseo` 和 `mobbin`（远程 http）。skill 和 agent 按插件名下的工具名用它们（`mcp__plugin_idea-loop_<服务>__*`）。Claude Code 对同一个服务只连一份：项目、用户、本地配置里配了同一个服务（远程比 URL，本地比命令），插件那份就被顶替，工具换成别人起的名字（`code.claude.com/docs/en/mcp.md`，2026-11-16 查，出处见 #164 的 spec）。

真实发生过：一个项目 2026-10-29 的 seo-scan，项目自己的 `.mcp.json` 也配了 `openseo`，五个方向 agent 拿不到工具（#164 正文）。#164 起草 spec 时摆的三个修法里有两个是去迁就别处的配置（白名单加 `mcp__openseo__*`，或不写白名单），人否掉了，原话：「从plugin建设的角度来说，我是觉得统一用plugin内的mcp配置是不是比较好？」（#164 的 triage 会话，2026-11-16）。这条方向只落在 #164 的 spec 里，只管 OpenSEO 的两处。

测了什么：2026-11-20 对着 `main`（1e0c2b92）在 `idea-loop/AGENTS.md` 里搜「mcp」「顶替」。看到什么：`idea-loop/AGENTS.md` 只有「skill 分类」「参考资料归谁」「登记」三节，没有任何一处写被顶替时怎么办。本该是：有一条插件级规则，新写一个用插件自带 MCP 的 skill 或 agent 时照它做，不再摆同一道题。分拣评论（2026-11-17，对着 5f26e2f）的结论相同。

现状里已有的零散做法（2026-11-20 对着 1e0c2b92 查）：

| 服务 | 谁用 | 被顶替时现在怎样 |
|---|---|---|
| `mobbin` | `uiux-researcher`（白名单 `mcp__plugin_idea-loop_mobbin__*`） | agent 第 0 步「先认 Mobbin 连着没有」，工具不在就交回「没连上」；`idea-loop:runtime` 的 claude-desktop 参考「装与设置」写了被同地址手动配置顶替时删哪份 |
| `openseo` | seo-scan、seo-setup、六个 SEO agent（白名单 `mcp__plugin_idea-loop_openseo__*`） | 没有确认；#164（开着，分支 `issue/164-openseo-tool-names`）在补 seo-scan、seo-setup 两处 |
| `design-archive` | `idea-loop:design-archive` 的查询、dreaming 的审阅页 | 没有确认；同样七个入口也有命令行，给同一份 JSON（`design-archive` 的 `references/query.md`） |

### 根因

- 方向只写在 #164 那份 spec 的「实现决策」里，spec 只管 OpenSEO 的两个流程；插件维护者读的 `idea-loop/AGENTS.md` 没有它，所以每个新流程都要重新想一遍。

## 方案

改完：维护 idea-loop 的 agent 新写或改一个用插件自带 MCP 的 skill、agent 时，读 `idea-loop/AGENTS.md` 就知道三件事：白名单只写插件名；流程开场确认工具以插件名加载，被顶替就停下并说清删哪份配置；`design-archive` 例外，工具不在就用命令行。白名单那一条另有一个文档测试守着，谁以后给白名单加了别的名字会红。

不画时序图：只改一份给维护者读的文档和加一个文档测试，没有模块间的消息变化。

同一件事的其他入口：

- `mobbin`：纳入规则作现存实例，不改它的流程（第 0 步和 runtime 参考已经符合新规则）。
- `openseo` 的 seo-scan、seo-setup：排除，归 #164 做；规则写好后 #164 照它就行。
- `design-archive`：纳入规则的例外，不加开场确认（理由见「实现决策」）。
- 其他插件（excalidrawer、posthog）自带的 MCP：排除，规则只管 idea-loop 自己 `.mcp.json` 里的服务；`results-analyst` 白名单里的 `mcp__plugin_excalidrawer_*`、`mcp__plugin_posthog_*` 也是插件名，测试照样放行。

## User Stories

只修问题、不加能力，不画树：

1. 期望行为（对应「下一个用插件自带 MCP 的 skill 或 agent 没有规则可照」）：维护者读 `idea-loop/AGENTS.md` 能找到「插件自带的 MCP」一节，照它写白名单和开场确认；有人给 agent 的 `tools` 或 skill 的 `allowed-tools` 加了不是 `mcp__plugin_` 开头的 MCP 名字，文档测试变红。

## 实现决策

- **落点 `idea-loop/AGENTS.md`，新开一节「插件自带的 MCP」**。依据：#164 retro 里人批的「开 issue，落 idea-loop/AGENTS.md」（issue 正文「从哪发现」）。
- **规则正文以 issue 给的新文为底**：「插件自带的 MCP 以插件那份为准：用它的流程开场确认它以插件名加载，被顶替就停下，说清删哪份配置；不在 agent 白名单或 allowed-tools 里加别的名字。」落地时按 `idea-loop:writing-for-agents` 改两处：「不在白名单里加别的名字」改成正向写法「白名单只写插件名 `mcp__plugin_idea-loop_<服务>__*`」（杠杆：否定）；删法写具体（用户级或本地配置 `claude mcp remove <名字>`，项目配置删 `.mcp.json` 里那一项，与 #164 spec 的删法一致）。再指一个现存实例：Mobbin 的 `uiux-researcher` 第 0 步加 runtime「装与设置」的 Mobbin 那条（杠杆：上下文指针，让维护者照现成做法写，不重新发明）。
- **design-archive 的例外：不加开场确认，工具不在就改用命令行**。分拣评论给的两种做法（规则里写「以工具名对不上为信号停下」，或另开 issue 给它加开场确认）都是「停下」；但 design-archive 跟另两个不同，它的七个入口命令行也有、输出同一份 JSON（`references/query.md`），被顶替时换命令行就不丢任何东西，停下只是多让人动一次配置。另外它是本地命令，配置里的命令带插件缓存路径，项目或用户要配出同一条命令才会顶替它，查不到这样的真实路径。夜间模式，按推荐定（记进 PR 描述「夜里替你定的」）。
- **加一个文档测试守白名单**：扫 `idea-loop/agents/*.md` 的 frontmatter `tools` 和 `idea-loop/skills/**/SKILL.md` 的 frontmatter `allowed-tools`，其中每个 `mcp__` 开头的名字都以 `mcp__plugin_` 开头；再断言 `idea-loop/AGENTS.md` 有这一节和三个要点。依据：根 `AGENTS.md` §5「能机械判定的规则不走这里，做成检查」。只读 frontmatter，`agent-builder` 正文里的模板行（`mcp__<server>__*`）不算。
- **版本档 patch**：只改维护者文档和加测试，不改任何 skill、agent 的行为（`REVIEW.md`「额外要求」：只改 README 或测试算 patch；`idea-loop/AGENTS.md` 是维护约定，不进运行时）。
- **README 不改**：没有 skill、agent、hook、脚本行为或产物位置的变化（`REVIEW.md`「额外要求」第一条只管这些）。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：文档测试（白名单只写插件名、AGENTS.md 有这一节） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：没改任何 skill、agent 的正文 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：一个文档测试 `idea-loop/scripts/plugin-mcp-names-doc.test.mjs`，`node --test` 跑。能抓到：有人给白名单加了 `mcp__openseo__*` 这类别处配置的名字、有人删了这一节；漏掉：新流程有没有真的写开场确认（那是写作判断，靠 review）。
- **增量功能测试**：
  - 前置：当前仓库。步骤：跑这个测试。期望：AGENTS.md 那一组断言先红（这一节还没写），写完转绿；白名单那组在现状上就是绿的。覆盖：期望行为 1。
  - 前置：临时给某个 agent 的 `tools` 加 `mcp__openseo__*`。步骤：跑测试。期望：红，报出文件和那个名字。覆盖：期望行为 1。
- **照着谁写**：`idea-loop/scripts/seo-params-doc.test.mjs`（读 agent frontmatter、断言白名单）。

## Out of scope

- 给 seo-scan、seo-setup 加 OpenSEO 的开场确认：#164 在做。
- 给 design-archive 加开场确认（理由见「实现决策」）。

## 关联

- #164（开着，分支 `issue/164-openseo-tool-names`，spec `seo-agents-openseo-tool-name`）：方向出处；它改 seo-scan、seo-setup、SEO agent，本 spec 只改 `idea-loop/AGENTS.md` 和加测试，文件不重叠，谁先合都行。
- 相邻还没完成的 spec：`docs/spec/index.md` 里没有动 `idea-loop/AGENTS.md` 或 MCP 配置的，无重叠。
