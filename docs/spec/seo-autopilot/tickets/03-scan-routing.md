# 03 — 扫描开出的 SEO issue 当场分流

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
现在 `seo-scan` 开出的 issue 是 backlog，要等每周 `issue-triage` 才被看（最长一周）；分拣员拿不准的一律建议 triage 等人。

这一刀之后：
- seo-scan 在「提 issue」之后新增「分流」一节：只处理本次 `seo-issues.mjs` 输出里 `created` 的号（`commented` 的已在某个状态里，不再分流）；对每个起一个 `idea-loop:issue-triager`（同时最多 5 个），照它交回的建议翻：canceled → `issues set canceled --comment=<结论>`；triage → `set triage`；todo、留在 backlog（判不了）→ `set todo`。优先级照分拣员的建议打。人手动跑 `/idea-loop:seo-scan <方向>` 时同样跑分流。
- issue-triager 的「建议去向」表加 SEO 分支：带 `type:seo/*` 的 issue，只有要新建或改组件、页面模板、样式时建议 triage；要 grill、要定方案的建议 todo（todo 会话照推荐定）；判不了的也建议 todo。canceled 仍只来自重复、命中「不做」清单、已实现、复现不出四种。每周 `issue-triage` 不用改：它照同一个分拣员的建议翻，漏到 backlog 的 SEO issue（如人手动开的）走同一条规则。
- seo-scan 交回模板多一行「分流：todo <n>，triage <n>，canceled <n>」；研究日志模板对应加一行，前两行格式不动（`seo-due.mjs` 依赖）。
- seo-scan 开头说「开出的 issue 就是 backlog，等人分拣」那类句子改成新出口。

## 验收标准
- [ ] seo-scan 有「分流」一节，写明只处理 `created`、同时最多 5 个、三种翻法；`*-doc.test.mjs` 钉住（先对改前原文看它红）
- [ ] issue-triager 的去向表有 SEO 分支，写明「只有 UI 设计建议 triage、判不了建议 todo」；`*-doc.test.mjs` 钉住
- [ ] 交回模板与研究日志模板各多一行分流计数，研究日志前两行格式不变（`seo-due.mjs` 的现有测试仍过）
- [ ] seo-scan 的 SKILL.md 主体仍 < 5000 字（量法见仓库根 AGENTS.md）；超了把细节挪进 seo-scan 自己的 references
- [ ] idea-loop 全量测试通过

## 选中的存量回归
- `triage-autonomous-doc.test.mjs`：钉着 issue-triage「照建议直接翻」「不替人拒需求」的句子，改分拣员去向表可能碰到
- `seo-scripts.test.mjs`：`seo-due.mjs` 读研究日志前两行，模板改动可能弄坏
