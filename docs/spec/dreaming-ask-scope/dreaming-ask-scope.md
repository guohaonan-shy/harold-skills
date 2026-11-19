---
type: spec
tags: [idea-loop, dreaming, productivity]
summary: 把 dreaming 问人范围的说法统一成脚本的实际判定，周任务说明改成指过去而不再复述
related: ["[[0047-dreaming-triage-autonomous]]"]
issues: [350]
---

# dreaming 问人的范围只认一处说法

> #350 存在：每周对账的说明仍写「只有 DESIGN.md 和文档里的冲突两类」等人批，dreaming 开头的列举也漏了 GLOSSARY.md 和「候选」行，详情在「问题陈述」

## 问题陈述

### 1. 两处文字跟脚本的实际判定对不上

dreaming 是知识库对账的 skill：它把每一行提议拆成两份，问人的那份摆给人批，其余自己执行并合并。哪些行问人，只由 `proposal-table-check.mjs --split-ask` 判（dreaming 的 SKILL.md 第 5 步原话：「问人的是哪几类行，只由脚本判，这里不另写一份」）。

2026-11-20 对着 origin/main（`1e0c2b92`）核，脚本的 `isAskRow` 把这几类行拆给人：所有 `候选` 行、所有 `DESIGN.md 条目` 行、处置是「删除」的 `暂缓设计` 行、处置是「报警」「问人」的 `文档` 行（文档里的冲突）、对象是 `GLOSSARY.md` 的 `文档` 行。对照各处文字：

| 位置 | 原文 | 跟脚本比 |
|---|---|---|
| `idea-loop/skills/engineering/setup/references/weekly-dreaming.md` 第 3 行 | 「只有 `DESIGN.md` 和文档里的冲突两类才摆在会话里等人批」 | 漏了 GLOSSARY.md、候选、要删的暂缓设计 |
| `idea-loop/skills/productivity/dreaming/SKILL.md` 第 6 行 | 「会判错或删了找不回的（`DESIGN.md`、文档里的冲突、要删的暂缓设计）问人」 | 漏了 GLOSSARY.md、候选 |
| `idea-loop/README.md` dreaming 一行 | `DESIGN.md`、文档冲突、`GLOSSARY.md`、要删的暂缓设计，另加所有 `候选` 行 | 一致 |
| 根目录 `AGENTS.md` 第 32 行 | 同 README | 一致（分拣时还是「两类」，之后已被别的改动修掉） |
| `idea-loop/skills/productivity/wiki-conventions/SKILL.md` | 已不再提问人范围 | 不涉及（7488bf9c 精简时删掉） |

例子：每周定时起的 dreaming 会话读到 weekly-dreaming 那句，会以为一条「GLOSSARY.md 里某术语改名」的行不用等人；脚本实际会把它拆进问人的小表。说法和行为对不上，读的人（和 agent）就不知道该信哪个。

没查到实际误判的记录：dreaming 运行不留统计，次数查不到。

出处：分拣评论（2026-11-17，对着 `5f26e2f`）列了三处；本次复核时其中 `AGENTS.md`、`wiki-conventions` 两处已修，另发现 dreaming SKILL.md 开头也漏两类。

### 根因

问人范围在 556068a1（「只问人两类」）时确实是两类，那时各处照抄了一份。之后脚本加了 GLOSSARY.md、候选、要删的暂缓设计，README 和 AGENTS.md 跟着改了，weekly-dreaming 和 dreaming 开头那句没跟上；`dreaming-autonomous-doc.test.mjs` 还用断言把旧原文钉住（第 80、81 行），改了文字测试会红，没人改。

修正：分拣评论认为落后的是 wiki-conventions、weekly-dreaming、AGENTS.md 三处；实测现在是 weekly-dreaming 和 dreaming SKILL.md 两处。

## 方案

改完后，任何人或 agent 读到 dreaming「问谁」的说法，都跟脚本拆出的小表一致；以后脚本再加一类，只有一处列举要跟着改。

```
周任务说明（weekly-dreaming） ──指向──▶ dreaming SKILL.md 开头的列举 ──以它为准──▶ proposal-table-check --split-ask
README / AGENTS.md（人看的总览，各列一份，跟 SKILL.md 同一份清单）
```

- **dreaming SKILL.md 开头**：列举补全成脚本的五类（`DESIGN.md`、文档里的冲突、`GLOSSARY.md`、要删的暂缓设计、所有 `候选` 行），跟 README、AGENTS.md 同序同词。
- **weekly-dreaming.md**：不再复述列举，改成「只有问人的那几类行（见 `idea-loop:dreaming` 开头）才摆在会话里等人批」。这是给 agent 的文档，改动对的是「单一来源」：周任务只是起 dreaming 的入口，范围由 dreaming 自己说。
- **测试**：两条断言跟着改，并加一条守住「dreaming 开头的列举 = 脚本的五类」，下次脚本加类而文字没跟，测试红。

同一说法的其他入口：

| 入口 | 处置 |
|---|---|
| `idea-loop/README.md` dreaming 一行 | 已一致，不改 |
| 根目录 `AGENTS.md` | 已一致，不改 |
| `wiki-conventions` | 已不提，不改 |
| `dreaming/references/proposal-table.md` | 只说「问人的行」，不列举，不改 |
| `docs/adr/0047-dreaming-triage-autonomous.md` | 排除：ADR 是当时决定的记录，被后来的改动取代由 dreaming 标注，不在这里改 |

## User Stories

1. 期望行为（对应问题 1）：weekly-dreaming 与 dreaming SKILL.md 关于问人范围的说法跟 `proposal-table-check --split-ask` 的判定一致；weekly-dreaming 不再自带一份列举。

## 实现决策

- **列举只在 dreaming SKILL.md 写一份给 agent 看，weekly-dreaming 指过去。** 依据：dreaming SKILL.md 自己的原话「问人的是哪几类行，只由脚本判，这里不另写一份」；分拣评论建议「让 wiki-conventions 与 weekly-dreaming 指向 dreaming 的一处说明，而不是再各复述一遍」。dreaming 开头那句是 skill 的概述，保留列举、但跟脚本对齐，并由测试钉住。
- **README、AGENTS.md 不改成指针。** 它们是给人看的总览，已一致；改它们不在本 issue 的问题里。
- **版本 patch**：只修说明前后不一致，不改行为（`REVIEW.md`「额外要求」patch 档原文「修说明里前后不一致的地方」）。
- **SKILL.md 主体仍 < 5000 字**：列举只多十几个字，提交前按 `AGENTS.md` 的量法量一次。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 文档 tripwire：`dreaming-autonomous-doc.test.mjs` 的断言先改成新说法（红），再改文字（绿） |
| API 契约 | TDD API 测试 | 不涉及 |
| DB | 真 DB 测试 | 不涉及 |
| LLM 输出质量 | eval | 不涉及（不改 prompt 的行为，只改说明） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：已有的 `idea-loop/scripts/dreaming-autonomous-doc.test.mjs`（读 SKILL.md 与 weekly-dreaming 的原文做断言）。它能抓到文字回退、列举漏类；抓不到 agent 实际怎么理解这句话。
- **增量功能测试**：
  - 前置：脚本 `isAskRow` 判的五类。步骤：读 dreaming SKILL.md 开头那句。期望：五类都在（`DESIGN.md`、文档里的冲突、`GLOSSARY.md`、要删的暂缓设计、`候选`）。覆盖：期望行为 1。
  - 步骤：读 weekly-dreaming.md。期望：没有「两类」，指向 `idea-loop:dreaming`。覆盖：期望行为 1。
- **照着谁写**：同文件里 `dreaming and the weekly setup text say what dreaming still asks` 那条测试。

## Out of scope

- 把 README、AGENTS.md 也改成指针（它们已一致）。
- 改脚本的问人判定本身。

## 关联

- ADR：[[0047-dreaming-triage-autonomous]]（「只问两类」的原决定，后来脚本扩了范围）。
- 相邻 issue：#340、#341（skill 主文件越写越长、缺结构检查）方向相关——同一规则多处复述；本 spec 只消掉这一处复述，不重叠，谁先谁后都行。
- 开着的 PR：#407（插件自带 MCP 被顶替时的规则），不碰这几份文件，无重叠。
