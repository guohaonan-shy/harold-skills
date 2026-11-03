---
name: issue-session
description: 一组 issue（一个根加它的子 issue，或一个没被整合的 issue）的会话：从验证、grill、设计一路走到实现合并，人在这里拍板，活交给 skill 和子代理。调度卡片开出的会话、人要接手某个 issue、或人说「新想法，开聊」时用。
argument-hint: "<根号或 issue 号，或「新想法，开聊：一句想法」>"
---

你是 issue #`$ARGUMENTS` 所在那一组的会话，从验证一直陪到这一组关闭。**一组**是一个根 issue 加它的子 issue；没被整合的 issue 自己是一组，下文把它当作「只有一个子 issue、根就是它自己」。人在这个会话里 grill、看设计、拍板；复现、设计、实现交给下面点名的 skill 和它们起的子代理，你只管换阶段。

一组一份 spec，`issues:` 写这一组全部子 issue（没被整合的 issue 就写它自己）；根和子 issue 一起认领、一起翻状态、spec 完成时一起关，都由脚本做（`idea-loop:spec-status` 的「根 issue 和子 issue」）。

| 阶段 | 侧边栏 section | issue 的 label | 这一段做完的标志 |
|---|---|---|---|
| 审核 | 审核中 | 验证中 → 审核中 | spec 经知识库的 PR 合进知识库的主分支 |
| 设计 | 设计中 | 设计中 | 冻结结果经设计的知识库 PR 合进知识库的主分支 |
| 实现 | 实现中 | 实现中 | 实现的 PR 全部合并（有几个代码仓库时，每个仓库一个 PR，再加知识库的一个） |

下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指知识库的 `docs/`（`idea-loop:wiki-conventions` 的「知识库」）：这个 skill 里的 `issues` 命令用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" root` 的输出加 `/docs`（写 spec、切票、归档这些写的步骤由被调的 skill 自己取 `root --write`），`<主分支>` 取当前仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md` 时先看 `idea-loop:wiki-conventions` 的「会话开在知识库里」：会话开在知识库里就照那里做，不停；否则停下告诉人跑 `/idea-loop:setup`。

## 新想法，开聊

人说「新想法，开聊：<一句想法>」（或参数是这句话、不是 issue 号），先把想法记成 issue，再当它的会话：

1. 照 `idea-loop:spec-status` 的「开一个待验证的 issue」开：标题写想法本身，正文照录人的原话，`gh issue edit <号> --add-label Idea`；判 P0、挂模块根照做（想法基本不是 P0）。
2. 不在一个带 worktree 的会话里：把 issue 号交给人，告诉人开一个带 worktree 的会话再说「接着聊 #<号>」，停下（想法已经记下，不丢）。
3. 在：把这个号当 `$ARGUMENTS`，照下面「开场」做下去，你就是人直接调的这一组的会话；进「审核」时告诉 `idea-loop:issue-verify` 这是想法，不复现，直接 grill。

带 `Idea` 的 issue 不进调度的候选，只在人自己开聊时才有会话。

## 开场

1. **自己的 worktree**：你应该在一个从主分支开出的 worktree 里，不跟别的会话共用；不是就停下告诉人。
2. **认出这一组**：`issues group <docs> $ARGUMENTS`，`$ARGUMENTS` 是根号或任一子 issue 号都行，返回根和根下开着的子 issue。以下的「根号」是返回的根号（没被整合的 issue 就是它自己）。
3. **归位**：调 `detach_session`（`self`）变成顶层会话；报错说你不是被别的会话开出来的，就跳过。按上表的 section 名用 `list_sections` 找到当前阶段的那个，没有就 `create_section`，再 `move_sessions`（`self`）移进去。标题不是「<仓库名>#<根号> <根标题>」的，用 `set_session_title` 改成这样：调度会话靠它数会话，所以会话标题用根号。
4. **认领**：对根号 `gh issue view <根号> --comments` 读全文和评论（子 issue 的在审核时一个个读），看它现在的状态（`idea-loop:spec-status` 的「issue 的状态」）：
   - 待验证：`issues set <docs> 验证中 <根号>`，根和开着的子 issue 一起进验证中（整组认领），从「审核」开始。
   - 已经是别的状态、你是调度卡片开出来的：别的会话已经在做它。告诉人，然后照「收尾」归档自己。
   - 已经是别的状态、人直接调的你：人在接手一个没有会话的 issue。照状态接上：待设计、设计中去「设计」，待实现、实现中去「实现」，验证中、审核中去「审核」；需要时先对根号 `issues set` 认领成对应的「中」状态。

完成条件：会话在当前阶段的 section 里，根和子 issue 的 label 都是这一阶段的「中」状态。

## 审核

用 Skill 工具调 `idea-loop:issue-verify`，对这一组**只调一次**，`<号>` 给根号，并告诉它这是根的会话、认领已经做过。它逐个复现根下每个子 issue，起草**一份**覆盖全部子 issue 的 spec，在这里跟人 grill，最后把这份 spec 合进主分支，交回 spec 的 slug。没被整合的 issue 照旧调一次。

调之前先 `git fetch origin`，从最新的主分支切出分支：`git switch -c spec/issue-<根号> origin/<主分支>`。交回「已关闭」「搁置」的，这一组就没有 spec，去「收尾」；否则去「换阶段」。

## 设计

读 spec，几句话告诉人要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策。告诉人设计从 `/idea-loop:uiux-imagine` 开始（只能人调），停下等人。

人设计完、`/idea-loop:uiux-refine` 把冻结结果经设计的知识库 PR 合进知识库的主分支之后，去「换阶段」。

## 实现

1. **切工单**：spec 的 `docs/spec/<slug>/tickets/` 下已经有工单就跳过切票（人重敲本 skill 进来时就是这样）；没有就用 Skill 工具调 `idea-loop:to-ticket` 切。
2. **做**：用 Skill 工具调 `idea-loop:implement` 把工单做完、开 PR；implement 全部落地后用 Skill 工具调 `idea-loop:pr-review`。要人拍板的就停下等人。人说合并时由 pr-review 合并，这一段的 PR 全部合并之后去「换阶段」；合了一个、还有没合的，pr-review 的汇报里写还剩哪几个没合，这里不换阶段，等人说合并下一个。

**规则回放的结果**：夜里的任务会用会话间消息把结果发进这个会话（一条「From …」的消息，第一行是 `<仓库> #<PR> 的规则回放：…`，后面是结果文件路径）。收到后：读那份 review loop 文件里的 `规则回放` 条目核实，再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到 `idea-loop:implement` 的「没活了就停下」：没有别的挡着就 `gh pr ready` 进 `idea-loop:pr-review`。
- **有不过的**：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照 `idea-loop:implement` 里「人回复后」处理。
- 会话收到消息时正忙着别的，先做完手上这一步再处理；消息没发来（会话归档过、任务没跑）时，人会收到 macOS 通知，结果照样在文件里。

## 换阶段

每一段的 PR 全部合并后做一遍（实现这一段有几个 PR，见上面「实现」）：

1. `git fetch origin`，从最新的主分支切出下一段的分支：`git switch -c <下一段>/<spec-slug> origin/<主分支>`（设计用 `design/`，实现用 `impl/`）。
2. `issues advance <docs> <spec-slug>`：照知识库主分支上的 spec 把这一组的 issue 翻到下一段并认领，或关掉；spec 完成时根随子 issue 一起关。最后一行写着「下一段」。
3. 下一段是「设计中」或「实现中」：`move_sessions`（`self`）移进这一段的 section，去那一段。是「关闭」：去「收尾」。

## 收尾

这一组关了（spec 完成，根和子 issue 一起关；没被整合的 issue 关了），或人说先放着（`issues set <docs> 搁置 <号>`，根和子 issue 一起搁置）之后：

1. 用 Skill 工具调 `idea-loop:retro`：人批完候选、批了的 issue 开完、决定记录的知识库 PR 合并之后，才往下走。
2. `git status --short` 里没有要留的改动；有就先问人。
3. 用 `archive_session`（`session_id: self`，reason 写「#<根号> 已关闭」或「#<根号> 搁置」）归档自己，worktree 随归档清掉。

## 边界

- 只做这一组。路上发现的别的问题：P0 的照 `idea-loop:spec-status` 的「开一个待验证的 issue」当场开；不是 P0 的告诉人是什么、在哪，人说开才开（`idea-loop:decision-rules` 第 2 条）。
- issue 的状态只走 `issues`；侧边栏只移动你自己。
