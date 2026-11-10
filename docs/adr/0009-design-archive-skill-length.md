---
type: adr
status: 生效
tags: [design-archive, skill-length]
summary: design-archive 主体以图的实体为中心、<5000 字，写法/拍图/校验/查询/归档各走一份 references
related: ["[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0009 — design-archive 主体只讲图的实体，命令与写法外置成 references

> 由 spec `design-archive-skill-length` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

issue #125 说 `design-archive` 的 SKILL.md 主体约 2.1 万字，超过仓库「主体 < 5000 字」的规则。核对后修正：2.1 万是 C locale 下 `wc -m` 数出的字节数，按 UTF-8 字符数、去掉 frontmatter 是 11386，仍是上限的 2.3 倍。

根因是设计档案的几份 spec（`ui-state-archive`、`design-archive-sections`、`design-archive-unstable-sections` 等）每次都把新字段、新规则加进主体；只有分段一块挪进过 `references/sections.md`，而这份文件自己又长到 1.55 万字，一半是拍图脚本的内部实现。只读档案的调用方（dreaming 对账、design-steward）每次要带上它们用不到的 frontmatter 字段表，写对象的调用方要带上查询说明。

## 2 决策（how）

- **主体以图的实体为中心，读写共用一处**。起草时按「写对象 / 读档案 / 归档」三个分支拆，被人推翻：写档案和读档案面对的是同一组对象，拆开会让读档案的人看不懂查询返回的 `blocked`、「进不去」。主体改成：页面、状态、边、分段、组件、动效、用户路径各一节，同一概念的定义、关联、字段放在同一节；`blocked`、`usedBy` 这类散在多处的概念各只定义一次。
- **引导词「派生」**：档案只写源头，进入方式、`usedBy`、`prod/index.md`、截图都是派生物，由脚本或查询算，不手写。
- **命令行全部外置，渐进披露**：主体只留目录与命名、进入方式怎么从图上推导，和一张「按需读」表；写对象文件、拍截图、查询、校验、归档各走一份参考。查询以 MCP 工具 `design_*` 的 description 为单一事实来源，参考里只补退出码与返回字段。
- **`sections.md` 并进这次**（人原话「把 sections.md 的精简并进 #125」）：拆成两半，写分段的规范并进实体与写法，拍图单成一份按情形排步骤的参考，只收 agent 要处理的输出，脚本内部做了什么留给脚本源码与 `--help`。
- **规则不改**：字段名、规则编号、命令、选项、退出码一个不动；删掉的句子要么别处已有单一事实来源，要么按 `writing-for-agents`「剪枝」判为空操作。
- **节名就是契约**：别处按「skill 名 + 节名」指过来，节名变了，调用方同一个 PR 里改；由文档测试守。

## 3 结果（result）

- `idea-loop/skills/design/design-archive/SKILL.md` 主体 4785 字符（2026-11-10 量，PR #152 合并时 4591）。节为：图的实体、目录与命名、进入方式从图上推导、按需读。
- `references/` 下：`writing.md`（写对象文件）、`shooting.md`（拍档案截图）、`query.md`、`check.md`、`archive-script.md`；`sections.md` 已不存在。此外有 `review-archive.md`、`review-reconcile.md`，是之后 `design-reading-load` 把 ui-reviewer 的两种模式挪进来的。
- 文档测试 `idea-loop/scripts/design-archive-skill-doc.test.mjs` 守两件事：主体字符数 < 5000；别处写的「`idea-loop:design-archive` 的「X」」，X 必须是 SKILL.md 或其 `references/` 某份文件的标题。
- 「网页上点合并会绕过归档」的已知缺口，已挪进 `idea-loop:pr-review` 的合并参考 `references/merge.md`。
- 外部入口（implementer、ui-reviewer、dreaming 的 `references/initial-scan.md` 与 `archive-reconcile.md`、`wiki-conventions`、ui-measure）按新节名指过来。
- 量法（去 frontmatter 后按 UTF-8 数字符）沿用 dreaming、retro 两次先例；其余超标的 SKILL.md 另开 #137，量法的写明另开 #132，都不在本决策内。
