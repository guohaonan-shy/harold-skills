# 市场格局分支

回答：「这个 SEO 市场谁在赢，什么内容对他们起作用，空位在哪？」

人要跨几个竞品的市场级视图时用。深挖一个域名回到 `SKILL.md` 的单个竞品流程。「两种调用」「项目上下文」「无人值守的交回」照 `SKILL.md`；下面几节代替它的同名小节。

## 必需输入

- `projectId`
- 话题、种子关键词、市场 / 类目，或人的域名。无人值守时取 SEO.md「重点页面」的头词和「站点」节的域名。
- 可选：已知竞品。默认是 SEO.md「竞品」。
- 可选：地区 / 语言。

## 项目上下文的差异

- 已存的竞品是起始名单，业务和定位决定谁算竞品。
- 人在场收尾时：每个确认的竞品附一句它为什么要紧，经人同意写进 SEO.md 的「竞品」，再用 `addCompetitors` 写进项目上下文；你加进来、后来证明无关的条目，从 SEO.md 删掉并用 `removeCompetitors` 移除（人加的条目不动）。研究日志：`{ appendResearchLog: { summary: "Competitive landscape: <market/query set>. Verdict: <conclusion>" } }`。
- 无人值守时：不写回；发现的新竞品作为发现交回（见下文）。

## OpenSEO MCP 工具

- `research_keywords`：发现有代表性的市场查询。
- `get_keyword_metrics`：用搜索量、难度、意图和趋势验证已知的查询集合。
- `get_serp_results`：在目标查询上找反复排名的域名。
- `find_serp_competitors`：比较在给定关键词上竞争的域名；有关键词集合时，先用它再手工数 SERP。
- `get_domain_overview`：给候选领先者估算自然流量规模。
- `get_search_console_performance`：人自己的域名在对比里、Search Console 又已连接时，用一方的点击 / 展现 / CTR 锚定人的位置，不用第三方估算。
- `get_ranked_keywords`：领先者确切的排名关键词、网址、排名、意图和 SERP 结果类型。
- `get_backlinks_overview`：相关时比较外链 / 引用域名强度。
- `search_local_businesses`、`get_local_serp_results`、`get_google_business_questions`：本地 SEO 市场，距离、地图排名、商家类目、评价或 Google 问答影响谁在赢时用。

## 工作流

1. 定义市场查询集合：
   - 用给定的关键词，或调 `research_keywords` 组出 5–10 个有代表性的查询。
   - 混合意图：适用时包括信息类、商业类、对比类、工具 / 软件类。
   - 本地 SEO 时，加上街区 / 城市 / 服务区查询，确定重点位置或坐标。
2. 查询集合已知时，用 `get_keyword_metrics` 验证相对需求和难度，用 `find_serp_competitors` 成规模地找反复出现的域名。
3. 本地 SEO 时，在综合出赢家之前，对最高优先级的位置调 `search_local_businesses` 和 `get_local_serp_results`。`get_serp_results` 作为自然页面的补充，不作为唯一的本地证据。
4. 需要查看实时 SERP 构成、排名网址或 SERP 特性时，对代表性查询调 `get_serp_results`。每次至多 10 个查询。
5. 找出反复出现的域名，按类型分组：
   - 直接的产品竞品
   - 发布者 / 媒体
   - 市场 / 目录站
   - 社区 / 论坛
   - 文档 / 资源
6. 对最强的反复出现的域名调 `get_domain_overview`；先默认前 3–5 个，再扩展。
7. 对直接竞品和相关发布者调 `get_ranked_keywords`。
8. 外链权威度看起来要紧、或人问为什么某个域名在赢时，用 `get_backlinks_overview`。账户没开那项数据时外链可能拿不到；失败了就用 SERP / 域名证据继续。
9. 综合出模式：内容类型、主题、SERP 形式、本地包信号、权威度优势和没被满足的角度。

## 输出格式（人在场）

开头写市场判断：

- 市场领先者
- 最能赢的机会领域
- 排名的最大障碍

然后：

| Domain | Type | Why they matter | Organic footprint | Winning themes | Weakness/gap |
| ------ | ---- | --------------- | ----------------- | -------------- | ------------ |

再加：

- 用到的查询集合
- 起作用的内容形式
- 关键词 / 主题缺口
- 外链或权威度观察
- 建议的下一步流程：竞品分析（单个竞品）、关键词聚类（`keyword-clustering`）或内容 brief

## 无人值守的额外发现

照 `SKILL.md`「无人值守的交回」的形状，另外：

- 反复出现、却不在 SEO.md「竞品」里的直接产品竞品，合成一条：`direction: "keywords"`，`kind: "unlisted-serp-competitors"`，`targets` 列这些域名，`fix` 写「需要决定：要不要加进 SEO.md 的竞品」。
- 查询集合小时，在 `assumptions` 写明结论只是方向性的。

## 护栏

- 区分 SEO 竞品和业务竞品。
- OpenSEO 返回的是估算时，别夸大确切流量。
- 查询集合小时，把结果称作方向性的。
- 别假定一个发布者就是产品竞品；清楚标出域名类型。
- 本地市场里，区分自然页面的赢家和地图 / 本地包的赢家。
