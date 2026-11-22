---
type: adr
status: 生效
tags: [idea-loop, dreaming, productivity, dreaming-ask-scope]
summary: dreaming 问人的范围只在 SKILL.md 开头列一份并跟脚本判定对齐，周任务说明改成指过去，测试从脚本推出类别来守
related: ["[[350]]", "[[0047-dreaming-triage-autonomous]]"]
---

# ADR-0067 — dreaming 问人的范围只认一处说法

> 由 spec `dreaming-ask-scope` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#350。dreaming 是知识库对账的 skill：把每一行提议拆成两份，问人的那份摆给人批，其余自己执行并合并（见 [[0047-dreaming-triage-autonomous]]）。哪些行问人，只由 `proposal-table-check.mjs --split-ask`（脚本里的 `isAskRow`）判。

2026-11-20 对着 origin/main（`1e0c2b92`）核，脚本拆给人的有：所有 `候选` 行、所有 `DESIGN.md 条目` 行、处置是「删除」的 `暂缓设计` 行、处置是「报警」「问人」的 `文档` 行（文档里的冲突）、对象是 `GLOSSARY.md` 的 `文档` 行。但两处文字没跟上：

- `setup/references/weekly-dreaming.md`：「只有 `DESIGN.md` 和文档里的冲突两类才摆在会话里等人批」，漏了 `GLOSSARY.md`、候选、要删的暂缓设计。
- dreaming `SKILL.md` 开头那句：「`DESIGN.md`、文档里的冲突、要删的暂缓设计」问人，漏了 `GLOSSARY.md`、候选。

README 和根目录 `AGENTS.md` 那份已一致。例子：每周定时起的 dreaming 会话读到 weekly-dreaming 那句，会以为「GLOSSARY.md 里某术语改名」那一行不用等人；脚本实际会把它拆进问人的小表。

根因：556068a1（「只问人两类」）时确实是两类，各处照抄了一份；之后脚本加了类，README 和 `AGENTS.md` 跟着改，这两处没跟，`dreaming-autonomous-doc.test.mjs` 还用断言把旧原文钉住，改了文字测试会红，没人改。没查到实际误判的记录（dreaming 运行不留统计）。

## 2 决策（how）

- **列举只在 dreaming `SKILL.md` 开头写一份给 agent 看，其余指过去。** 开头补全成脚本的五类（`DESIGN.md`、文档里的冲突、`GLOSSARY.md`、要删的暂缓设计、所有 `候选` 行），跟 README、`AGENTS.md` 同序同词。依据是 `SKILL.md` 自己的原话「问人的是哪几类行，只由脚本判，这里不另写一份」。
- **`weekly-dreaming.md` 不再复述列举**，改成「只有问人的那几类行（见 `idea-loop:dreaming` 开头）才摆在会话里等人批」。
- **`dreaming/references/proposal-table.md`**：「问人的行和自动的行」一节里只列三类的「大意」改成指向 dreaming 开头，不再自带列举（review 第 1 轮发现这句原本漏判，并进本次）。
- **测试从脚本的判定推出类别、再去对开头的列举，不把五个词写死**：下次脚本再加一类而文字没跟，测试红。review 第 2 轮要求五个说法在测试里只出现一次（一张表）。
- 版本：patch，只修说明前后不一致，不改行为。

没做：README、`AGENTS.md` 改成指针（它们是给人看的总览，已一致）；改脚本的问人判定本身；`wiki-conventions`（精简时已不再提问人范围）。ADR-0047 里「只问两类」的原话是当时决定的记录，不在这里改。

## 3 结果（result）

- 文字：`idea-loop/skills/productivity/dreaming/SKILL.md` 开头列五类；`idea-loop/skills/engineering/setup/references/weekly-dreaming.md` 指向 `idea-loop:dreaming` 开头；`idea-loop/skills/productivity/dreaming/references/proposal-table.md` 不自带列举。
- 合并在 PR #409（dreaming 问人的范围只认一处说法）；issue #350 已 CLOSED（2026-11-20）。决定记录 [[350]]（review 两轮的偏差都是夜间模式按推荐定的）。
- 守护：`idea-loop/scripts/dreaming-autonomous-doc.test.mjs`（`ASK_KINDS` 一张表，`askedBySplit()` 从 `splitAskRows` 探出脚本实际拆给人的类别，缺一类或多一类都红）。
