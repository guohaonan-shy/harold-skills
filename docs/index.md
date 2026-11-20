# docs
> 这个仓库自己的知识库，按 `idea-loop` 的 wiki 契约维护（契约全文见 `idea-loop/skills/productivity/wiki-conventions/SKILL.md`）。
>
> **生命周期**：grill → raw（永久）；spec → design/tmp（碰 UI 时）→ 工单 → 合并（工单删、设计归档进 design/prod）→ issue 全关后 dreaming 把 spec 写成 ADR、删 spec。

| 层 | 收什么 | 当前 |
|---|---|---|
| [raw](raw/index.md) | 素材与事实，忠实不编辑 | 65 份，6 个桶 |
| [spec](spec/index.md) | 还没了结的规格，一份一个目录，做完即删 | 空 |
| [adr](adr/index.md) | spec 的归档总结，永久 | 57 份 |
| [records](records/index.md) | 运营台账，会话起头、之后由人持续更新 | 1 个：`retro-candidates/`（retro 的候选池） |

尚未用上的层：`domain/`（领域知识，目录已建、还没有文档）。

> 索引表体从各文件的 frontmatter 生成，不手工维护。引用某一层请写路径，**不要写指向 index 的 wikilink** —— 各层的 `index.md` 是 slug 唯一性的豁免项，靠这条纪律维持。
