# 无人值守的关键词研究

调用方提示的第一行是「无人值守，交回发现清单。」时读这份；后面还给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。交付物是一个发现清单，不是报告。

## 和人在场的差别

- 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`；项目信息（业务、目标、定位、竞品）缺了不在此列，见下面「项目信息缺了」。
- 不写入、不保存：不调 `save_keywords`、`update_project_context`（研究日志也不追加），不改 SEO.md。
- 不出报告：工作流第 4 步不做，改做下面的「交回」。
- 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 项目信息缺了

`SKILL.md`「项目上下文」第 3 步，无人值守时：

- 哪项写着「无」：在 `assumptions` 里写明哪部分因此没做（`business_overview`：没法按业务筛种子词；`current_goal`：没法按目标给机会排优先级），其余照常做完；没有发现可挂时，把同样的话写进 `uncollected`。
- 任一为空：缺了不推断，不从站点猜业务或目标来用，不写回。在 `assumptions` 里写明缺 `business_overview` 还是 `current_goal`、哪部分因此没做（缺 `business_overview`：没法按业务筛种子词；缺 `current_goal`：没法按目标给机会排优先级），其余照常做完；没有发现可挂时，把同样的话写进 `uncollected`。

## 交回

做完工作流第 1–3 步后，交回一个 JSON 数组。每个值得做的机会一条发现，`direction` 都是 `keywords`：

```json
{ "direction": "keywords", "kind": "content-weeknight-dinner-ideas", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["weeknight dinner ideas", "easy weeknight dinners"],
  "evidence": { "what": "research_keywords，seeds=[…]，location=…", "when": "YYYY-MM-DD", "values": "搜索量 / KD / 意图，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "建议的修法；没定的写「需要决定：…」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值；缺的项目信息及因此没做的部分"],
  "content": { "keyword": "weeknight dinner ideas", "pageType": "教程", "mode": "new" } }
```

- 要新写或改写正文的机会带 `content`：已有页面差一点排上的是 `update`（`targets` 里写那个网址），没有合适页面的是 `new`。`pageType` 取 `对比与研究 | 数据研究 | 故事 | 教程` 之一。
- `kind` 小写连字符、同一方向内唯一；内容类每个目标页一条，`kind` 写 `content-<目标词，小写连字符>`（如上例），不同的页才不会被合进同一个 issue。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "keywords", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`，指标全部来自 OpenSEO 的返回。
