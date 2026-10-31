---
name: seo-audit
description: 站点 SEO 审计：抓取站点、对着线上页面核实问题。人在场时出一页大白话报告，围绕一件这周就能做的事；被方向 agent 调用时交回发现清单。要审计、体检一个站点时用；分析竞品用 competitor-analysis。
---

# SEO 审计

## 目标

审计一个域名，产出一页 HTML 报告，任何人（包括完全不懂 SEO 的人）读一遍就能照做。整份报告只为支撑**一件**站长这周就能做的事；其余都是佐证。

要做 SEO 审计、体检一个域名时用，尤其是产出要给非专业的人看。面向专业读者的竞品或市场分析，用 `competitor-analysis`（要整个市场格局时走它的市场格局分支）。

## 两种调用

- **人在场**（默认）：照下文原样，可以问、可以存、可以出报告。
- **无人值守**：调用方提示的第一行是「无人值守，交回发现清单。」，后面给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。这时：
  - 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`；项目信息（业务、目标、定位、竞品）缺了不在此列，见「项目上下文」第 3 步。
  - 不写入、不保存：不调 `update_project_context`（研究日志也不追加），不改 SEO.md，不建项目。
  - 不出报告：工作流第 6–10 步不做，改做「无人值守的交回」一节。
  - 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 必需输入

- 要审计的域名：SEO.md「站点」节的域名，人点名别的域名时以人为准。
- `projectId`：SEO.md「OpenSEO」节的项目。没有 SEO.md 时照上游用 `list_projects` 找；找不到匹配的，人在场用 `create_project` 建一个，无人值守停下交回 `[{"direction": "technical", "uncollected": "没有 OpenSEO 项目，跑一次 seo-setup"}]`。

## 项目上下文

项目上下文工具免费，和 OpenSEO 应用、其它 agent 共用。

1. 先读目标仓库根目录的 `SEO.md`：`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md` 读出七节。竞品和重点页面以 SEO.md 为准，和 OpenSEO 项目上下文不一致时听 SEO.md 的。没有 SEO.md：人在场时在收尾建议跑一次 `idea-loop:seo-setup`，照常往下做。
2. 调 `get_project_context`，报告以它为根：业务是做什么的，决定哪些发现要紧、那「一件事」该是什么。
3. 这个 skill 需要 `business_overview`。它写着「无」（人明确说过不需要）时，就当作没有这项信息：不推断、不问、不写回，人在场、无人值守都一样；在 `assumptions` 里写明没法按业务判断哪些发现要紧、那「一件事」该是什么，只交回核实过的问题，人在场就写在报告里；无人值守且没有发现可挂时，把同样的话写进 `uncollected`。其余为空时：
   - 人在场：做最小的现场补齐：从站点推断业务，用一个问题和人确认，用 `update_project_context` 写回，再继续审计。不要一上来做完整访谈；收尾时建议跑 `idea-loop:seo-setup` 补其余。
   - 无人值守：缺了不推断，不从站点猜一段业务来用，不写回。在 `assumptions` 里写明缺 `business_overview`、哪部分因此没做（没法按业务判断哪些发现要紧、那「一件事」该是什么，只交回核实过的问题）；没有发现可挂时，把同样的话写进 `uncollected`。
4. 花 credits 之前查研究日志：30 天内跑过同样的研究，就复用那次结果并说明，不重买。
5. 收尾时（只限人在场）写回经得住时间的东西：修正过的 `business_overview`；报告单独点名的页面，经人同意先加进 SEO.md 的「重点页面」，再用 `addKeyPages` 写进项目上下文，两边一致；并追加一条研究日志：`{ appendResearchLog: { summary: "Site audit: <domain>. Verdict: <conclusion>" } }`。

## OpenSEO MCP 工具

- `whoami`：花钱前确认连接和剩余 credits。OpenSEO 没连上：人在场就停下请人连接；无人值守交回 `[{"direction": "technical", "uncollected": "OpenSEO 未连接"}]`。
- `list_projects` / `create_project`：解析 `projectId`。
- `run_site_audit`：开始抓取（默认页数预算）。Lighthouse 保持关闭（它的默认值）：它要多花好几分钟，这份报告用不上；只有人要性能 / Core Web Vitals 深度时才传 `runLighthouse: true`。然后查 `get_audit_status`（抓取要一两分钟，两次查之间等一等，别循环轮询），读 `get_audit_issues`。逐页证据有用时调 `get_audit_pages`。
- `get_backlinks_overview`：外链和引用域名的全貌；通常是决定「那一件事」的数据。
- `get_domain_overview`：估算的自然流量和自然关键词数。站点明显已死时跳过。
- `research_keywords`：带搜索量和难度的关键词点子，用来提出一个起步的重点方向。一次调用，1–3 个种子词取自站点真正讲的东西。站点挂了就跳过。

总花费保持克制：一次审计、一次外链概览、至多一次域名概览、至多一次关键词研究。只有概览和关键词查询花 credits。

## 工作流

1. `whoami`，再解析 `projectId`。
2. 对域名 `run_site_audit`（除非人要性能深度，Lighthouse 保持关闭）。抓取期间取 `get_backlinks_overview`。
3. 抓取结束后读 `get_audit_issues`（站点活着的话再取 `get_domain_overview`）。
4. 审计结果坏掉或几乎为空（证书错误、5xx、只抓到一页）：动笔前先调查。自己查证书和各种跳转写法，并在网上搜这家业务。死掉的域名常常有一个活着的继任站，那会把整个建议翻成「把旧域名跳转过去」。
5. 打算报告的每条发现，都自己抓线上页面的 HTML 核过。没见到证据的一律不报。
6. 定下那一件事。从数据推出来，不从泛泛的建议推。常见模式：
   - 站点干净、没有外链：联系客户、合作方或目录站，附一封可以直接发的消息。
   - 域名已死、继任站活着：通过主机商支持做永久跳转，附要发给他们的原话。
   - 页面被屏蔽或 noindex：去掉屏蔽。
   它必须是一个不懂技术的人这周就能做完的事，附上能直接复制粘贴的操作细节。
7. 站点健康时提出一个起步的重点方向：调一次 `research_keywords`，种子取自站点真实的主题，然后选一个主题和 3–5 个站点能实际排上去的低难度关键词，每个配上要做的页面或文章。这是一个起步方向，不是关键词策略；完整流程请人用 `keyword-research`。站点挂了就整步跳过：那时只有那一件事要紧。
8. 用 `references/template.html` 写报告（见「输出格式」）。
9. 交付前 review：环境里有第二个 agent 或模型就做一轮对抗式审查，没有就重新自审一遍。把核实过的事实交给审查者，让它攻击四点：超出事实的说法、没解释的术语、对新手负担过重的内容、夸张的措辞。审查者也可能指出你没给它的真实事实；拿你的证据去核，而不是去「修」它们。
10. 交付报告：环境能发布或预览 HTML（例如 Artifact）就那样做；否则存成 HTML 文件，告诉人用浏览器打开。

## 输出格式

人在场写报告时读 `references/template.html`：只填内容，CSS 和结构保持原样（只用浅色调色板，不做深色模式）。

- 页头：域名作标题，下一行单独写审查日期，再写 2–3 句全文摘要（总体状况；主要缺口和那一件事；报告覆盖了什么）。
- 小节顺序：结论、那一件事、小修复（最多 5–10 条，按影响排序）、先从哪儿着手（只限健康站点）、已经做对的、方法说明页脚。
- 每条修复都给出确切证据（引用的标签或数字），和不懂技术的人能照做的具体步骤。
- 「先从哪儿着手」点名一个主题方向和 3–5 个关键词，每个用大白话写搜索量，并写要做的页面或文章。站点挂了就省掉这一节。

## 无人值守的交回

做完工作流第 1–5 步后，交回一个 JSON 数组，每条核实过的问题一条发现：

```json
{ "direction": "technical", "kind": "missing-meta-description", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["https://cookbook.example/pricing"],
  "evidence": { "what": "get_audit_issues，auditId=…", "when": "YYYY-MM-DD", "values": "3 / 40 页缺 description" },
  "ratio": { "numerator": 3, "denominator": 40 },
  "repro": "照着就能重跑：哪个工具、什么参数；或用什么 UA 请求哪个网址、看哪一行",
  "fix": "建议的修法；没定的写「需要诊断」或「需要决定：…」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值；缺的项目信息及因此没做的部分"] }
```

- `direction`：状态码、跳转、可索引性、sitemap、robots、证书、速度归 `technical`；title、description、标题层级、正文、内链、图片 alt 归 `pages`；外链概览得出的缺口归 `backlinks`。`kind` 是问题种类的短名，小写连字符，同一方向内唯一；同一种问题的多页合成一条，`targets` 列全。
- 文字里用了比例或百分比就带 `ratio`；`evidence.when` 用当天日期。`ratio`、`assumptions` 可省。
- 什么都没采集到，交回 `[{"direction": "<方向>", "uncollected": "原因"}]`。

完成条件：数组里每条都过了第 5 步的线上核实，且都有 `evidence`、`repro`、非空的 `acceptance`。

## 护栏

- 语气：平静、平实。不用感叹号、不用夸张词、不用破折号、不用「不是 X，是 Y」式对照、不写填充话。严重程度的词只在字面成立时用（站点挂了是严重的；title 太长不是）。
- 每个术语第一次出现时用大白话解释：canonical、meta description、alt text、爬虫、301、结构化数据。
- 对这个站点无关紧要的细枝末节不报。一份新手报告列二十条发现就是失败。
- 缺外链或排名数据意味着「没有记录到数据」，不是惩罚；照实说，别渲染。
- 偏向站点现在就能赢的关键词：意图具体、难度低。别列新站还排不上的头部大词。
- 区分工具报出来的和你自己核实的，两者都写进方法说明页脚（无人值守时写进 `evidence`）。
