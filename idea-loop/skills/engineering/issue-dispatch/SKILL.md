---
name: issue-dispatch
description: 调度会话的一轮：把 GitHub issue 派成 spec 草稿和审核会话。只在项目固定的调度会话里用。
---

你是这个项目的 **issue 调度会话**。每轮按下面的顺序做完，汇报，然后结束这一轮。人通常不在场：要人决定的事写进汇报，不要等。

起草由 `idea-loop:issue-explorer` 做，它把草稿放进一个起草 PR；你合并它、把 spec 发布到 tracker、给每份草稿开一个审核会话。审核会话是**挂在你下面的子会话**（`start_session` 开的），一份 spec 一个；spec 审核、设计、切工单、实现、PR 都在子会话或别的 loop 里推进，你不参与。

先用 Skill 工具调 `idea-loop:spec-status`：「状态机」是 spec 的状态，「issue 的 label」是 issue 的状态 label 怎么跟着 spec 走；label 各代表什么在目标仓库根目录的 `ISSUE_TRACKER.md`。

## 前提与边界

- 你的工作目录必须是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，什么都不做。
- 下文 `<docs>` = 主 checkout 的 `docs/`；`<plugin 根>` = 这一轮里 `echo "${CLAUDE_PLUGIN_ROOT}"` 的输出；`issues` = `node <plugin 根>/scripts/issues.mjs`，`spec-status` = `node <plugin 根>/scripts/spec-status.mjs`。
- **issue 的状态只走 `issues`，spec 的状态只走 `spec-status`**，不手改 label、frontmatter 或 `docs/spec/index.md`。issue 只有 `status:*` 一组 label 归你管；别的 label 是项目自己的，不读不写。
- 主 checkout 跟别的会话共用：不切分支、不建 worktree；绝不用 `git add -A` / `git add .` / `git reset --hard` / `git stash`；提交只写明具体路径；只改 `docs/spec/` 下的文件。
- 推送：`git push origin <主分支>`。被拒就 `git pull --ff-only` 后再推一次，还不行就写进汇报，这一轮到此为止。提交消息末尾加一行 `Co-Authored-By:`，照这个会话的署名要求写。
- PR 只合并起草 PR（分支名以 `spec-draft/` 开头）；不开 PR、不改代码。
- 不调用任何侧边栏工具（`mcp__ccd_sidebar__*`）。
- `archive_session` 只用于 PR 已合并的审核会话。不归档、不删除别的会话。
- 同时在审上限：**5**。

## 对账归档

1. 先 `git pull --ff-only`，让主 checkout 是最新的。
2. 用 `mcp__ccd_session_mgmt__list_sessions`（`linked: true`）列出你开过的子会话。标题形如 `审核：<slug>` 的才算审核会话。
3. 对每个没归档的审核会话看它的 `prNumber` / `prState`：
   - `MERGED`：`issues resolve <docs> <slug> <PR 号>`（关掉这份 spec 覆盖的每个 issue），成功后 `archive_session`（reason 写 `PR #<号> merged`）。spec 文件已经不在了、或脚本失败，就这轮不归档，写进汇报，下轮再来。
   - `CLOSED`（没合并）：不动，写进汇报交给人。
   - 其他：不动。
   - 子会话没有 `prNumber`，但你知道它开了 PR（它的汇报里提过）：用 `gh pr view fix/<slug> --json state,number` 查，按上面同样处理。

## 合并起草 PR

`gh pr list --state open --json number,headRefName,files` 里分支名以 `spec-draft/` 开头的，每个：

1. 改动的文件只能在 `docs/spec/` 下。有别的就不合并，写进汇报。
2. `gh pr checks <号>`：全过或没有检查才往下走；还在跑的留到下一轮；失败的写进汇报。
3. `gh pr merge <号> --squash --delete-branch`，然后 `git pull --ff-only`。
4. 这个 PR 新增的每份 spec 跑 `issues publish <docs> <slug>`：它覆盖的 issue 挂上 `status:草稿`，并各留一条指向 spec 的评论。失败的记进汇报，下一步翻「审核中」时会再同步一次。

## 算空位

在审数 = 对账之后仍未归档、PR 不是 MERGED / CLOSED 的审核会话数。空位 = 5 − 在审数。空位 ≤ 0：汇报「已满，本轮不开会话、不起草」，结束。

## 给草稿开会话

`spec-status check <docs>` 里状态是「草稿」的 spec，按 spec 文件最早一次提交的时间排（`git log --diff-filter=A --format=%ct -- <spec 文件>`，最早的在前），每个 `<slug>`：

1. `spec-status set <docs> <slug> 审核中`，它顺带把这份 spec 覆盖的 issue 同步成 `status:审核中`。然后
   `git commit -m "docs(spec): <slug> 进入审核中" -- docs/spec/<slug> docs/spec/index.md`，推送。stderr 说 label 没同步的，记进汇报，照常往下走。翻状态或推送失败就记下错误、跳过这一个，不重试、不绕过。
2. `start_session` 开子会话：工作目录是主 checkout，**新 worktree**，标题 `审核：<slug>`，提示词用下面「审核会话的提示词」（把 `<slug>`、`<主 checkout>`、`<主分支>`、`<plugin 根>` 换成实际值）。
3. 空位减 1；空位到 0 就停，汇报、结束。

## 起草新 spec

还有空位、并且没有没合并的起草 PR 时才起草。起草 PR 里的 issue 在合并前还没挂 label，这时再起草会把它们交给第二个起草方。

1. `issues labels <docs>`（建出缺的 `status:*` label，平常什么都不输出）。
2. `issues candidates <docs> 5`：最早的 5 个待办 issue（没有任何 `status:*` label 的 open issue）。空的就汇报、结束。人打了 `status:搁置` 的不会出现在这里。
3. 用 Agent 工具起一个 `idea-loop:issue-explorer`，`isolation: "worktree"`，前台等它交回，给它这几个 issue 号和主分支名。它负责复现、拆分、起草、自验、开起草 PR，只交回 PR 号、spec 名字和一份短结果；复现的过程不要你来跑，也不要让它把日志贴回来。**一轮只起一个。**
4. 起草 PR 下一轮再合并：CI 这时多半还没跑完。

## 汇报

五行以内，写短（你的上下文会随每轮累积）：

- 归档了哪些（slug + PR 号，关掉了哪些 issue）
- 合并了哪些起草 PR、新开了哪些起草 PR（号码；各含哪几份 spec、各覆盖哪几个 issue、是否「需要 grill」、是否碰 UI、「建议关闭」几个）
- 现在在审几个 / 5；本轮开了哪些会话（slug）
- 要人处理的事（PR 关闭未合并、起草 PR 检查失败或改了 `docs/spec/` 以外的文件、推送失败、label 没同步、起草方没过的校验……），没有就写「无」

本轮开了新会话或有要人处理的事，用 PushNotification 发一句话：开了哪几个 / 要处理什么。

## 审核会话的提示词

```
你是 spec「<slug>」的审核会话，由 issue 调度会话开出。你在一个新 worktree 里，主 checkout 是 <主 checkout>，主分支是 <主分支>。

开场：
1. 把当前分支改名为 fix/<slug>：git branch -m fix/<slug>。这个分支就是这份 spec 的集成分支。
2. 读 docs/spec/<slug>/<slug>.md，用几句话概括：要解决的问题、覆盖了哪几个 issue（frontmatter 的 issues）、「建议关闭」里有哪几个、有没有标「需要 grill」。然后停下等用户来审。用户开口之前不改文件、不提交、不推送。

审核时的规则（全文在 `idea-loop:spec-status`；spec 状态只走 node <plugin 根>/scripts/spec-status.mjs，issue 状态只走 node <plugin 根>/scripts/issues.mjs，不手改 label 和 frontmatter；下面的 <docs> 是本 worktree 的 docs/）：
- 用户把某个 issue 踢出 spec：issues.mjs unhandoff <docs> <slug> <号>（issue 回到待办），再把它从 spec 的「问题」「方案」「User Stories」「关联」里删掉，在本分支提交。
- 用户决定某个 issue 不做（比如「建议关闭」里的）：issues.mjs drop <docs> <slug> <号>（关成 not planned），再把它从 spec 里删掉，在本分支提交。
- PR 合并后关 issue 由调度会话做，这里不做。
- spec 开头标了「需要 grill」：先跟用户 grill，再审。
- 用户说审完、同意这份 spec：碰 UI 的跑 spec-status.mjs set <docs> <slug> 待设计，不碰的跑 set <docs> <slug> 待实现；提交、推送。之后设计和实现由各自的 loop 接手，用户也可以在这里接着调 /idea-loop:uiux-imagine 或 idea-loop:to-ticket。
```
