---
type: spec
tags: [idea-loop, seo, seo-writing, faq]
summary: FAQ 条数超出项目规范时，seo-writing 先拿 Search Console 搜索词逐条评估能删哪些，删完仍超才交给人
related: ["[[idea-loop-seo]]", "[[seo-params-from-seo-md]]"]
issues: [150]
---

# seo-writing：FAQ 条数超出项目规范，先看搜索词再交给人

> #150 存在：`seo-writing` 第 4 步的 FAQ 规则没说条数超出项目规范时怎么办，超标直接成了「接受现状、另开 issue」的默认推荐，详情在「问题陈述」

## 问题陈述

### 1. FAQ 超出项目规范的条数时，没人先看数据就推荐「接受现状」

2026-11-10 对着 `main`（e8c14bf）读 `idea-loop/skills/seo/seo-writing/SKILL.md` 第 4 步「写」：FAQ 那一条只写「每条问题是用户真会搜、真会问 AI 的说法……两三条头部问题，其余是本文最能答好的长尾问题」，全文没有「条数」「Search Console」相关的规则（分拣评论 2026-11-10 grep 无命中，本次复核一致）。项目自己的文风文件可以规定条数（例：「分析类文章 3–5 条」），seo-writing 开头也说项目规则叠在通用规则上、冲突时以项目为准，但超了之后该怎么处理没有着落。

真实经过（issue 正文）：一个项目的口语分数博客在 PR 第 2 轮 review 时 FAQ 从 6 条变 7 条，超出项目规范的 3–5 条。审查者推荐「接受 7 条、开 issue 以后再收」。人要求先评估：「这个博客中哪些FAQ是不会带来流量和曝光的，我们先评估哪些内容是可以删的，如果都不能删，我们就先接受这个现状」。逐条对 Search Console 后，两条问答近 3 个月没有可见搜索词、内容又和别的问答重复，删掉后正好回到 5 条，不需要另开 issue。

证据：分拣评论 https://github.com/guohaonan-shy/harold-skills/issues/150#issuecomment-6758224475 （2026-11-10）。

### 根因

规则只管每条 FAQ 写得对不对，没管条数超标时的处置；交给人的题因此没先做功课，「接受现状」被当成默认选项摆了出来。

## 方案

写文章的 agent 发现 FAQ 条数超出项目规范时，交回之前先自己拿这一页近 3 个月的 Search Console 搜索词逐条对过每个问答，能删的删掉；删完仍超才写进交回的「需要人决定的事」，并附逐条对照，人看着数据决定接受还是另开 issue。

改动只有一处：`seo-writing` 第 4 步 FAQ 那一条后面加一句（文字见「实现决策」）。

同一行为的入口：

- `seo-writing` 第 4 步「写」的 FAQ 一条：**纳入**，规则写在这里。按 brief 写、局部润色、review 后回来改，都走第 4 步，一处覆盖。
- `seo-writing` 第 1 步「多语言镜像」要求镜像与源版本 FAQ 条数一致：**排除**，镜像跟源走，条数在源版本上处理。
- `pr-reviewer` / `idea-loop:pr-review`：**排除**。审查者照项目规范报出超标是对的；这次的缺口是写的一方没先评估。写的一方照新规则做了，到 review 时交回里已经带着逐条对照，审查者不必再自己出「接受现状」的默认推荐。
- `seo-check`：**排除**，它查构建产物的机械项，不查条数规范。

## User Stories

只修问题，不画树。

1. 期望行为（对应问题 1）：FAQ 条数超出项目规范时，seo-writing 交回里有逐条对照（问答 / 对得上的搜索词与展现 / 判断），没有可见搜索词、内容又和别的问答或正文重复的已经删掉；删完仍超的，才作为「需要人决定的事」交给人，并写明 Search Console 的两条限制。拉不到搜索词时写明原因，直接交给人。

## 实现决策

- **落点与文字**：在第 4 步 FAQ 那一条末尾加一句，基于 issue 给的新文，按下面三条调整后写成：「条数超出项目规范时，先用 OpenSEO 的 `get_search_console_performance` 拉这一页近 3 个月的搜索词，逐条对到每个问答；没有可见搜索词、内容又和别的问答或正文重复的，删掉；删完仍超，写进交回的『需要人决定的事』，附逐条对照（问答 / 对得上的搜索词与展现 / 判断），并写明两点限制：Search Console 隐藏低展现的长尾词，没有可见搜索词不等于零；问答被 AI 回答引用的价值它量不到。页面还没上线或拉不到数据，写明原因，直接交给人。」措辞允许实现时为通顺小改，意思不变。
- **交给人的说法用第 5 步已有的「需要人决定的事」**，不用 issue 里的「写成待定」。依据：seo-writing 第 5 步交回清单里已有这一项；「待定」是 spec 的标记，写文章时没有 spec 小节可写。
- **点名工具 `get_search_console_performance`**。依据：分拣评论建议；兄弟 skill seo-brief 第 1 步已用同一个工具拉 Search Console（按 `page` 维度过滤），项目 id 取 SEO.md「OpenSEO」节，seo-writing 第 1 步也已这样取 `get_serp_results` 的项目 id。
- **拉不到就直接交给人**（新页面没数据、项目没连 Search Console）。依据：分拣评论「拉不到就跳过这步，直接交给人，避免写不下去」。
- **只管 FAQ**，不扩到别的「条数」规范（H2 数、表格数）。依据：issue 正文的落点和真实经过都只有 FAQ；标题的「等」没有第二个实例。
- **内联在第 4 步，不另开 reference**。依据：只有一句；主体现在 3328 字，加上后远低于 5000。writing-for-agents 的「信息层级」说只有部分分支走到的放到指针后面，但一句话的分支单开一个文件，多一次跳转换不来清晰。
- plugin 版本不在这次升，照仓库现有做法由集成时的 chore 提交统一升。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及：只改规则文字 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：一句规则，照仓库 AGENTS.md §5 不做 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`seo-writing/SKILL.md` 第 4 步 FAQ 那一条的文字，加上仓库已有的 `idea-loop/scripts/no-project-leak.test.mjs`。抓得到：规则写进去了、没带进项目名；抓不到：写文章的 agent 下次会不会照做（要等下一次真实超标）。
- **增量功能测试**：
  - 前置：本分支。
  - 步骤：读改后的 FAQ 一条；跑 `node --test idea-loop/scripts/no-project-leak.test.mjs`。
  - 期望：FAQ 一条包含「超出项目规范」「近 3 个月」「`get_search_console_performance`」「需要人决定的事」「逐条对照」和两点限制；no-project-leak 测试通过。
  - 覆盖：期望行为 1。
- **照着谁写**：`docs/spec/link-sweep-skip-code/` 同为一条规则文字的修改。

## Out of scope

- FAQ 以外的条数规范：没有实例，有了再开 issue。
- 给 FAQ 条数写机械检查（进 seo-check）：项目规范的条数在项目文风文件里是自由文字，没有可读的取值。

## 关联

- 覆盖：#150
- 相关 spec：[[idea-loop-seo]]（seo 分类的来源）、[[seo-params-from-seo-md]]（项目信息从 SEO.md 读的约定，本条沿用它取 OpenSEO 项目 id）
- 相邻还没完成的 issue：#163（blog-publisher 拆成 seo-writing / cover / og，讨论项目维度的东西放哪）也碰 seo-writing，但改的是 skill 边界，不碰第 4 步的 FAQ 规则，无重叠、不分先后；#235、#238 改 seo-outreach，不相关。
