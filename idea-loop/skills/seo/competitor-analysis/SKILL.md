---
name: competitor-analysis
description: 竞品分析：深挖一个竞品的自然流量、排名词、内容主题、外链和缺口；要整个市场格局（几个竞品里谁在赢、哪里有空位）时走市场格局分支。人在场时出分析和行动计划；被方向 agent 调用时交回发现清单。
---

# 竞品分析

## 目标

把一个竞品分析到足以决定：向它学什么、避开什么、怎么和它错位、在哪儿超过它。

点名了一个竞品时走下文。**要整个市场格局**（「这个 SEO 市场谁在赢、什么内容在起作用、空位在哪」，跨几个竞品的市场级视图）时，读 `references/landscape.md`，用它的必需输入、工具、工作流、输出格式和护栏代替下文同名的几节；「两种调用」「项目上下文」「无人值守的交回」两个分支共用。市场格局之后要深挖其中一家，回到下文。

## 两种调用

- **人在场**（默认）：照下文原样，可以问、可以存、可以出报告。
- **无人值守**：调用方提示的第一行是「无人值守，交回发现清单。」，后面给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。这时：
  - 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`。
  - 不写入、不保存：不调 `update_project_context`（研究日志也不追加），不改 SEO.md。
  - 不出报告：「输出格式」不做，改做「无人值守的交回」一节。
  - 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 竞品域名。无人值守时用调用方点名的；没点名就按 SEO.md「竞品」列出的顺序，在额度内一家一家做。
- 要对比时，人的域名：SEO.md「站点」节的域名。
- 可选：话题 / 类目 / 地区 / 语言。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 先读目标仓库根目录的 `SEO.md`：`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md` 读出六节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议跑一次 `idea-loop:seo-setup`，照常往下做。
2. 调 `get_project_context`，分析以它为根：已存的竞品说明这个域名是否早已知道、以前对它下过什么结论。
3. 这个 skill 需要竞品。SEO.md 和项目上下文里都没有时：
   - 人在场：做最小的现场补齐：存下正在分析的这家，问人（或从 `find_serp_competitors` 推断再确认）还有没有别家；先写进 SEO.md 的「竞品」，再用 `update_project_context`（`addCompetitors`）写回，然后继续分析。不要一上来做完整访谈；收尾时建议跑 `idea-loop:seo-setup` 补其余。
   - 无人值守：只分析调用方点名的那家；没点名就用 `find_serp_competitors` 推断，写进 `assumptions`，不写回。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明，不重买。
5. 收尾时（只限人在场）写回经得住时间的东西：这家竞品的一句强项和软肋，经人同意先写进 SEO.md 的「竞品」，再用 `update_project_context` 的 `addCompetitors` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Competitor analysis: <domain>. Verdict: <conclusion>" } }`。

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

1. 对竞品调 `get_domain_overview`，支持时传入给定的地区 / 语言。
2. 要和人对比时，对人的域名也调 `get_domain_overview`；Search Console 已连接时再调 `get_search_console_performance` 拿人的真实基线。
3. 对竞品调 `get_ranked_keywords`。用 `maxRank`、`minSearchVolume`、`excludeBrandTerms`、`resultTypes` 这类过滤保持行的相关性。
4. 要和人对比时，对人的域名 / 页面也调 `get_ranked_keywords`；共同词只要轻量核对时用 `get_serp_results`。
5. 本地 SEO 时，在下本地包的结论前先围绕相关商家位置用 `search_local_businesses` 和 `get_local_serp_results`。只有问答证据要紧时才加 `get_google_business_questions`。
6. 竞品是人给的、但搜索重合度不清楚时，用 `find_serp_competitors`。
7. 把竞品的关键词按主题分组：
   - 产品 / 类目词
   - 替代品 / 对比
   - 模板 / 工具 / 计算器
   - 教学指南
   - 品牌需求
   - 相关时的本地 / 街区词
8. 对竞品调 `get_backlinks_overview`，尤其是权威度看起来能解释排名时。拿不到外链证据就不靠它继续。
9. 对重要的共同词或目标词用 `get_serp_results` 比较定位，支持时传入给定的地区 / 语言。
10. 产出一份可执行的计划：
    - 他们做得好的
    - 他们的软肋
    - 该追的页面 / 关键词
    - 不该照抄的

## 输出格式

开头写：

- 竞品速览
- 最大的教训
- 超过他们的最好机会

然后：

| Area | Competitor pattern | Evidence | OpenSEO opportunity |
| ---- | ------------------ | -------- | ------------------- |

再有这几节：

- 头部关键词主题
- 对他们起作用的内容 / 页面类型
- 外链 / 权威度备注
- 正面交锋的 SERP 观察
- 给人的优先行动

## 无人值守的交回

做完工作流（市场格局分支做完它自己的工作流）后，交回一个 JSON 数组，每个可执行的机会或缺口一条：

```json
{ "direction": "keywords", "kind": "competitor-gap-recipe-app-alternatives", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["recipebox alternatives", "recipe app like recipebox"],
  "evidence": { "what": "get_ranked_keywords，target=recipebox.example，maxRank=10，…", "when": "YYYY-MM-DD", "values": "竞品在这些词上的排名和流量，我们的排名，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "建议的修法；没定的写「需要决定：…」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值"],
  "content": { "keyword": "recipebox alternatives", "pageType": "对比与研究", "mode": "new" } }
```

- `direction`：关键词 / 主题缺口归 `keywords`；对方起作用、我们缺的页面类型或已有页面的弱点归 `pages`；权威度 / 引用域名缺口归 `backlinks`。
- 要新写或改写正文的带 `content`（`mode` 为 `new` 或 `update`，`pageType` 取 `对比与研究 | 数据研究 | 故事 | 教程` 之一）。页面层面的说法要有 SERP 或网页证据，不只靠关键词行。
- `kind` 小写连字符、同一方向内唯一，带上主题或目标词，不同的机会才不会被合进同一个 issue。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "keywords", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`，证据和推断在 `evidence` 里分开写。

## 护栏

- 别把竞品的所有关键词都当成想要的。按业务契合度过滤。
- 证据和推断分开。
- 别只从关键词行推断竞品的页面 / 内容类型模式；页面层面的说法用 SERP 或网页证据。
- 本地 SEO 时，别只凭全国范围的自然域名指标推断地图 / 本地包强度；位置已知或能合理找到时，用本地商家和本地 SERP 工具。
- 别建议照抄内容；建议一个更强的角度，或对同一意图的更好回答。
- 拿不到人的域名时，把分析框定为只看竞品。
