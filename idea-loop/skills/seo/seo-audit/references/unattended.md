# 无人值守的审计

调用方提示的第一行是「无人值守，交回发现清单。」时读这份；后面还给出 SEO.md 路径、OpenSEO 项目、本次额度和今天的日期。交付物是一个发现清单，不是报告。完成条件：清单交回，每条过了 `SKILL.md` 工作流第 2 步的线上核实。

## 和人在场的差别

- 不提问：要问的值从 SEO.md 取，SEO.md 没有就用 MCP 默认值，写进那条发现的 `assumptions`；项目信息（业务、目标、定位、竞品）缺了不在此列，见下面「项目信息缺了」。
- 不写入、不保存：不调 `update_project_context`（研究日志也不追加），不改 SEO.md，不建项目。
- 不出报告：工作流第 3 步起不做，改做下面的「交回」。
- 花费不超过调用方给的额度：每次付费调用后用 `whoami` 核已花的数，再花一次可能超额就停，没做的写进 `assumptions`。
- 没有 OpenSEO 项目：交回 `[{"direction": "technical", "uncollected": "没有 OpenSEO 项目，跑一次 /idea-loop:setup 的 SEO 模块"}]`。
- OpenSEO 没连上：交回 `[{"direction": "technical", "uncollected": "OpenSEO 未连接"}]`。

## 项目信息缺了

`SKILL.md`「项目上下文」第 3 步的两种情形，无人值守时：

- `business_overview` 写着「无」：在 `assumptions` 里写明没法按业务判断哪些发现要紧、那「一件事」该是什么，只交回核实过的问题；没有发现可挂时，把同样的话写进 `uncollected`。
- `business_overview` 为空：缺了不推断，不从站点猜一段业务来用，不写回。在 `assumptions` 里写明缺 `business_overview`、哪部分因此没做（没法按业务判断哪些发现要紧、那「一件事」该是什么，只交回核实过的问题）；没有发现可挂时，把同样的话写进 `uncollected`。

## 交回

做完工作流第 1–2 步后，交回一个 JSON 数组，每条核实过的问题一条发现：

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

完成条件：数组里每条都过了线上核实，且都有 `evidence`、`repro`、非空的 `acceptance`。
