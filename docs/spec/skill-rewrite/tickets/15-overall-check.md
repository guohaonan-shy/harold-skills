# 15 — 整体核对

**Blocked by**：04、05、06、07、08、09、10、11、13、14
**设计冻结**：不涉及 UI

## 要建什么

不改 skill：对整个插件核一遍前面每张工单的机械验收，确认合在一起也成立，README 和 skill 目录对得上。核出不成立的，在交回里列出文件和哪一条，由编排者派回对应的工单。

## 验收标准

- [ ] 插件里每份 SKILL.md 和 agent 定义主体都不超过 4500 字（量法照仓库 `AGENTS.md`），交回贴一张全量的字数表。
- [ ] 插件的 skill、agent 定义、README 里搜不到 `idea-loop:evidence`、`idea-loop:glossary`、`idea-loop:seo-brief`、`idea-loop:seo-setup`、`idea-loop:link-prospecting`、`idea-loop:runtime`、`idea-loop:browser`、`idea-loop:seo-check`（`/idea-loop:setup` 的 SEO 模块不算）。
- [ ] 决策历史的搜索（日期、「人定」「原话」「依据：」）在 skill 与 agent 定义里没有命中，或剩下的每处在交回里有一行理由。
- [ ] 行内 `gh` / `git` 命令的搜索只命中适配层文件和标了「坑」的行。
- [ ] skill 目录 36 个、agent 定义 16 份，插件 README、SEO 的 README、仓库根 `AGENTS.md` 的清单与目录一致。
- [ ] 在本地新开一个会话（用这条分支上的插件），开场注入里有 decision-rules 的「依据只认三种」和「证据是什么」两节。
- [ ] 全量测试绿（`REVIEW.md`「验证命令」的全量测试）。

## 选中的存量回归

全量测试。
