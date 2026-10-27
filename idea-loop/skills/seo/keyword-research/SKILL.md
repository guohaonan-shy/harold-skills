---
name: keyword-research
description: 关键词研究：从种子话题发现机会词，评估指标和 SERP，排出优先级。人在场时出机会清单、经同意保存打标；被方向 agent 调用时交回发现清单。要找关键词机会时用；把词分组映射到页面用 keyword-clustering。
---

# 关键词研究

## 目标

用 OpenSEO MCP 的数据，把种子话题变成一组排好优先级的关键词机会。产出要帮人决定瞄准什么、保存什么、下一步研究什么。

## 两种调用

- **人在场**（默认）：照下文原样，可以问、可以存、可以出报告。
- **无人值守**：调用方提示的第一行是「无人值守，交回发现清单。」，后面给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。这时：
  - 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`。
  - 不写入、不保存：不调 `save_keywords`、`update_project_context`（研究日志也不追加），不改 SEO.md。
  - 不出报告：工作流第 9–10 步不做，改做「无人值守的交回」一节。
  - 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 一个或多个种子：话题、产品、页面、竞品或受众的问题。无人值守时取 SEO.md「重点页面」的头词，加上 `business_overview` 里的核心话题。
- 可选的市场 / 地区 / 语言。

目标市场、地区、语言不清楚、又会实质影响关键词指标时：人在场就问人；无人值守按 SEO.md「站点」节的语言取，没有就用 MCP 默认值。其余情况用 MCP 工具的默认值。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 先读目标仓库根目录的 `SEO.md`：`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md` 读出七节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议跑一次 `idea-loop:seo-setup`，照常往下做。
2. 调 `get_project_context`，研究以它为根：业务、目标、市场，以及已经存下的竞品和重点页面。
3. 这个 skill 需要 `business_overview` 和 `current_goal`。任一为空时：
   - 人在场：做最小的现场补齐：问人，或从站点推断再确认，补到够用为止，用 `update_project_context` 写回，再继续研究。不要一上来做完整访谈；收尾时建议跑 `idea-loop:seo-setup` 补其余。
   - 无人值守：从站点推断，写进 `assumptions`，不写回。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明，不重买。
5. 收尾时（只限人在场）写回经得住时间的东西：磨得更准的 `business_overview` 或 `current_goal`；在 SERP 里反复出现的竞品、关键词该落到的页面，经人同意先加进 SEO.md 的「竞品」「重点页面」，再用 `addCompetitors`、`addKeyPages` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Keyword research: <seeds/market>. Verdict: <conclusion>" } }`。

## OpenSEO MCP 工具

- `research_keywords`：主要的发现工具。每次 1–5 个种子，除非人要穷尽式研究，优先取 150 条结果。
- `get_keyword_metrics`：一次给至多 700 个已知关键词补上搜索量、关键词难度（KD）、搜索意图、CPC 和月度趋势。用它给候选词或已知词打分，包括第 1 步 Search Console 里差一点排上的查询。
- `get_ranked_keywords`：研究对象里有目标域名或页面时，拉它确切的排名关键词行。
- `get_search_console_performance`：Search Console 已连接时，从项目真实的一方需求起步：已经拿到展现的查询，和差一点排上（「striking distance」）的词。请求一个大的 `rowLimit`，在客户端筛平均排名 5–20（API 按点击排序，不能按排名过滤）。再用 `get_keyword_metrics` 给这些词补上难度和意图。
- `get_serp_results`：查看头部候选词的 SERP，尤其是意图有歧义时。
- `search_local_businesses`、`get_local_serp_results`、`get_google_business_questions`：本地 SEO 话题、业务位置或服务半径要紧时用。
- `list_saved_keywords`：避免重复已经存过的工作，或拿已有的标签当上下文。
- `save_keywords`：只在人明确确认后保存选中的词。

## 工作流

1. 把种子整理成一小组彼此不同的研究角度。项目连了 Search Console 就先拉 `get_search_console_performance`（大 `rowLimit`、默认回看期），在客户端筛到排名约 5–20，再用 `get_keyword_metrics` 补上 KD 和意图。这份排过名、补过指标的清单是最快的机会集，先做它，再做广泛发现。
2. 要做的是本地 SEO 时，弄清业务、位置 / 坐标或服务范围，以及本地类目。对最重要的位置 / 关键词组合用 `search_local_businesses` 和 `get_local_serp_results`，不只靠全国范围的关键词 / SERP 数据。
3. 对探索性的种子调 `research_keywords`。能批量就批量。
4. 排优先级之前，用 `get_keyword_metrics` 给固定的关键词清单（或第 1 步差一点排上的查询）补上搜索量、KD 和意图。
5. 人给了域名 / 页面，想基于当前排名、差一点排上的词或竞品占着的词找机会时，用 `get_ranked_keywords`。
6. 去掉不相关、重复、只有品牌词、意图不对的词。
7. 按实际机会排优先级，不只看搜索量：
   - 和人的产品 / 页面 / 话题高度契合
   - 搜索意图清楚
   - 难度合理
   - 搜索量 / CPC 信号有用
   - SERP 上人有可能竞争得过
   - 本地 SEO 还看本地包 / 地图的可见度和距离是否契合
8. 对潜力高或有歧义、SERP 意图会改变建议的词用 `get_serp_results`；默认只查一小批。
9. 给出一份短名单和一张更长的机会表。
10. 保存关键词前先问人。保存时建议简洁的标签，如 `topic:<topic>`、`intent:<intent>`、`page:<slug>`。

## 输出格式

开头放信号最强的建议：

- 最好的机会主题
- 现在就该瞄准的词
- 该保存的词
- 风险或 SERP 上的注意事项

然后是一张紧凑的表：

| Keyword | Intent | Volume |  KD | CPC | Priority | Notes |
| ------- | ------ | -----: | --: | --: | -------- | ----- |

最后写下一步：要不要跑关键词聚类（`keyword-clustering`）、写内容 brief，或保存选定的词。

## 无人值守的交回

做完工作流第 1–8 步后，交回一个 JSON 数组。每个值得做的机会一条发现，`direction` 都是 `keywords`：

```json
{ "direction": "keywords", "kind": "content-weeknight-dinner-ideas", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["weeknight dinner ideas", "easy weeknight dinners"],
  "evidence": { "what": "research_keywords，seeds=[…]，location=…", "when": "YYYY-MM-DD", "values": "搜索量 / KD / 意图，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "建议的修法；没定的写「需要决定：…」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值"],
  "content": { "keyword": "weeknight dinner ideas", "pageType": "教程", "mode": "new" } }
```

- 要新写或改写正文的机会带 `content`：已有页面差一点排上的是 `update`（`targets` 里写那个网址），没有合适页面的是 `new`。`pageType` 取 `对比与研究 | 数据研究 | 故事 | 教程` 之一。
- `kind` 小写连字符、同一方向内唯一；内容类每个目标页一条，`kind` 写 `content-<目标词，小写连字符>`（如上例），不同的页才不会被合进同一个 issue。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "keywords", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`，指标全部来自 OpenSEO 的返回。

## 护栏

- 不编指标。OpenSEO 没返回的值写 `unknown`。
- 没有人明确确认，不调 `save_keywords`。
- 业务契合、意图契合优先于追最大搜索量的词。
