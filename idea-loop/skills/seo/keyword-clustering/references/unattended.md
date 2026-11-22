# 无人值守的关键词聚类

调用方提示的第一行是「无人值守，交回发现清单。」时读这份；后面还给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。交付物是一个发现清单，不是报告。

## 和人在场的差别

- 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`。
- 不写入、不保存：不调 `save_keywords`（聚类标签不存）、`update_project_context`（研究日志也不追加），不改 SEO.md。
- 不出报告：工作流第 4 步和「输出格式」不做，改做下面的「交回」。
- 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。

## 项目信息缺了

`SKILL.md`「项目上下文」第 3 步，无人值守时：重点页面没有，就从 Search Console 或排名数据里拿已有展现的页面当作已有页面，写进 `assumptions`，不写回。

## 交回

做完工作流第 1–3 步后，交回一个 JSON 数组，`direction` 都是 `keywords`：

```json
{ "direction": "keywords", "kind": "cannibalization-weeknight-dinner-ideas", "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["weeknight dinner ideas", "https://cookbook.example/blog/weeknight-dinners", "https://cookbook.example/blog/quick-dinners"],
  "evidence": { "what": "get_search_console_performance，dimensions=[query,page]，…", "when": "YYYY-MM-DD", "values": "两个网址分到的展现和点击，一两句" },
  "repro": "照着就能重跑：哪个工具、什么参数",
  "fix": "建议的修法；没定的写「需要决定：合并到哪一页」",
  "acceptance": ["能逐条独立检查的验收标准"], "assumptions": ["代替提问用的默认值"],
  "content": { "keyword": "weeknight dinner ideas", "pageType": "教程", "mode": "update" } }
```

- 每个值得做的簇一条：映射到已有页面的是 `content.mode: "update"`，要新建页面的是 `"new"`；蚕食各一条，`kind` 以 `cannibalization-` 开头。`pageType` 取 `对比与研究 | 数据研究 | 故事 | 教程` 之一。「不瞄准 / 以后再说」的簇留在清单外。
- `kind` 小写连字符、同一方向内唯一：簇写 `content-<主词，小写连字符>`，不同的簇才不会被合进同一个 issue，下次扫到同一簇也会落到同一个 issue。
- 文字里用了比例或百分比就带 `ratio: { numerator, denominator }`；`evidence.when` 用当天日期。
- 什么都没采集到，交回 `[{"direction": "keywords", "uncollected": "原因"}]`。

完成条件：每条都有 `evidence`、`repro`、非空的 `acceptance`；同一簇的判断有 SERP 或 Search Console 证据，不只靠字面相似。
