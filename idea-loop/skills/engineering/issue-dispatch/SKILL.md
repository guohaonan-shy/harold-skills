---
name: issue-dispatch
description: 调度会话的一轮：按 issue 的状态 label，给待验证、待设计、待实现的 issue 开会话往下做。只在项目固定的调度会话里用。
argument-hint: "[待验证] [待设计] [待实现]"
---

你是这个项目的 **issue 调度会话**。这一轮负责的状态：`$ARGUMENTS`，可以有几个，按给的顺序逐个做；是空的就三个都做。每轮先对账，再按状态开会话，汇报，然后结束这一轮。人通常不在场：要人决定的事写进汇报，接着做完这一轮。

| 状态 | 开什么会话 | 同时开着的上限 | 标题 |
|---|---|---|---|
| `待验证` | 验证会话：复现、分组、起草 spec，要人定的就地 grill | 3 | `验证：#<号> #<号>…` |
| `待设计` | 设计会话：人来设计，冻结后开设计 PR | 2 | `设计：<slug>` |
| `待实现` | 实现会话：切工单、实现、开 PR，等人合并 | 5 | `实现：<slug>` |

**只看 issue 的 label。** 「待」开头的 label 只由对账按主分支挂，所以看到它，主分支上一定已经有下一段要用的东西。各状态的意思在 `idea-loop:spec-status` 的「issue 的状态」。

## 前提与边界

- 工作目录是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，这一轮什么都不做。
- 下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指主 checkout 的 `docs/`。
- issue 的状态只走 `issues`。你只管 `status:*` 一组 label，别的 label 是项目自己的，不读不写。
- 主 checkout 跟别的会话共用，你在这里只读：不切分支、不建 worktree、不改文件、不提交，绝不用 `git reset --hard` / `git stash`。开 PR、合并、改代码都在你开出的会话里做。
- 会话只用 `start_session` 开，不碰侧边栏工具（`mcp__ccd_sidebar__*`），不归档、不删除会话：你开的会话收尾时自己归档。
- 你开的会话结束一轮时，app 会把它汇报的开头转给你：只记一笔，它的活留给它自己。

## 对账

每轮都做，不管参数是什么：

1. `git pull --ff-only`。
2. `issues labels <docs>`：建出缺的 `status:*` label。
3. `issues reconcile <docs>`：按主分支上的 spec 翻 issue、关 issue。它报的问题原样记进汇报。
4. `mcp__ccd_session_mgmt__list_sessions`（`linked: true`）列出你开过、还没归档的会话，按标题前缀数出三种各开着几个。label 是「验证中」「设计中」「实现中」、却没有对应会话开着的 issue，记进汇报交给人：会话可能是被人关掉的，要不要翻回去由人定。

## 开会话

每种状态的空位 = 表里的上限 − 开着的这种会话数，≤ 0 就跳过这种。每个空位认领一份活、开一个会话：`start_session`，工作目录是主 checkout，**新 worktree**，标题照表。提示词按会话种类取 [references/session-prompts.md](references/session-prompts.md) 里的那一段。

- **待验证**：`issues candidates <docs> 5` 取最早的 5 个待验证 issue，空的就停；`issues set <docs> 验证中 <号>...` 认领，下一个空位就不会再拿到它们；再开验证会话。
- **待设计**：`issues queue <docs> 待设计` 列出等设计的 spec，最早的在前，`problems` 原样记进汇报。每个空位取一份，`issues set <docs> 设计中 <slug>`，再开设计会话。
- **待实现**：`issues queue <docs> 待实现`，同上；`issues set <docs> 实现中 <slug>`，再开实现会话。

## 汇报

五行以内（你的上下文会随每轮累积）：

- 对账做了什么（哪些 issue 进了哪个状态、关了哪些）
- 开了哪些会话；三种各开着几个 / 上限
- 要人处理的事（对账和 queue 报的问题、没有会话的「中」状态、开会话失败），没有就写「无」

开了新会话或有要人处理的事，用 PushNotification 发一句话：开了哪几个 / 要处理什么。
