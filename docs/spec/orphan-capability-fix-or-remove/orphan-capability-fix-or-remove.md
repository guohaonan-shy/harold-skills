---
type: spec
tags: [idea-loop, issue-session, to-spec, draft-spec]
summary: 起草修坏能力的 spec 时先查有没有调用方；一个都查不到，把「修好还是删掉」写成待定，不默认按修
related: ["[[issue-triage]]", "[[retro]]"]
issues: [148]
---

# 坏掉的能力没有调用方时，spec 把「修好还是删掉」摆成待定

> #148 存在：起草 spec 的自校验只要求查「同一行为的其他入口」，不要求查这个能力有没有人在用；一个坏掉、没人用的能力会被默认按修好起草，详情在「问题陈述」

## 问题陈述

### 1. 没人用的坏能力被按「修好」起草，人追问后才改成删掉，spec 重写一次

Toeflair#430（报告历史接口按分数排序的测试不稳定）的 issue 会话里，spec `history-score-sort` 复现了按分数排序没生效、最低分过滤漏掉一类报告，正文也写了学生端没有入口触发，却仍按修好起草，经 Toeflair PR #634 合进主分支（提交 `2b7f0791`，2026-10-27）。人在切票时追问：

> 分数排序是哪个部分使用，我在前端都没有看到

会话这才去查，学生端、营销站、端到端测试、MCP 都没有调用；人定「删掉 sort_by=score 和 min_score，重写 spec」，重写版经 PR #648 合入。多出来的是一份重写的 spec 和一次 spec PR（出处：Toeflair `docs/raw/decisions/430.md` 题 1、题 2）。

现行规则里仍会这样走（分拣评论 2026-11-10，对着 `origin/main` 6202c21 核过）：issue 指的落点 `idea-loop:issue-verify` 已删掉，起草 spec 的规则现在在 issue-session 的「起草 spec」参考里。它的「自己校验」第 7 条只要求「同一行为的其他入口，每个都在『方案』里标了纳入还是排除」，没有一句要求查这个能力有没有调用方；`to-spec` 和 `decision-rules` 里也没有。在插件 skill 里搜「调用方」，命中的都是「调用本 skill 的上游」的意思。

### 根因

起草时核现状的清单里没有「有没有调用方」这一项，坏能力默认就是要修的；没人用这件事只有人自己去看界面才发现。修正：issue 原先认为落点是 issue-verify 的「先复现」一节，实测它已被 #243 删掉，规则落在 issue-session 的「起草 spec」参考。

## 方案

改完以后，issue 会话起草一份「修一个坏掉的能力」的 spec 时，会先查这个能力有没有调用方：查到了，调用方写进「方案」，照常按修起草；一个都查不到，spec 的「实现决策」里多一条「待定：修好还是删掉」，两个选项各配例子和代价、带推荐，交给人定，不再默认按修。待定会让 todo 会话照现有流程把 issue 翻回 triage，由人定完再走。

改的是一份给 agent 读的参考：issue-session 的「起草 spec」参考（`references/draft-spec.md`）。按 `idea-loop:writing-for-agents` 的杠杆诊断：

- **谁读它、读哪块**：只有 `idea-loop:issue-session`，triage 会话第 1 步、todo 会话没有 spec 时起草，都在调完 `to-spec` 之后「照它做」，逐项过「自己校验」再提交。人直接敲 `/idea-loop:to-spec` 的不读它。
- **杠杆：可执行的检查项**。「自己校验」是提交前逐项过的清单，哪项不过回去改；规则写进这里，每次起草都一定会被核一遍。写进「输入」的叙述里只是提醒，没有「不过就回去改」的力道。所以改第 7 条「现状和范围查清了」，在它后面加一句。
- **杠杆：指针不复述**。待定的写法已经在第 6 条指给 `idea-loop:decision-rules`「要人定的写成一道题」，这里只说「写一条待定」和它的两个选项，写法不再重复。

加的那句的意思（落字以实现为准）：修一个坏掉的能力的，查过它有没有调用方（界面入口、前端请求、别的服务、脚本或定时任务），查到的写进「方案」；一个都查不到，「实现决策」里有一条「待定：修好还是删掉」，两个选项各配例子和代价，不默认按修起草。

同一行为的其他入口：

- 纳入：issue-session 的「起草 spec」参考，triage 会话和 todo 会话都经它起草。
- 排除：`to-spec` 本身。它也服务不从 issue 来的需求（一场讨论落成 spec），多数不是修坏能力；人直接用它时人就在场，会自己问。issue 原文和分拣建议的落点都是 issue 起草这一处。
- 排除：分拣员（`idea-loop:issue-triager`）。它判 issue 真不真、去哪，不起草方案；修还是删是方案的事。

## User Stories

1. 期望行为（对应问题 1）：issue 会话起草修坏能力的 spec，查不到任何调用方时，spec 里有一条「待定：修好还是删掉」，两个选项各有例子和代价；查得到调用方时，调用方写在「方案」里，照常按修起草。

## 实现决策

- 落点：issue-session「起草 spec」参考的「自己校验」第 7 条，加一句，不新开条目。依据：分拣评论的建议；见「方案」的杠杆诊断。
- 「调用方」列举界面入口、前端请求、别的服务、脚本或定时任务。依据：issue 新文列了前三类；Toeflair#430 里人当时查了学生端、营销站、端到端测试、MCP，端到端测试不算真实使用，脚本和定时任务是插件仓库这类项目里常见的调用方。
- 查不到就一律写成待定，不由 agent 自己判「删」。依据：issue 新文「不默认按修起草」，以及决定记录里人的原话「删掉……重写 spec」是人定的；删掉是对外行为的改动，归人。
- 待定选项的写法沿用 `idea-loop:decision-rules`，本处不复述。依据：第 6 条已指向它。
- README 不改：README 里 issue-session 那一行只写「起草 spec 经 `references/draft-spec.md`（自校验……）」，没有逐条列校验项。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了「起草 spec」参考的一条校验；加一个 retro 回放用例（见下） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：retro 回放（`idea-loop/evals/retro/`）：同一输入、改前改后的插件各跑一遍 to-spec 加「起草 spec」参考，判定会话答是/否题。能抓到：规则有没有让起草出的 spec 多出这条待定。漏掉：调用方查得全不全，只看结论。
- **增量功能测试**：回放用例 `draft-spec-orphan-capability`。
  - 前置：Toeflair 仓库在 spec 起草之前的提交 `b9602e50`（`2b7f0791` 的父提交）；回放时用 `--repo <Toeflair 本地 checkout>` 指向它。
  - 步骤：把 Toeflair#430 的原文交给 issue 会话的起草步骤（to-spec 加「起草 spec」参考），停在 spec 草稿写好、交给人看的那一刻。
  - 期望：改前「否」、改后「是」。是/否题：spec 有没有把「修好还是删掉」写成一条待定，依据是查过按分数排序和最低分过滤没有任何调用方？
  - 覆盖：期望行为 1。
  - 大小：small，只驱动 to-spec 一个 skill、不起插件 agent、不开浏览器，按规则当场跑。
  - 已知限制：用例的提交在 Toeflair，夜间队列按 PR 所在 worktree 取仓库，取不到它；它只能用 `--case` 加 `--repo` 当场跑。用例旁写明这一点。
- **照着谁写**：`idea-loop/evals/retro/cases/to-spec-diagnose-agent-docs/`（同样驱动 to-spec 到草稿写好）。

## Out of scope

- 不改 `to-spec` 的模板和流程。
- 不给回放 runner 加「用例自带仓库」的字段；跨仓库用例在队列里跑不了，记为已知限制。

## 关联

- 来源：Toeflair#430 会话的 retro（2026-10-27 人批），决定记录在 Toeflair `docs/raw/decisions/430.md`。
- [[issue-triage]]：删掉了 issue-verify，起草规则因此搬到 issue-session 的参考里。
- [[retro]]：规则改动走回放验收。
- 相邻还没完成的 spec 与 issue：查过 `docs/spec/index.md` 和开着的 issue，没有改「起草 spec」参考的；无重叠。
