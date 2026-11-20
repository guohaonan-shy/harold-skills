# 18 — 「人的原话」字段名统一回「原话」，results-analyst 输入段收成指针

**Blocked by**：无——可立即开工（01–16 已落地）
**设计冻结**：不涉及 UI

## 要建什么

> 人的决定（2026-11-20）：D3 选 A——改回「原话」，全插件统一一个叫法；决策历史搜索命中的「原话」当字段名放行。

10、11 号把 uiux-refine、uiux-research、uiux-imagine、designer、ui-reviewer、design-change-sync、uiux-researcher、uiux-imaginer 及它们的参考文件里当字段名用的「原话」改成了「原文」（ledger 的「人的原话」列、调研页的研究问题块、批示原话等）。这张把这些改回「原话」，让人在设计收敛报告、调研页、UI 审查发现、retro 候选里看到的是同一个词。只改回 10、11 号由「原话」改来的那些；原本就叫「原文」、指别的东西的（例如引用外部文本）不动。

顺带：16 号收 SEO 方向 agent 的输入段时，results-analyst 开头也有同样的「提示里有六行」，跟 seo-scan 的提示模板重复。照 16 号对另五个 agent 的做法收成指针，项目目录那句逐字保留。

## 验收标准

- [ ] 10、11 号提交里「原话 → 原文」的每一处都改回，交回里列出文件和处数；改动前后对一遍，没有误改原本就叫「原文」的。
- [ ] results-analyst 的输入段改成指向 seo-scan 的「提示模板」，项目目录那句保留；钉着它的文档测试同步改。
- [ ] 每份改到的 SKILL.md、agent 定义主体不超过 4500 字，交回里贴改前、改后字数。
- [ ] 改到的文件对应的文档测试同步改；全量测试除 plugin-version（预期红）外全绿。
- [ ] 不改任何流程的行为：只改字段名和位置。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `refine-round-flow-doc`、`research-light-doc`、`research-baseline`、`ui-reviewer-archive-doc`、`design-change-final-version-doc`、`project-directory-wording-doc`、`seo-results-report-doc`、`dedupe-rules-doc` 测试。
