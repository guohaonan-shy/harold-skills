---
name: keyword-clustering
description: 关键词聚类：按搜索意图把词分组，映射到已有或要新建的页面，查出蚕食。人在场时出映射表、经同意打标；被方向 agent 调用时交回发现清单。要把一批词落到页面上时用；找新词用 keyword-research。
---

# 关键词聚类

## 目标

把关键词分成页面级的簇，决定每个簇由哪个已有页面或新页面来瞄准。这是一个关键词映射流程，不只是按语义分组。

## 两种调用

- **人在场**（默认）：照下文原样，可以问、可以存、可以出报告。
- **无人值守**：调用方提示的第一行是「无人值守，交回发现清单。」，后面给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。这时：
  - 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`。
  - 不写入、不保存：不调 `save_keywords`（聚类标签不存）、`update_project_context`（研究日志也不追加），不改 SEO.md。
  - 不出报告：工作流第 7 步和「输出格式」不做，改做「无人值守的交回」一节。
  - 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 一份关键词清单、一个已存的关键词标签、一个种子话题或一个目标域名。无人值守时用调用方给的词；没给就用 SEO.md「站点」节的域名走 `get_ranked_keywords` / Search Console。
- 可选：要映射的已有网址 / 页面。默认是 SEO.md「重点页面」。

没给关键词时：已存的集合用 `list_saved_keywords`，从种子发现用 `research_keywords`，从目标域名起步用 `get_ranked_keywords`。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 先读目标仓库根目录的 `SEO.md`：`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md` 读出七节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议跑一次 `idea-loop:seo-setup`，照常往下做。
2. 调 `get_project_context`，映射以它为根：重点页面就是簇要映射到的已有页面，业务和目标决定哪些簇值得瞄准。
3. 这个 skill 需要重点页面。SEO.md 和项目上下文里都没有时：
   - 人在场：做最小的现场补齐：问人哪些页面要紧，或从站点、审计、Search Console 提一份短名单再确认，先写进 SEO.md 的「重点页面」，再用 `update_project_context`（`addKeyPages`）写回，然后继续聚类。不要一上来做完整访谈；收尾时建议跑 `idea-loop:seo-setup` 补其余。
   - 无人值守：从 Search Console 或排名数据里拿已有展现的页面当作已有页面，写进 `assumptions`，不写回。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明，不重买。
5. 收尾时（只限人在场）写回经得住时间的东西：新的或修正过的重点页面及每个页面现在瞄准的话题，经人同意先改 SEO.md 的「重点页面」（头词），再用 `update_project_context` 的 `addKeyPages` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Keyword clustering: <keyword set>. Verdict: <conclusion>" } }`。

## OpenSEO MCP 工具

- `list_saved_keywords`：取一组已存的关键词，可按标签过滤。
- `research_keywords`：人从一个话题起步时扩展种子。
- `get_ranked_keywords`：人从一个域名或页面起步时，收集确切的排名关键词和网址。
- `get_search_console_performance`：Search Console 已连接时，用 `dimensions: ["query","page"]` 拉真实查询，把词映射到已经拿到展现的页面，并找出蚕食（一个查询的点击分散到多个网址上）（品牌词查询不算，见工作流第 6 步）。
- `get_serp_results`：查 SERP 重合度和意图，验证几个词是否该放在同一页。
- `get_local_serp_results`：本地 SEO 的簇，地图 / 本地包意图会影响页面映射时用。
- `save_keywords`：人确认后，可选地给最终的簇打标签。

## 工作流

1. 收集候选关键词集合。
   - Search Console 已连接时用 `get_search_console_performance`（dimensions `["query","page"]`），从真实查询和已经为它们排名的页面起步。
   - 按域名 / 页面聚类时用 `get_ranked_keywords`。
   - 距离、本地包或 Google 商家结果决定一些词是否该放在地区页上时，用 `search_local_businesses` 和 `get_local_serp_results`。
2. 去掉重复的、不相关的，以及明显需要另一种产品或受众的词。
3. 围绕意图和页面类型建簇：
   - SERP 意图相同、排名页面相似的放在一起。
   - 意图、购买阶段或 SERP 形式不同的拆开。
   - 字面相近不保证是同一个簇。
4. 对要紧的边界词，用一小批 `get_serp_results` 查重合度。
5. 给每个簇指定去处：
   - 已有网址：给了且合适时
   - 新页面建议：没有合适的已有页面时
   - 不瞄准 / 以后再说：弱或偏离策略时
6. 找出蚕食风险：多个页面会瞄准同一个意图时。Search Console 已连接时用 `get_search_console_performance`（`dimensions: ["query","page"]`）从真实数据确认：同一个查询把展现分给了多个网址。
   **蚕食判定排除品牌查询**：SEO.md「品牌」节写了品牌词时，查询和每个品牌词都转小写、去掉空格和连字符后，查询包含任一品牌词的，不判蚕食（品牌词 `cookbook` 时，「cookbook」「Cook Book pricing」「best cook-book app」不判，「weeknight dinner ideas」照常判）。没写品牌词：不排除，蚕食照常判，不从域名推。只作用于蚕食判定：其他判定（如 `striking-distance`、`low-ctr`）照常包含品牌词查询。
7. 用 `save_keywords` 打簇标签之前先问人。

## 输出格式

先给一段简短的映射摘要：

- 簇的个数
- 要新建的页面
- 要更新的已有页面
- 蚕食或合并问题

然后：

| Cluster | Primary keyword | Secondary keywords | Intent | Target page | Priority | Notes |
| ------- | --------------- | ------------------ | ------ | ----------- | -------- | ----- |

每个簇附一份建议的页面 brief：

- 页面类型
- 搜索者的问题
- 必需的小节
- 内链机会
- 保存 / 打标建议

## 无人值守的交回

做完工作流第 1–6 步后，交回一个 JSON 数组，`direction` 都是 `keywords`：

```json
{ "direction": "keywords", "kind": "cannibalization-weeknight-dinner-ideas", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["weeknight dinner ideas", "https://cookbook.example/blog/weeknight-dinners", "https://cookbook.example/blog/quick-dinners"],
  "evidence": { "what": "get_search_console_performance，dimensions=[query,page]，…", "when": "YYYY-MM-DD", "values": "两个网址分到的展现和点击，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "建议的修法；没定的写「需要决定：合并到哪一页」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值"],
  "content": { "keyword": "weeknight dinner ideas", "pageType": "教程", "mode": "update" } }
```

- 每个值得做的簇一条：映射到已有页面的是 `content.mode: "update"`，要新建页面的是 `"new"`；蚕食各一条，`kind` 以 `cannibalization-` 开头。`pageType` 取 `对比与研究 | 数据研究 | 故事 | 教程` 之一。「不瞄准 / 以后再说」的簇不交回。
- `kind` 小写连字符、同一方向内唯一：簇写 `content-<主词，小写连字符>`，不同的簇才不会被合进同一个 issue，下次扫到同一簇也会落到同一个 issue。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "keywords", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`；同一簇的判断有 SERP 或 Search Console 证据，不只靠字面相似。

## 护栏

- 关键词集合很小时别过度聚类。可用的词少于 10 个，就出一张简单的映射。
- 别只靠字面相似。SERP 意图说了算。
- 没有人明确确认，不大范围替换标签。
- 缺已有网址数据时，把目标页面标成「建议新建」。
