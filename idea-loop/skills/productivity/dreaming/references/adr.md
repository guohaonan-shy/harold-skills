# ADR 的状态与按小节取代

写 ADR 的人（dreaming、adr-reconciler）读这一份。ADR 的 frontmatter 照 `idea-loop:wiki-conventions` 的「frontmatter」写，另加一个 `status`，只有 ADR 带，两个值：

| `status` | 什么时候 |
|---|---|
| `生效` | 默认 |
| `已被取代（→ ADR-NNNN）` | 这份 ADR 的全部小节都作废时 |

**ADR 按小节取代**：一份 ADR 常含多条决策（引用写 `ADR-NNNN §n`），新决策通常只推翻其中一节。部分取代记在那一节标题后（`⚠️ 已被取代 → ADR-<new> §<n>`），文件仍是 `生效`；全部小节都作废时，frontmatter 才翻成 `已被取代（→ ADR-<new>）`。写新 ADR 前先搜 `docs/adr/` 有没有同话题的旧决策。
