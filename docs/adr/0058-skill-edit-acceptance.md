---
type: adr
status: 生效
tags: [idea-loop, to-ticket, implement, implementer, writing-for-agents, skill-edit-acceptance]
summary: 改 skill 类文件的工单带三格验收，落地前脚本核对交回「调过」writing-for-agents
related: ["[[0034-writing-for-agents-pruning-layers]]", "[[0039-implementer-reuse-and-compact]]", "[[311]]", "[[303]]"]
---

# ADR-0058 — 改 skill 的工单自带验收格，落地时机械核对

> 由 spec `skill-edit-acceptance` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`writing-for-agents` 是插件里管「skill、agent 定义、`AGENTS.md` 怎么写」的 skill。执行方改 skill 类文件时大约一半没用过它。issue #311 的统计（2026-11-14 扫本机 2058 份子代理记录，挑出用 Edit 或 Write 改过 skill、agent 定义或 skill 参考文件的 111 个，调过或读过它算用过）：

| 谁改的 | 个数 | 用过 `writing-for-agents` |
|---|---|---|
| 执行方，10-30 之前 | 63 | 17（27%） |
| 执行方，10-30 及以后（加了「先读写法规范」那句之后） | 38 | 19（50%） |
| 通用子代理（派的人在 prompt 里点了名） | 10 | 10（100%） |

读过 `CODING_STANDARDS.md` 却没顺着链接去读 `writing-for-agents` 的执行方有 13 个：执行方定义要它先读 `CODING_STANDARDS.md`、再在里面找指向 `writing-for-agents` 的那条链接，要走两跳。

没读的交回照样被收下。真实例子是 #304（测试按阶段分层）的提交 2be5d8e 改了 pr-review 的 `SKILL.md`，交回里写法规范那一行是「读 · 工单里 writing-for-agents 的规则原文（已在工单 C1 一格引用）」：没调，只读了工单里引的一句。编排者在「核对与落地」只核提交数、工单号、每格勾没勾，这一行不核。同一个 PR 第 1 轮 review 里，人推翻了执行方为守 5000 字删掉的范围外句子，批示「先都不压」。另一个后果：implement 的 `SKILL.md` 正文从 10-14 的 3885 字长到 9414 字，是约 25 个功能提交一段段内联加进去的。

修正 issue 的说法：2be5d8e 的交回其实写了 `writing-for-agents` 这个名字，只是方式是「读」。所以机械检查不能只搜名字，要核方式是「调」。

## 2 决策（how）

决定它的输入只有一个：这张工单的提交改没改到「这类文件」，判据按路径，不看是哪个仓库：路径以 `SKILL.md` 结尾；或在某个 `skills/` 目录下、以 `.md` 结尾；或是某个 `agents/` 目录下直接的 `.md`（含 `.claude/agents/`）。工单文件不算。

- **to-ticket**：工单要改这类文件的，验收末尾固定带三格：(1) 调过 `writing-for-agents`，交回 `verified` 里每个改到的文件一行杠杆；(2) 改到的 `SKILL.md` 正文按 `AGENTS.md` 量法在上限内，超了就把只有部分运行才走到的分支挪进参考文件，不删工单范围以外的句子；(3) 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选一种证明并做完，只改措辞的写「不涉及：只改措辞」。第 3 格只指向已有的那一节，不复述。
- **implementer**：「开工前」第 5 步直接点名：工单改这类文件的，用 Skill 工具调 `idea-loop:writing-for-agents`，不再经 `CODING_STANDARDS.md` 转一跳。交回 `verified` 多一种行：每个改到的文件一行「杠杆 | <文件> | <对的哪条杠杆>」。
- **implement 的「核对与落地」**：landed 的核对多一项，跑 `ticket-ledger.mjs skill-edit <提交> <交回文件>`；提交改到了这类文件、而交回里写法规范那一行不是「调」且名单里没有 `writing-for-agents`，或有改到的文件没有杠杆行，就退回执行方，处理同现有核对：SendMessage 退回，第二次不过按 failed。
- **机检放进已有的 `ticket-ledger.mjs` 加子命令**，不新建脚本：landed 核对本来就在调它的 `of` 子命令（用户级约定「先扩展已在用的工具」）。
- **「调」才算**：2be5d8e 正是「读」了一句引文。杠杆行逐文件核，不逐处改动核：一处改动算几处脚本判不了，文件是能核的最细粒度；脚本只核行在、第三栏非空，杠杆叫得对不对由 review 判。
- **这次碰到的 `implement` 正文已超上限，就压回上限内**：人对「超上限时要做到什么」选了「照 issue 原文压回上限」。做法是预重构，排在加规则之前：只挪不删，只有部分运行才走到的分支整段挪进 implement 自己的 `references/`，主文件原处留一行指针，别处按节名引用的标题保留。
- **版本档**：人定 patch（0.1.16 到 0.1.17）；审核报告原按 `REVIEW.md` 三档判的是 minor。

取舍（没做）：

- 不走工单直接改 skill 的路径（issue 会话自己改、dreaming 改文档、retro 批了规则直接改）不核：没有工单和交回可核，它们的写法由 review 的 Standards 轴审。
- `AGENTS.md` / `CLAUDE.md` 不算这类文件：issue 只点了 skill、agent 定义、skill 参考文件三类。
- 不核执行方是不是真的调过 Skill 工具（读子代理记录）：只核交回自报，自报不实由 review 抓。
- 量法不在这里改：`AGENTS.md` 的上限改成 token 和行数归 #137；implement 以外的超长 `SKILL.md` 也归 #137。

## 3 结果（result）

- `idea-loop/scripts/ticket-ledger.mjs` 有 `skill-edit` 子命令（判路径、解析交回、给不过的原因）；`idea-loop/skills/engineering/to-ticket/SKILL.md` 有「改 skill 类文件的工单」一节和三格原文；`idea-loop/agents/implementer.md` 第 5 步直接调 `idea-loop:writing-for-agents`、交回格式有「杠杆」行；`idea-loop/skills/engineering/implement/SKILL.md` 的 landed 核对含 `ticket-ledger.mjs skill-edit`。
- implement 的 `SKILL.md` 正文 9414 字压到 4876 字（决定记录数；2026-11-15 重量是 4874），分支挪进 `skills/engineering/implement/references/` 的 `start-of-run.md`、`stop-and-resume.md`、`landing-branches.md`、`multi-repo.md`、`design-change.md`。
- 合并在 PR #317（改 skill 的工单自带验收格，落地时机械核对）；issue #311 已 COMPLETED 关闭；决定记录 [[311]]；2be5d8e 与「先都不压」的出处是 [[303]]。落地时实测补过一处：核对不认模板原文「读 / 调」（`3c36cf8`）。
- 守护：`scripts/skill-edit-acceptance-doc.test.mjs`（三份文档里的格子、字段、核对项）、`scripts/implement-slim-doc.test.mjs`（implement 正文字数）、`scripts/ticket-ledger.test.mjs`（路径判据、交回解析、不过的原因，含 2be5d8e 那种「读」的交回被判不过）。本次对账跑这三个文件，29 条全过。
