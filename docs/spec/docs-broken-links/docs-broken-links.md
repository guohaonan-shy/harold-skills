---
type: spec
tags: [knowledge-base, docs-broken-links]
summary: 知识库 4 处双括号链接指向主分支上不存在的文件，改成纯文本或删掉 related 里的那一项
related: ["[[0042-link-sweep-skip-code]]"]
issues: [388]
---

# 知识库里 4 处链接指向不存在的文件

> #388 存在：在 Obsidian 里点这 4 处 `[[...]]` 会新建一个空页，而不是打开目标；issue 写的是 8 处，2026-11-21 对着 origin/main（94150ce5）重扫是 4 处，详情在「问题陈述」

## 问题陈述

### 4 处 `[[...]]` 的目标在主分支上不存在

`docs/` 是 Obsidian vault，`[[slug]]` 按文件名解析；`idea-loop:wiki-conventions` 要求「`[[...]]` 指到的 slug 都要有文件（行内代码和代码块里的不算）」。

测了什么：2026-11-21 对 origin/main 94150ce5，扫 `docs/` 下全部 `.md`，跳过代码块和行内代码，取每个 `[[...]]` 的名字去 `docs/` 下找同名文件。找不到的 4 处：

| 位置 | 链接 | 目标为什么不在 |
|---|---|---|
| `docs/raw/issue-workflow/2026-11-02-issue-intake-priority-grill.md` 第 7 行（frontmatter `related`） | `[[issue-intake-priority]]` | 那是 #217 的 spec，#243（c920996b）删掉了；#217 已关，没有对应的 ADR |
| `docs/raw/issue-workflow/2026-11-05-issue-triage-grill.md` 第 7 行（frontmatter `related`） | `[[2026-11-04-idea-loop-0-2-0-restructure-grill]]` | 这份 0.2.0 重构的讨论记录只在没合进主分支的 `impl/business-knowledge-base` 等分支上 |
| 同一文件第 10 行（正文） | 同上 | 同上 |
| `docs/records/retro-candidates/2026-11-16-eval-covers-models-and-languages.md` 第 23 行 | `[[FA-457]]` | 是另一个仓库的 Linear issue 号，不是 docs 里的文件 |

本该是：每个 `[[...]]` 都能打开一份文件；指不到文件的引用写成纯文本。

修正：issue 列的另外 4 处（`docs/spec/skills-read-home/` 里的 `[[docs-ride-code-pr]]`、`[[dreaming-triage-autonomous]]`）已经不在：那份 spec 已从主分支删掉，两个名字已成为 `docs/adr/0050-docs-ride-code-pr.md`、`docs/adr/0047-dreaming-triage-autonomous.md`。ADR 0042、0054 等里的 `[[<basename>]]` 在代码示例里，按 [[0042-link-sweep-skip-code]] 不算链接。

### 根因

- 前两处：目标文件被删（spec 了结时）或从没进主分支（讨论记录留在别的分支），引用它的 raw 没跟着改；raw 是永久的，这类引用不会自己消失。
- `FA-457`：写决定记录出处时把外部系统的号当成了 vault 链接。

## 方案

只改这 3 个文件，每处按目标的情况处理，原意不丢：

1. `issue-intake-priority`（frontmatter `related`）：删掉这一项，`related` 留空列表。spec 已删、没有接替它的 ADR，可挂的东西没有；`tags` 里的 `issue-intake-priority` 保留，召回照样能找到。
2. `2026-11-04-idea-loop-0-2-0-restructure-grill`：frontmatter `related` 里删掉这一项，另外两项不动；正文第 10 行改成行内代码 `` `2026-11-04-idea-loop-0-2-0-restructure-grill` ``，后面注一句「（未合进主分支）」，读者仍知道指的是哪场讨论、题号为什么不是一套。
3. `[[FA-457]]`：这是别的仓库的决定记录，照 retro 候选池的写法规则（「决定记录不在池所在的仓库时……写仓库加 `docs/raw/decisions/<文件名>.md`……不用双括号链接」）改成「fishaudio/fish-agent `docs/raw/decisions/FA-457.md`」，跟池里其余跨仓库的出处一致。（修正：起草时写的是纯文本「Linear FA-457」，review 第 1 轮按这条规则改。）

改完重扫，`docs/` 下 0 处死链。

## User Stories

只修问题，不加能力。

1. 期望行为（对应「4 处 `[[...]]` 的目标在主分支上不存在」）：作为在 Obsidian 里读知识库的人，`docs/` 里每个 `[[...]]` 都能打开一份存在的文件。

## 实现决策

- **找不到目标就不留链接，不去补文件**。依据：`idea-loop:wiki-conventions`「`[[...]]` 指到的 slug 都要有文件」；分拣评论（#388，2026-11 issue-triager）给的修法是「换成真实存在的目标，或改成纯文本」，三处都没有真实存在的替代目标（已核：`docs/adr` 下没有 #217 的 ADR；0.2.0 重构讨论不在主分支）。把 0.2.0 讨论记录从别的分支搬进主分支不在本 issue 内（那是 `impl/business-knowledge-base` 那条线自己的事）。
- **纯文本用行内代码写文件名**：行内代码里的 `[[...]]` 和名字都不算链接（同上原文），以后的扫描不会再报。
- 不碰插件，不升版本。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约 | TDD API 测试 | 不涉及 |
| DB schema、迁移 | 真 DB 测试 | 不涉及 |
| LLM 输出质量 | eval | 不涉及 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

只改 docs 文本，验证是一次扫描：

- **seam**：对 `docs/` 跑死链扫描（规则同 wiki-conventions：跳过代码块和行内代码，按文件名解析），输出就是死链清单。
- **增量功能测试**：前置 = 本分支；步骤 = 扫 `docs/`；期望 = 0 处；覆盖 = 期望行为 1。再跑 `REVIEW.md` 的全量测试，确认没碰坏别的。
- **照着谁写**：分拣时的扫描（#388 评论里的 `.tmp/triage/388/scan.mjs`）。

## Out of scope

- 加一条常驻测试或 CI 守死链：wiki-conventions 已要求每次删除后查死链，这次是没执行；要不要做成常驻检查，是另一个需求。
- 把 `2026-11-04-idea-loop-0-2-0-restructure-grill` 搬进主分支。

## 关联

- ADR：[[0042-link-sweep-skip-code]]（代码里的 `[[...]]` 不算链接）。
- 相邻 issue：查过 open 的 issue，没有别的在改这 3 个文件，无重叠。
