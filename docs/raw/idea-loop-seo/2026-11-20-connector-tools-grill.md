---
type: raw
source_type: conversation
captured: 2026-11-20
title: grill —— 带连接器的 agent 怎么写工具：放弃白名单，改只写禁用清单（#164 推翻 11-16 的决定）
tags: [idea-loop-seo, agent-connector-tools]
related: ["[[seo-agents-openseo-tool-name]]"]
---

U 是 Harold 的原话，逐字保留；A 是 AI 的结论与发现，取证过程略去。背景：#164 的夜间 todo 会话按 11-16 的决定（以插件自带的 OpenSEO 为准，被顶替就停下让人删配置）做完了 PR #397，交审核报告时 Harold 提起 Mobbin 也碰到同样的问题，重开讨论。

## U1

这块我觉的我们可以讨论下，UI 工作流重构的时候mobbin 也遇到了相同的问题，我在想一般的plugin是怎么处理connector 相关的工具调用吗？会像idea-loop一样指明具体用哪个工具吗？

## A1

一般插件不在 agent 里写死工具全名，idea-loop 是少数派。本机已装插件（2026-11-20 查）：PostHog 唯一的 agent 不写 `tools:`、skill 里只写工具短名；ChatCut 的 skill 明说按短名从可见工具里找；Stripe 走命令行。idea-loop 有 7 个 agent 的（当时误说成 8 个） `tools:` 白名单写死了插件全名，来源是 agent-builder 模板「`tools: <白名单；MCP 可写 mcp__<server>__*>`」。坏的只有白名单：它按全名逐字匹配，被顶替后对不上；skill 正文在主会话里跑，不受影响。摆了两个方向：A 维持现状（被顶替就停下让人删），B 学别的插件（agent 不写白名单、改写 `disallowedTools`，skill 按短名），推荐 B。

## U2

选 B，起 grill 把方案定下来。选B，我理解哪怕是连接的claude官方的connector，我理解方案依旧可以work？这样是否在会话内会出现两个mcp？一个是plugin的，一个是用户纬度的

## A2

查 Claude Code 文档（[mcp.md](https://code.claude.com/docs/en/mcp.md)、[sub-agents.md](https://code.claude.com/docs/en/sub-agents.md)，2026-11-20）：同一服务按地址判重只连一次，优先级本地 > 项目 > 用户 > 插件 > claude.ai 连接器；claude.ai 连接器跟插件同地址时用插件那份，B 照样能用。地址真不同才会两份都连上，记为已知限制。agent 不写 `tools:` 时继承主会话全部内置和 MCP 工具；`disallowedTools` 存在，能写 MCP 写法。

本机探针（假插件 `p` 带本地服务 `echo`，项目用 `myecho` 配同一条命令）：白名单 agent 被顶替后拿到 0 个工具；只写 `disallowedTools: Edit, Write, NotebookEdit` 的 agent 拿到 `mcp__myecho__ping`、回 pong、`Write` 不在手里，同时也拿到了会话里全部 claude.ai 连接器（Gmail 的 `send_message`、Supabase 的 `execute_sql` 等）。claude.ai 连接器的工具前缀是 `mcp__claude_ai_<名字>__`。

第一轮七题：Q1 改哪些 agent；Q2 禁用清单写什么；Q3 #397 已落地的开场检测怎么处理；Q4 skill 里怎么称呼工具；Q5 防止再写回白名单；Q6 范围和落在哪；Q7「连接器」指什么。

## U3

Q1 只改那8个，disallowed tool是指不被允许的工具吗？

Q2 关于使用disallow 还是 tool，我们需要和Q1 一起讨论，tools和disallowed tools的区别

Q3 没问题

Q4 没问题

Q5 没问题

Q6 没问题

Q7 没问题

## A3

`tools` 是白名单（只给列出的），`disallowedTools` 是禁用清单（继承全部再去掉列出的）。实测 `tools: Read, mcp__*` 的折中写法不生效（agent 拿到 0 个 MCP 工具），没有两头都占的写法。Q2 重摆：(a) 只写 `disallowedTools: Edit, NotebookEdit, Agent` 并在定义里写「只用 OpenSEO（或 Mobbin）」；(b) 再按名字禁常见高危连接器；(c) 回到白名单。推荐 (a)：implementer 等 7 个 agent 现在就不写白名单。「连接器」写进术语表。

## U4

Q2 我觉的agent定义不用写"只用 OpenSEO（或 Mobbin），不碰别的连接器" 。

之后不允许什么样的连接器，我们再加

## A4

验 Q4 留下的一条：skill 的 `allowed-tools` 能不能写中间通配。本机 `auto` 权限模式下三种写法都直接放行，对照无效；改默认权限模式重跑：中间通配 `mcp__*__ping` 在被顶替和没被顶替时都被拒，插件全名只在没被顶替时放行。结论：`allowed-tools` 保留插件全名，被顶替且用默认权限模式时定时扫描会卡在确认框，记为已知限制。

## U5

没问题

## 本轮决议

| 议题 | 决议 |
|---|---|
| 方向 | 选 B：带连接器的 agent 不写 `tools:` 白名单，推翻 11-16「以插件那份为准、被顶替就停下」 |
| 改哪些 agent | 白名单里写了 MCP 的 7 个（讨论中误数成 8 个）：technical-auditor、page-optimizer、keyword-miner、backlink-analyst、geo-analyst、results-analyst（连同 excalidrawer、PostHog）、uiux-researcher；adr-reconciler、explorer、ui-master 不动 |
| 怎么写 | 去掉 `tools:`，只写 `disallowedTools: Edit, NotebookEdit, Agent`；定义里不加「只用某连接器」；以后要禁的连接器再加 |
| #397 的开场检测 | 删「被顶替就停下」与 seo-setup 的话术、`openseo-superseded.md`；留「一个 OpenSEO 都没有就停下」，按短名判断；挪出正文的段落按字数定去留 |
| 怎么称呼工具 | skill 正文、agent 定义只写短名；`allowed-tools` 保留插件全名（中间通配实测无效），默认权限模式被顶替时卡确认框记已知限制 |
| 防回退 | agent-builder 模板改成用 MCP 的 agent 写 `disallowedTools`；文档测试：`tools:` 行含 `mcp__plugin_` 就红 |
| 范围 | Mobbin、PostHog、excalidrawer 并进 #164，同一分支、同一 PR #397；spec 改标题「带连接器的 agent 不认得改了名的工具」 |
| 术语 | 「连接器」= 会话里任何一个提供工具的 MCP 服务，不分来源；「被顶替」「认 OpenSEO」不收 |
