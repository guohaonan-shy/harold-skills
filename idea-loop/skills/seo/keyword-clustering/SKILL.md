---
name: keyword-clustering
description: 关键词聚类：按搜索意图把词分组，映射到已有或要新建的页面，查出蚕食。要把一批词落到页面上时用；找新词用 keyword-research。
---

# 关键词聚类

## 目标

把关键词分成页面级的簇，决定每个簇由哪个已有页面或新页面来瞄准。这是一个关键词映射流程，不只是按语义分组；交付一张簇到页面的映射表，带蚕食风险。

调用方提示的第一行是「无人值守，交回发现清单。」时交付的是发现清单，不是报告：先读 [references/unattended.md](references/unattended.md)，它改写下面的输入、项目上下文、工作流收尾，并定清单的格式。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 一份关键词清单、一个已存的关键词标签、一个种子话题或一个目标域名。无人值守时用调用方给的词；没给就用 SEO.md「站点」节的域名走 `get_ranked_keywords` / Search Console。
- 可选：要映射的已有网址 / 页面。默认是 SEO.md「重点页面」。

没给关键词时：已存的集合用 `list_saved_keywords`，从种子发现用 `research_keywords`，从目标域名起步用 `get_ranked_keywords`。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 读项目目录的 `SEO.md`：`dyna seo parse <项目目录>/SEO.md` 读出各节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议人跑一次 `/idea-loop:setup`（SEO 模块），照常往下做。
2. 调 `get_project_context`，映射以它为根：重点页面就是簇要映射到的已有页面，业务和目标决定哪些簇值得瞄准。
3. 这个 skill 需要重点页面。SEO.md 和项目上下文里都没有时：
   - 人在场：做最小的现场补齐：问人哪些页面要紧，或从站点、审计、Search Console 提一份短名单再确认，先写进 SEO.md 的「重点页面」，再用 `update_project_context`（`addKeyPages`）写回，然后继续聚类。收尾时建议人跑 `/idea-loop:setup`（SEO 模块）补其余。
   - 无人值守：写法见 `references/unattended.md`。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明。
5. 收尾时（只限人在场）写回经得住时间的东西：新的或修正过的重点页面及每个页面现在瞄准的话题，经人同意先改 SEO.md 的「重点页面」（头词），再用 `update_project_context` 的 `addKeyPages` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Keyword clustering: <keyword set>. Verdict: <conclusion>" } }`。

完成条件：知道簇要映射到哪些已有页面；缺的页面已补齐，或已写进 `assumptions`。

## OpenSEO MCP 工具

- `list_saved_keywords`：取一组已存的关键词，可按标签过滤。
- `research_keywords`：人从一个话题起步时扩展种子。
- `get_ranked_keywords`：人从一个域名或页面起步时，收集确切的排名关键词和网址。
- `get_search_console_performance`：Search Console 已连接时，用 `dimensions: ["query","page"]` 拉真实查询，把词映射到已经拿到展现的页面，并找出蚕食（一个查询的点击分散到多个网址上；品牌词查询不算，见工作流第 3 步）。
- `get_serp_results`：查 SERP 重合度和意图，验证几个词是否该放在同一页。
- `get_local_serp_results`：本地 SEO 的簇，地图 / 本地包意图会影响页面映射时用。
- `save_keywords`：人确认后，可选地给最终的簇打标签。

## 工作流

1. **收集**：
   - Search Console 已连接时用 `get_search_console_performance`（dimensions `["query","page"]`），从真实查询和已经为它们排名的页面起步。
   - 按域名 / 页面聚类时用 `get_ranked_keywords`。
   - 距离、本地包或 Google 商家结果决定一些词是否该放在地区页上时，用 `search_local_businesses` 和 `get_local_serp_results`。
   - 去掉重复的、不相关的，以及明显需要另一种产品或受众的词。
   完成条件：候选词清单定下，每个词有来源。
2. **建簇、指定去处**：
   - 围绕意图和页面类型建簇：SERP 意图相同、排名页面相似的放在一起；意图、购买阶段或 SERP 形式不同的拆开；字面相近只是线索，不保证同簇。
   - 对要紧的边界词，用一小批 `get_serp_results` 查重合度。
   - 给每个簇指定去处：已有网址（给了且合适时）；新页面建议（没有合适的已有页面时）；不瞄准 / 以后再说（弱或偏离策略时）。
   完成条件：每个簇有去处；边界词有 SERP 重合度的证据。
3. **蚕食**：找出多个页面会瞄准同一个意图的风险。Search Console 已连接时用 `get_search_console_performance`（`dimensions: ["query","page"]`）从真实数据确认：同一个查询把展现分给了多个网址。
   **蚕食判定排除品牌查询**：SEO.md「品牌」节写了品牌词时，查询和每个品牌词都转小写、去掉空格和连字符后，查询包含任一品牌词的，不判蚕食（品牌词 `cookbook` 时，「cookbook」「Cook Book pricing」「best cook-book app」不判，「weeknight dinner ideas」照常判）。没写品牌词，或写的是 `无`（人确认过没有）：不排除，蚕食照常判，不从域名推。只作用于蚕食判定：其他判定（如 `striking-distance`、`low-ctr`）照常包含品牌词查询。
   完成条件：每个蚕食风险有数据证据或写明「只是风险，没有 Search Console 数据」。
4. **交付**：按「输出格式」写映射摘要和表。用 `save_keywords` 打簇标签之前先问人。
   完成条件：映射表在手；打标签有人的确认。

## 输出格式

先给一段简短的映射摘要：簇的个数、要新建的页面、要更新的已有页面、蚕食或合并问题。然后：

| Cluster | Primary keyword | Secondary keywords | Intent | Target page | Priority | Notes |
| ------- | --------------- | ------------------ | ------ | ----------- | -------- | ----- |

每个簇附一份建议的页面 brief：页面类型、搜索者的问题、必需的小节、内链机会、保存 / 打标建议。

## 护栏

- 关键词集合很小时不过度聚类：可用的词少于 10 个，就出一张简单的映射。
- SERP 意图说了算，字面相似只作线索。
- 只在人明确确认后大范围替换标签。
- 缺已有网址数据时，把目标页面标成「建议新建」。
