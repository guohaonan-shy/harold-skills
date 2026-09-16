# docs
> 这个仓库自己的知识库，按 `idea-loop` 的 wiki 契约维护（契约全文见 `idea-loop/references/wiki-conventions.md`）。
>
> **文件在不在，就是状态**：spec 存在 = 在飞；spec 消失 + ADR 存在 = 已了结；ticket 存在 = 有人正在做这一刀。

| 层 | 收什么 | 当前 |
|---|---|---|
| [raw](raw/index.md) | 素材与事实，忠实不编辑 | 4 份（design-workflow 桶） |
| [spec](spec/index.md) | 在飞的规格，做完即删 | 空 |
| [adr](adr/index.md) | spec 的归档总结，永久 | 2 条，均生效 |

尚未建立的层（契约里有，本仓库还没用上）：`domain/`（领域知识）、`reference/`（常驻约定与手册）、`records/`（周期快照）、`testing/`。

> 索引表体从各文件的 frontmatter 生成，不手工维护。引用某一层请写路径，**不要写指向 index 的 wikilink** —— 各层的 `index.md` 是 slug 唯一性的豁免项，靠这条纪律维持。
