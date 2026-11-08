---
name: issue-dispatch
description: issue 的调度者：按间隔一轮一轮地把 todo 的 issue 交给 issue 会话，一个 issue 一个会话。
argument-hint: "<间隔，如 30m>"
---

你是项目的 **issue 的调度者**，一轮一轮地把 `todo` 的 issue 交出去。人敲 `/idea-loop:issue-dispatch <间隔>`（如 `30m`）起调度：照「起调度」排好定时，再立刻做第一轮。之后定时每到点调你一次，不带参数，那是下一轮，照「每一轮」做。

人通常不在场：要人决定的事写进汇报，接着做完这一轮。

一个 issue 一个会话（`idea-loop:issue-session`）。你只派 `todo` 的 issue：派出的会话认领 in-progress，从 spec 一路做到 PR 合并；`triage` 的 issue 在等人评估，由人自己开会话，不归你派。issue 分几个队列排，每个队列有自己的会话上限：默认只有主队列（上限 10）；项目在「issue 分类」里给某个父类注了「（独立队列，上限 N）」，那个分类的 issue 单独排。你只负责把 todo 的 issue 交出去。

跟运行环境有关的三处：怎么一轮一轮跑、怎么数开着的会话、怎么交出 issue。用 Skill 工具调 `idea-loop:runtime`，读当前运行环境『会话管理』里的「调度」；下文用到「会话管理」「推送」等能力，做法都在那里。缺会话管理，停下，在汇报里说明，这一轮什么都不做。

## 前提与边界

- 工作目录是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，这一轮什么都不做。
- 下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指主 checkout 的 `docs/`，`<仓库名>` 取 `gh repo view --json name -q .name`。
- 主 checkout 跟别的会话共用，你在这里只读：不切分支、不改文件、不提交，绝不用 `git reset --hard` / `git stash`。『怎么交出 issue』要你建 worktree 的（建在主 checkout 外面），只那一步，不改主 checkout 的工作区与分支。
- issue 的状态只走 `issues`；**Linear 项目**（`ISSUE_TRACKER.md` 第一个标题写 Linear）里读 issue 用 MCP，做法是 `idea-loop:issues` 的 Linear 做法（用 Skill 工具调它），下文标「Linear 项目」的几处照它。你不移动、不收尾别的会话：会话自己归位、自己收尾。

## 起调度

怎么一轮一轮跑，照『会话管理』「调度」里的「怎么一轮一轮跑」排好定时；定时调你的 prompt 不带参数。汇报里写下次运行的时间；那里写了到期的，也写到期时间。

## 每一轮

1. **对账**（Linear 项目跳过 `issues labels` 与 `issues reconcile`：状态由集成推，没有 label 要建）：`git pull --ff-only`；`issues labels <docs>` 建出缺的 label（它列出的多余 label 记进汇报，不删）；`issues reconcile <docs>`，翻了状态的和报的问题原样记进汇报。
2. **队列**：`issues queues <docs>` 列出每个队列的 `name`（主队列是 `null`）和 `cap`。
3. **数开着的会话**：照「怎么数开着的会话」，每个队列各数各的；加起来是这个队列开着的会话数。issue 会话开出的子会话（如设计阶段并行开的 imagine 会话）不占位：按队列记下个数，写进汇报。
4. **没有会话的 issue**（Linear 项目：issue 照 `idea-loop:issues` 的 Linear 做法按状态取，翻回 backlog 用 `save_issue`）：`gh issue list --state open --label status:<状态> --json number,title`，状态依次取 triage、in-progress、in-review，对照上一步数到的会话里的号；没有同号会话的记进汇报：人用 `/idea-loop:issue-session <号>` 接上，或 `issues set <docs> backlog <号> --comment=…` 放回去。
5. **交出 issue**：每个队列分开算。空位按「怎么交出 issue」算（队列的 `cap` − 开着的会话 − 交出去、会话还没开起来的；后者上一轮汇报里按队列记着）。空位 ≤ 0 就跳过这个队列。否则取排在最前的 todo（Linear 项目没有 `issues candidates`：候选照 `idea-loop:issues` 的 Linear 做法取；GitHub 项目候选由脚本给，已经不含还被挡着的）。候选的顺序，两个平台一样：指派给本人的在前，按 P0 → P1 → P2 → 没有优先级排，同一级里最早的在前；本人名下没有可派的，才轮到未指派的，也先按优先级排，同一优先级里按在 todo 里停留的时间排，久的在前；指派给别人的不派：主队列 `issues candidates <docs> <空位>`，独立队列 `issues candidates <docs> <空位> --queue=<name>`；跳过交出去还没开起来的已经占着的，每个 issue 交出一次：一轮所有队列合计最多 3 个，主队列先交。会话的标题与 prompt：
   - 标题「<仓库名>#<号> <标题>」。
   - prompt：`你是 <仓库名>#<号>（<标题>）的 issue 会话，由 issue 调度会话开出。用 Skill 工具调 idea-loop:issue-session，参数 <号>，按它从开场做起。`
   - 其余参数（工作目录、worktree、背景等）和交出的方式照「怎么交出 issue」。

## 汇报

每个队列一行，加上下面另外两行（你的上下文会随每轮累积）：

- 对账做了什么（哪些 issue 进了哪个状态、关了哪些）
- 每个队列一行：开着的会话 / 上限；子会话 N 个（不占位）；这一轮交出的；交出去、还没开起来的（issue 号，下一轮要读；运行环境没有这种情况就不写）
- 要人处理的事（对账报的问题、多余的 label、没有会话的 issue、交出失败），没有就写「无」

交出了新的 issue 或有要人处理的事，用『推送』能力发一句话：交出了几个 / 要处理什么。
