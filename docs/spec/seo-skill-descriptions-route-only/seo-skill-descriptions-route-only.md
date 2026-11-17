---
type: spec
tags: [idea-loop, seo, seo-skill-descriptions-route-only]
summary: seo 分类 6 个 skill 的 description 删掉流程与产物，只留「是什么 + 触发词」
related: ["[[seo-autopilot]]"]
issues: [234]
---

# seo 分类 6 个 skill 的 description 只做路由

> #234 存在：`seo-outreach` 等 6 个 skill 的 description 写着产物去向和两种调用各交什么，违反「description 只做路由」，详情在「问题陈述」；标题里的 `issue-verify` 已在 #243 删掉，这半条不存在（2026-11-12 分拣时对着 main a7c8129 核过，本次对着 main 5f26e2f 再核一次，仓库里没有这个 skill）

## 问题陈述

### description 写了流程和产物，每一轮都白占上下文

模型可调用的 skill，description 常驻在每一轮的上下文里，规则只让它写「是什么 + 每个分支的触发词 + 必要时一句『X 用 Y』」，流程和产物格式不写（`AGENTS.md`「SKILL.md 编写约定」第 1 条，`writing-for-agents` 的 `SKILL-MECHANICS.md`「调用方式」）。2026-11-16 对着 main 5f26e2f 读 `idea-loop/skills/seo/` 下各 skill 的第 3 行，有 6 个违反：

| skill | 违规的那段（原文） | 属于 |
|---|---|---|
| seo-outreach | 「起草邮件**放进草稿箱**」「**填**目录提交**表单**」 | 产物去向、做法 |
| link-prospecting | 「人在场时出拓展表和外联草稿；被方向 agent 调用时交回发现清单」 | 两种调用各交什么 |
| competitor-analysis | 「人在场时出分析和行动计划；被方向 agent 调用时交回发现清单」，且**没有触发词** | 同上 |
| keyword-research | 「人在场时出机会清单、经同意保存打标；被方向 agent 调用时交回发现清单」 | 同上 |
| keyword-clustering | 「人在场时出映射表、经同意打标；被方向 agent 调用时交回发现清单」 | 同上 |
| seo-audit | 「人在场时出一页大白话报告，围绕一件这周就能做的事；被方向 agent 调用时交回发现清单」 | 同上 |

这些信息在各自正文的「目标」「两种调用」两节都已经写了，删掉 description 里的这半句不丢信息。

修正：分拣时认为 seo-outreach 违规的是「每个目标站点一份草稿，经只改 docs/ 的 PR 合并，邮件由人发送」；#291（seo-autopilot）之后这句已换掉，现在违规的是上表那两处。

### 根因

5 个方法 skill 的「两种调用各交什么」是新增 seo 分类时（提交 df60674，2026-10-22，idea-loop 0.1.2）一起写进 description 的，当时没对 description 的规则；seo-outreach 的那两处是 #291 加四个分支时（提交 42158c4，2026-11-16）把各分支的做法写进了 description。

## 方案

只改 6 个 `SKILL.md` 的 frontmatter `description`，正文不动。谁调它们不变：方向 agent（backlink-analyst、keyword-miner、page-optimizer、technical-auditor）和 seo-scan 按名字调，人在对话里说触发词由 description 路由。杠杆：description 的常驻上下文负担（`writing-for-agents`「调用方式」），只留路由需要的。

改前 → 改后：

| skill | 改后的 description |
|---|---|
| seo-outreach | 外链外联：给目标站点写外联邮件、发信、跟进回信、提交到目录站点。外链类 issue 进了实现阶段、人给一批站点要写外联、说「发外联邮件」或「提交」、或扫描结尾有已发送的外联时用；找候选站点用兄弟 skill link-prospecting。 |
| link-prospecting | 外链拓展：从 SERP 和竞品外链里找可能引用我们的页面和站点，查公开联系途径。要给一个页面找外链机会时用；写外联邮件、跟进用 seo-outreach。 |
| competitor-analysis | 竞品分析：一个竞品的自然流量、排名词、内容主题、外链和缺口，或几个竞品构成的市场格局（谁在赢、哪里有空位）。要分析一个竞品、或看整个市场格局时用；体检自己的站点用 seo-audit。 |
| keyword-research | 关键词研究：从种子话题发现机会词，评估指标和 SERP，排出优先级。要找关键词机会时用；把词分组映射到页面用 keyword-clustering。 |
| keyword-clustering | 关键词聚类：按搜索意图把词分组，映射到已有或要新建的页面，查出蚕食。要把一批词落到页面上时用；找新词用 keyword-research。 |
| seo-audit | 站点 SEO 审计：抓取站点、对着线上页面核实问题。要审计、体检一个站点时用；分析竞品用 competitor-analysis。 |

seo-outreach 的触发词保留现在全部四个分支（起草、发送、跟进、目录提交）；competitor-analysis 补上缺的触发词，两个分支（单个竞品、市场格局）各一个。

## User Stories

只修问题、不加能力：

1. 期望行为：这 6 个 skill 的 description 只写它是什么和触发词，不写产物、产物去向、两种调用各交什么；每个都有「…时用」的触发词。

## 实现决策

- 只改 description，不改正文、不改调用方式（6 个都保持模型可调用：方向 agent 和 seo-scan 要按名字调它们）。依据：规则只管 description；正文的「两种调用」节已经写着同样的信息。
- 改后文字用上面「方案」表里的，`seo-outreach` 的 `#235`（同改这个 skill 正文里读 `seo-md.md` 的那句）不碰 description，两边不冲突。
- 只改 description、不改行为，按 `REVIEW.md`「额外要求」升 idea-loop 的 patch 版本。
- `idea-loop/skills/seo/README.md` 描述的是行为不是 description 原文，不用改。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了 6 个 description；照仓库惯例用 `*-doc.test.mjs` 钉住（不做 baseline eval，AGENTS.md §5） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：6 个 `SKILL.md` 的 frontmatter `description` 行。能抓到：产物、调用方式的描述又写回 description，触发词被删掉；漏掉：新写法换了别的词描述产物。
- **增量功能测试**：新增一个 doc 测试，对 6 个 skill 断言 description 不含「人在场时」「发现清单」「草稿箱」「表单」「报告」「打标」，且含「时用」；先在改前的文字上看到它红。覆盖：期望行为 1。
- **照着谁写**：`idea-loop/scripts/seo-method-skills-no-inference-doc.test.mjs`（读 seo 下各 SKILL.md）、`dreaming-autonomous-doc.test.mjs`（断言 description 不含某句）。

## Out of scope

- seo 分类里其他 skill 的 description（seo-scan 的「每 3 天出一份效果报告」、seo-setup 列的几步等）：issue 没点名、人批的范围只到这 6 个；要收另开 issue。
- 正文的「两种调用」节不动。

## 关联

- 相关 spec：[[seo-autopilot]]（#291，给 seo-outreach 加了四个分支、写出了现在的 description）。
- 相邻 issue：#235（seo-outreach 读 seo-setup 的私有参考，in-progress，另一个会话在做）：同改 seo-outreach，但只改正文，没有重叠，谁先合都行。
