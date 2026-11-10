---
type: adr
status: 生效
tags: [idea-loop, runtime]
summary: 运行环境从通用流程里抽出：能力清单加每个运行环境一份做法，自动检测，支持 Claude 桌面端与 magi，tripwire 防耦合回来
related: ["[[2026-11-06-runtime-grill]]"]
---

# ADR-0026 — runtime：把运行环境从通用流程里抽出来，按检测到的运行环境加载做法

> 由 spec `runtime` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#262、#264。0.1.10 的 skill 与 agent 里有 24 个文件、64 行直接写了某个运行环境的工具：定时任务 MCP、会话内循环、会话管理 MCP 与侧边栏 section、Playwright MCP、`AskUserQuestion`、`Artifact`、`PushNotification`、桌面 app 的 Connectors 等；退路也各写各的，`issue-dispatch` 根本没有退路。在 magi（管理 Claude Code / Codex 会话的工具）启动的会话里实测：会话管理、定时任务、`Artifact`、`AskUserQuestion` 都不存在，`CronCreate` 被 `CLAUDE_CODE_DISABLE_CRON` 禁用；magi 用命令给出对应能力（`magi cron`、`magi sessions`、`magi browser`、`magi artifact push`、`magi mcp call`）。结果是 setup 每处都要人在会话外翻译，`issue-dispatch` 在 magi 里跑不起来。#264 是同一批问题的后续：调度不看指派人，多人团队里会派出同事名下的 issue；magi 里开出的会话缺 Linear 等能力。

## 2 决策（how）

- **能力清单是闭集**：新共享 skill `idea-loop:runtime` 列出十个能力——定时任务、会话内循环、会话管理、浏览器、向人提问、发布审阅页、推送、发文件给人、调用 MCP、装与设置——每个写“通用流程要它做什么、做不到怎么退”；通用流程只写能力名，要新能力先改这张表。每个运行环境一份 reference，逐能力写做法或写“没有”。
- **检测**：`IDEA_LOOP_RUNTIME`（必须是已知名，未知值报错不猜）→ 有 `MAGI_SESSION_ID` 是 `magi` → 否则 `claude-desktop`。命令行、IDE 插件没有可靠标记变量，落到 claude-desktop，缺的工具走退路。主会话由 `SessionStart` hook 注入一行，子 agent 自己跑检测脚本；hook 不注入整份 reference，用到能力时才读。
- **退路只写在 `runtime`**：把要做的事原样交给人并记“未做：运行环境 X 没有『能力』”；例外：调度缺会话管理就整轮停下，缺“分组”就跳过，缺“向人提问”改在对话里问。
- **调度在 magi 里的形状**：通用部分留在 `issue-dispatch`，三处交给 runtime——怎么一轮一轮跑（桌面端是常驻会话里的会话内循环，magi 是 `magi cron` 每轮新开一个调度会话、跑完停掉自己）、怎么数开着的会话（section 标题 vs slug 前缀）、怎么交出 issue（卡片 vs 直接开）。magi 里先建 worktree 再开会话，并用 `--cap` 带上 `magi`、`browser`、issue 平台 MCP；magi 里状态分组本期不维护。
- **调用 MCP 以 magi 托管的优先**（人定），没有再用原生工具。
- **定时任务 prompt**：magi 不把“/命令”当命令，所以写成“用 Skill 工具调 idea-loop:<skill>”；只能由人调用的 skill 不能这样起，走退路。为此 `seo-scan` 改为可被模型调用。
- **合并后补审**：magi 的定时任务读不出每次成败，流程要“上次成功运行”时当作没有基准（dreaming 的增量截图对账因此走全量）；magi 里 issue 会话先回收自己的 worktree 再停掉自己。
- **调度按指派人取候选**（#264，人定）：指派给本人 > 未指派，指派给别人的不派；每档内先按优先级；本人名下之后按号（Linear 按创建时间），未指派的同优先级里按在 todo 停留的久的先。Backlog 不直接派。
- **tripwire**：测试扫 `skills/` 与 `agents/`，除了 runtime 的 `references/` 与 frontmatter 的工具声明，不许出现运行环境专用的工具名或命令。
- **与计划中的“工作环境”层关系**：#227（setup 独立“工作环境”层，Desktop/cmux）由本决定取代并关闭（NOT_PLANNED，cmux 人已不要）；叫法定为“运行环境”，“工作环境”“workspace”进术语表 _Avoid_。运行环境靠检测，不按项目配置。
- 本期不做：知识库在仓库外时各流程怎么工作；dreaming 在 magi 里的定时任务；命令行、IDE、claude.ai 网页、Codex 作为单独的运行环境。

## 3 结果（result）

- skill：`idea-loop:runtime`（`references/claude-desktop.md`、`references/magi.md`，各十个能力小节）；`setup`、`issue-dispatch`、`issue-session`、`browser`、`dreaming` 等流程已改成引用能力名。
- 脚本与钩子：`idea-loop/scripts/runtime-detect.mjs`，`idea-loop/hooks/hooks.json` 的 `SessionStart` 注入一行。
- 守护：`runtime-tripwire.test.mjs`、`runtime-detect.test.mjs`、`runtime-skill-doc.test.mjs`；术语表有“运行环境”“能力”两条。
- 现状核对：skill / agent 正文里残留的工具名只剩 frontmatter 的 `allowed-tools`（`uiux-research`、`uiux-imagine`、`seo-scan`），属规定放行项。

### tripwire 的名单（从 spec 原样抄来，`idea-loop/scripts/runtime-tripwire.test.mjs` 的注释指向这里）

运行环境专用的写法（正则）：定时任务 MCP 的工具名、会话管理 MCP 的前缀、`start_session`、`list_sections` / `create_section`、`CronCreate` / `CronList` / `CronDelete`、`mcp__playwright__`、`mcp__Claude_Browser__`、`AskUserQuestion`、`Artifact`（作工具名）、`PushNotification`、`magi `（命令）、`claude mcp add`、`~/.claude/settings`、「桌面 app」。扫 `skills/`、`agents/`，排除 runtime 自己的 `references/` 与 frontmatter 的工具声明行。命中输出「文件:行  规则  原文」。

## 取代线索

- 无与 ADR-0001 / ADR-0002 冲突。
- 改写 ADR-0024 里“接 MCP 的步骤”（改走“装与设置”“调用 MCP”能力）；给 ADR-0025 的卡片/直接开提供按运行环境分写的承载；补充 ADR-0023 的“桌面 app 建定时任务”。
