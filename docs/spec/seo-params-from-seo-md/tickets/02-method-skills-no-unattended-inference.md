# 02 — 四个 seo 方法 skill 无人值守时缺信息不再推断着用

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 seo 分类有四个方法 skill：keyword-research、seo-audit、link-prospecting、competitor-analysis。每周的 `/idea-loop:seo-scan` 起方向 agent，方向 agent 再无人值守地调它们。四个 skill 的「项目上下文」一节第 3 步，现在在无人值守、缺信息时会自己推断，写进 `assumptions` 后照样拿来用：

- keyword-research：缺 `business_overview`、`current_goal` 时从站点推断；
- seo-audit：缺 `business_overview` 时从站点推断；
- link-prospecting：缺 `positioning` 时从站点推断，缺竞品时用 `find_serp_competitors` 推断；
- competitor-analysis：调用方没点名竞品时用 `find_serp_competitors` 推断。

项目定下的约定是：推出来的值没经过人确认就不拿来用（seo-scan 开场会先把缺口补齐，见同一份 spec 的另一张工单）。所以这四处第 3 步的「无人值守」分支改成：**缺了不推断，在 `assumptions` 里写明缺什么、哪部分因此没做**，其余照常做完。「人在场」分支（推测 → 问人 → 写入）不改；competitor-analysis 被点名竞品时照常分析那一家，不受影响。

例子：link-prospecting 无人值守时竞品为空，就不挖竞品的外链档案，只从自家资产找候选，`assumptions` 写「SEO.md 竞品为空，未挖竞品外链」。keyword-research 无人值守时 `business_overview` 为空，`assumptions` 写缺了它、哪部分研究因此没做（比如没法按业务筛种子词），不从站点推一段业务描述来用。

## 验收标准

- [x] 四个 skill 第 3 步的「无人值守」分支都不再写「推断」，改成「缺了不推断，在 `assumptions` 里写明缺什么、哪部分因此没做」，每个 skill 写清自己那部分是哪部分。
- [x] 四个 skill 的「人在场」分支原样保留；competitor-analysis 被点名竞品的路径不变。
- [x] 这四个 skill 别处（例如「目标」「边界」或交回格式）跟无人值守推断有关的说法，跟新分支对得上，没有残留「推断后照用」的句子。
- [x] 用文档测试钉住四处无人值守分支「不推断」的关键句（照仓库里 `*-doc.test.mjs` 的写法）。
- [x] review 第 1 轮 S3（2026-10-31）：四个方法 skill 读到项目上下文里业务概述、当前目标或定位写着「无」时，当作没有这项信息（人明确说过不需要）：不推断、不问，在 `assumptions` 里写明哪部分因此没做；人在场时也不再把它当空缺去补问

## 选中的存量回归

- `no-project-leak.test.mjs`：改 skill 文档时防止写进具体项目。
- `skill-private-references.test.mjs`：防止 skill 之间引到别的 skill 私有的参考资料。
