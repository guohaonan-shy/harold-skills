---
type: adr
status: 生效
tags: [idea-loop, wiki-conventions, skill-length, wiki-conventions-slim]
summary: wiki-conventions 主体缩到 5000 字以下并重组成目录表加生命周期两部分，规则不改，节名当契约
related: ["[[302]]", "[[0009-design-archive-skill-length]]", "[[0033-skill-length-measure]]", "[[0050-docs-ride-code-pr]]"]
---

# ADR-0090 — wiki-conventions 主体缩到 5000 字以下，重组成「目录表加生命周期」

> 由 spec `wiki-conventions-slim` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:wiki-conventions` 是所有动目标仓库 `docs/` 或 worktree 下 `.tmp/` 的 skill 的共同入口，管目录、`frontmatter`、slug 与链接、生命周期、知识库改动怎么合进主分支。issue #302：2026-11-16 对 main 按仓库 `AGENTS.md` 的量法量，主体 7854 字，超上限 2854 字（上限与量法见 [[0033-skill-length-measure]]）。

两个问题：

- **每个调起它的 skill 都整份读，多数只用一两节。** 例子：`implement` 开工调它只为「中间产物」（2382 字），却连带读「目录」里设计档案两层生命周期的 950 字和 index.md 的 1033 字。成因是几份 spec 每次把新规则直接加进主体，只有「从平铺布局迁移」外置过；另有重复，如「`prod/` 只走归档脚本」两句在 design-archive 里又写了一遍。#298 的 review 把它报为 Standards C1，人定「这次不缩，单独提 issue」，就是 #302。
- **十个并列的节，拼不出「每个目录是什么、一份内容怎么走完一生」。** 人 2026-11-18 读完第一版缩短的结果后总结：这份约定其实只有两件事。要知道工单目录的全部约定，得读「目录」「frontmatter」「文件在不在，就是状态」「slug 与链接」四处。

## 2 决策（how）

- **按分支外置，不拆 skill。** 每个分支都要的内联，只有部分分支走到的放到指针后面（`writing-for-agents`「渐进披露」）；先例是 [[0009-design-archive-skill-length]]（design-archive 同样外置，没拆 skill）。
- **规则一条不改，节名就是契约。** 别处按「skill 名加节名」指过来，所以别处指的名字都得还是标题（任意级）；这条从「`##` 全保留」放宽成「标题存在」。仓库规则「别的 skill 不读另一个 skill 的 `references/`」由全量测试守着，所以调用方照旧指正文节名，由正文那一节末尾一行指进参考。
- **重组成两部分加中间产物**（人 2026-11-18 定，并进同一个 PR，0.2.0 只做迁移、不改结构和生命周期）：`## 目录` 一张表，每个目录一行说清收什么、谁写、`type`、什么时候消失；`## 生命周期` 一张线条图（grill → raw；spec → design/tmp → 工单 → 合并；issue 全关后 dreaming 写 ADR 删 spec）；`## 中间产物` 单列，因为 `.tmp/` 不是知识库。
- **再精简一轮**（同日人定）：删「文件在不在，就是状态」「人机分工」「spec 和工单怎么写」（起草 spec、切工单两个 skill 已各写一遍）；`frontmatter` 一句话讲清、字段模板去掉 `status`（只有 ADR 用，56 份「生效」、1 份「被取代」），ADR 的 `status` 与按小节取代挪进 dreaming 自己的参考；slug 一节只留规则；index.md 一节删掉，手写索引的格式挪进 dreaming 的参考。「知识库落地」保留（9 处指它，有文档测试守原文）。
- **机械可判的约定交给命令行**：slug 全局唯一、删除后查死链、各层 `index.md` 生成、ADR 命名，人定交给统一命令行 #339 包装，上线前正文各留一行规则。（#339 的实现合进了 0.2.0 发布线，不在 main 上。）
- **版本**：idea-loop 升 patch，行为不变、只是文档挪位置。

取舍（没做）：不改任何知识库规则本身，不处理其余超长 `SKILL.md`（归 #137），不跟 #333（知识库搬出代码仓库）抢先后，规则不改所以只可能有文本合并冲突。

## 3 结果（result）

- 主体 `idea-loop/skills/productivity/wiki-conventions/SKILL.md` 按量法 3455 字（2026-11-22 对 origin/main 量），二级标题恰是 目录、生命周期、中间产物；外置参考只剩 `references/tmp-layout.md`（`.tmp/` 每个子目录何时清理）与 `references/migrate-flat-layout.md`。
- 挪走的内容：`idea-loop/skills/productivity/dreaming/references/adr.md`（ADR 的 `status` 与按小节取代）、`dreaming/references/index-md.md`（手写 `raw/`、`adr/` 索引的格式）。
- 合并在 PR #372（wiki-conventions 主体缩到 5000 字以下）；issue #302 已关闭；决定记录 [[302]]。
- 守护：`idea-loop/scripts/wiki-conventions-skill-doc.test.mjs`（主体字数、被指名的节都存在、二级标题恰为那三个；两项检查与 design-archive 的文档测试共用 `skill-doc-check.mjs`），本次对账跑过，6 条全过。
