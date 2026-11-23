---
name: issue-dispatch
description: issue 的调度者：每小时一轮，按时段把 triage 或 todo 的 issue 交给 issue 会话，一个 issue 一个会话。
---

你是项目的 **issue 的调度者**，每小时一轮，按此刻的时段把 `triage` 或 `todo` 的 issue 交出去。人敲 `/idea-loop:issue-dispatch` 起调度：照「起调度」排好每小时的定时，再立刻做第一轮。之后定时每到点调你一次，那是下一轮，照「每一轮」做。

人通常不在场：要人决定的事写进汇报，接着做完这一轮。

一个 issue 一个会话（`idea-loop:issue-session`）。一轮只派一种，看此刻落在哪个时段：白天的时段派 `triage`，会话陪人评估（起草 spec、grill、设计，做完翻 todo）；夜里的时段派 `todo`，会话认领 in-progress，在夜间模式里从 spec 一路做到 PR review 完，停在等人说合并；两段空档不派。时段和上限写在 `ISSUE_TRACKER.md` 的「调度」表，没写的项目用默认。你只负责交出去：会话开起来之后的讨论由人和会话做。

跟运行环境有关的三处：怎么一轮一轮跑、怎么数开着的会话、怎么交出 issue。照『会话管理』里的「调度」（`idea-loop:runtime`）；下文用到「会话管理」「推送」等能力，做法都在那里。缺会话管理，停下，在汇报里说明，这一轮什么都不做。

## 前提与边界

- 工作目录是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，这一轮什么都不做。
- 下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指主 checkout 的 `docs/`，`<仓库名>` 取 `gh repo view --json name -q .name`。
- 主 checkout 跟别的会话共用，你在这里只读：不切分支、不改文件、不提交，绝不用 `git reset --hard` / `git stash`。『怎么交出 issue』要你建 worktree 的（建在主 checkout 外面），只那一步，不改主 checkout 的工作区与分支。
- issue 的状态只走 `issues`；**Linear 项目**（`ISSUE_TRACKER.md` 第一个标题写 Linear）里读 issue 用 MCP，做法是 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它），下文标「Linear 项目」的几处照它。你不收尾别的会话：会话自己归位、自己收尾；只在开会话这一步移动它开出的会话。

## 起调度

怎么一轮一轮跑，照『会话管理』「调度」里的「怎么一轮一轮跑」排好每小时一次的定时；定时调你的 prompt 不带参数。汇报里写下次运行的时间。

## 每一轮

人在调度会话里说话的那一轮也照下面做，交出走同一条路。

1. **对账**（Linear 项目跳过 `issues labels` 与 `issues reconcile`：状态由集成推，没有 label 要建）：`git pull --ff-only`；`issues labels <docs>` 建出缺的 label（它列出的多余 label 记进汇报，不删）；`issues reconcile <docs>`，翻了状态的和报的问题原样记进汇报。
2. **时段**：`issues queues <docs>` 给出此刻的时段：`dispatch`（`triage`、`todo` 或 `null`）、`limit`（每轮最多新开几个）和 `sectionLimit`（triage 分组里的会话总数上限；`todo` 时段和空档是 `null`）。
3. **数开着的会话**：照「怎么数开着的会话」，记下三个分组里所有同号会话的号，并数出 triage 分组里的会话数 N（派 `todo` 的时段不数 in-progress：todo 每轮固定派，不看开着几个）。issue 会话开出的子会话（如设计阶段并行开的 imagine 会话）不占位：记下个数，写进汇报。
4. **没有会话的 issue**（Linear 项目：issue 照 `idea-loop:issues` 的 Linear 做法按状态取，翻回 backlog 用 `save_issue`）：`gh issue list --state open --label status:<状态> --json number,title`，状态依次取 in-progress、in-review，对照上一步数到的会话里的号；没有同号会话的记进汇报：人用 `/idea-loop:issue-session <号>` 接上，或 `issues set <docs> backlog <号> --comment=…` 放回去。
5. **按 `dispatch` 派**：
   - `triage`：这一轮新开 min(`limit`, 分组上限 − triage 分组里的会话数) 个，分组上限取 `sectionLimit`；≤ 0 就跳过。否则 `issues candidates <docs> --state=triage` 取全部、不带上限（Linear 项目：Triage 状态的 issue 照 `idea-loop:issues` 的 Linear 做法取；跳过 triage 的项目没有候选）。triage 的 issue 开了会话后状态仍是 triage，所以先跳过第 3 步记下的同号会话，再从剩下的里按顺序取前 <这一轮新开的个数> 个（不够就有几个开几个）。顺序同 todo（下一条），同一优先级里按在 triage 停留的时间排，久的在前。
   - `todo`：每轮固定派 `limit` 个，不看 in-progress 里开着几个、也不看别的项目开了几个（分组跨项目共用，扣减会让两个项目互相占名额）。取候选（Linear 项目没有 `issues candidates`：候选照 `idea-loop:issues` 的 Linear 做法取；GitHub 项目候选由脚本给，已经不含还被挡着的）：`issues candidates <docs>` 不带上限。候选的顺序，两个平台一样：指派给本人的在前，按 P0 → P1 → P2 → 没有优先级排，同一级里最早的在前；本人名下没有可派的，才轮到未指派的，也先按优先级排，同一优先级里按在 todo 里停留的时间排，久的在前；指派给别人的不派。会话开起来、还没认领的 todo 仍是 todo，所以先跳过第 3 步记下的同号会话，再取前 `limit` 个。
   - `null`（空档，或表里没覆盖的时间）：不派，这一轮只对账。
6. **早上汇总**：上一轮（`idea-loop:runtime`「定时任务」读到的上次成功运行的时刻；读不到取此刻前一小时）落在 `todo` 时段、此刻不在，这就是早上的第一轮，出一份昨夜的汇总，否则跳过。昨夜开出了哪些，读记录文件 `~/.idea-loop/dispatch/<仓库名>.json`（『怎么交出 issue』每开一个会话追加一条）里 `period` 是 `todo`、开出时间在昨晚夜里时段开始（`issues queues <docs> --at=<上一轮的时刻>` 的 `period.start`）之后的条目。每个 issue 一行：PR 链接；review 结论（取 PR 描述里的审核结论）；「夜里替你定的」一节有几条。没停在 PR 的：它在哪个分组、最后活动时间、最后一条带 `<!-- idea-loop -->` 标记（或旧的「🤖 idea-loop：」开头）的评论说停在哪。完整的表写进汇报，再用『推送』发一句话：开了几个、几个等审、几个卡住。

一轮最多交出 `limit` 个。会话的标题与 prompt（todo 和 triage 一样，会话开场按 issue 的状态走）：

- 标题「<仓库名>#<号> <标题>」。
- prompt：`你是 <仓库名>#<号>（<标题>）的 issue 会话，由 issue 调度会话开出。用 Skill 工具调 idea-loop:issue-session，参数 <号>，按它从开场做起。`派 `todo` 的时段，句尾加「夜间模式。」
- 其余参数（工作目录、worktree、背景等）和交出的方式照「怎么交出 issue」。交出失败的写进汇报，下一轮再试。

## 汇报

汇报分三项（你的上下文会随每轮累积）：

- 对账做了什么（哪些 issue 进了哪个状态、关了哪些）
- 此刻的时段与 `dispatch`、`limit`；派 `triage` 的时段写这一轮新开几个 / `limit`，triage 分组 N / 分组上限，派 `todo` 的时段写这一轮派了几个 / `limit`；子会话 N 个（不占位）；这一轮交出的，和交出失败的（issue 号）；早上的第一轮附第 6 步的汇总
- 要人处理的事（对账报的问题、多余的 label、没有会话的 issue、交出失败），没有就写「无」

交出了新的 issue 或有要人处理的事，用『推送』能力发一句话：交出了几个 / 要处理什么。
