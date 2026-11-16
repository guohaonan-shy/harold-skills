---
type: spec
tags: [seo, seo-scan, openseo, agents]
summary: OpenSEO 被项目或用户配置顶替改名时，seo-scan 的方向 agent 仍拿得到工具，拿不到就开场说清
related: ["[[0020-idea-loop-seo]]"]
issues: [164]
---

# 方向 agent 不认得改了名的 OpenSEO

> #164 存在：项目自己用另一个名字配了同一个 OpenSEO 服务时，按白名单起的方向 agent 一个 OpenSEO 工具都拿不到；2026-11-16 用一个假插件在本机 Claude Code 2.1.299 上复现，详情在「问题陈述」

## 问题陈述

### 1. 项目也配了 OpenSEO，seo-scan 的方向 agent 全部空手而归

seo-scan 每周派五个方向 agent（technical-auditor、page-optimizer、keyword-miner、backlink-analyst、geo-analyst）去查站点。每个 agent 的定义里有一行 `tools:` 白名单，OpenSEO 的工具只写了插件自带那份的名字 `mcp__plugin_idea-loop_openseo__*`。

真实发生过一次：TOFEL-demo 2026-10-29 21:11 的 seo-scan（idea-loop 0.1.5）。主会话里 `whoami`、`get_project_context` 都调成功了，technical-auditor 却交回「OpenSEO MCP 工具在本会话不可用」，page-optimizer 0 条发现，整次扫描 0 credits。那个会话里的 OpenSEO 工具全叫 `mcp__openseo__*`：项目根 `.mcp.json`（本机配置，被 gitignore）里也配了 `openseo`，地址跟插件的一样（issue 原文与 2026-11-14 分拣评论）。从外面看就是「OpenSEO 时好时坏」：主会话不受白名单限制，能用；子 agent 受限，不能用。

这次在本机复现（2026-11-16，Claude Code 2.1.299）：做一个假插件 `p`，自带一个本地 MCP 服务 `echo`（一个工具 `ping`），插件里一个 agent 照方向 agent 的写法只放行 `mcp__plugin_p_echo__*`。让 agent 列出自己有的 MCP 工具并调一次 `ping`：

| 项目配置 | 白名单 agent 拿到的工具 | 调 `ping` |
|---|---|---|
| 项目没有 `.mcp.json` | `mcp__plugin_p_echo__ping` | pong |
| 项目 `.mcp.json` 用名字 `myecho` 配了同一条命令 | 无 | 调不到 |

本该是：不管 OpenSEO 在这台机器上以什么名字加载，方向 agent 都能用它；用不了的时候，扫描在开场就停下并说清原因，而不是派出五个拿不到工具的 agent 白跑一轮。

复现材料：`.tmp/to-spec/seo-agents-openseo-tool-name/repro/`（假插件、两份项目配置、三次运行的回复）。

### 根因

Claude Code 对同一个 MCP 服务只连一次：插件带的服务和项目、用户、本地配置里的服务地址相同（远程服务比 URL，本地服务比命令），就算重复，用优先级高的那份，插件那份排在项目、用户、本地之后（`code.claude.com/docs/en/mcp.md`，2026-11-16 查）。顶替之后工具名换成对方起的名字 `mcp__<对方的名字>__*`，而这个名字由人自己起，插件事先不知道。五个 agent 的白名单写死了插件那份的名字（`idea-loop/agents/` 下五个文件第 7 行，对着 `main` a032e45 查，2026-11-16），所以一个都匹配不上。

能走到这条路的不止项目 `.mcp.json` 一种（这三种情况本机当前都没有，2026-11-16 查）：
- 项目或本地配置里配了 OpenSEO：10-29 那次就是。TOFEL-demo 的 `.mcp.json` 已在 2026-11-16 10:39 去掉了 `openseo`，所以眼下这台机器碰不到。
- 用户级配置（`claude mcp add -s user`）配了 OpenSEO：所有项目一起中招。
- 同时装着 OpenSEO 官方插件（本机 `~/.claude/settings.json` 登记了它的 marketplace，现在没启用）：两份都是插件带的，谁顶替谁文档没写。ADR-0020 只写了「原 OpenSEO 插件要先卸，否则同名 skill 两份」，没提工具名。

## 方案

![扫描开场先认 OpenSEO 的名字](assets/sequence-seo-agents-openseo-tool-name.png)

1. **用户得到什么**：装了 idea-loop 的项目跑 seo-scan，OpenSEO 不管是插件那份还是被项目、用户配置顶替成 `openseo`，五个方向 agent 都拿得到工具，照常采集。顶替成别的名字时，扫描在开场停下，交回一句话：哪个配置里的哪个名字跟插件的 OpenSEO 重复，删掉它或改名成 `openseo` 就能跑。决定走哪条的只有一个输入：这个会话里 OpenSEO 的工具以什么名字加载。
2. **做法**（是否这样做见「待定」，下面按推荐写）：
   - 五个方向 agent 的白名单在插件名之外加一个 `mcp__openseo__*`：覆盖 10-29 那次的写法（项目里就叫 `openseo`）。
   - seo-scan 开场多一步「认 OpenSEO」：看这个会话里有没有插件名或 `openseo` 名下的 `whoami`。都没有、但有别的名字下的 OpenSEO 工具：停下交回原因和改法；一个 OpenSEO 工具都没有：同样停下，交回「OpenSEO 没连上，在 `/mcp` 里连上」。不再派出拿不到工具的 agent。
   - seo-scan 后面几步调 OpenSEO 的地方，用开场认出的那个名字。
3. **中间状态**：
   - 插件那份正常加载：跟现在一样，开场多一次判断，不多花 credits。
   - 被顶替成 `openseo`：照常跑完。主会话的 `allowed-tools` 只预先放行了插件名下的四个工具，`openseo` 名下的这四个走人自己的权限设置（10-29 那次主会话的调用没被拦，说明那台机器的设置放行了）。
   - 被顶替成别的名字：开场停下，这一周的扫描没跑；研究日志不写（日志也是经 OpenSEO 写的）。定时任务下次再触发时，人改了配置就恢复。
4. **其他入口**：
   - 纳入：seo-scan 本身、五个方向 agent。
   - 排除：人在场时直接调的 SEO 方法 skill（seo-audit、keyword-research 等）。理由：在主会话里跑，不受白名单限制，按工具的短名字（`whoami`、`get_audit_issues`）调，什么名字加载都能用。
   - 排除：`/idea-loop:seo-setup` 发现重复时提示。理由：它只在设置时跑一次，之后人再加的配置它看不到；开场检查每次扫描都跑，覆盖它。
   - 排除：seo-scan 的 `allowed-tools` 加 `openseo` 名下的四个工具。理由：`allowed-tools` 只预先放行、不限制能不能调（`code.claude.com/docs/en/skills.md`），10-29 那次也没卡在这里；加了要跟插件名两处同步，没有对应的真实问题。

## User Stories

只修问题，每个问题一行期望行为：

1. 期望行为：OpenSEO 以插件名或 `openseo` 加载时，seo-scan 的方向 agent 拿得到 OpenSEO 工具并照常采集；以别的名字加载或没加载时，seo-scan 在派 agent 之前停下，交回是哪个名字重复、怎么改。

## 实现决策

### 待定：方向 agent 怎么拿到改了名的 OpenSEO

背景：名字由人起，插件事先不知道，白名单只能写确定的名字（文档只支持末尾通配 `mcp__<名字>__*`，中间通配没写）。另一条路是不写白名单，只用 `disallowedTools` 去掉不该有的，子 agent 就继承主会话的全部工具。复现里这样写的 agent 在项目改名为 `myecho` 时拿到了 `mcp__myecho__ping`、调通了，但同时也拿到了主会话里的 Gmail、Linear、Supabase。

- **甲（推荐）：白名单加 `openseo` + 开场检查**。例子：10-29 那次的 TOFEL-demo，五个方向照常采集；有人把它配成 `seo-tools`，扫描开场就停，交回「项目配置里的 `seo-tools` 跟插件的 OpenSEO 重复，删掉或改名成 `openseo`」，一个 credit 不花。代价：起了别的名字的那周扫描不跑，要人动一次配置；白名单里多一个名字，#241 拆插件时要一起改。
- **乙：改用 `disallowedTools`，不写白名单**。例子：同样配成 `seo-tools` 的项目，扫描照常跑完，不用人动。代价：方向 agent 能用主会话的所有工具；technical-auditor、page-optimizer 要读外部网页，页面里的文字能在一个有 Gmail、Supabase 写权限的 agent 里被当作指令读到。
- **丙：只做开场检查，白名单不动**。例子：10-29 那次的 TOFEL-demo 也会在开场停下，要人删掉项目里的 `openseo`。代价：最常见的那种写法也要人改配置。

推荐甲：最常见的写法（名字就叫 `openseo`）不用人动，别的写法不白跑也说得清；方向 agent 读外部网页，保留白名单这条边界。

### 其余已定

- **开场检查按「这个会话里有哪个名字的 `whoami`」判断**，先插件名，再 `openseo`，再任何名字以 `__whoami` 结尾、同时有 `__get_project_context` 的服务。依据：seo-scan 本来就要调这两个工具（开场调 `get_project_context`，预算一步调 `whoami` 读余额），判断不多一次付费调用。
- **停下时的交回**照「交回」一节加一种形状，跟「缺口关卡」停下的形状并列，写明重复的名字、改法；定时任务触发时照 seo-scan 现在的做法用『推送』提醒。
- **方向 agent 的提示里写明 OpenSEO 的名字**：派 agent 的模板加一行「OpenSEO 工具：`mcp__<名字>__*`」，agent 照这一行认工具，不自己猜。依据：模板是 seo-scan 跟 agent 之间唯一的接口，「不加别的」的规则不变。
- **版本档**：patch（`REVIEW.md`「额外要求」：修 bug，老用法照样能用）。
- **README**：`idea-loop/README.md` 的 `/idea-loop:seo-scan` 一行补一句：开场先认 OpenSEO 的名字，重复配置成别的名字时停下说明（`REVIEW.md`「额外要求」第一条）。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：五个 agent 的白名单、seo-scan 文档里的开场检查与交回形状（文档测试） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 碰到：seo-scan 的 SKILL.md 和派 agent 模板；不加 eval，用下面的探针 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及；换成本地假插件的探针（见下） |

- **seam**：
  - 文档测试（已有 `idea-loop/scripts/seo-params-doc.test.mjs` 这一类）：五个 agent 的 `tools:` 同时含插件名和 `mcp__openseo__*`；seo-scan 的「开场」有认 OpenSEO 的一步，「交回」有停下的那种形状，派 agent 的模板有「OpenSEO 工具」一行。能抓到：漏改某个 agent、模板没加；漏掉：Claude Code 真的按这个白名单放行。
  - 假插件探针（不进测试套件，实现完跑一次）：照问题陈述的复现，项目用 `openseo` 和 `myecho` 两个名字各跑一次。能抓到：白名单写法在当前 Claude Code 版本上是否生效；漏掉：真实 OpenSEO 的鉴权和 credits。
- **增量功能测试**：
  - 前置：假插件把服务名改成 `openseo` 之外的名字、agent 白名单照新写法，项目 `.mcp.json` 用名字 `openseo` 配同一条命令。步骤：让 agent 列工具并调 `ping`。期望：拿到 `mcp__openseo__ping`，调到 pong。覆盖：期望行为 1。
  - 前置：同上，项目改用名字 `myecho`。期望：白名单 agent 拿不到；按 seo-scan 开场检查的判断规则，主会话能认出 `myecho` 是重复的那份。覆盖：期望行为 1。
- **照着谁写**：`idea-loop/scripts/seo-params-doc.test.mjs`（读 seo 的 SKILL.md 和 agent 定义、按小节断言）。

## Out of scope

- 跟 OpenSEO 官方插件并装时谁顶替谁：文档没写，本机没启用，不在这里核；ADR-0020 已要求先卸。
- 让 seo-scan 在名字不认得时也照常跑（就是「待定」里的乙）。

## 关联

- raw：无（从 issue 起草，没有对话）。
- 相关 ADR：ADR-0020（idea-loop 的 seo 分类，五个方向 agent 和插件自带 OpenSEO 的来历）。
- 相邻未完成的 issue：#241（把 seo 拆成单独的插件）：重叠。拆完插件名从 `idea-loop` 变成 `seo`，白名单里的插件名要跟着改，`mcp__openseo__*` 和开场检查不受影响；两者谁先都行，后合的那个改白名单里的插件名。
