---
name: issue-session
description: 一个 issue 的会话：triage 会话陪人评估它（spec、grill、设计），todo 会话把它做到合并。调度开出的会话、或人要接手某个 issue 时用。
argument-hint: "<issue 号>"
---

你是 issue #`$ARGUMENTS` 的会话。一个 issue 一个会话、一份 spec（frontmatter 的 `issues:` 写它的号）；分支 `issue/<号>-<slug>` 只给代码用。人在这个会话里 grill、看设计、拍板；复现、设计、实现交给下面点名的 skill 和它们起的子代理，你照「triage 会话」「todo 会话」「实现」往下走。状态怎么翻、前提是什么，读 `idea-loop:issues`。

会话有两条路，认领时 issue 的状态决定走哪条：

| 会话 | 谁开的 | 认领成 | 做完 |
|---|---|---|---|
| triage 会话 | 人或调度 | triage | 起草 spec、grill、设计，`set todo`，收尾 |
| todo 会话 | 调度 | in-progress，PR 转 ready 后 in-review | 读 spec（没有就起草），实现，review，合并，done，收尾 |

任务里写了「夜间模式」：人不在，整个会话照 [references/night-mode.md](references/night-mode.md) 做，停下等人、翻回 triage、收尾的地方以它为准。

运行环境的能力（会话管理、推送等）照『<能力>』（`dyna runtime show <能力>`），下文只写能力名。

**Linear 项目**读写 issue、翻状态（认领、翻回 triage、先放着都算）用 MCP，照 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它）；`dyna issues set` 在那里被拒，翻前跑 `dyna issues check <docs> <状态> <号> --from=<现在>`。`<docs>` 指 `<项目目录>/docs/`（项目目录：`idea-loop:wiki-conventions` 的「项目目录」），`<主分支>` 取 `<项目目录>/DEVELOPMENT.md` 的「分支」节；没有 `DEVELOPMENT.md`，停下告诉人跑 `/idea-loop:setup`。

## 开场

1. **自己的 worktree**：你应该在一个从主分支开出的 worktree 里，不跟别的会话共用；不是就停下告诉人。
2. **认领**：读 issue 全文和评论（`dyna issues read <docs> $ARGUMENTS`；读哪条评论接上次，照 `idea-loop:issues` 的「评论」），`dyna issues show <docs> $ARGUMENTS` 看状态、PR、spec、分支（triage 阶段 `branch: null` 是正常的）。按状态走：
   - backlog：人在接手它。`dyna issues set <docs> triage $ARGUMENTS`，走 triage 会话。项目跳过 triage 的（`set triage` 被拒），`set todo` 再 `set in-progress`，走 todo 会话。
   - triage：人在接着评估，走 triage 会话。
   - todo：`dyna issues set <docs> in-progress $ARGUMENTS`，走 todo 会话。
   - in-progress、in-review：别的会话已经在做。你是调度开出来的，告诉人后照「收尾」收尾；人直接调的，是在接手没有会话的 issue，不翻状态，按 PR、spec、工单接上；in-review 里人批了要改的，先 `set in-progress`。
   - 已关闭：停下说明。
3. **归位**：用『会话管理』的「分组」把自己归到认领后状态对应的分组，标题改成「<仓库名>#<号> <标题>」；没有分组就跳过。
4. **不切分支**：triage 会话不切分支，spec、设计、工单提交到 home（`idea-loop:wiki-conventions` 的「知识库落地」），不进任何分支；todo 会话第一次要写代码时才在「实现」里接分支。

完成条件：会话在当前路的分组里（没有分组就免），issue 状态是这条路认领成的那个。

## triage 会话

1. **起草**：输入是第 2 步读到的 issue 全文和分拣贴的证据评论。用 Skill 工具调 `idea-loop:to-spec` 起草，再照 [references/draft-spec.md](references/draft-spec.md) 自校验、在这里跟人 grill、把 spec 提交到 home。起草时发现已被做掉的、人决定不做的，去「收尾」；人说先放着，去「先放着」。
2. **设计**：不碰 UI 的 spec 跳过。碰 UI 的照 [references/design-handoff.md](references/design-handoff.md) 带人过设计，停下等人；冻结结果提交到 home 之后，往下。
3. **交给调度**：`dyna issues set <docs> todo $ARGUMENTS --comment=<spec 已提交到 home <提交号>>`，去「收尾」。`set todo` 被拒时，照它说的还差什么回去补。

## todo 会话

home 里已有 spec 就读它；没有就用 Skill 工具调 `idea-loop:to-spec` 起草，上下文是 issue 全文和评论，再照 [references/draft-spec.md](references/draft-spec.md) 做，提交到 home。起草中冒出了要人定的（spec 里要写「需要 grill」「待定」），把已写的提交到 home，`dyna issues set <docs> triage $ARGUMENTS --comment=<要人定什么、spec 在 home 的提交号>`，去「收尾」，人在 triage 里定。项目跳过 triage 的翻不回去，就在这个会话里照 triage 会话的 1、2 步跟人 grill、做设计。spec 就绪后去「实现」。

## 实现

顺序是接分支 → 开 draft PR → 切工单 → 做，让 issue 从第一次写代码起就挂着 PR。

1. **接分支，开 draft PR**：spec 已提交到 home（上一步保证）。第一次要写代码，先把 origin 取到最新，再让工作区站在分支 `issue/<号>-<slug>` 上：当前分支已经是它（调度建 worktree 时开好的）就接着做；`show` 返回了分支就接上它；都没有就从 `origin/<主分支>` 新建，`<slug>` 取标题的几个词。新建的分支先提一个空提交（说明 `chore: 开工 #<号>`）再 `dyna git push`；坑：分支比主分支没有新提交时开不了 PR，空提交要 `--allow-empty`。然后用 Skill 工具调 `idea-loop:pr`，照它的「开 draft PR」开 PR（已有就跳过）。
2. **切工单**：spec 的 `<docs>/spec/<slug>/tickets/` 下已经有工单就跳过切票；没有就用 Skill 工具调 `idea-loop:to-ticket` 切。
3. **做**：用 Skill 工具调 `idea-loop:implement` 把工单做完；implement 全部落地后用 Skill 工具调 `idea-loop:pr-review`。要人拍板的就停下等人。人说合并时由 pr-review 合并；PR 合并后 issue 应已是 done，不是就 `dyna issues set <docs> done $ARGUMENTS`，然后去「收尾」。Linear 项目的 done 由集成推，核一次，不是就提醒人。转 ready、进 in-review 在这两个 skill 里。

## 先放着

人说先放着（任何一步）：已写的知识库改动提交到 home；已有分支且有未推送的代码提交，用 `dyna git push` 推上去；`dyna issues set <docs> backlog $ARGUMENTS --comment=<停在哪个阶段、有分支就写分支名>`，去「收尾」。下一个会话读这条评论接上。

## 收尾

issue 关了（done、canceled），triage 做完翻了 todo，翻回了 triage，或先放着之后：

1. 用 Skill 工具调 `idea-loop:retro`：人批完候选、批了的 issue 开完、决定记录提交到 home 之后，才往下走。
2. 工作区里没有要留的改动；有就先问人。
3. 用『会话管理』的「会话收尾」收尾自己，reason 写「#<号> done」这类一句话。

## 边界

- 只做这一个 issue。路上发现的别的问题，照 `idea-loop:issues` 的「开一个 issue」开出去。
- 任何时候停下问人（包括讨论中冒出的范围题：并进当前 PR 还是另开），先照会话已加载的用户规则（`~/.claude/CLAUDE.md`）的「停下问我」。
- issue 的状态只走 `issues`；分组只移动你自己。
