---
name: keyword-research
description: 关键词研究：从种子话题发现机会词，评估指标和 SERP，排出优先级。要找关键词机会时用；把词分组映射到页面用 keyword-clustering。
---

# 关键词研究

## 目标

用 OpenSEO MCP 的数据，把种子话题变成一组排好优先级的关键词机会：一份短名单加一张更长的机会表，帮人决定瞄准什么、保存什么、下一步研究什么。

调用方提示的第一行是「无人值守，交回发现清单。」时交付的是发现清单，不是报告：先读 [references/unattended.md](references/unattended.md)，它改写下面的输入、项目上下文、工作流收尾，并定清单的格式。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 一个或多个种子：话题、产品、页面、竞品或受众的问题。无人值守时取 SEO.md「重点页面」的头词，加上 `business_overview` 里的核心话题（`business_overview` 为空或写着「无」就只取头词，见「项目上下文」第 3 步）。
- 可选的市场 / 地区 / 语言。

目标市场、地区、语言不清楚、又会实质影响关键词指标时：人在场就问人；无人值守按 SEO.md「站点」节的语言取，没有就用 MCP 默认值。其余情况用 MCP 工具的默认值。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 读项目目录的 `SEO.md`：`dyna seo parse <项目目录>/SEO.md` 读出各节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议人跑一次 `/idea-loop:setup`（SEO 模块），照常往下做。
2. 调 `get_project_context`，研究以它为根：业务、目标、市场，以及已经存下的竞品和重点页面。
3. 这个 skill 需要 `business_overview` 和 `current_goal`。哪项写着「无」（人明确说过不需要），就当作没有这项信息：不推断、不问、不写回，人在场、无人值守都一样；说明哪部分因此没做（`business_overview`：没法按业务筛种子词；`current_goal`：没法按目标给机会排优先级），人在场就写在报告里，其余照常做完。其余任一为空时：
   - 人在场：做最小的现场补齐：问人，或从站点推断再确认，补到够用为止，用 `update_project_context` 写回，再继续研究。收尾时建议人跑 `/idea-loop:setup`（SEO 模块）补其余。
   - 无人值守：缺了不推断，写法见 `references/unattended.md`。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明。
5. 收尾时（只限人在场）写回经得住时间的东西：磨得更准的 `business_overview` 或 `current_goal`；在 SERP 里反复出现的竞品、关键词该落到的页面，经人同意先加进 SEO.md 的「竞品」「重点页面」，再用 `addCompetitors`、`addKeyPages` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Keyword research: <seeds/market>. Verdict: <conclusion>" } }`。

完成条件：知道业务、目标和 SEO.md 的重点页面；缺的项已补齐，或已说明因此没做的部分。

## OpenSEO MCP 工具

- `research_keywords`：主要的发现工具。每次 1–5 个种子，除非人要穷尽式研究，优先取 150 条结果。
- `get_keyword_metrics`：一次给至多 700 个已知关键词补上搜索量、关键词难度（KD）、搜索意图、CPC 和月度趋势。用它给候选词或已知词打分，包括 Search Console 里差一点排上的查询。
- `get_ranked_keywords`：研究对象里有目标域名或页面时，拉它确切的排名关键词行。
- `get_search_console_performance`：Search Console 已连接时，从项目真实的一方需求起步：已经拿到展现的查询，和差一点排上（「striking distance」）的词。请求一个大的 `rowLimit`，在客户端筛平均排名 5–20（API 按点击排序，不能按排名过滤）。再用 `get_keyword_metrics` 给这些词补上难度和意图。
- `get_serp_results`：查看头部候选词的 SERP，尤其是意图有歧义时。
- `search_local_businesses`、`get_local_serp_results`、`get_google_business_questions`：本地 SEO 话题、业务位置或服务半径要紧时用。
- `list_saved_keywords`：避免重复已经存过的工作，或拿已有的标签当上下文。
- `save_keywords`：保存选中的词，只在人明确确认后调。

## 工作流

1. **起点**：把种子整理成一小组彼此不同的研究角度。项目连了 Search Console 就先拉 `get_search_console_performance`（大 `rowLimit`、默认回看期），在客户端筛到排名约 5–20，再用 `get_keyword_metrics` 补上 KD 和意图：这份排过名、补过指标的清单是最快的机会集，先做它，再做广泛发现。本地 SEO 时，弄清业务、位置 / 坐标或服务范围，以及本地类目，对最重要的位置 / 关键词组合用 `search_local_businesses` 和 `get_local_serp_results`，不只靠全国范围的关键词 / SERP 数据。
   完成条件：研究角度定下；有 Search Console 的，差一点排上的词带着 KD 和意图。
2. **发现与指标**：对探索性的种子调 `research_keywords`，能批量就批量。排优先级之前，用 `get_keyword_metrics` 给固定的关键词清单补上搜索量、KD 和意图。人给了域名 / 页面，想基于当前排名、差一点排上的词或竞品占着的词找机会时，用 `get_ranked_keywords`。
   完成条件：每个候选词都有搜索量、KD 和意图。
3. **筛选与排序**：去掉不相关、重复、只有品牌词、意图不对的词；按实际机会排优先级，不只看搜索量：
   - 和人的产品 / 页面 / 话题高度契合
   - 搜索意图清楚
   - 难度合理
   - 搜索量 / CPC 信号有用
   - SERP 上人有可能竞争得过
   - 本地 SEO 还看本地包 / 地图的可见度和距离是否契合

   对潜力高或有歧义、SERP 意图会改变建议的词用 `get_serp_results`；默认只查一小批。
   完成条件：每个入选词有一句排优先级的理由；有歧义的词看过 SERP。
4. **交付**：给出一份短名单和一张更长的机会表（见「输出格式」）。保存关键词前先问人；保存时建议简洁的标签，如 `topic:<topic>`、`intent:<intent>`、`page:<slug>`。
   完成条件：短名单和机会表在手；要保存的词有人的确认。

## 输出格式

开头放信号最强的建议：最好的机会主题、现在就该瞄准的词、该保存的词、风险或 SERP 上的注意事项。然后是一张紧凑的表：

| Keyword | Intent | Volume |  KD | CPC | Priority | Notes |
| ------- | ------ | -----: | --: | --: | -------- | ----- |

最后写下一步：要不要跑关键词聚类（`keyword-clustering`）、写内容 brief，或保存选定的词。

## 护栏

- 指标全部取自 OpenSEO 的返回；没返回的值写 `unknown`。
- 只在人明确确认后调 `save_keywords`。
- 业务契合、意图契合排在最大搜索量之前。
