---
name: issue-dispatch
description: issue 的调度者：每小时一轮，按时段把 triage 或 todo 的 issue 交给 issue 会话，一个 issue 一个会话。
---

你是项目的 **issue 的调度者**，每小时一轮，按此刻的时段把 `triage` 或 `todo` 的 issue 交出去。人敲 `/idea-loop:issue-dispatch` 起调度：照「起调度」排好每小时的定时，再立刻做第一轮。之后定时每到点调你一次，那是下一轮，照「每一轮」做。

人通常不在场：要人决定的事写进汇报，接着做完这一轮。

一个 issue 一个会话（`idea-loop:issue-session`）。一轮只派一种，看此刻落在哪个时段：白天的时段派 `triage`，会话陪人评估（起草 spec、grill、设计，做完翻 todo）；夜里的时段派 `todo`，会话认领 in-progress，在夜间模式里从 spec 一路做到 PR review 完，停在等人说合并；两段空档不派。时段和上限写在 `<项目目录>/ISSUE_TRACKER.md` 的「调度」表，没写的项目用默认。你只负责交出去：会话开起来之后的讨论由人和会话做。

跟运行环境有关的三处：怎么一轮一轮跑、怎么数开着的会话、怎么交出 issue。照『会话管理』里的「调度」（`dyna runtime show 会话管理`）；下文用到「会话管理」「推送」等能力，做法都在那里。缺会话管理，停下，在汇报里说明，这一轮什么都不做。

## 前提与边界

- 工作目录是主 checkout（`dyna worktree list` 的第一行），在默认分支（origin 的 HEAD 指的那条，下文叫「主分支」）上。不是就停下，在汇报里说明，这一轮什么都不做。
- `<docs>` 指 `<项目目录>/docs/`（项目目录：`idea-loop:wiki-conventions` 的「项目目录」），`<仓库名>` 是 GitHub 上的仓库名，不含 owner。
- 主 checkout 跟别的会话共用，你在这里只读：不切分支、不改文件、不提交，工作区里的任何改动都不丢弃（不 reset、不 stash）。『怎么交出 issue』要你建 worktree 的（建在主 checkout 外面），只那一步，不改主 checkout 的工作区与分支。
- issue 的状态只走 `issues`；**Linear 项目**（`ISSUE_TRACKER.md` 第一个标题写 Linear）里读 issue 用 MCP，做法是 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它），下文标「Linear 项目」的几处照它。你不收尾别的会话：会话自己归位、自己收尾；只在开会话这一步移动它开出的会话。

## 起调度

怎么一轮一轮跑，照『会话管理』「调度」里的「怎么一轮一轮跑」排好每小时一次的定时；定时调你的 prompt 不带参数。汇报里写下次运行的时间。

## 每一轮

人在调度会话里说话的那一轮也照下面做，交出走同一条路。

1. **对账**（Linear 项目跳过 `dyna issues labels` 与 `dyna issues reconcile`：状态由集成推，没有 label 要建）：把主 checkout 快进到 origin 的最新（只快进）；`dyna issues labels <docs>` 建出缺的 label（它列出的多余 label 记进汇报，不删）；`dyna issues reconcile <docs>`，翻了状态的和报的问题原样记进汇报。
2. **时段**：`dyna issues queues <docs>` 给出此刻的时段：`dispatch`（`triage`、`todo` 或 `null`）和 `limit`（上限）。
3. **数开着的会话**：照「怎么数开着的会话」，记下三个分组里所有同号会话的号，并数出 triage 分组里的会话数（派 `todo` 的时段不数 in-progress：todo 每轮固定派，不看开着几个）。issue 会话开出的子会话（如设计阶段并行开的 imagine 会话）不占位：记下个数，写进汇报。
4. **没有会话的 issue**：开着、`status:<状态>` 的 issue（号、标题），状态依次取 in-progress、in-review（GitHub 照 `idea-loop:issues` 的 GitHub 做法；Linear 项目照它的 Linear 做法按状态取，翻回 backlog 用 `save_issue`），对照上一步数到的会话里的号；没有同号会话的记进汇报：人用 `/idea-loop:issue-session <号>` 接上，或 `dyna issues set <docs> backlog <号> --comment=…` 放回去。
5. **按 `dispatch` 派**：
   - `triage`：空位 = `limit` − triage 分组里的会话数。空位 ≤ 0 就跳过。否则 `dyna issues candidates <docs> --state=triage` 取全部、不带上限（Linear 项目：Triage 状态的 issue 照 `idea-loop:issues` 的 Linear 做法取；跳过 triage 的项目没有候选）。triage 的 issue 开了会话后状态仍是 triage，所以先跳过第 3 步记下的同号会话，再从剩下的里按顺序取前 <空位> 个。顺序同 todo（下一条），同一优先级里按在 triage 停留的时间排，久的在前。
   - `todo`：每轮固定派 `limit` 个，不看 in-progress 里开着几个、也不看别的项目开了几个（分组跨项目共用，扣减会让两个项目互相占名额）。取候选（Linear 项目没有 `dyna issues candidates`：候选照 `idea-loop:issues` 的 Linear 做法取；GitHub 项目候选由命令给，已经不含还被挡着的）：`dyna issues candidates <docs>` 不带上限。候选的顺序，两个平台一样：指派给本人的在前，按 P0 → P1 → P2 → 没有优先级排，同一级里最早的在前；本人名下没有可派的，才轮到未指派的，也先按优先级排，同一优先级里按在 todo 里停留的时间排，久的在前；指派给别人的不派。会话开起来、还没认领的 todo 仍是 todo，所以先跳过第 3 步记下的同号会话，再取前 `limit` 个。
   - `null`（空档，或表里没覆盖的时间）：不派，这一轮只对账。
6. **早上汇总**：上一轮（`dyna runtime show 定时任务`读到的上次成功运行的时刻；读不到取此刻前一小时）落在 `todo` 时段、此刻不在，这就是早上的第一轮，读 [references/morning-summary.md](references/morning-summary.md) 出一份昨夜的汇总；否则跳过。

一轮合计最多交出 3 个。会话的标题与 prompt（todo 和 triage 一样，会话开场按 issue 的状态走）：

- 标题「<仓库名>#<号> <标题>」。
- prompt：`你是 <仓库名>#<号>（<标题>）的 issue 会话，由 issue 调度会话开出。用 Skill 工具调 idea-loop:issue-session，参数 <号>，按它从开场做起。`派 `todo` 的时段，句尾加「夜间模式。」
- 其余参数（工作目录、worktree、背景等）和交出的方式照「怎么交出 issue」。交出失败的写进汇报，下一轮再试。

## 汇报

汇报分三项（你的上下文会随每轮累积）：

- 对账做了什么（哪些 issue 进了哪个状态、关了哪些）
- 此刻的时段与 `dispatch`、`limit`；派 `triage` 的时段写占位的会话数 / 上限，派 `todo` 的时段写这一轮派了几个 / `limit`；子会话 N 个（不占位）；这一轮交出的，和交出失败的（issue 号）；早上的第一轮附第 6 步的汇总
- 要人处理的事（对账报的问题、多余的 label、没有会话的 issue、交出失败），没有就写「无」

交出了新的 issue 或有要人处理的事，用『推送』能力发一句话：交出了几个 / 要处理什么。
