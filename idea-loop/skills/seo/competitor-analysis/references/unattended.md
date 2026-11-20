# 无人值守的竞品分析

调用方提示的第一行是「无人值守，交回发现清单。」时读这份（单个竞品和市场格局分支都走它）；后面还给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。交付物是一个发现清单，不是报告。

## 和人在场的差别

- 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`；项目信息（业务、目标、定位、竞品）缺了不在此列，见下面「项目信息缺了」。
- 不写入、不保存：不调 `update_project_context`（研究日志也不追加），不改 SEO.md。
- 不出报告：`SKILL.md` 的「输出格式」不做，改做下面的「交回」。
- 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 项目信息缺了

`SKILL.md`「项目上下文」第 3 步，无人值守时：

- 竞品写着「无」：调用方点名了一家，照常分析那一家；没点名，在 `assumptions` 里写明竞品写着无、竞品分析因此没做；没有发现可挂时，把同样的话写进 `uncollected`。
- 竞品为空：只分析调用方点名的那家，照常做；没点名、也没有竞品可用时，缺了不推断，不用 `find_serp_competitors` 找竞品来分析，不写回。在 `assumptions` 里写明缺竞品、竞品分析因此没做；没有发现可挂时，把同样的话写进 `uncollected`。

## 交回

做完工作流（市场格局分支做完它自己的工作流）后，交回一个 JSON 数组，每个可执行的机会或缺口一条：

```json
{ "direction": "keywords", "kind": "competitor-gap-recipe-app-alternatives", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["recipebox alternatives", "recipe app like recipebox"],
  "evidence": { "what": "get_ranked_keywords，target=recipebox.example，maxRank=10，…", "when": "YYYY-MM-DD", "values": "竞品在这些词上的排名和流量，我们的排名，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "建议的修法；没定的写「需要决定：…」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值；缺的项目信息及因此没做的部分"],
  "content": { "keyword": "recipebox alternatives", "pageType": "对比与研究", "mode": "new" } }
```

- `direction`：关键词 / 主题缺口归 `keywords`；对方起作用、我们缺的页面类型或已有页面的弱点归 `pages`；权威度 / 引用域名缺口归 `backlinks`。
- 要新写或改写正文的带 `content`（`mode` 为 `new` 或 `update`，`pageType` 取 `对比与研究 | 数据研究 | 故事 | 教程` 之一）。页面层面的说法要有 SERP 或网页证据，关键词行只作线索。
- `kind` 小写连字符、同一方向内唯一，带上主题或目标词，不同的机会才不会被合进同一个 issue。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "keywords", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`，证据和推断在 `evidence` 里分开写。
