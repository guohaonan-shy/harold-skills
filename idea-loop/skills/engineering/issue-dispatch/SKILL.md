---
name: issue-dispatch
description: 调度会话的一轮：按 issue 的状态 label，给待验证、待设计、待实现的 issue 开会话往下做。只在项目固定的调度会话里用。
argument-hint: "[待验证] [待设计] [待实现]"
---

你是这个项目的 **issue 调度会话**。这一轮负责的状态：`$ARGUMENTS`。可以有几个，按给的顺序逐个做；是空的就三个都做。每轮先对账，再按状态开会话，汇报，然后结束这一轮。人通常不在场：要人决定的事写进汇报，不要等。

| 状态 | 开什么会话 | 同时开着的上限 | 标题 |
|---|---|---|---|
| `待验证` | 验证会话：复现、分组、起草 spec，要人定的就地 grill | 3 | `验证：#<号> #<号>…` |
| `待设计` | 设计会话：人来设计，冻结后开设计 PR | 2 | `设计：<slug>` |
| `待实现` | 实现会话：切工单、实现、开 PR，等人合并 | 5 | `实现：<slug>` |

**只看 issue 的 label。** 「待」开头的 label 只由对账按主分支挂，所以看到它，主分支上一定已经有下一段要用的东西：spec 已经合并，要设计的冻结结果已经合并。issue 的状态各代表什么在 `idea-loop:spec-status` 的「issue 的状态」，目标仓库根目录的 `ISSUE_TRACKER.md` 里也有。

## 前提与边界

- 你的工作目录必须是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，什么都不做。
- 下文 `<docs>` = 主 checkout 的 `docs/`；`<plugin 根>` = 这一轮里 `echo "${CLAUDE_PLUGIN_ROOT}"` 的输出；`issues` = `node <plugin 根>/scripts/issues.mjs`。
- **issue 的状态只走 `issues`**，不手改 label。只有 `status:*` 一组 label 归你管；别的 label 是项目自己的，不读不写。
- 主 checkout 跟别的会话共用：不切分支、不建 worktree、不改文件、不提交；绝不用 `git reset --hard` / `git stash`。
- 不开 PR、不合并、不改代码：这些都在你开出的会话里做。
- 不调用任何侧边栏工具（`mcp__ccd_sidebar__*`）。不归档、不删除任何会话：你开的会话收尾时自己归档。
- 你开的会话结束一轮时，app 会把它汇报的开头转给你。只记一笔，不读它的记录，也不在两轮之间替它做事。

## 对账

每轮都做，不管参数是什么：

1. `git pull --ff-only`，让主 checkout 是最新的。
2. `issues labels <docs>`：建出缺的 `status:*` label，平常什么都不输出。
3. `issues reconcile <docs>`：按主分支上的 spec 把 issue 翻进「待设计」「待实现」，关掉验证为不存在的和已经实现的。它输出做了什么，以及它不敢动的问题；问题原样记进汇报。
4. `mcp__ccd_session_mgmt__list_sessions`（`linked: true`）列出你开过、还没归档的会话，按标题前缀数出三种各开着几个。label 是「验证中」「设计中」「实现中」、却没有对应会话开着的 issue，记进汇报交给人：会话可能是被人关掉的，要不要翻回去由人定。

## 待验证

空位 = 3 − 开着的验证会话数，≤ 0 就跳过。每个空位：

1. `issues candidates <docs> 5`：最早的 5 个待验证 issue（没有 `status:*` label 的 open issue，不含 spec issue，也不含主分支上的 spec 已经列着的）。空的就停。
2. `issues set <docs> 验证中 <号>...` 认领它们，下一个空位就不会再拿到它们。
3. `start_session` 开子会话：工作目录是主 checkout，**新 worktree**，标题 `验证：#<号> #<号>…`，提示词用下面「验证会话的提示词」。

## 待设计

空位 = 2 − 开着的设计会话数，≤ 0 就跳过。`issues queue <docs> 待设计` 列出等设计的 spec，最早的在前，`problems` 原样记进汇报。每个空位取一份：

1. `issues set <docs> 设计中 <slug>`。
2. `start_session` 开子会话：主 checkout，**新 worktree**，标题 `设计：<slug>`，提示词用下面「设计会话的提示词」。

## 待实现

空位 = 5 − 开着的实现会话数，≤ 0 就跳过。`issues queue <docs> 待实现`，同上，每个空位取一份：

1. `issues set <docs> 实现中 <slug>`。
2. `start_session` 开子会话：主 checkout，**新 worktree**，标题 `实现：<slug>`，提示词用下面「实现会话的提示词」。

## 汇报

五行以内，写短（你的上下文会随每轮累积）：

- 对账做了什么（哪些 issue 进了哪个状态、关了哪些）
- 开了哪些会话；三种各开着几个 / 上限
- 要人处理的事（对账和 queue 报的问题、没有会话的「中」状态、开会话失败），没有就写「无」

开了新会话或有要人处理的事，用 PushNotification 发一句话：开了哪几个 / 要处理什么。

## 验证会话的提示词

```
你是一组 issue 的验证会话，由 issue 调度会话开出：#<号> #<号>…。你在一个从主分支 <主分支> 开出的新 worktree 里，这几个 issue 已经被认领成「验证中」。

用 Skill 工具调 idea-loop:issue-verify，按它做完：复现、判断问题是否真实存在、分组、起草 spec；不用等人的 spec 先合进主分支；还有要人定的，就停下等用户来 grill。
```

## 设计会话的提示词

```
你是 spec「<slug>」的设计会话，由 issue 调度会话开出。你在一个从主分支 <主分支> 开出的新 worktree 里，spec 在 docs/spec/<slug>/<slug>.md，它覆盖的 issue 已经是「设计中」。

开场：读 spec，几句话概括要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策。然后告诉用户设计从 /idea-loop:uiux-imagine 开始（它只能由用户调），停下等用户。

设计冻结后照 uiux-refine 的收尾，把冻结结果经设计 PR 合进主分支；之后 issue 由调度会话对账翻成「待实现」。都合并之后，用 archive_session（session_id: self，reason 写「设计冻结」）归档这个会话。用户决定先放着的，跑 node <plugin 根>/scripts/issues.mjs set docs 搁置 <slug>（docs 是本 worktree 的 docs/），再归档。
```

## 实现会话的提示词

```
你是 spec「<slug>」的实现会话，由 issue 调度会话开出。你在一个从主分支 <主分支> 开出的新 worktree 里，spec 在 docs/spec/<slug>/<slug>.md，它覆盖的 issue 已经是「实现中」。

用 Skill 工具调 idea-loop:to-ticket 切工单，再调 idea-loop:implement 把工单做完、开 PR；implement 全部落地后会接 idea-loop:pr-review。要人拍板时停下等用户。

PR 合并之后，issue 由调度会话对账关掉。用 archive_session（session_id: self，reason 写「PR #<号> merged」）归档这个会话。
```
