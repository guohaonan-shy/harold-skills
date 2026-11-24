---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, issue-dispatch, dispatch-day-night-modes]
summary: 调度按时段派：白天开 triage、夜里每小时开 1 个 todo 做到 review 完，用 claude -p 加 /desktop 交到桌面端
related: ["[[379]]", "[[2026-11-18-dispatch-day-night]]", "[[0025-dispatch-triage-cards]]", "[[0026-runtime]]"]
---

# ADR-0065 — 调度按时段分两种模式：白天开 triage，夜里开 todo 做到 review 完

> 由 spec `dispatch-day-night-modes` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#379。调度（`idea-loop:issue-dispatch`，定时跑一轮、给 issue 开会话的 skill）原来不分时段，todo 和 triage 一起排、todo 先出、一轮最多 3 个，有三个问题：

- triage 排不上：11-13 21:44、11-14 13:26、11-14 14:17、11-15 14:15 四轮，3 个名额全给了 todo，P0 的 #292 在 triage 最前面排着。
- 人不在开不了会话：定时触发的一轮只能出「会话卡片」（人点了才开会话），11-13 出的 #291 卡片到 11-15 没人点。
- 会话停下问人，夜里就卡住：#157、#69 停在问「要不要开 worktree」。

11-18 在桌面端（Claude Code 2.1.299 到 2.1.327）实测哪条路能在人不说话时开出一个待在侧边栏分组里的会话：定时触发的一轮调 `start_session` 被 app 拒；别的会话开出的会话再开会话被 auto mode 拦；桌面定时任务自己开的会话进不了分组；`claude --bg` 的桌面端看不见；只有 **`claude -p` 开会话、再在交互模式里 `/desktop` 交到桌面端**成功，变成普通桌面会话、能改标题和移进分组，全程没被拦（实测 [[2026-11-18-dispatch-day-night]]，决定 [[379]]）。

## 2 决策（how）

- **时段和上限写在项目配置里**：`ISSUE_TRACKER.md` 的「调度」一节，一张表（时段、派 `triage` 或 `todo`、上限）；没写的项目用默认（9:00–19:00 派 triage 上限 3，22:00–8:00 派 todo，其余不派）。`issues queues <docs> [--at=HH:MM]` 读它，返回此刻的时段、派什么、上限；原先写死的 `cap` 10 去掉。依据「先扩展已在用的工具」。
- **白天只派 triage，夜里只派 todo，19:00–22:00、8:00–9:00 两段空档不开新会话**，留给人做缓冲。
- **夜里每轮固定派 `limit` 个（默认 1），不数 in-progress 里开着几个**。最初定的是「同时不超过 3 个、2 小时没活动让出名额」，11-20 推翻：分组跨项目共用，两个项目抢同一组名额（11-19 夜里 Toeflair 一轮开 3 个，之后 harold-skills 每轮只开出 1 至 2 个）；人先要每轮 3 个，看到一晚最多 30 个，改成每小时 1 个。
- **一轮一轮由桌面定时任务跑**：每小时一次、任务 id `dispatch-<仓库名>`，每次开一个新会话跑完一轮就结束；不再用常驻会话里的循环（会话内定时随会话结束消失，11-18 夜里 00:10 到 13:56 一次没被叫醒）。人要自己加允许规则 `mcp__ccd_sidebar__move_sessions`，否则无人值守时移动别的会话被拦。
- **桌面端开会话四步**：建 worktree（本地有分支就接上、只有远端有就建跟踪分支、都没有才新建）；`claude -p` 开会话只回「就绪」，新脚本在交互模式敲 `/desktop`，看到「Opening Claude Desktop」算成功，否则「交出失败」下一轮再试；改标题、移进分组；**交过去之后**才发任务，因为 `claude -p` 跑着时桌面端看不见它、调度数不到，夜里会超开。出卡片的做法整段删掉。
- **夜间模式**：夜里的任务写明「夜间模式」，`issue-session` 照一份参考做：开 PR 前不停下问人，要人定的按推荐定并写进 PR 描述「夜里替你定的」；只在合并、删分支或数据、强推、对外发信或评论别人的仓库、碰这个 issue 以外的项目，及 `decision-rules` 护栏里只由人定的几样上停下，写进「等你定的」；做到 `pr-review` 跑完、停在等人说合并，不做 retro、不归档。
- **早上汇总**：每次开出会话往 `~/.idea-loop/dispatch/<仓库名>.json` 追加一条（每一轮是新会话，不记得上一轮）；8:00 后第一轮读昨夜条目，每个 issue 一行（PR 链接、review 结论、替人定了几条、没停在 PR 的停在哪），推送一句话。
- **magi 只改「每一轮派什么」**，开会话的做法不动。

没做：夜里看剩余额度；跨项目协调 triage 上限。已知限制：交到桌面端时会话被打开到前台，白天开 triage 会抢窗口，接受。

## 3 结果（result）

- 脚本：`idea-loop/scripts/issues.mjs` 的 `DEFAULT_PERIODS`、`parsePeriods`、`queues`（带 `--at`，输出无 `cap`）；`idea-loop/scripts/desktop-handoff.mjs`（`claude -p` 加 `expect` 敲 `/desktop`、追加记录文件）。
- 文字：`idea-loop/skills/engineering/issue-dispatch/SKILL.md`；`idea-loop/skills/productivity/runtime/references/claude-desktop.md`（每小时定时任务、四步开会话、「装与设置」里的允许规则）与 `magi.md`；`idea-loop/skills/engineering/issue-session/references/night-mode.md`；本仓库 `ISSUE_TRACKER.md` 的「调度」一节。
- 合并在 PR #382（调度按时段分两种模式：白天开 triage，夜里开 todo 做到 review 完）；之后 PR #390 把本仓库白天 triage 上限从 3 调到 6（只改 `ISSUE_TRACKER.md`，代码默认值仍是 3），PR #442（夜里 todo 每小时固定派 1 个，不受 in-progress 影响）落地上面「每轮固定派」。issue #379 已 CLOSED（2026-11-19）。
- 守护：`idea-loop/scripts/dispatch-by-period-doc.test.mjs`、`idea-loop/scripts/issue-session-night-mode-doc.test.mjs`、`idea-loop/scripts/desktop-handoff.test.mjs`（假 `claude` 看到或看不到「Opening Claude Desktop」）、`idea-loop/scripts/issues.test.mjs`（`queues` 的默认值、边界、跨夜、`--at`）。
- 未验：真机的一次夜跑（一次性定时任务、侧边栏出现会话、早上汇总），spec 列为端到端验证，这次对账没跑。
