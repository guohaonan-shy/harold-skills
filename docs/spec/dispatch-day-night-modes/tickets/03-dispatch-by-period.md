# 03 — 调度每小时一轮、按时段直接开会话、早上给汇总

**Blocked by**：01、02
**设计冻结**：不涉及 UI

## 要建什么

改完后人看到的：在主 checkout 敲一次 `/idea-loop:issue-dispatch`，从此每小时桌面端自己跑一轮调度；白天 triage 会话自己出现在 triage 分组，夜里 todo 会话自己出现在 in-progress 分组并开始干活，整晚不用点卡片；早上 8 点后的第一轮汇报列出昨夜每个会话的结果并推送一句话。

要改的文字（`issue-dispatch` 的 skill、运行环境的 claude-desktop 与 magi 两份参考、`setup` 的「装与设置」、idea-loop 的 README）：

- **起调度**：不再带间隔参数。claude-desktop 上建（已有就更新）一个每小时一次的定时任务，id `dispatch-<仓库名>`，prompt `/idea-loop:issue-dispatch`，建在主 checkout；然后立刻跑第一轮。删掉会话内循环和 7 天到期提醒。magi 照旧用它的定时任务，间隔改成默认每小时。
- **每一轮**：先用 `issues queues` 拿此刻的时段，再对账、数会话：
  - 派 triage 的时段：空位 = 上限 − triage 分组里的会话；只派 triage。
  - 派 todo 的时段：空位 = 上限 − in-progress 分组里最近 2 小时有活动的会话（in-review 不算，2 小时没活动的不算，不动它们）；只派 todo，prompt 写明「夜间模式」。
  - 不派的时段：只对账；是 8:00 之后的第一轮就出早上汇总。
  - 一轮最多开 3 个；只数标题匹配「<仓库名>#<号> …」的会话：照旧。
  - 不再有 `cap` 10、不再有「todo 先交、剩下给 triage」、不再有「还没点的卡片」。
- **claude-desktop 怎么开会话**（替换出卡片）：建 worktree（照 magi 的建法，主 checkout 外面，已有分支接上）→ 用工单 02 的脚本开会话并交到桌面端（在沙箱外跑，它要联网），带上 issue 号、仓库名、时段让它记一笔 → 给 `local_<id>` 改标题、移进对应分组 → 用会话间消息发 issue 会话的 prompt。脚本失败算「交出失败」，写进汇报，下一轮再试。「调度不移动任何会话」的说法改成「只在开会话这一步移动它开出的会话」。人在调度会话里说话的那一轮也走这条路。
- **早上汇总**：读记录文件里昨晚夜里时段开出的条目，每个 issue 一行：PR 链接、review 结论、「夜里替你定的」条数；没停在 PR 的写它在哪个分组、最后活动时间、最后一条「🤖 idea-loop：」评论说停在哪。推送一句话：开了几个、几个等审、几个卡住。
- **装与设置**：`/idea-loop:setup` 打印一条要人自己加的允许规则 `mcp__ccd_sidebar__move_sessions`，说明不加的话夜里会话进不了分组。
- **已知限制**写进 claude-desktop 参考：交到桌面端会把会话打开到前台，白天会抢窗口。
- `issue-session` 表里「triage 会话由人或调度卡片开」改成由人或调度开；`issue-triage` 表里「调度会给它出会话卡片」同步改。
- 现有的调度文字 tripwire 测试改写成新规则的 tripwire：出卡片的说法删干净、按时段派、2 小时、早上汇总、允许规则都在。

## 验收标准

- [x] skill 与两份运行环境参考里没有「出卡片」「还没点的卡片」「会话内循环」「7 天到期」「`cap`（10）」的调度说法（tripwire 测试守）
- [x] `issue-dispatch` 写明三种时段各做什么，空位算法分别是「triage 分组会话数」和「in-progress 里 2 小时内有活动的会话数」
- [x] claude-desktop 参考写明开会话的四步，第二步用工单 02 的脚本，交出失败下一轮再试
- [x] 早上汇总写明数据从记录文件来、每行有哪几项、推送什么
- [x] setup 的「装与设置」打印 `mcp__ccd_sidebar__move_sessions` 允许规则
- [x] magi 参考只改派什么（时段、上限、空位），开会话的做法原样
- [x] `issue-session`、`issue-triage`、README 里跟卡片有关的说法同步
- [x] 各 skill 主体 < 5000 字（量法见仓库 AGENTS.md）
- [x] 插件全部测试绿（含 `no-project-leak`）
- [ ] 真实运行：建一个一次性的调度定时任务跑一轮（时刻用 `--at=23:30`），in-progress 分组出现「harold-skills#<号> …」会话并收到夜间模式的任务（⏭ 延后 → 人：要人先加允许规则、挑一个真 todo issue；PR 里列进「要你做的事」） ⏭ 延后 → 人：要人先加允许规则、先信任 worktree 目录、挑一个真 todo issue，再建一次性调度任务跑 23:30 一轮（PR 列进「要你做的事」）

## 选中的存量回归

- `idea-loop/scripts/dispatch-triage-cards-doc.test.mjs`：本次改写它，改写前跑一次确认现在绿。
- `idea-loop/scripts/issue-session-implement-doc.test.mjs`、`idea-loop/scripts/issues-skill-doc.test.mjs`：读 issue-session 与 issues 的文字，改了表格行可能碰到。
- `idea-loop/scripts/no-project-leak.test.mjs`：新文字不能出现真实项目名。
