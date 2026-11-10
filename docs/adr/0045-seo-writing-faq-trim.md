---
type: adr
status: 生效
tags: [seo, seo-writing, seo-writing-faq-trim]
summary: FAQ 条数超出项目规范时，seo-writing 先拿 Search Console 搜索词逐条评估，删完仍超才交给人
related: ["[[2026-10-22-grill-idea-loop-seo]]"]
---

# ADR-0045 — FAQ 超出项目规范的条数：先看搜索词再交给人

> 由 spec `seo-writing-faq-trim` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`seo-writing` 第 4 步对 FAQ 只规定每条写得对不对（用户真会搜、答案可单独摘走），没规定条数超出项目文风文件里的规范时怎么办。项目规范可以写条数（例：分析类文章 3–5 条），冲突时以项目为准，但超了之后没有着落。

真实经过：一篇博客在 PR 第 2 轮 review 时 FAQ 从 6 条变 7 条，超出 3–5 条。审查者推荐「接受 7 条、另开 issue」。人要求先评估哪些 FAQ 不会带来流量和曝光、能删，都不能删才接受。逐条对 Search Console 后，两条问答近 3 个月没有可见搜索词、内容又和别的问答重复，删掉正好回到 5 条，不用另开 issue。缺口在写的一方没先做功课，「接受现状」被当成默认选项摆了出来。

## 2 决策（how）

在 `seo-writing` 第 4 步 FAQ 那一条末尾加一句规则，不另开 reference：

- 条数超出项目规范时，用 OpenSEO 的 `get_search_console_performance` 拉这一页近 3 个月的搜索词，逐条对到每个问答；没有可见搜索词、内容又和别的问答或正文重复的，删掉。
- 删完仍超，写进交回的「需要人决定的事」（第 5 步已有这一项，不用「待定」，那是 spec 的标记），附逐条对照（问答 / 对得上的搜索词与展现 / 判断），并写明两点限制：Search Console 隐藏低展现长尾词，没有可见搜索词不等于零；问答被 AI 回答引用的价值它量不到。
- 页面还没上线或拉不到数据，写明原因，直接交给人。

取舍与边界：

- 第 4 步覆盖按 brief 写、局部润色、review 后回来改，一处够用。多语言镜像跟源版本走，条数在源版本上处理。
- 审查端（`pr-reviewer`）不改：写的一方照新规则做了，交回里已带逐条对照，审查者不必再出「接受现状」的默认推荐。`seo-check` 不查，项目规范里的条数是自由文字，没有可读取值。
- 只管 FAQ，不扩到 H2 数、表格数等别的条数规范：目前没有第二个实例。
- 一句规则内联，不为一个分支单开文件，多一次跳转换不来清晰。
- 项目 id 取法沿用 `SEO.md`「OpenSEO」节（兄弟 skill `seo-brief` 已这样拉 Search Console），承接 ADR-0044 的「skill 只读写着的」约定。

## 3 结果（result）

- `skills/seo/seo-writing/SKILL.md` 第 4 步 FAQ 一条已含上述规则，文字与设计一致；主体约 3.6 千字，在 5000 字限内。
- 守护：`scripts/no-project-leak.test.mjs` 保证规则里不带项目名；规则是否被下次真实超标照做，要等一次真实运行才知道，没建 eval（仓库 AGENTS.md §5）。
- 合并在 PR #273，issue #150 已 COMPLETED 关闭。
