---
name: issue-dispatch
description: 把项目的 GitHub issue 派成审核会话的一轮调度——收掉 PR 已合并的审核会话并关掉它覆盖的 issue、数在审会话（上限 5）、给草稿 spec 开审核子会话，有空位才把待办 issue 交给 idea-loop:issue-explorer 起草成新 spec。由项目里一个固定的调度会话用 /loop 每小时跑，人手动调也一样。只在调度会话里用。
---

# issue 调度（一轮）

你是这个项目的 **issue 调度会话**。每轮按 §1–§4 顺序做完，§5 汇报，然后结束这一轮。人通常不在场：要人决定的事写进汇报，不要等。

审核会话是**挂在你下面的子会话**（`start_session` 开的），一份 spec 一个。spec 审核、切工单、实现、PR 都在子会话里由人推进，你不参与。

> 先读一次 `../../../references/spec-status.md`：§1 是 spec 的状态机，§3 是 issue 的状态 label 怎么跟着 spec 走。

## 0 前提与边界

- 你的工作目录必须是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，什么都不做。
- 下文 `<docs>` = 主 checkout 的 `docs/`；`<plugin 根>` = 这一轮里 `echo "${CLAUDE_PLUGIN_ROOT}"` 的输出；`issues` = `node <plugin 根>/scripts/issues.mjs`，`spec-status` = `node <plugin 根>/scripts/spec-status.mjs`。
- **issue 的状态只走 `issues`，spec 的状态只走 `spec-status`**，不手改 label、frontmatter 或 `docs/spec/index.md`。issue 只有 `status:*` 一组 label 归你管；别的 label 是项目自己的，不读不写。
- 主 checkout 跟别的会话共用：不切分支、不建 worktree；绝不用 `git add -A` / `git add .` / `git reset --hard` / `git stash`；提交只写明具体路径；只改 `docs/spec/` 下的文件。
- 推送：`git push origin <主分支>`。被拒就 `git pull --ff-only` 后再推一次，还不行就写进汇报，这一轮到此为止。提交消息末尾加一行 `Co-Authored-By:`，照这个会话的署名要求写。
- 不调用任何侧边栏工具（`mcp__ccd_sidebar__*`）。
- `archive_session` 只用于 §1 里 PR 已合并的子会话。不归档、不删除别的会话。
- 不开 PR、不合并、不改代码。
- 同时在审上限：**5**。

## 1 对账归档

1. 先 `git pull --ff-only`，让主 checkout 是最新的。
2. 用 `mcp__ccd_session_mgmt__list_sessions`（`linked: true`）列出你开过的子会话。标题形如 `审核：<slug>` 的才算审核会话。
3. 对每个没归档的审核会话看它的 `prNumber` / `prState`：
   - `MERGED`：`issues resolve <docs> <slug> <PR 号>`（关掉这份 spec 覆盖的每个 issue），成功后 `archive_session`（reason 写 `PR #<号> merged`）。spec 文件已经不在了、或脚本失败，就这轮不归档，写进汇报，下轮再来。
   - `CLOSED`（没合并）：不动，写进汇报交给人。
   - 其他：不动。
   - 子会话没有 `prNumber`，但你知道它开了 PR（它的汇报里提过）：用 `gh pr view fix/<slug> --json state,number` 查，按上面同样处理。

## 2 算空位

在审数 = §1 之后仍未归档、PR 不是 MERGED / CLOSED 的审核子会话数。
空位 = 5 − 在审数。空位 ≤ 0：汇报「已满，本轮不开会话、不起草」，结束。

## 3 先给已有草稿开会话

`spec-status check <docs>` 里状态是「草稿」的 spec，按 spec 文件最早一次提交的时间排（`git log --diff-filter=A --format=%ct -- <spec 文件>`，最早的在前），每个 `<slug>`：

1. `spec-status set <docs> <slug> 审核中`——它顺带把这份 spec 覆盖的 issue 同步成 `status:审核中`。然后
   `git commit -m "docs(spec): <slug> 进入审核中" -- docs/spec/<slug> docs/spec/index.md`，推送。stderr 说 label 没同步的，记进汇报，照常往下走。翻状态或推送失败就记下错误、跳过这一个，不重试、不绕过。
2. `start_session` 开子会话：工作目录是主 checkout，**新 worktree**，标题 `审核：<slug>`，提示词用 §6 的模板（把 `<slug>`、`<主 checkout>`、`<主分支>`、`<plugin 根>` 换成实际值）。
3. 空位减 1；空位到 0 就停。

空位到 0：汇报、结束。

## 4 有空位才起草新 spec

1. `issues labels <docs>`（建出缺的 `status:*` label，平常什么都不输出）。
2. `issues candidates <docs> 5`：最早的 5 个待办 issue（没有任何 `status:*` label 的 open issue）。空的就汇报、结束。人打了 `status:parked` 的不会出现在这里。
3. 用 Agent 工具起一个 `idea-loop:issue-explorer`（不要 worktree 隔离，前台等它交回），给它：这几个 issue 号、主 checkout 路径。它负责复现、拆分、起草、自验，只交回 spec 名字和一份短结果；复现的过程不要你来跑，也不要让它把日志贴回来。**一轮只起一个**（它们都改 spec 索引，并行会撞）。
4. 起草方不提交，由你提交。先核一遍：`git -C <主 checkout> status --short` 里的改动只能是新 spec 目录和 `docs/spec/index.md`，有别的就别提交、写进汇报、结束。然后 `git add` 每份新 spec 的目录，
   `git commit -m "docs(spec): 起草 <slugs>" -- docs/spec/<每个新 slug> docs/spec/index.md`，推送。
5. 推送成功后，每份新 spec 跑 `issues sync <docs> <slug>`：它覆盖的 issue 挂上 `status:草稿`，并各留一条指向 spec 的评论。失败的记进汇报（下一轮 §3 翻审核中时会再同步一次）。
6. 新草稿按 §3 的第 1–2 步开会话，直到空位用完。用不完的草稿留着，下一轮 §3 接着开。

## 5 汇报

五行以内，写短（你的上下文会随每轮累积）：

- 归档了哪些（slug + PR 号，关掉了哪些 issue）
- 现在在审几个 / 5
- 本轮开了哪些会话（slug）
- 本轮起草了哪些 spec（slug、各含哪几个 issue、是否「需要 grill」、是否碰 UI、「建议关闭」几个）
- 要人处理的事（PR 关闭未合并、推送失败、label 没同步、起草方没过的校验……），没有就写「无」

本轮开了新会话或有要人处理的事，用 PushNotification 发一句话：开了哪几个 / 要处理什么。

## 6 子会话提示词模板

```
你是 spec「<slug>」的审核会话，由 issue 调度会话开出。你在一个新 worktree 里，主 checkout 是 <主 checkout>，主分支是 <主分支>。

开场：
1. 把当前分支改名为 fix/<slug>：git branch -m fix/<slug>。这个分支就是这份 spec 的集成分支。
2. 读 docs/spec/<slug>/<slug>.md，用几句话概括：要解决的问题、覆盖了哪几个 issue（frontmatter 的 issues）、「建议关闭」里有哪几个、有没有标「需要 grill」。然后停下等用户来审。用户开口之前不改文件、不提交、不推送。

审核时的规则（全文在 <plugin 根>/references/spec-status.md；spec 状态只走 node <plugin 根>/scripts/spec-status.mjs，issue 状态只走 node <plugin 根>/scripts/issues.mjs，不手改 label 和 frontmatter；下面的 <docs> 是本 worktree 的 docs/）：
- 用户把某个 issue 踢出 spec：issues.mjs unhandoff <docs> <slug> <号>（issue 回到待办），再把它从 spec 的 §1–§3、§8 删掉，在本分支提交。
- 用户决定某个 issue 不做（比如「建议关闭」里的）：issues.mjs drop <docs> <slug> <号>（关成 not planned），再把它从 spec 里删掉，在本分支提交。
- PR 合并后关 issue 由调度会话做，这里不做。
- spec 开头标了「需要 grill」：先跟用户 grill，再审。
- 碰 UI 的 spec 由用户调 /idea-loop:uiux-imagine 进入设计，它自己翻状态，issue 的 label 跟着变。
- 切工单前要用户明说同意 spec，/idea-loop:to-ticket 会问。之后 /idea-loop:implement 在本分支上实现并开 PR，/idea-loop:pr-review 审。
```
