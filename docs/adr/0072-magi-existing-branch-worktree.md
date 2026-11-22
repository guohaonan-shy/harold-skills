---
type: adr
status: 生效
tags: [idea-loop, issue-dispatch, magi, magi-existing-branch-worktree]
summary: magi 下调度给已有分支的 issue 建 worktree 时先查分支在不在，本地有就接上，不再一律 -b 新建
related: ["[[383]]", "[[2026-11-18-dispatch-day-night]]"]
---

# ADR-0072 — magi 调度给已有分支的 issue 建 worktree：接上分支，不再 -b 新建

> 由 spec `magi-existing-branch-worktree` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#383。magi 是管理 Claude Code / Codex 会话的工具；调度在 magi 里开会话前，要先给 issue 建一个 worktree（主 checkout 外面的独立工作区）。运行环境参考 `magi.md`「调度 · 怎么交出 issue」第 1 步原来写：issue 已有分支时用 `-b <那条分支> origin/<那条分支>`。`-b` 总是新建一条本地分支。白天 triage 会话建过这条分支，收尾时只清掉工作区、分支还在本地；夜里调度再跑这条命令，git 拒绝，worktree 建不出来，会话开不出，下一轮同一条命令同样失败。

分拣时在临时仓库复现（先建本地分支 `issue/9-login-fix` 并跟踪远端）：`git worktree add <路径> -b issue/9-login-fix origin/issue/9-login-fix` 报 `fatal: a branch named 'issue/9-login-fix' already exists`，退出码 255；去掉 `-b`（`git worktree add <路径> issue/9-login-fix`）成功。规模：本机 harold-skills 主 checkout 里 50 条 issue 分支有 46 条已经没有工作区，正是会触发的状态；magi 上实际跑过多少次查不到（本机没有 magi）。

根因：`magi.md` 只区分「有分支 / 没分支」。桌面端那份（`claude-desktop.md` 同一步）在 PR #382（[[2026-11-18-dispatch-day-night]] 讲的按时段调度）里已拆成三种情况修掉，magi 那份因那张工单要求「magi 开会话的做法原样不动」没跟着改。

## 2 决策（how）

- **照抄桌面端的三种情况写法，不另想一种**：本地有分支（`git -C <主 checkout> show-ref --verify --quiet refs/heads/<分支>` 成功）就 `git worktree add <路径> <分支>`，不带 `-b`；只有远端有（`refs/remotes/origin/<分支>`）就 `worktree add --track -b <分支> <路径> origin/<分支>`；两处都没有才 `worktree add <路径> -b <分支> origin/<基准分支>`。路径、`<slug>`、分支名取法和「路径已存在就直接用」保留原文；措辞与桌面端对齐，两份对着看一眼能看出是同一件事。
- 桌面端的同一步不改（已修）；issue 会话开场的「接分支」不改（它在已建好的 worktree 里 `git switch`，不走 `-b`）。
- 版本：idea-loop 升一档 patch（修 bug，不改用法）。

没做：多仓库项目里给别的仓库开同名分支工作区的同类限制，不在这次修、也不另开 issue：人在 PR 上说「你说的限制在0.2.0的home repo会处理」（[[383]]）；magi 下 worktree 的清理流程（`branch -D` 等）不变。

## 3 结果（result）

- 文字：`idea-loop/skills/productivity/runtime/references/magi.md`「调度」的「怎么交出 issue」第 1 步，三种情况各一条命令。
- 合并在 PR #413（magi 调度给已有分支的 issue 建 worktree：接上分支，不再 -b 新建）；issue #383 已 CLOSED（2026-11-20）；决定记录 [[383]]。
- 守护：`idea-loop/scripts/dispatch-by-period-doc.test.mjs` 里 `magi: a worktree for an issue with an existing branch attaches that branch instead of creating one with -b` 一条（三条命令、本地有的那条不带 `-b`、只有「两处都没有」从基准分支建），原先钉着旧写法整条命令的断言已改。
- 未验：magi 上真实跑一次的结果（本机没有 magi）；spec 里的临时仓库三情形演示不是仓库里的测试。
