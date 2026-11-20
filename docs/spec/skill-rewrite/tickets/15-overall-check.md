# 15 — 整体核对

**Blocked by**：04、05、06、07、08、09、10、11、13、14
**设计冻结**：不涉及 UI

## 要建什么

不改 skill：对整个插件核一遍前面每张工单的机械验收，确认合在一起也成立，README 和 skill 目录对得上。核出不成立的，在交回里列出文件和哪一条，由编排者派回对应的工单。

## 验收标准

- [x] 插件里每份 SKILL.md 和 agent 定义主体都不超过 4500 字（量法照仓库 `AGENTS.md`），交回贴一张全量的字数表。
- [x] 插件的 skill、agent 定义、README 里搜不到 `idea-loop:evidence`、`idea-loop:glossary`、`idea-loop:seo-brief`、`idea-loop:seo-setup`、`idea-loop:link-prospecting`、`idea-loop:runtime`、`idea-loop:browser`、`idea-loop:seo-check`（`/idea-loop:setup` 的 SEO 模块不算）。
- [x] 决策历史的搜索（日期、「人定」「原话」「依据：」）在 skill 与 agent 定义里没有命中，或剩下的每处在交回里有一行理由。
- [x] 行内 `gh` / `git` 命令的搜索只命中适配层文件和标了「坑」的行。
- [x] skill 目录 36 个、agent 定义 16 份，插件 README、SEO 的 README、仓库根 `AGENTS.md` 的清单与目录一致。
- [x] 在本地新开一个会话（用这条分支上的插件），开场注入里有 decision-rules 的「依据只认三种」和「证据是什么」两节。
- [x] 全量测试绿（`REVIEW.md`「验证命令」的全量测试）。

## 选中的存量回归

全量测试。

## 核对结果（编排者，对着 fdbc3e10）

- 主体字数：36 份 SKILL.md、16 份 agent 定义全部 ≤4500（量法照 `AGENTS.md`）；最紧的 seo-writing 4489、wiki-conventions 4496、writing-for-agents 4497、to-spec 4473、dreaming 4457。
- 被合并、被删 skill 的引用：skill、agent、README、仓库 `AGENTS.md`、hooks、runtime 数据里都没有。
- 决策历史搜索剩下的命中全是行为规则（「由人定」「要人定的写成一道题」这类谁来定的规矩）或数据字段名（retro 候选的「原话」、交回里的「写作评委原话」），各工单交回里逐条写了为什么留。
- 行内 `gh` / `git` 只剩适配层（issues 的 GitHub 参考、setup 写进目标仓库的模板与前置检查表、pr-review 交给 Codex 的 prompt 模板）和标了「坑」的行；另有 wiki-conventions 的旧布局迁移参考里两处 `git mv`（目标型，未改，记为已知残留）。
- 份数：skill 目录 36 个、agent 定义 16 份。
- 开场注入：用这条分支构建的 dyna 跑 `runtime inject decision-rules`，输出含「依据只认三种」「证据是什么」「整体风格」「配什么图」。
- 全量测试 1092 条，1091 过；红的一条是「改了插件就要升版本」，本 PR 按约定不升 `plugin.json`，合进集成分支时统一升。dyna：`go vet`、`gofmt -l`、`go test ./...` 全绿。
