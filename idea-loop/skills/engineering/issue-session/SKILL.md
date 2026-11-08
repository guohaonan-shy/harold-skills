---
name: issue-session
description: 一个 issue 的会话：triage 会话陪人评估它（spec、grill、设计），todo 会话把它做到合并。调度开出的会话、或人要接手某个 issue 时用。
argument-hint: "<issue 号>"
---

你是 issue #`$ARGUMENTS` 的会话。一个 issue 一个会话、一份 spec（frontmatter 的 `issues:` 写它的号）、一条分支 `issue/<号>-<slug>`。人在这个会话里 grill、看设计、拍板；复现、设计、实现交给下面点名的 skill 和它们起的子代理，你只管换阶段。状态怎么翻、前提是什么，读 `idea-loop:issues`。

会话有两条路，认领时 issue 的状态决定走哪条：

| 会话 | 谁开的 | 认领成 | 做什么 | 做完 |
|---|---|---|---|---|
| triage 会话 | 人 | triage | 起草 spec、grill、设计 | push 分支，`set todo`，收尾 |
| todo 会话 | 调度 | in-progress，PR 全部转 ready 后 in-review | 接分支（没有就自己起草 spec），实现，review，合并 | 全部 PR 合并后 done，收尾 |

会话管理、推送等运行环境的能力，用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的『<能力>』，下文只写能力名。

**Linear 项目**读写 issue、翻状态（认领、翻回 triage、先放着都算）用 MCP，照 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它）；`issues set` 在那里被拒，翻前跑 `issues check <docs> <状态> <号> --from=<现在>`。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指当前 worktree 的 `docs/`，`<主分支>` 取目标仓库 `DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

## 开场

1. **自己的 worktree**：你应该在一个从主分支开出的 worktree 里，不跟别的会话共用；不是就停下告诉人。
2. **认领**：`gh issue view $ARGUMENTS --comments` 读全文和评论（最近一条「🤖 idea-loop：」写着上次停在哪、分支叫什么），`issues show <docs> $ARGUMENTS` 看状态、挂着的 PR、spec、分支。按状态走：
   - backlog：人在接手它。`issues set <docs> triage $ARGUMENTS`，走 triage 会话。项目跳过 triage 的（`issues set` 拒绝 triage），`set todo` 再 `set in-progress`，走 todo 会话。
   - triage：人在接着评估，走 triage 会话。
   - todo：`issues set <docs> in-progress $ARGUMENTS`，走 todo 会话。
   - in-progress、in-review：别的会话已经在做。你是调度开出来的，告诉人，然后照「收尾」收尾；人直接调的，是在接手一个没有会话的 issue，不翻状态，按 PR、spec、工单在哪接上；in-review 里人批了要改的，先 `set in-progress`。
   - 已关闭：停下说明。
3. **归位**：用『会话管理』的「分组」把自己归到认领后状态对应的分组，标题改成「<仓库名>#<号> <标题>」；没有分组的运行环境跳过。
4. **接分支**：`git fetch origin`。`show` 返回了分支，就在它上面接着做（`git switch -c issue/<号>-<slug> --track origin/issue/<号>-<slug>`）；没有就 `git switch -c issue/<号>-<slug> origin/<主分支>`，`<slug>` 取标题的几个词。spec、设计、工单和代码都提交在这一条分支上，PR 合进主分支（`idea-loop:wiki-conventions` 的「知识库落地」）。

完成条件：会话在当前路的分组里（没有分组就免），issue 的状态是这条路认领成的那个，worktree 在这个 issue 的分支上。

## triage 会话

1. **起草**：读 issue 全文和分拣贴的证据评论（`gh issue view $ARGUMENTS --comments`，「🤖 idea-loop：」开头的那条），用 Skill 工具调 `idea-loop:to-spec` 起草，再照 [references/draft-spec.md](references/draft-spec.md) 自校验、在这里跟人 grill、把 spec 提交在分支上。起草时发现已被做掉的（它会把 issue 关成 canceled）、人决定不做的，去「收尾」；人说先放着，去「先放着」。
2. **设计**：读 spec，几句话告诉人要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策。不碰 UI 的 spec 跳过。碰 UI 的告诉人设计从 `/idea-loop:uiux-imagine` 开始（只能人调），停下等人；人设计完、`/idea-loop:uiux-refine` 把冻结结果提交在这个分支上之后，往下。
3. **交给调度**：`git push -u origin issue/<号>-<slug>`，`issues set <docs> todo $ARGUMENTS --comment=<分支名，spec 与设计已提交>`，去「收尾」。`set todo` 被拒时说出了还差什么（spec 里没定完的行、没冻结的设计），回去补。

## todo 会话

分支上已有 spec（triage 会话留下的，或先放着时留下的），读它；没有就用 Skill 工具调 `idea-loop:to-spec` 起草，上下文是 issue 全文和评论，再照 [references/draft-spec.md](references/draft-spec.md) 做，提交在分支上。起草中冒出了要人定的（spec 里要写「需要 grill」「待定」），把已写的提交并 push，`issues set <docs> triage $ARGUMENTS --comment=<要人定什么、分支名>`，去「收尾」，人在 triage 里定。项目跳过 triage 的，没法翻回去，就在这个会话里跟人 grill、做设计，写法同 triage 会话的 1、2 步。spec 就绪后去「实现」。

## 实现

顺序是 spec 提交 → 开 draft PR → 切工单 → 做：平台从 spec 提交起就能在 issue 上看到 PR。

1. **开 draft PR**：spec 已提交在分支上（上一步保证）。多个仓库的 issue：`ISSUE_TRACKER.md` 的「仓库」一节列出了几个仓库、spec 的「实现决策」写了要改哪些，就在每个要改的、不是当前 worktree 所在的仓库里开同名分支的 worktree：`git -C <那个仓库的本地路径> worktree add <路径> -b issue/<号>-<slug> origin/<那个仓库的主分支>`，把路径记进 spec 的「实现决策」并提交。没有这一节的项目就是一个仓库，不用开。然后用 Skill 工具调 `idea-loop:pr`，照它的「开 draft PR」给每个要改的仓库开 PR（已有就跳过）。
2. **切工单**：spec 的 `docs/spec/<slug>/tickets/` 下已经有工单就跳过切票（人重敲本 skill 进来时就是这样）；没有就用 Skill 工具调 `idea-loop:to-ticket` 切，多仓库时每张工单写明改哪个仓库。
3. **做**：用 Skill 工具调 `idea-loop:implement` 把工单做完；implement 全部落地后用 Skill 工具调 `idea-loop:pr-review`。要人拍板的就停下等人。人说合并时由 pr-review 逐个合并；全部 PR 合并后 issue 应已是 done，不是就 `issues set <docs> done $ARGUMENTS`，然后去「收尾」。Linear 项目的 done 由集成推，`get_issue` 核一次，不是就提醒人。转 ready、进 in-review 在这两个 skill 里。

**规则回放的结果**：夜里的任务会用会话间消息把结果发进这个会话（一条「From …」的消息，第一行是 `<仓库> #<PR> 的规则回放：…`，后面是结果文件路径）。收到后：读那份 review loop 文件里的 `规则回放` 条目核实，再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到 `idea-loop:implement` 的「没活了就停下」：没有别的挡着就 `gh pr ready` 进 `idea-loop:pr-review`。
- **有不过的**：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照 `idea-loop:implement` 里「人回复后」处理。
- 会话收到消息时正忙着别的，先做完手上这一步再处理；消息没发来（会话已收尾、任务没跑）时，人会收到 macOS 通知，结果照样在文件里。

## 先放着

人说先放着，在哪一步都一样：已写的改动提交，`git push -u origin issue/<号>-<slug>`，`issues set <docs> backlog $ARGUMENTS --comment=<停在哪个阶段、分支名>`，去「收尾」。下一个会话读这条评论接上分支。

## 收尾

issue 关了（done、canceled），triage 做完翻了 todo，翻回了 triage，或先放着之后：

1. 用 Skill 工具调 `idea-loop:retro`：人批完候选、批了的 issue 开完、决定记录的 docs PR 合并之后，才往下走。
2. `git status --short` 里没有要留的改动；有就先问人。
3. 用『会话管理』的「会话收尾」收尾自己，reason 写「#<号> done」「#<号> 交给调度」「#<号> 先放着」之类。

## 边界

- 只做这一个 issue。路上发现的别的问题，照 `idea-loop:issues` 的「开一个 issue」开出去。
- issue 的状态只走 `issues`；分组只移动你自己。
