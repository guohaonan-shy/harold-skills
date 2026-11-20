---
type: spec
tags: [idea-loop, issue-dispatch, magi]
summary: magi 下调度给已有分支的 issue 建 worktree 时先查分支在不在，在就接上，不再用 -b 新建
issues: [383]
related: ["[[dispatch-day-night-modes]]"]
---

# magi 调度给已有分支的 issue 建 worktree：接上分支，不再 -b 新建

> #383 存在：本地已有 issue 分支时，magi 调度照原样跑 `git worktree add <路径> -b <分支> origin/<分支>` 报「a branch named … already exists」，详情在「问题陈述」

## 问题陈述

### 1. 本地已有分支的 issue，magi 下每一轮都开不出会话

magi 运行环境参考（`idea-loop/skills/productivity/runtime/references/magi.md`「调度 · 怎么交出 issue」第 1 步，2026-11-20 对着 origin/main 1e0c2b92 核过）写着：issue 已有分支时「用它，`-b <那条分支> origin/<那条分支>`，不新起」。`-b` 总是新建一条本地分支。白天 triage 会话建过这条分支、收尾时只清掉了工作区，分支还在本地；夜里调度再跑这条命令，git 拒绝，worktree 建不出来，会话开不出；下一轮还是同一条命令，同样失败。

分拣时在临时仓库里复现（先建本地分支 `issue/9-login-fix` 并跟踪远端，再照原样跑）：

| 写法 | 结果 |
|---|---|
| `git worktree add <路径> -b issue/9-login-fix origin/issue/9-login-fix` | `fatal: a branch named 'issue/9-login-fix' already exists`，退出码 255 |
| `git worktree add <路径> issue/9-login-fix` | 成功，退出码 0 |

量：本机 harold-skills 主 checkout 里 50 条 issue 分支有 46 条已经没有工作区，正是会触发的状态；magi 上实际跑过多少次查不到（本机没有 magi）。

复现材料：`.tmp/triage/383/repro.log`（分拣会话的 worktree）。

### 根因

magi.md 只区分了「有分支 / 没分支」，有分支时一律 `-b` 新建，没考虑分支已经在本地。桌面端那份（`claude-desktop.md` 同一步）在 PR #382 里已经拆成三种情况修掉，magi 那份因为那张工单要求「magi 开会话的做法原样不动」没跟着改。

## 方案

改完：magi 下调度给任何 issue 建 worktree 都一次成功——本地有分支就接上它，只有远端有就从远端建跟踪分支，两处都没有才从基准分支新建。会话开在这条分支上，白天留下的 spec、设计提交都在。

做法：把 magi.md 第 1 步改成桌面端同一步的写法，三种情况各一条命令：

1. 本地有（`git -C <主 checkout> show-ref --verify --quiet refs/heads/<分支>` 成功）：`git -C <主 checkout> worktree add <路径> <分支>`。
2. 只有远端有（`refs/remotes/origin/<分支>`）：`git -C <主 checkout> worktree add --track -b <分支> <路径> origin/<分支>`。
3. 两处都没有：`git -C <主 checkout> worktree add <路径> -b <分支> origin/<基准分支>`。

路径、`<slug>`、分支名的取法和「路径已存在就直接用」照原文保留。模块之间的消息不变（调度 → git → magi sessions start 的顺序照旧），所以不配时序图。

同一行为的其他入口：

- 桌面端 `claude-desktop.md` 同一步：**排除**，PR #382 已修。
- issue 会话开场「接分支」（`issue-session` SKILL.md）：**排除**，它在已建好的 worktree 里 `git switch`，本地已有分支时 `git branch --show-current` 已经是它，不走 `-b`。

## User Stories

1. 期望行为（对应问题 1）：magi 下，本地已有 issue 分支的 issue 被调度时，worktree 建在这条分支上，会话照常开出；只有远端有、两处都没有的情况也各自一次成功。

## 实现决策

- **照抄桌面端的三种情况写法，不另想一种。** 依据：现存实例 `claude-desktop.md`「调度 · 怎么交出 issue」第 1 步；分拣评论的建议做法也是这个。
- **措辞对齐桌面端**：magi.md 这一步里路径先定义成 `<路径>`，后面三条命令都用它，读者两份对着看能一眼看出同一件事。
- **文档测试**：`idea-loop/scripts/dispatch-by-period-doc.test.mjs` 里给桌面端的那条测试照样给 magi 加一条（三条命令、本地有的那条不带 `-b`、只有「两处都没有」从基准分支建）；原来钉着 magi 旧写法整条命令的断言改成钉新写法。
- 插件版本：idea-loop `plugin.json` 升一档 patch（修 bug，不改用法）。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改的是给 agent 读的命令，用文档测试钉住命令形状（见下）；不加 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：magi.md 的文本本身，由 `dispatch-by-period-doc.test.mjs` 读。能抓到：命令写错、少一种情况、本地有分支那条又带上 `-b`；漏掉：magi 上真实跑一次的结果（本机没有 magi）。
- **增量功能测试**：在临时 git 仓库里，三种情况各照 magi.md 的命令跑一次 `git worktree add`，都退出码 0，worktree 在对应分支上。前置：本地有分支 / 只有远端有 / 都没有；覆盖：期望行为 1。
- **照着谁写**：同文件里「claude-desktop: a worktree for an issue with an existing branch attaches that branch…」那条测试。

## Out of scope

- magi 下 worktree 的清理流程（`branch -D` 等），不变。

## 关联

- PR #382（#379）：桌面端同一步的修法，本 spec 照它。
- 相邻 spec `dispatch-day-night-modes`：定了按时段派发，没碰建 worktree 的命令，不重叠。
- 开着的 issue 里没有改 magi.md 这一步的。
