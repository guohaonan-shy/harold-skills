---
name: issue-verify
description: 验证一组 GitHub issue 描述的问题是否真实存在，存在的起草成 spec，不存在的留下证据。
---

验证一组 issue：每个先复现，判断问题是否真实存在，再按「同一处改动」分组，每组用 `idea-loop:to-spec` 起草一份 spec，spec 里记下每个 issue 的验证结论。规则判不了、要人定的，就在这个会话里跟人 grill。最后经只改 `docs/` 的 PR 合进主分支，issue 的 label 由 `issue-dispatch` 下一轮对账时按主分支挂上、关掉。

issue 怎么读、label 是什么意思，见目标仓库根目录的 `ISSUE_TRACKER.md`。先用 Skill 工具调 `idea-loop:spec-status`（spec 和 issue 的状态）和 `idea-loop:decision-rules`（能按「自己定的四条」判的自己定，依据不成立的才留给人）。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`spec-status` 指同目录的 `spec-status.mjs`，`<docs>` 指当前 worktree 的 `docs/`。

## 开场

1. 你应该在一个从主分支最新提交开出的 worktree 里。把分支改名：`git branch -m spec/<YYYYMMDD-HHMM>`。照目标仓库 `DEVELOPMENT.md` 的「worktree 准备」准备好它；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。
2. 每个 issue 读全文和评论：`gh issue view <号> --comments`。issue 应该是「验证中」：loop 开会话时已经认领了。人直接调你的，先 `issues set <docs> 验证中 <号>...` 认领；已关闭、或已经在别的状态的跳过，说明原因。

## 先复现

每个 issue 先复现，再写进 spec。复现要起服务的，照 `DEVELOPMENT.md` 的「开发服务器」起，收工前全部停掉。

| issue 的性质 | 复现手段 | spec 里写什么 |
|---|---|---|
| 逻辑、数据、API 行为 | 一个会红的测试，不提交：测试代码和输出放 `.tmp/to-spec/<spec-slug>/repro/`，正式的测试由 `implement` 写 | 白话写测了什么、看到什么、本该是什么，带一个具体例子 |
| 看得见的界面问题 | 一张截图，标注照 `idea-loop:evidence` 里「问题的复现证据」 | 截图本身 |
| 线上数据、日志、性能 | 一条查询或一段日志，写明查的是什么、什么时候查的 | 查的范围和时间，加结果；数字能列成小表就列 |

**复现的输出不进这个会话的上下文。** 服务日志、测试的失败输出、堆栈、查询结果都重定向进 `.tmp/to-spec/<spec-slug>/repro/` 下的文件，只读回判断要用的那一两行。人可能要进这个会话 grill，那时上下文里该是 issue、结论和 spec，不是一屏屏的日志。

方案、选项、范围依赖的现状也在这时核清：代码现在怎么做、影响多大、同类入口有哪些、相邻还没完成的 spec 与 issue。issue 是不是已经被做掉了，也靠这一步查出来。

每个 issue 得出一个结论，写进 spec 的「验证」表：

- **存在**：复现到了。复现推翻了 issue 原来的说法，在「根因」里写「修正：issue 原先认为 X，实测是 Y」。
- **不存在**：复现不出，或者已经被做掉了。证据一栏写三样，缺一样以后有人回头查就得自己重来：试了什么、卡在哪（或现在的规则、代码在哪）；什么时候、对着哪个基准分支核的；用什么手段核的。

## 先分组，再起草

一份 spec 收「同一处改动」的几个 issue，让它们一次做掉：

- **要调整设计的单独成一份。** 它会去「待设计」，不能拖着同组别的 issue 一起等设计。
- **功能级的单独成一份**，标题下第一行写「> 需要 grill：<为什么>」。功能级是修完多了一个原来没有的能力，或者 issue 里写着还没定的设计问题。
- **剩下的一份超过 5 个问题，按相关性拆**：同一个页面、同一条链路、同一个根因的放一起。
- **验证为不存在的**，跟它要改的那处放进同一份 spec 的「验证」表；跟哪份都不沾的，单独成一份只有「验证」和「关联」两节的 spec。

每份用 Skill 工具调 `idea-loop:to-spec`，上下文就是这几个 issue 和你的复现结论。没人在场时 seam 自己定。它「合进主分支」那一步留给你，下面统一做。`spec-status route` 之后，每份 spec 落在三种状态之一：「完成」（覆盖的 issue 全都不存在）、「正式」，或「审核中」（还有「需要 grill」或「待定」）。

## 自己校验

开 PR 之前，对每份新 spec 逐项核对。哪项不过，回去改 spec 或补跑那一步，改完再核一遍。

1. **状态与结构**：`spec-status check <docs>` 的 `problems` 为空；每份新 spec 都跑过 `route`。
2. **每个都有着落**：每个 issue 都在某份 spec 的 frontmatter `issues` 里，「验证」表里各有一行；没有一个 issue 同时在两份 spec 里。
3. **存在的都复现过**：标「存在」的，「问题」里都写了本次复现到的现象。只有 issue 原文、没有本次复现的，不算。
4. **正文里没有机器的原始输出**：`grep -nE 'AssertionError|expected .* to |^\s+at |\[repro\]|^\s*(SELECT|FROM|WHERE) ' <spec>` 有输出就回去改写。
5. **每条都有期望行为**：只修问题的 spec，「User Stories」里每个问题一行「期望行为」，编号跟「问题」对得上。
6. **分组守规则**：照上面「先分组，再起草」。
7. **选项都是真分歧**：每条「待定」都写明了为什么「自己定」的依据不成立，并配了一个具体例子和推荐。
8. **范围写明了同类入口**：同一行为的其他页面、接口、调用方，每个都写了纳入（「方案」）还是排除（「Out of scope」，带一句理由）；「关联」列了相邻还没完成的 spec 与 issue，没有写「无」。
9. **改动只在该在的地方**：`git status --short` 里只有新 spec 目录和 `docs/spec/index.md`。

## 不等人的先合进主分支

「正式」和「完成」的 spec 不等「审核中」的那几份：

1. 只 `git add` 这几份 spec 的目录和 `docs/spec/index.md`，提交（`docs(spec): 起草 <slugs>`，末尾加一行 `Co-Authored-By:`，照这个会话的署名要求写），`git push -u origin <分支>`，`gh pr create --base <主分支>`，正文每份 spec 一行：slug、状态、覆盖的 `#号`。
2. `gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`；失败就停下告诉人。只改 `docs/` 的 PR 检查过了就合并（`idea-loop:decision-rules` 的「不自动的」）。
3. 还有「审核中」的，`git fetch` 后从更新过的主分支开新分支接着做：`git switch -c spec/<slug> origin/<主分支>`，没提交的 spec 文件会跟过来。

## 跟人定「审核中」的

有「审核中」的 spec：`issues set <docs> 审核中 <slug>`，用 PushNotification 发一句话说哪份 spec 等人定什么，然后停下等人。人开口后逐条处理：

- 「需要 grill」：用 Skill 工具调 `idea-loop:grill`，按结果改 spec，删掉这一行。
- 「待定」：人定了，把小节改写成定下的决定，写上依据（人的原话），删掉「待定」两个字；牵出的图、User Stories 和测试决策一起改。
- 人把某个 issue 踢出 spec：`issues unhandoff <docs> <slug> <号>`（回到待验证），再把它从 spec 里删掉。
- 人决定某个 issue 不做：`issues drop <docs> <slug> <号>`（关成 not planned），再把它从 spec 里删掉。
- 都定完了：`spec-status set <docs> <slug> 正式`（覆盖的 issue 全都不存在的翻「完成」），照上一节合进主分支。人说先放着的，`issues set <docs> 搁置 <slug>`，spec 不合并。

## 收工

告诉人每份 spec 落在哪：合进主分支的 PR 号，「正式」的之后由 loop 按碰不碰 UI 排进「待设计」或「待实现」，「完成」的覆盖的 issue 会被关掉。label 由 `issue-dispatch` 下一轮对账挂；项目没跑 loop 的，在主 checkout 上跑 `issues reconcile <docs>`。

这个会话是 loop 开出来的，所有 spec 都合进主分支或搁置之后，用 `archive_session`（session_id 写 `self`，reason 写「issue 验证结束」）归档自己。

## 边界

- 只改 worktree 里 `docs/spec/` 下的文件和 `.tmp/`。不改代码；复现用的测试代码不提交。
- GitHub 上：issue 的状态只走 `issues`；只开 spec 的 PR，只合并只改 `docs/` 的 PR。
