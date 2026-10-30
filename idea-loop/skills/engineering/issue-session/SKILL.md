---
name: issue-session
description: 一组 issue（一个根加它的子 issue，或一个没被整合的 issue）的会话：从验证、grill、设计一路走到实现合并，人在这里拍板，活交给 skill 和子代理。调度卡片开出的会话、或人要接手某个 issue 时用。
argument-hint: "<根号或 issue 号>"
---

你是 issue #`$ARGUMENTS` 所在那一组的会话，从验证一直陪到这一组关闭。**一组**是一个根 issue 加它的子 issue；没被整合的 issue 自己是一组，下文把它当作「只有一个子 issue、根就是它自己」。人在这个会话里 grill、看设计、拍板；复现、设计、实现交给下面点名的 skill 和它们起的子代理，你只管换阶段。

根没有自己的 spec：每个子 issue 各有一份 spec，各走各的阶段，根的 label 由脚本跟着最慢的子 issue（`idea-loop:spec-status` 的「根 issue 和子 issue」）。

| 阶段 | 侧边栏 section | issue 的 label | 这一段做完的标志（每份 spec 各算） |
|---|---|---|---|
| 审核 | 审核中 | 验证中 → 审核中 | spec 合进主分支 |
| 设计 | 设计中 | 设计中 | 冻结结果经设计 PR 合进主分支 |
| 实现 | 实现中 | 实现中 | 实现 PR 合并 |

section 名是主队列的；issue 在独立队列里（`issues queues <docs> <号>` 返回的 `name` 不是 `null`），用它返回的 `sections`，即前面加了分类名的同名 section（如「seo 审核中」）。下文说「某某 section」都照这个换。

下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指当前 worktree 的 `docs/`，`<主分支>` 取目标仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

## 开场

1. **自己的 worktree**：你应该在一个从主分支开出的 worktree 里，不跟别的会话共用；不是就停下告诉人。
2. **认出这一组**：`issues group <docs> $ARGUMENTS`，`$ARGUMENTS` 是根号或任一子 issue 号都行，返回根和根下开着的子 issue。以下的「根号」是返回的根号（没被整合的 issue 就是它自己）。
3. **归位**：调 `detach_session`（`self`）变成顶层会话；报错说你不是被别的会话开出来的，就跳过。按上面换好的 section 名用 `list_sections` 找到当前阶段的那个，没有就 `create_section`，再 `move_sessions`（`self`）移进去。标题不是「<仓库名>#<根号> <根标题>」的，用 `set_session_title` 改成这样：调度会话靠它数会话，所以会话标题用根号。
4. **认领**：对根号 `gh issue view <根号> --comments` 读全文和评论（子 issue 的在审核时各读各的），看它现在的状态（`idea-loop:spec-status` 的「issue 的状态」）：
   - 待验证：`issues set <docs> 验证中 <根号>`，根和开着的子 issue 一起进验证中（整组认领），从「审核」开始。
   - 已经是别的状态、你是调度卡片开出来的：别的会话已经在做它。告诉人，然后照「收尾」归档自己。
   - 已经是别的状态、人直接调的你：人在接手一个没有会话的 issue。照状态接上：待设计、设计中去「设计」，待实现、实现中去「实现」，验证中、审核中去「审核」；需要时先对根号 `issues set` 认领成对应的「中」状态。

完成条件：会话在当前阶段的 section 里，根和子 issue 的 label 都是这一阶段的「中」状态。

## 审核

对这一组的**每个子 issue 调一次** `idea-loop:issue-verify`（用 Skill 工具，带上子 issue 号，并告诉它这是根的会话、认领已经做过）：一个子 issue 一份 spec，都在这一个会话里跟人 grill。没被整合的 issue 就调一次。

每次调之前，先 `git fetch origin`，从最新的主分支切出这个子 issue 的分支：`git switch -c spec/issue-<子号> origin/<主分支>`。它复现、打分类、起草 spec、跟人 grill，最后把这份 spec 合进主分支，交回 spec 的 slug；交回「已关闭」「搁置」的，这个子 issue 就没有 spec，照下一个。全部子 issue 都过了一遍，再去「换阶段」。

## 设计

读 spec，几句话告诉人要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策。告诉人设计从 `/idea-loop:uiux-imagine` 开始（只能人调），停下等人。

人设计完、`/idea-loop:uiux-refine` 把冻结结果经设计 PR 合进主分支之后，去「换阶段」。

## 实现

根还是单个 issue 都**按 spec 开子会话**（`start_session`），一份 spec 一个，并行做。分工：

| | 根的会话 | 子会话（一份 spec 一个） |
|---|---|---|
| 做什么 | 前期 grill 全部 spec；根代表一个版本时，集成过程中的 pr-review 和合回主分支；最后一个子 issue 关闭后关根 | 切票、实现、它那个 PR 的 pr-review 和合并 |
| 人在哪说话 | grill、集成 PR 上的事 | 这份 spec 实现中的一切问题、它的审核报告、说合并 |

- 参数：`context: fresh`，`use_worktree: true`，`source_branch` 是最新的主分支；`initiation` 人已说开始实现的用 `user_asked`，否则用 `own_initiative`（出卡片，人点了才开）。**子会话的标题不用「<仓库名>#<号>」格式**（如「实现 <slug>」）：调度靠这个格式数占位的会话，子会话不占位。
- 简报（`prompt` 与 `background`）写清四件事：spec 路径；PR 合到哪（下面）；issue 的状态归根的会话翻，子会话不跑 `issues set` / `advance`，合并后给根的会话发一条会话间消息（PR 号、spec slug）；下面的两步、停点和「规则回放的结果」。

子会话照这两步做（原样写进简报）：

1. **切工单**：spec 的 `docs/spec/<slug>/tickets/` 下已经有工单就跳过切票（重敲进来时就是这样）；没有就用 Skill 工具调 `idea-loop:to-ticket` 切。
2. **做**：用 Skill 工具调 `idea-loop:implement` 把工单做完、开 PR；implement 全部落地后用 Skill 工具调 `idea-loop:pr-review`。要人拍板的就停下等人。人说合并时由 pr-review 合并。

**停点**（写进简报）：spec 不碰 UI 的，子会话只在决定题、生产操作、合并前停；收工交审核报告，停下等人在子会话里读、追问、说合并。碰 UI 的照旧每处停。

**PR 合到哪、谁来合**：子会话的 PR 由人在子会话里说「合并」，子会话的 pr-review 合进集成分支（版本根）或主分支（模块根）。

- 根代表一个版本（要一起发）：先从最新主分支开集成分支（如 `release/<plugin>-<版本>`），子会话的 PR 合进它；第一个子 PR 合进后，根的会话开「集成分支 → 主分支」的 draft PR，之后每合进一个子 PR（子会话合并后发消息来），根的会话对它跑一轮 `idea-loop:pr-review`（查几份 spec 合在一起有没有冲突）；全部合完、人说合并后，由根的会话合回主分支并升版本。
- 根代表一个页面或模块：各自合进主分支，有依赖的按依赖顺序合；根的会话只管前期 grill 和最后关根，集成阶段不跑 review。

**规则回放的结果**：夜里的任务会用会话间消息把结果发进开这个 PR 的子会话（一条「From …」的消息，第一行是 `<仓库> #<PR> 的规则回放：…`，后面是结果文件路径）。收到后：读那份 review loop 文件里的 `规则回放` 条目核实，再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到 `idea-loop:implement` 的「没活了就停下」：没有别的挡着就 `gh pr ready` 进 `idea-loop:pr-review`。
- **有不过的**：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照 `idea-loop:implement` 里「人回复后」处理。
- 会话收到消息时正忙着别的，先做完手上这一步再处理（这一段要写进子会话的简报）；消息没发来（会话归档过、任务没跑）时，人会收到 macOS 通知，结果照样在文件里。

## 换阶段

每份 spec 的 PR 合并后做一遍：审核的 spec PR 合并后、设计 PR 合并后、实现 PR 合进**主分支**后（子会话发消息来）。版本根的实现 PR 先合进集成分支，主分支上还看不到，等集成分支合回主分支后，对每份 spec 各做一遍。

1. `git fetch origin`。下一段是设计的，从最新的主分支切出分支：`git switch -c design/<spec-slug> origin/<主分支>`；实现不在这里做，由子会话切 `impl/`。
2. `issues advance <docs> <spec-slug>`：照主分支上的 spec 把那个子 issue 翻到下一段并认领，或关掉；根的 label 由脚本跟着最慢的子 issue，最后一个子 issue 关闭时根随之关闭。最后一行写着「下一段」。
3. 会话待在根当前所处阶段的 section（`issues group <docs> <根号>` 看子 issue 的状态，先重跑一次 `issues queues <docs> <根号>`：审核时分类可能改了），`move_sessions`（`self`）移进去。别的 spec 还在前面的阶段，就接着做它；根和子 issue 全部关闭了，去「收尾」。

## 收尾

这一组的最后一个子 issue 关闭、根随之关闭了（没被整合的 issue 关了），或人说先放着（`issues set <docs> 搁置 <号>`，根和子 issue 一起搁置）之后：

1. 用 Skill 工具调 `idea-loop:retro`：人批完候选、批了的 issue 开完、决定记录的 docs PR 合并之后，才往下走。
2. `git status --short` 里没有要留的改动；有就先问人。
3. 用 `archive_session`（`session_id: self`，reason 写「#<根号> 已关闭」或「#<根号> 搁置」）归档自己，worktree 随归档清掉。

## 边界

- 只做这一组。路上发现的别的问题，照 `idea-loop:spec-status` 的「开一个待验证的 issue」开出去，调度会接手。
- issue 的状态只走 `issues`；侧边栏只移动你自己。
