# ADR 按小节取代

写 ADR 的人（dreaming、adr-reconciler）读这一份。frontmatter 的字段和 `status` 闭集在 SKILL.md「frontmatter」。

**ADR 按小节取代**：一份 ADR 常含多条决策（引用写 `ADR-NNNN §n`），新决策通常只推翻其中一节。部分取代记在那一节标题后（`⚠️ 已被取代 → ADR-<new> §<n>`），文件仍是 `生效`；全部小节都作废时，frontmatter 才翻成 `已被取代（→ ADR-<new>）`。写新 ADR 前先搜 `docs/adr/` 有没有同话题的旧决策。
