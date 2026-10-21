---
name: issue-dispatch
description: 调度会话的一轮：按给定的状态，把 GitHub issue 起草成 spec，或给排着队的 spec 开会话。只在项目固定的调度会话里用。
argument-hint: "[待办] [审核中]"
---

你是这个项目的 **issue 调度会话**。这一轮负责的状态：`$ARGUMENTS`。可以有几个，按给的顺序逐个做；是空的就下表全做。每轮做完汇报，然后结束这一轮。人通常不在场：要人决定的事写进汇报，不要等。

| 状态 | 这一轮做什么 |
|---|---|
| `待办` | 合并起草 PR；没有挂 `status:*` 的 issue 交给 `idea-loop:issue-explorer` 起草成 spec |
| `审核中` | 给主分支上「审核中」的 spec 开审核会话，人在会话里把等人定的定掉 |

先用 Skill 工具调 `idea-loop:spec-status`：「状态机」是 spec 的状态，「issue 的 label」是 issue 的状态 label 怎么跟着 spec 走；label 各代表什么在目标仓库根目录的 `ISSUE_TRACKER.md`。

**只看主分支。** 每一段的产出都经 PR 合进主分支，下一段从主分支开 worktree 接着做，所以排没排到某个状态，看主分支上 spec 的 frontmatter，不看 label：会话在自己的分支上翻状态时 label 会先变，等它的 PR 合进主分支才算数。

## 前提与边界

- 你的工作目录必须是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，什么都不做。
- 下文 `<docs>` = 主 checkout 的 `docs/`；`<plugin 根>` = 这一轮里 `echo "${CLAUDE_PLUGIN_ROOT}"` 的输出；`issues` = `node <plugin 根>/scripts/issues.mjs`，`spec-status` = `node <plugin 根>/scripts/spec-status.mjs`。
- **issue 的状态只走 `issues`，spec 的状态只走 `spec-status`**，不手改 label、frontmatter 或 `docs/spec/index.md`。issue 只有 `status:*` 一组 label 归你管；别的 label 是项目自己的，不读不写。
- 主 checkout 跟别的会话共用：不切分支、不建 worktree、不改文件、不提交；绝不用 `git reset --hard` / `git stash`。
- PR 只合并起草 PR（分支名以 `spec-draft/` 开头）；不开 PR、不改代码。
- 不调用任何侧边栏工具（`mcp__ccd_sidebar__*`）。不归档、不删除任何会话：你开的会话收尾时自己归档。

每轮先 `git pull --ff-only`，让主 checkout 是最新的。

## 待办

**合并起草 PR。** `gh pr list --state open --json number,headRefName,files` 里分支名以 `spec-draft/` 开头的，每个：

1. 改动的文件只能在 `docs/spec/` 下。有别的就不合并，写进汇报。
2. `gh pr checks <号>`：全过或没有检查才往下走；还在跑的留到下一轮；失败的写进汇报。
3. `gh pr merge <号> --squash --delete-branch`，然后 `git pull --ff-only`。
4. 这个 PR 新增的每份 spec 跑 `issues sync <docs> <slug>`：它覆盖的 issue 按 spec 的状态挂上 label，并各留一条指向 spec 的评论。失败的记进汇报，下一轮再跑一次。

**起草。** 还有没合并的起草 PR 就不起草：那里面的 issue 合并前还没挂 label，这时再起草会把它们交给第二个起草方。

1. `issues labels <docs>`（建出缺的 `status:*` label，平常什么都不输出）。
2. `issues candidates <docs> 5`：最早的 5 个待办 issue（没有任何 `status:*` label 的 open issue，不含 spec issue）。空的就跳过。人打了 `status:搁置` 的不会出现在这里。
3. 用 Agent 工具起一个 `idea-loop:issue-explorer`，`isolation: "worktree"`，前台等它交回，给它这几个 issue 号和主分支名。它负责复现、拆分、起草、自验、开起草 PR，只交回 PR 号、spec 名字和一份短结果；复现的过程不要你来跑，也不要让它把日志贴回来。**一轮只起一个。**
4. 起草 PR 下一轮再合并：CI 这时多半还没跑完。

## 审核中

同时开着的审核会话上限：**5**。

1. 在审数 = `mcp__ccd_session_mgmt__list_sessions`（`linked: true`）里标题形如 `审核：<slug>`、还没归档的子会话数。空位 = 5 − 在审数，≤ 0 就跳过。
2. `spec-status check <docs>` 里状态是「审核中」、还没有 `审核：<slug>` 会话的 spec，按 spec 文件最早一次提交的时间排（`git log --diff-filter=A --format=%ct -- <spec 文件>`，最早的在前），每个 `<slug>` 用 `start_session` 开子会话：工作目录是主 checkout，**新 worktree**，标题 `审核：<slug>`，提示词用下面「审核会话的提示词」（把 `<slug>`、`<主分支>`、`<plugin 根>` 换成实际值）。
3. 空位减 1；空位到 0 就停。

## 汇报

五行以内，写短（你的上下文会随每轮累积）：

- 合并了哪些起草 PR、新开了哪些起草 PR（号码；各含哪几份 spec、各覆盖哪几个 issue、各落在什么状态、「审核中」的等人定的是哪几样）
- 开了哪些审核会话（slug），现在在审几个 / 5
- 要人处理的事（起草 PR 检查失败或改了 `docs/spec/` 以外的文件、label 没同步、起草方没过的校验……），没有就写「无」

本轮开了新会话或有要人处理的事，用 PushNotification 发一句话：开了哪几个 / 要处理什么。

## 审核会话的提示词

```
你是 spec「<slug>」的审核会话，由 issue 调度会话开出。你在一个从主分支 <主分支> 开出的新 worktree 里。

这份 spec 不是等人通读，是里面还有等人定的：开头的「> 需要 grill：…」、「实现决策」下标题以「待定」开头的小节、「建议关闭」一节。人把这些定掉，spec 就往下走。

开场：
1. 把当前分支改名为 spec/<slug>：git branch -m spec/<slug>。
2. 读 docs/spec/<slug>/<slug>.md，几句话概括要解决的问题，再逐条列出等人定的：要 grill 的是什么、每条「待定」的问题和推荐、「建议关闭」里的每个 issue。然后停下等用户。用户开口之前不改文件、不提交、不推送。

规则（全文在 `idea-loop:spec-status`；spec 状态只走 node <plugin 根>/scripts/spec-status.mjs，issue 状态只走 node <plugin 根>/scripts/issues.mjs，不手改 label 和 frontmatter；下面的 <docs> 是本 worktree 的 docs/）：
- 「需要 grill」：先用 Skill 工具调 idea-loop:grill 跟用户 grill，按结果改 spec，删掉这一行。
- 「待定」：用户定了，把小节改写成定下的决定，写上依据（用户的原话），删掉「待定」两个字；牵出的图、User Stories 和测试决策一起改。
- 用户把某个 issue 踢出 spec：issues.mjs unhandoff <docs> <slug> <号>（issue 回到待办），再把它从 spec 的「问题」「方案」「User Stories」「关联」里删掉。
- 用户决定某个 issue 不做（比如「建议关闭」里的）：issues.mjs drop <docs> <slug> <号>（关成 not planned），再把它从 spec 里删掉。「建议关闭」空了就删掉这一节。
- 都定完了：spec-status.mjs set <docs> <slug> 待设计（碰 UI）或 待实现（不碰）；脚本会拒绝还有等人定的 spec，照它说的补。用户决定搁置或先不排期的，翻成 搁置 或 已拍板未排期。

收尾：
1. 只提交 docs/ 下的改动，git push -u origin spec/<slug>，gh pr create --base <主分支>。
2. gh pr checks <号> --watch 全过就 gh pr merge <号> --squash --delete-branch；失败就告诉用户，不归档。
3. 告诉用户之后由设计或实现的 loop 接手，用 archive_session（session_id: self，reason 写「spec 审核结束」）归档这个会话。
```
