# frontmatter 的补充

`design` 是需求的冻结记录（`design/tmp/<spec-slug>/canvas/<spec-slug>-design.md`），随 `tmp/` 清掉。`design-page` / `design-state` / `design-component` / `design-motion` / `design-journey` 是设计档案的五种对象，每份文件一个对象，住在 `design/prod/`（与 `tmp/<spec-slug>/delta/` 同构），都不带 `status`，结构字段见 `idea-loop:design-archive` 的「图的实体」。

**ADR 按小节取代**：一份 ADR 常含多条决策（引用写 `ADR-NNNN §n`），新决策通常只推翻其中一节。部分取代记在那一节标题后（`⚠️ 已被取代 → ADR-<new> §<n>`），文件仍是 `生效`；全部小节都作废时，frontmatter 才翻成 `已被取代（→ ADR-<new>）`。写新 ADR 前先搜 `docs/adr/` 有没有同话题的旧决策。
