---
name: competitor-analysis
description: 竞品分析：一个竞品的自然流量、排名词、内容主题、外链和缺口，或几个竞品构成的市场格局（谁在赢、哪里有空位）。要分析一个竞品、或看整个市场格局时用；体检自己的站点用 seo-audit。
---

# 竞品分析

## 目标

把一个竞品分析到足以决定：向它学什么、避开什么、怎么和它错位、在哪儿超过它。交付一份带证据的分析和一份可执行的计划。

- 要整个市场格局（「这个 SEO 市场谁在赢、什么内容在起作用、空位在哪」，跨几个竞品的市场级视图）：读 [references/landscape.md](references/landscape.md)，它的必需输入、工具、工作流、输出格式和护栏代替下文同名的几节；「项目上下文」共用。市场格局之后要深挖其中一家，回到下文。
- 调用方提示的第一行是「无人值守，交回发现清单。」：读 [references/unattended.md](references/unattended.md)，它定无人值守时和人在场的差别、缺项目信息怎么办、发现清单的格式；市场格局分支也走它。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 竞品域名。无人值守时用调用方点名的；没点名就按 SEO.md「竞品」列出的顺序，在额度内一家一家做。
- 要对比时，人的域名：SEO.md「站点」节的域名。
- 可选：话题 / 类目 / 地区 / 语言。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 读项目目录的 `SEO.md`：`dyna seo parse <项目目录>/SEO.md` 读出各节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议人跑一次 `/idea-loop:setup`（SEO 模块），照常往下做。
2. 调 `get_project_context`，分析以它为根：已存的竞品说明这个域名是否早已知道、以前对它下过什么结论。
3. 这个 skill 需要竞品。竞品写着「无」（人明确说过不需要；SEO.md「竞品」节是一行 `- 无`，命令读出 `competitors` 为空、`confirmed.competitors` 为 true）时，当作没有竞品可用：不推断、不问、不写回，人在场、无人值守都一样；调用方或人点名了一家，照常分析那一家，没点名就说明竞品写着无、竞品分析因此没做，人在场就写在报告里。其余 SEO.md 和项目上下文里都没有时：
   - 人在场：做最小的现场补齐：存下正在分析的这家，问人（或从 `find_serp_competitors` 推断再确认）还有没有别家；先写进 SEO.md 的「竞品」，再用 `update_project_context`（`addCompetitors`）写回，然后继续分析。收尾时建议人跑 `/idea-loop:setup`（SEO 模块）补其余。
   - 无人值守：只分析调用方点名的那家；缺了竞品不推断，写法见 `references/unattended.md`。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明。
5. 收尾时（只限人在场）写回经得住时间的东西：这家竞品的一句强项和软肋，经人同意先写进 SEO.md 的「竞品」，再用 `update_project_context` 的 `addCompetitors` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Competitor analysis: <domain>. Verdict: <conclusion>" } }`。

完成条件：知道有哪些竞品可分析；缺的项已补齐，或已说明因此没做的部分。

## OpenSEO MCP 工具

- `get_domain_overview`：自然流量和关键词数的基线。
- `get_search_console_performance`：和人自己的域名对比、Search Console 又已连接时，拿它当一方基线（真实的点击 / 展现 / CTR / 排名），不用第三方数据估算人自己的表现。
- `get_ranked_keywords`：竞品域名或页面确切的关键词、网址、排名、意图、流量、CPC 和 SERP 类型行。
- `get_backlinks_overview`：外链 / 引用域名档案。
- `find_serp_competitors`：在目标关键词集合上验证点名的竞品是否真是搜索上的竞品。
- `search_local_businesses`、`get_local_serp_results`、`get_google_business_questions`：本地 SEO 竞品，地图 / 本地包可见度、附近商家、类目或 Google 问答要紧时用。
- `get_serp_results`：验证重要关键词上的正面交锋 SERP。
- `research_keywords`：需要时扩展缺口词或类目词。

## 工作流

1. **基线**：对竞品调 `get_domain_overview`，支持时传入给定的地区 / 语言。要和人对比时，对人的域名也调 `get_domain_overview`；Search Console 已连接时再调 `get_search_console_performance` 拿人的真实基线。
   完成条件：竞品（和要对比的人）的流量、关键词数基线在手。
2. **关键词**：
   - 对竞品调 `get_ranked_keywords`，用 `maxRank`、`minSearchVolume`、`excludeBrandTerms`、`resultTypes` 这类过滤保持行的相关性。
   - 要和人对比时，对人的域名 / 页面也调 `get_ranked_keywords`；共同词只要轻量核对时用 `get_serp_results`。
   - 本地 SEO 时，在下本地包的结论前先围绕相关商家位置用 `search_local_businesses` 和 `get_local_serp_results`；只有问答证据要紧时才加 `get_google_business_questions`。
   - 竞品是人给的、但搜索重合度不清楚时，用 `find_serp_competitors`。
   - 把竞品的关键词按主题分组：产品 / 类目词；替代品 / 对比；模板 / 工具 / 计算器；教学指南；品牌需求；相关时的本地 / 街区词。
   完成条件：竞品的关键词已按主题分组，每组有代表词和排名行。
3. **外链与定位**：对竞品调 `get_backlinks_overview`，尤其是权威度看起来能解释排名时；拿不到外链证据就不靠它继续。对重要的共同词或目标词用 `get_serp_results` 比较定位，支持时传入给定的地区 / 语言。
   完成条件：每条要写进分析的页面 / 内容类型判断都有 SERP 或网页证据。
4. **计划**：产出一份可执行的计划：他们做得好的、他们的软肋、该追的页面 / 关键词、不该照抄的。
   完成条件：四项都有，每项对着证据。

## 输出格式

开头写：竞品速览、最大的教训、超过他们的最好机会。然后：

| Area | Competitor pattern | Evidence | OpenSEO opportunity |
| ---- | ------------------ | -------- | ------------------- |

再有这几节：头部关键词主题；对他们起作用的内容 / 页面类型；外链 / 权威度备注；正面交锋的 SERP 观察；给人的优先行动。

## 护栏

- 按业务契合度过滤竞品的关键词，只留想要的。
- 证据和推断分开写。
- 页面 / 内容类型的模式用 SERP 或网页证据支撑，关键词行只作线索。
- 本地 SEO 时，地图 / 本地包强度用本地商家和本地 SERP 工具判断（位置已知或能合理找到时），全国范围的自然域名指标只作背景。
- 建议一个更强的角度，或对同一意图的更好回答，不建议照抄内容。
- 拿不到人的域名时，把分析框定为只看竞品。
