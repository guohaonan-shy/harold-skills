---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, issue-dispatch]
summary: 调度也给 triage 的 issue 出会话卡片（单独上限 3），人点了才开会话；删掉独立队列，所有 issue 一个队列
related: ["[[2026-11-05-issue-triage-grill]]", "[[2026-11-05-issue-model-regrill]]", "[[266]]"]
---

# ADR-0025 — 调度给 triage 的 issue 出会话卡片；所有 issue 一个队列

> 由 spec `dispatch-triage-cards` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#266。分拣表里“triage + P1/P2”那一行写着“人自己开 triage 会话”，调度这边也只给 todo 出卡片，triage 的 issue 在汇报里只记一行。结果批进 triage 的 issue 在侧边栏里什么都不出现：人得记得号码、新开带 worktree 的会话、手敲 `/idea-loop:issue-session <号>`；没开就一直停在 triage，翻不到 todo，调度也永远派不到它。一次真实分拣：15 行表里 5 个批进 triage，批完没有一张卡片。todo 会话起草 spec 时冒出要人定的而翻回 triage 的，同样没人接。

另一件事：分类可以注“（独立队列，上限 N）”，只有 `seo-setup` 写过，结果侧边栏里 `seo 审核中`、`seo 设计中`等六个 section 跟主队列并排。人明确说“所有 issue 统一一个队列”。

## 2 决策（how）

- **根因判断**：“triage 由人评估”被理解成了“triage 的会话由人开”。人要的只是讨论的**时机**由人定；桌面端调度出的是卡片，要人点了才开会话，已经满足这一点，不需要连入口一起拿掉。
- **triage 也出卡片**：`issues candidates --state=triage` 取候选，顺序与 todo 相同（指派给本人的在前，按优先级，同级里停留久的在前；指派给别人的不派）；卡片的 prompt 不分状态，`issue-session` 开场按 issue 状态分路。一轮合计最多 3 张，todo 先交，剩下的给 triage。
- **triage 单独上限 3**（人选）：数 triage section 里的会话与还没点的 triage 卡片；原上限 10 只数 in-progress、in-review。理由：triage 会话要人在场 grill，一次接不住太多；单独计数也不跟 todo 抢位。
- **magi 里 triage 也直接开**（人选）：magi 没有卡片，调度直接开会话，受 triage 上限卡住；会话开场起草 spec、自校验，碰到“需要 grill”“待定”就推送一句停下等人。magi 没有 section，按会话 slug 里的号读 issue 状态来分两份数。
- **删掉独立队列**：`issues queues` 不再带 `<号>`，返回 `{ cap: 10, triageCap: 3, sections: [triage, in-progress, in-review] }`；`candidates` 去掉 `--queue`；`seo-setup` 不再写那条注；脚本仍把旧注从分类说明里剥掉，已装的项目不用改文件也不坏。已待在 `seo …` section 里的会话不兼容，由人把它们挪进同名主 section。
- 跳过 triage 的项目：没有候选，不受影响。

## 3 结果（result）

- skill：`issue-dispatch` 有独立的“交出 triage”一步与 `triageCap` 计数，边界里不再写“由人自己开会话”；`issue-session` 会话表里 triage 会话“谁开的”是“人或调度卡片”；`issue-triage` 批表的 triage 行写“调度会给它出会话卡片”。
- 脚本：`idea-loop/scripts/issues.mjs` 的 `candidates(…, { state })`（`todo`/`triage`）、`queues()`、`MAIN_CAP`、`TRIAGE_CAP`；`queueOf` 已删。
- 两个运行环境的做法在 `runtime` skill 的 `references/claude-desktop.md`（卡片、还没点的卡片记法）与 `references/magi.md`（直接开）。
- 守护：`idea-loop/scripts/dispatch-triage-cards-doc.test.mjs`。
- 插件文档里已没有“独立队列”的说法（只剩 `issues.mjs` 剥旧注的兼容代码）。

## 取代线索

- 改写 ADR-0022“调度只派 todo、triage 会话由人开”两处，其余不变；改写 ADR-0023 里分拣表的“人自己开 triage 会话”。
- 与 ADR-0026 配合：调度“怎么数会话”“怎么交出 issue”两处按运行环境分写。
