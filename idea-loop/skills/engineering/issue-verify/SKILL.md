---
name: issue-verify
description: 验证一个 GitHub issue 描述的问题是否真实存在，打上分类，存在的起草成 spec、不存在的留下证据，要人定的跟人 grill，spec 合进主分支。issue 会话的审核阶段、或人要核一个 issue 时用。
---

验证一个 issue：先复现，判断问题是否真实存在，打上分类，用 `idea-loop:to-spec` 起草一份 spec 记下验证结论。规则判不了、要人定的，就在这个会话里跟人 grill。最后经只改 `docs/` 的 PR 合进主分支，把 spec 的 slug 交回给调用你的 `idea-loop:issue-session`，issue 的下一段由它翻。

issue 怎么读、label 是什么意思，见目标仓库根目录的 `ISSUE_TRACKER.md`。先用 Skill 工具调 `idea-loop:spec-status`（spec 和 issue 的状态）和 `idea-loop:decision-rules`（能按「自己定的四条」判的自己定，依据不成立的才留给人）。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指当前 worktree 的 `docs/`。

## 开场

1. 你应该在一个从主分支最新提交开出的 worktree 里。把分支改名：`git branch -m spec/issue-<号>`。照目标仓库 `DEVELOPMENT.md` 的「worktree 准备」准备好它；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。
2. 读 issue 全文和评论：`gh issue view <号> --comments`。它应该是「验证中」：issue 会话开场时已经认领了。人直接调你的，先 `issues set <docs> 验证中 <号>` 认领；已关闭、或已经走过审核的，停下说明原因。
3. **在根的会话里**：根 issue 的会话对一组只调你一次，`<号>` 给根号。逐个复现根下每个子 issue，起草**一份**覆盖全部子 issue 的 spec（开头的结论每个子 issue 一行，frontmatter 的 `issues` 列全部子 issue），交回这一份 spec 的 slug。认领已由会话对根号整组做过（根和子 issue 都已是「验证中」），**不重复认领**，不跑 `issues set`。会话在调你之前已经从最新的主分支切好 `spec/issue-<根号>`，分支已是这个名字就不用改名。

## 先复现

先复现，再写进 spec。复现要起服务的，照 `DEVELOPMENT.md` 的「开发服务器」起，收工前全部停掉。

| issue 的性质 | 复现手段 | spec 里写什么 |
|---|---|---|
| 逻辑、数据、API 行为 | 一个会红的测试，不提交：测试代码和输出放 `.tmp/to-spec/<spec-slug>/repro/`，正式的测试由 `idea-loop:implement` 写 | 白话写测了什么、看到什么、本该是什么，带一个具体例子 |
| 看得见的界面问题 | 一张截图，标注照 `idea-loop:evidence` 里「问题的复现证据」 | 截图本身 |
| 线上数据、日志、性能 | 一条查询或一段日志，写明查的是什么、什么时候查的 | 查的范围和时间，加结果；数字能列成小表就列 |

**复现的输出留在文件里。** 服务日志、测试的失败输出、堆栈、查询结果都重定向进 `.tmp/to-spec/<spec-slug>/repro/` 下的文件，只读回判断要用的那一两行：人要在这个会话里 grill，那时上下文里该是 issue、结论和 spec。

方案、选项、范围依赖的现状也在这时核清：用 Skill 工具调 `idea-loop:evidence`，看它的「写给人看的东西」。issue 是不是已经被做掉了，也靠这一步查出来。

得出一个结论，写成 spec 标题下的一行引用（`> #<号> 存在：…` 或 `> #<号> 不存在：…`，模板在 `idea-loop:to-spec`）：

- **存在**：复现到了。复现推翻了 issue 原来的说法，在「根因」里写「修正：issue 原先认为 X，实测是 Y」。
- **不存在**：复现不出，或者已经被做掉了。冒号后写三样，缺一样以后有人回头查就得自己重来：试了什么、卡在哪（或现在的规则、代码在哪）；什么时候、对着哪个基准分支核的；用什么手段核的。

## 打分类

项目的分类写在根目录 `AGENTS.md`（或 `CLAUDE.md`）的「issue 分类」一节：父类，和父类下可选的子类。照 issue 和复现结论选一个父类，有贴切的子类就带上：`issues type <docs> <号> <父类>[/<子类>]`，它会替换 issue 上原有的 `type:*`。没有一节、或没有一个分类贴切的，不打，在交回时告诉人，贴切的新分类名一起写上。

## 起草

用 Skill 工具调 `idea-loop:to-spec`，上下文就是这个 issue 和你的复现结论。没人在场时 seam 自己定；它「合进主分支」那一步留给你，下面做。

- **功能级的**，标题下第一行写「> 需要 grill：<为什么>」。功能级是修完多了一个原来没有的能力，或者 issue 里写着还没定的设计问题。
- **验证为不存在的**，spec 只有开头的结论和「关联」。

`spec-status route` 之后，spec 落在三种状态之一：「完成」（issue 不存在）、「正式」，或「审核中」（还有「需要 grill」或「待定」）。

## 自己校验

开 PR 之前逐项核对。哪项不过，回去改 spec 或补跑那一步，改完再核一遍。

1. **状态与结构**：`spec-status check <docs>` 的 `problems` 为空；spec 跑过 `route`。
2. **有着落**：issue 在 spec frontmatter 的 `issues` 里，标题下有它的一行结论。
3. **存在的复现过**：标「存在」的，「问题陈述」里写了本次复现到的现象。只有 issue 原文、没有本次复现的，不算。
4. **正文里没有机器的原始输出**：`grep -nE 'AssertionError|expected .* to |^\s+at |\[repro\]|^\s*(SELECT|FROM|WHERE) ' <spec>` 有输出就回去改写。
5. **每条都有期望行为**：只修问题的 spec，「User Stories」里每个问题一行「期望行为」，编号跟「问题陈述」的小节对得上。
6. **选项都是真分歧**：每条「待定」写明了为什么「自己定」的依据不成立；选项的写法照 `idea-loop:evidence` 的「写给人看的东西」（上面已调过）。
7. **现状和范围查清了**：同一行为的其他入口，每个都在「方案」里标了纳入还是排除；「关联」列了相邻还没完成的 spec 与 issue，没有写「无」。
8. **改动只在该在的地方**：`git status --short` 里只有这份 spec 的目录和 `docs/spec/index.md`。

## 跟人定「审核中」的

spec 是「审核中」：`issues set <docs> 审核中 <号>`，用 PushNotification 发一句话说要人定什么，然后停下等人。人开口后逐条处理：

- 「需要 grill」：用 Skill 工具调 `idea-loop:grill`，按结果改 spec，删掉这一行。
- 「待定」：人定了，把小节改写成定下的决定，写上依据（人的原话），删掉「待定」两个字；牵出的图、User Stories 和测试决策一起改。
- 人决定不做：`issues drop <docs> <slug> <号>`（关成 not planned），删掉这份 spec 的目录，不合并，交回「已关闭」。
- 人说先放着：`issues set <docs> 搁置 <号>`，spec 不合并，交回「搁置」。
- 都定完了：`spec-status set <docs> <slug> 正式`（issue 不存在的翻「完成」），去「合进主分支」。

## 合进主分支

1. 只 `git add` 这份 spec 的目录和 `docs/spec/index.md`，提交（`docs(spec): 起草 <slug>`），`git push -u origin <分支>`，`gh pr create --base <主分支>`，正文写 slug、状态、覆盖的 `#号`。
2. `gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`；失败就停下告诉人。只改 `docs/` 的 PR 检查过了就合并（`idea-loop:decision-rules` 的「不自动的」）。

## 交回

交回 spec 的 slug 和合并的 PR 号，或「已关闭」「搁置」。不是 issue 会话调的你，告诉人用 `/idea-loop:issue-session <号>` 接上后面的阶段。

## 边界

- 只改 worktree 里 `docs/spec/` 下的文件和 `.tmp/`。不改代码；复现用的测试代码不提交。
- GitHub 上：issue 的状态和分类只走 `issues`；只开 spec 的 PR，只合并只改 `docs/` 的 PR。
