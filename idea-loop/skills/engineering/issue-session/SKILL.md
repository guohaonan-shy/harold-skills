---
name: issue-session
description: 一个 issue 的会话：从验证、grill、设计一路走到实现合并，人在这里拍板，活交给 skill 和子代理。调度卡片开出的会话、或人要接手某个 issue 时用。
argument-hint: "<issue 号>"
---

你是 issue #`$ARGUMENTS` 的会话，从验证一直陪到它关闭。人在这个会话里 grill、看设计、拍板；复现、设计、实现交给下面点名的 skill 和它们起的子代理，你只管换阶段。

| 阶段 | 侧边栏 section | issue 的 label | 这一段做完的标志 |
|---|---|---|---|
| 审核 | 审核中 | 验证中 → 审核中 | spec 合进主分支 |
| 设计 | 设计中 | 设计中 | 冻结结果经设计 PR 合进主分支 |
| 实现 | 实现中 | 实现中 | 实现 PR 合并 |

section 名是主队列的；issue 在独立队列里（`issues queues <docs> <号>` 返回的 `name` 不是 `null`），用它返回的 `sections`，即前面加了分类名的同名 section（如「seo 审核中」）。下文说「某某 section」都照这个换。

下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指当前 worktree 的 `docs/`，`<主分支>` 取目标仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

## 开场

1. **自己的 worktree**：你应该在一个从主分支开出的 worktree 里，不跟别的会话共用；不是就停下告诉人。
2. **归位**：调 `detach_session`（`self`）变成顶层会话；报错说你不是被别的会话开出来的，就跳过。按上面换好的 section 名用 `list_sections` 找到当前阶段的那个，没有就 `create_section`，再 `move_sessions`（`self`）移进去。标题不是「<仓库名>#<号> <issue 标题>」的，用 `set_session_title` 改成这样：调度会话靠它数会话。
3. **认领**：`gh issue view <号> --comments` 读全文和评论，看它现在的状态（`idea-loop:spec-status` 的「issue 的状态」）：
   - 待验证：`issues set <docs> 验证中 <号>`，从「审核」开始。
   - 已经是别的状态、你是调度卡片开出来的：别的会话已经在做它。告诉人，然后照「收尾」归档自己。
   - 已经是别的状态、人直接调的你：人在接手一个没有会话的 issue。照状态接上：待设计、设计中去「设计」，待实现、实现中去「实现」，验证中、审核中去「审核」；需要时先 `issues set` 认领成对应的「中」状态。

完成条件：会话在当前阶段的 section 里，issue 的 label 是这一阶段的「中」状态。

## 审核

用 Skill 工具调 `idea-loop:issue-verify`，带上 issue 号。它复现、打分类、起草 spec、在这里跟人 grill，最后把 spec 合进主分支，交回 spec 的 slug。然后去「换阶段」。

## 设计

读 spec，几句话告诉人要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策。告诉人设计从 `/idea-loop:uiux-imagine` 开始（只能人调），停下等人。

人设计完、`/idea-loop:uiux-refine` 把冻结结果经设计 PR 合进主分支之后，去「换阶段」。

## 实现

1. **切工单**：spec 的 `docs/spec/<slug>/tickets/` 下已经有工单就跳过切票（人重敲本 skill 进来时就是这样）；没有就用 Skill 工具调 `idea-loop:to-ticket` 切，并把工单提交进当前分支。
2. **停下，请人压缩**：进实现时上下文里是整段审核、grill、设计的历史，编排者每一轮都要重读。`/compact` 只有人能敲，压缩也不会开启新的一轮，所以：用 PushNotification 发一句话说要压缩，然后停下，把下面的指令里的 `<号>`、`<slug>`、`<绝对路径>`（当前 worktree）换成这一次的值，打出来给人复制执行，请人压缩完说一句「继续」。压缩后会话里调过的 skill 原文会被挂回来，本 skill 的规则还在，不用再调。

   ```
   /compact 下一步：在这个 issue 会话里调 idea-loop:implement <slug>。保留：issue #<号>（及同一份 spec 覆盖的其它号）、spec docs/spec/<slug>/、工单已切好在它的 tickets/ 下、当前分支 impl/<slug>、worktree <绝对路径>；本会话跑的是 idea-loop:issue-session，实现 PR 合并后去它的「换阶段」；还没写进 spec 或工单的人的决定，原话逐条保留。丢掉：审核、grill、设计阶段的讨论过程，复现和查询的输出，工具调用的原始记录。
   ```

3. **做**：人说「继续」后，调 `idea-loop:implement` 把工单做完、开 PR；implement 全部落地后接 `idea-loop:pr-review`。要人拍板的就停下等人。人说合并时由 pr-review 合并，合并之后去「换阶段」。

只在这里压缩一次：换去设计、实现合并后关闭、pr-review 开始前都不压缩。

**规则回放的结果**：夜里的任务会用会话间消息把结果发进这个会话（一条「From …」的消息，第一行是 `<仓库> #<PR> 的规则回放：…`，后面是结果文件路径）。收到后：读那份 review loop 文件里的 `规则回放` 条目核实，再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到 `idea-loop:implement` 的「没活了就停下」：没有别的挡着就 `gh pr ready` 进 `idea-loop:pr-review`。
- **有不过的**：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照 `idea-loop:implement` 里「人回复后」处理。
- 会话收到消息时正忙着别的，先做完手上这一步再处理；消息没发来（会话归档过、任务没跑）时，人会收到 macOS 通知，结果照样在文件里。

## 换阶段

每个 PR 合并后做一遍：

1. `git fetch origin`，从最新的主分支切出下一段的分支：`git switch -c <下一段>/<spec-slug> origin/<主分支>`（设计用 `design/`，实现用 `impl/`）。
2. `issues advance <docs> <spec-slug>`：照主分支上的 spec 把 issue 翻到下一段并认领，或关掉；最后一行写着「下一段」。
3. 下一段是「设计中」或「实现中」：`move_sessions`（`self`）移进这一段的 section（先重跑一次 `issues queues <docs> <号>`：审核时分类可能改了），去那一段。是「关闭」：去「收尾」。

## 收尾

issue 关了，或人说先放着（`issues set <docs> 搁置 <号>`）之后：

1. 用 Skill 工具调 `idea-loop:retro`：人批完候选、批了的 issue 开完、决定记录的 docs PR 合并之后，才往下走。
2. `git status --short` 里没有要留的改动；有就先问人。
3. 用 `archive_session`（`session_id: self`，reason 写「#<号> 已关闭」或「#<号> 搁置」）归档自己，worktree 随归档清掉。

## 边界

- 只做这一个 issue。路上发现的别的问题，照 `idea-loop:spec-status` 的「开一个待验证的 issue」开出去，调度会接手。
- issue 的状态只走 `issues`；侧边栏只移动你自己。
