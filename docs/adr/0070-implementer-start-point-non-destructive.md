---
type: adr
status: 生效
tags: [idea-loop, implementer, auto-mode, implementer-start-point-non-destructive]
summary: implementer 开工对齐起点改成核空、快进、快进不了再改指分支，不再用 reset --hard；定义压到 5000 字内
related: ["[[0039-implementer-reuse-and-compact]]", "[[0058-skill-edit-acceptance]]", "[[160]]"]
---

# ADR-0070 — implementer 开工对齐起点：换掉 `git reset --hard`，定义压回 5000 字

> 由 spec `implementer-start-point-non-destructive` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:implementer` 是工单的执行方，一张工单一个 worktree。它的定义（`idea-loop/agents/implementer.md`「开工前」第 1 步）原来让执行方先跑 `git reset --hard <起点 SHA>`，把从默认分支切出的新 worktree 对齐到集成分支。auto mode 的分类器（给自动执行的命令做拦截的那一层）把它判成「Irreversible Local Destruction」或「Destructive or Unwanted Actions」直接拒绝。

2026-11-16 扫本机全部会话记录，带 `git reset --hard` 的 Bash 调用：放行 713、被拒 84（10 月 33、11 月 21、无日期的子 agent 记录 30）、其他报错 60。被拒之后 5 条命令内（只看子 agent 记录）：原样重试又被拒 47，改用 `git merge --ff-only` 22（全放行），`git checkout -B` 6（全放行），`git switch -C` 4（放行 3、被拒 1，理由「Interfere With Workloads」），其余 17。执行方最后多能开工，但每次多花几轮试错。根因：定义里写死的是带「丢弃改动」语义的命令，分类器不知道这个 worktree 刚建、干净。

同一份定义还太长。2026-11-18 对着 `6a32a15` 量主体：implementer 11626 字，第二长的 ui-reviewer 6622，其余 792–3866。让它长的三类内容：只有部分工单走到的分支内联（改规则的工单约 1700 字、UI 工单与设计档案约 800 字）；编排者的流程（被叫回怎么接、重派、PR 开出后跑大用例）；交回模板后对「停，还是延后」的重复复述。

## 2 决策（how）

决定记录 [[160]]。

**对齐起点**，两步都不丢东西：先核 `git status --short` 为空；`git merge --ff-only <起点 SHA>`，这是最常见的路径；快进不了（默认分支在集成分支切出后又前进）才 `git checkout -B <你的分支> <起点 SHA>`，此时工作区已核空。然后照旧核 `git rev-parse HEAD` 等于起点 SHA、仍在派给你的分支上。

- **用改写法，不在 `/idea-loop:setup` 里给 `git reset --hard` 加允许规则**：允许规则改的是用户的权限配置，同项目里任何会话（包括 issue-dispatch 明令不许 reset 的主 checkout）都会免检，范围大得多。
- **不用 `git switch --detach`**：执行方停下时要把半成品提交在派给它的那条分支上，detached HEAD 上的提交不在任何分支。**不用 `git switch -C`**：被拒过一次。
- 定义里的步骤正向写要跑什么，不写「别用 reset --hard」（否定会把被禁的命令拖进上下文）；另两处提到 reset 的措辞改成「对齐起点」。落地用的 `reset --soft` 没在被拒记录里，保留。

**精简定义**（同一个 PR，人 2026-11-18 说「放在这里做」，两件改同一份文件，分开会冲突）：主体只留交付和步骤；改规则的工单整段挪进 implement skill 的 `references/rule-tickets.md`，UI 工单与设计档案并进已有的 `ui-tickets.md`，主体各留一行指针；删编排者的流程和重复的解释。不精简成「只列工具」：交回格式被编排者机械核对，命令不写死执行方就自己现想，这正是 84 次被拒的来源。

取舍（没做）：不排查编排者里的 git 命令（没出现在被拒记录里）；不改 Claude Code 的 worktree 从哪切出（不归插件）。进一步优化人说留到 0.2.0。

## 3 结果（result）

- `idea-loop/agents/implementer.md`「开工前」第 1 步（起点）是核空、`merge --ff-only`、不行再 `checkout -B`；文件里只剩落地用的 `reset --soft`。主体 4995 字（2026-11-22 按 `AGENTS.md` 量法重量，对着 c2b43c34）。
- 挪出去的内容在 `idea-loop/skills/engineering/implement/references/` 的 `rule-tickets.md` 与 `ui-tickets.md`，implementer 主体各有一行指针。
- 合并在 PR #371（implementer 开工对齐起点：换掉 git reset --hard）；issue #160 已 CLOSED（2026-11-18）；决定记录 [[160]]。
- 守护：`idea-loop/scripts/implementer-start-point-doc.test.mjs`（核空、快进、兜底、完成条件、另两处措辞）、`idea-loop/scripts/implementer-slim-doc.test.mjs`（主体 < 5000 字、分支在参考文件里）。
- 未验证：spec 要求的「合并后下一次实现运行里没有 `git reset --hard` 被拒」靠真实运行观察，本次对账查不到记录。
