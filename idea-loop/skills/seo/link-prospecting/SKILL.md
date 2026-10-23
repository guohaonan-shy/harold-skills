---
name: link-prospecting
description: 外链拓展：从 SERP 和竞品外链里找可能引用我们的页面和站点，查公开联系途径。人在场时出拓展表和外联草稿；被方向 agent 调用时交回发现清单。要给一个页面找外链机会时用；写外联邮件、跟进表用 seo-outreach。
---

# 外链拓展

## 目标

找到现实中可能引用人的页面、产品、研究、指南或工具的页面、站点和作者。用 OpenSEO 发现拓展目标，再用手头的网页 / 搜索 / 浏览器工具找联系方式。

## 两种调用

- **人在场**（默认）：照下文原样，可以问、可以存、可以出报告。
- **无人值守**：调用方提示的第一行是「无人值守，交回发现清单。」，后面给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。这时：
  - 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`。
  - 不写入、不保存：不调 `update_project_context`（研究日志也不追加），不改 SEO.md，不发任何消息。
  - 不出报告：工作流第 8–9 步（找联系途径、起草外联）和「输出格式」不做，改做「无人值守的交回」一节。联系途径和外联草稿由 issue 会话里的 seo-outreach 做。
  - 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 必需输入

- `projectId`：SEO.md「OpenSEO」节的项目；没有 SEO.md 时先用 `list_projects`。
- 人的域名或目标网址：SEO.md「站点」节的域名。
- 可被引用的资产：页面、产品、研究、工具或话题。无人值守时用调用方给的；没给就用 SEO.md「重点页面」，按列出的顺序在额度内做。
- 可选：竞品。默认是 SEO.md「竞品」。
- 可选：市场 / 地区 / 语言。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 先读目标仓库根目录的 `SEO.md`：`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md` 读出六节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议跑一次 `idea-loop:seo-setup`，照常往下做。
2. 调 `get_project_context`，外联以它为根：`positioning` 提供让人愿意给链接的那个主张，竞品就是要挖的外链档案。
3. 这个 skill 需要 `positioning` 和竞品。任一为空时：
   - 人在场：做最小的现场补齐：问人为什么有人会引用他们、他们和谁竞争，或从站点和 `find_serp_competitors` 推断再确认；竞品先写进 SEO.md 的「竞品」，再和 `positioning` 一起用 `update_project_context` 写回，然后继续拓展。不要一上来做完整访谈；收尾时建议跑 `idea-loop:seo-setup` 补其余。
   - 无人值守：从站点推断 `positioning`、用 `find_serp_competitors` 推断竞品，写进 `assumptions`，不写回。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明，不重买。
5. 收尾时（只限人在场）写回经得住时间的东西：可被引用的资产、外链档案证明有用的竞品，经人同意先加进 SEO.md 的「重点页面」「竞品」，再用 `addKeyPages`、`addCompetitors` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Link prospecting: <asset/target page>. Verdict: <conclusion>" } }`。

## OpenSEO MCP 工具

- `get_serp_results`：找排名的文章、榜单、资源页、对比页和话题相关的发布者。
- `get_backlinks_overview`：查看竞品域名或页面的外链 / 引用域名模式。
- `get_domain_overview`：给重要的拓展目标域名定性。
- `get_ranked_keywords`：话题契合度要紧时，了解一个拓展目标或竞品在哪些词上有排名。
- `search_local_businesses` 和 `get_local_serp_results`：本地 SEO 外链拓展，附近的商家、本地竞品或地图 / 类目信号能揭示合作目标时用。
- `research_keywords`：扩展拓展用的查询。

## 联系方式发现工具

OpenSEO 找出好的拓展目标后，用手头非 OpenSEO 的浏览或搜索工具找公开的联系途径。视客户端而定，可能是网页搜索、抓取页面、浏览器自动化或搜索 API。

找这些：

- 作者署名页
- 联系页
- 投稿 / 编辑指南
- 关于 / 团队页
- LinkedIn、X、Bluesky 或其它职业主页
- Newsletter 或出版物的版权页
- 页面 HTML 或可见正文里的公开邮箱
- 结构化数据，如 `Person`、`Organization`、`sameAs` 或 `email`

只记真正找到的联系方式。任何邮箱、主页或联系表单都附上来源网址。

## 拓展查询的模式

从资产 / 话题出发构造查询：

- `<topic> resources`
- `best <category> tools`
- `<competitor> alternatives`
- `<topic> statistics`
- `<topic> guide`
- `<topic> examples`
- `<topic> templates`
- `<topic> software`
- `<topic> for <audience>`

对最相关的模式分批调 `get_serp_results`。每次至多 10 个查询。

## 工作流

1. 弄清可被引用的资产，以及别人为什么会引用它。
2. 默认构造 5–10 个拓展查询。
3. 对这些查询调 `get_serp_results`。
4. 有竞品时，先对最强的竞品域名或页面调 `get_backlinks_overview`。拿不到外链证据就不靠它继续。
5. 本地 SEO 时，围绕重点位置用 `search_local_businesses` 和 `get_local_serp_results` 找出附近的竞品、类目和本地 SERP 证据，再去找本地商会、协会、校园资源、社区页面和目录站。
6. 筛选拓展目标：
   - 保留话题相关的、有编辑内容的页面。
   - 优先文章、目录、资源页、对比页、统计页、模板和精选榜单。
   - 降低首页、登录页、单薄的联盟营销页、垃圾站、不相关的论坛和直接竞品的优先级，除非对比角度成立。
7. 给每个好的拓展目标定外联角度：
   - 失效 / 缺失的资源
   - 更新的数据
   - 有用的工具 / 模板
   - 加进替代品或对比
   - 专家引语或佐证引用
8. 对最强的拓展目标，访问或搜索它的站点，找最好的联系途径。
9. 起草外联消息。找到了联系方式就附上来源；没找到就列出下一个最好的联系方式发现途径。

## 输出格式

开头写：

- 最好的外联角度
- 优先级最高的拓展目标类型
- 数据上的局限

然后：

| Prospect URL | Site/domain | Source | Relevance | Suggested angle | Contact path | Priority |
| ------------ | ----------- | ------ | --------- | --------------- | ------------ | -------- |

再给 2–3 份可复用的外联草稿：

- 资源 / 榜单收录
- 文章更新 / 引用建议
- 竞品替代 / 对比角度

## 无人值守的交回

做完工作流第 1–7 步后，交回一个 JSON 数组，`direction` 都是 `backlinks`。同一个资产（要被引用的那个页面）的拓展目标合成一条：

```json
{ "direction": "backlinks", "kind": "outreach-weeknight-dinners", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["https://recipeblog.example/best-dinner-resources", "…"],
  "evidence": { "what": "get_serp_results，queries=[…]", "when": "YYYY-MM-DD", "values": "每个目标为什么相关、建议的角度，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "用 seo-outreach 给这些站点写外联草稿和跟进表，角度：…",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值"] }
```

- `kind` 小写连字符、同一方向内唯一：写 `outreach-<资产页面路径的末段>`（如上例），不同资产不会被合进同一个 issue。
- 直接竞品、疑似付费位的拓展目标不列。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "backlinks", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`，每个拓展目标都写了相关的理由和角度。

## 护栏

- 不编邮箱、社交账号或联系人姓名。
- 除非 OpenSEO 工具确实返回了，否则不说是 OpenSEO 找到的联系方式。联系方式的出处归到实际用的网页 / 搜索 / 浏览器来源。
- 合理搜索后仍拿不到联系方式，就建议具体的发现步骤，如查作者页、联系页、LinkedIn、X，或一个可靠的联系方式补全工具。
- 避免垃圾式的群发外联。按页面、按理由个性化。
- 标出属于直接竞品或可能是付费位的拓展目标。
