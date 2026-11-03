---
name: issue-session
description: 一组 issue（一个根加它的子 issue，或一个没被整合的 issue）的会话：从验证、grill、设计一路走到实现合并，人在这里拍板，活交给 skill 和子代理。调度卡片开出的会话、或人要接手某个 issue 时用。
argument-hint: "<根号或 issue 号>"
---

你是 issue #`$ARGUMENTS` 所在那一组的会话，从验证一直陪到这一组关闭。**一组**是一个根 issue 加它的子 issue；没被整合的 issue 自己是一组，下文把它当作「只有一个子 issue、根就是它自己」。人在这个会话里 grill、看设计、拍板；复现、设计、实现交给下面点名的 skill 和它们起的子代理，你只管换阶段。

一组一份 spec，`issues:` 写这一组全部子 issue（没被整合的 issue 就写它自己）；根和子 issue 一起认领、一起翻状态、spec 完成时一起关，都由脚本做（`idea-loop:spec-status` 的「根 issue 和子 issue」）。

**一个会话一条线**：从开场到合并只在一条分支上（会话 worktree 的分支，和知识库里同名的分支），讨论、设计、实现都提交在这条线上，中途不开 PR 合进主分支。PR 从开出那一刻起是 draft，review 跑过一轮才转 ready。

| 阶段 | 侧边栏 section 与 issue 的 label | 这一段做完的标志 |
|---|---|---|
| 讨论 | 讨论中 | spec 定稿提交（`docs(spec): <slug> 定稿`），知识库的 draft PR 开出 |
| 设计 | 设计中 | 冻结结果提交在知识库的分支上 |
| 实现 | 实现中 | 工单全部落地、review 跑过一轮 |
| 审核 | 审核中 | 交了审核报告、PR 转 ready 之后，人说合并，这条线的 PR 全部合并 |

section 名是主队列的；issue 在独立队列里（`issues queues <docs> <号>` 返回的 `name` 不是 `null`），用它返回的 `sections`，即前面加了分类名的同名 section（如「seo 讨论中」）。下文说「某某 section」都照这个换。

下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指知识库的 `docs/`（`idea-loop:wiki-conventions` 的「知识库」）：这个 skill 里的 `issues` 命令用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" root` 的输出加 `/docs`（写 spec、切票、归档这些写的步骤由被调的 skill 自己取 `root --write`），`<主分支>` 取当前仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md` 时先看 `idea-loop:wiki-conventions` 的「会话开在知识库里」：会话开在知识库里就照那里做，不停；否则停下告诉人跑 `/idea-loop:setup`。

## 开场

1. **自己的 worktree 和分支**：你应该在一个从主分支开出的 worktree 里，不跟别的会话共用；不是就停下告诉人。分支改名 `git branch -m issue/<根号>`（根号见第 2 步），整条线就用它；知识库那边由写的步骤用 `root --write` 开同名分支。`DEVELOPMENT.md` 的「分支」节写着「发布方式：按版本发布」的，这个会话是版本会话，分支和合并照 [`references/release.md`](references/release.md) 走，下文的讨论、实现、换阶段按它改。
2. **认出这一组**：`issues group <docs> $ARGUMENTS`，`$ARGUMENTS` 是根号或任一子 issue 号都行，返回根和根下开着的子 issue。以下的「根号」是返回的根号（没被整合的 issue 就是它自己）。
3. **归位**：调 `detach_session`（`self`）变成顶层会话；报错说你不是被别的会话开出来的，就跳过。按上面换好的 section 名用 `list_sections` 找到当前阶段的那个，没有就 `create_section`，再 `move_sessions`（`self`）移进去。标题不是「<仓库名>#<根号> <根标题>」的，用 `set_session_title` 改成这样：调度会话靠它数会话，所以会话标题用根号。
4. **认领**：对根号 `gh issue view <根号> --comments` 读全文和评论（子 issue 的在讨论时一个个读），看它现在的状态（`idea-loop:spec-status` 的「issue 的状态」）：
   - 待验证：`issues set <docs> 讨论中 <根号>`，根和开着的子 issue 一起进讨论中（整组认领），从「讨论」开始。
   - 已经是别的状态、你是调度卡片开出来的：别的会话已经在做它。告诉人，然后照「收尾」归档自己。
   - 已经是别的状态、人直接调的你：人在接手一个没有会话的 issue。照状态接上：讨论中去「讨论」，设计中去「设计」，实现中、审核中去「实现」（审核中的 PR 已经交过报告，从 `idea-loop:pr-review` 接着等人）。上一条线的分支还在的（`git branch -a` 里有 `issue/<根号>`），切到它接着做；没有就照第 1 步开。

完成条件：会话在当前阶段的 section 里，根和子 issue 的 label 都是这一阶段的状态。

## 讨论

会话分支上的知识库（`root --write`）里已经有一份「正式」的 spec 列着这一组（比如人在对话里写好 spec 再调你），跳过下面，直接去「换阶段」。

用 Skill 工具调 `idea-loop:issue-verify`，对这一组**只调一次**，`<号>` 给根号，并告诉它这是根的会话、认领已经做过。它逐个复现根下每个子 issue，起草**一份**覆盖全部子 issue 的 spec，在这里跟人 grill，定稿后单独提交一次、推送并开出知识库的 draft PR，交回 spec 的 slug。没被整合的 issue 照旧调一次。

交回「已关闭」「搁置」的，这一组就没有 spec，去「收尾」；否则去「换阶段」。

## 设计

读 spec，几句话告诉人要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策。告诉人设计从 `/idea-loop:uiux-imagine` 开始（只能人调），停下等人。

人设计完、`/idea-loop:uiux-refine` 把冻结结果提交并推送到知识库的分支上之后，去「换阶段」。

## 实现

1. **切工单**：spec 的 `docs/spec/<slug>/tickets/` 下已经有工单就跳过切票（人重敲本 skill 进来时就是这样）；没有就用 Skill 工具调 `idea-loop:to-ticket` 切。
2. **做**：用 Skill 工具调 `idea-loop:implement` 把工单做完、开 draft PR；implement 全部落地后用 Skill 工具调 `idea-loop:pr-review` 跑第一轮。要人拍板的就停下等人。pr-review 交审核报告时把 PR 转 ready、把 issue 翻成审核中：`move_sessions`（`self`）移进审核中的 section，停下等人读。
3. **审核**：人在这里读报告、追问、批示，由 pr-review 处理。人说合并时由 pr-review 合并，这条线的 PR 全部合并之后去「换阶段」；合了一个、还有没合的，pr-review 的汇报里写还剩哪几个没合，这里不换阶段，等人说合并下一个。

**规则回放的结果**：夜里的任务会用会话间消息把结果发进这个会话（一条「From …」的消息，第一行是 `<仓库> #<PR> 的规则回放：…`，后面是结果文件路径）。收到后：读那份 review loop 文件里的 `规则回放` 条目核实，再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到 `idea-loop:implement` 的「没活了就停下」：没有别的挡着就进 `idea-loop:pr-review` 跑第一轮（PR 仍是 draft，交审核报告时才转 ready）。
- **有不过的**：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照 `idea-loop:implement` 里「人回复后」处理。
- 会话收到消息时正忙着别的，先做完手上这一步再处理；消息没发来（会话归档过、任务没跑）时，人会收到 macOS 通知，结果照样在文件里。

## 换阶段

spec 定稿、设计冻结提交、全部 PR 合并之后各做一遍。不切分支、不拉主分支：整条线就在当前分支上。

1. `issues advance <docs> <spec-slug>`：照会话分支上的 spec 把这一组的 issue 翻到下一段，或关掉；spec 完成时根随子 issue 一起关。最后一行写着「下一段」。
2. 下一段是「设计中」「实现中」：`move_sessions`（`self`）移进这一段的 section（先重跑一次 `issues queues <docs> <根号>`：讨论时分类可能改了），去那一段。是「关闭」：去「收尾」。

## 收尾

这一组关了（spec 完成，根和子 issue 一起关；没被整合的 issue 关了），或人说先放着（`issues set <docs> 搁置 <号>`，根和子 issue 一起搁置）之后：

1. 用 Skill 工具调 `idea-loop:retro`：人批完候选、批了的 issue 开完、决定记录的知识库 PR 合并之后，才往下走。
2. `git status --short` 里没有要留的改动；有就先问人。
3. 用 `archive_session`（`session_id: self`，reason 写「#<根号> 已关闭」或「#<根号> 搁置」）归档自己，worktree 随归档清掉。

## 边界

- 只做这一组。路上发现的别的问题，照 `idea-loop:spec-status` 的「开一个待验证的 issue」开出去，调度会接手。
- issue 的状态只走 `issues`；侧边栏只移动你自己。
