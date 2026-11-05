# 发现清单与方向 agent 的文件约定

一次 `seo-scan` 里，每个方向 agent 把发现写成一个 JSON 文件，`seo-scan` 合并后交给 `seo-issues.mjs`。这份文件定义发现的形状、文件放哪、未采集怎么写、agent 交回什么；五个方向 agent 和被它们调用的方法 skill 都照这里写。

## 一条发现

```json
{
  "direction": "technical | pages | keywords | backlinks | geo",
  "kind": "问题种类短名，用连字符连起来（小写字母、数字、中文），同一方向内唯一，例 missing-meta-description",
  "title": "一句话，不懂 SEO 的人能读懂",
  "targets": ["受影响的网址或关键词"],
  "evidence": { "what": "调了什么工具、什么参数", "when": "YYYY-MM-DD", "values": "拿回的数值，一两句" },
  "ratio": { "numerator": 3, "denominator": 40 },
  "repro": "照着就能重跑的步骤：哪个 OpenSEO 工具、什么参数；或用什么 UA 请求哪个网址、看哪一行",
  "fix": "建议的修法；还没定的写「需要诊断」或「需要决定：…」",
  "acceptance": ["能逐条独立检查的验收标准"],
  "assumptions": ["无人时代替提问用的默认值"],
  "content": { "keyword": "目标词", "pageType": "对比与研究 | 数据研究 | 故事 | 教程", "mode": "new | update" }
}
```

- `ratio`、`assumptions`、`content` 可选，其余必填。
- **同一种问题一条**：三十个页面缺描述是一条 `kind: missing-meta-description`、`targets` 列三十个网址，不是三十条。合并和去重都靠 `direction` + `kind`，所以同一方向里 `kind` 的拼法每次运行保持一致：优先用 OpenSEO 返回里现成的问题类型名（例如审计的 `issueType`）。
- 文字里（`title`、`evidence.values`、`fix`）出现百分比，就带 `ratio`；否则整条被拒收。CTR 写「12 次点击 / 1,050 次展现」，再给 `ratio: { numerator: 12, denominator: 1050 }`。
- `repro` 要能被一个没看过本次数据的人照着重跑：工具名加完整参数（含 `projectId`、日期范围），或一条 `curl -A '<UA>' <网址>` 加要看的那一行。issue 会话的审核阶段就照它独立复现。
- `fix` 还没想清楚时写「需要诊断」或「需要决定：…」，这条照样交回：诊断和拍板在 issue 会话里有人做。
- `content` 只给要新写或改写正文的发现，`pageType` 只取那四个值，`mode` 是新开页（`new`）还是改已有页（`update`）。
- `assumptions` 写清无人时你替人选了什么：「SEO.md 没写目标市场，按 MCP 默认 United States / English」。缺的项目信息不推断着用，写清缺什么、哪部分因此没做：「SEO.md 竞品为空，未挖竞品外链」。

例：

```json
{
  "direction": "pages",
  "kind": "low-ctr-striking-distance",
  "title": "「weeknight dinner ideas」排在第 7 位却几乎没人点，标题可能没对上搜索意图",
  "targets": ["https://cookbook.example/blog/weeknight-dinners"],
  "evidence": { "what": "get_search_console_performance dimensions=[query,page] dateRange=last_28_days minPosition=5 maxPosition=20 minImpressions=50", "when": "2026-01-12", "values": "平均排名 7.2，12 次点击 / 1,050 次展现" },
  "ratio": { "numerator": 12, "denominator": 1050 },
  "repro": "get_search_console_performance projectId=<SEO.md 的项目> dimensions=[query,page] dateRange=last_28_days filters=[{dimension:page,operator:equals,expression:https://cookbook.example/blog/weeknight-dinners}]",
  "fix": "需要诊断：对照 get_serp_results 前 10 名的标题，看意图是不是「快手」而不是「清单」",
  "acceptance": ["页面 title 包含目标词且不超过 seo-check 的宽度上限", "改动上线 28 天后同一查询的点击 / 展现高于本次"]
}
```

## 调方法 skill

方向 agent 用 Skill 工具调方法 skill（`idea-loop:seo-audit` 等）时，`args` 照这个模板填，第一行原样：

```
无人值守，交回发现清单。
SEO.md：<SEO.md 绝对路径>
OpenSEO 项目：<projectId>
本次额度：<n> credits
今天：<YYYY-MM-DD>
```

方法 skill 读到第一行就走它的无人分支：不提问、不写入、不出报告，交回上面形状的发现。一个方向调了几个方法 skill 时，额度在它们之间分，合计不超过「本次额度」。

## 文件放哪

- 运行目录由调用方给（`<仓库根>/.tmp/seo-scan/<YYYYMMDD-HHMM>/`）。发现清单写到 `<运行目录>/<方向>.json`：一个 JSON 数组，没有发现就是 `[]`。
- 为了交给脚本而存的工具原始返回（审计逐页数据等）也放在运行目录里，文件名带方向前缀（`technical-audit-pages-current.json`）。运行目录以外不写任何文件。
- **未采集**：这个方向的数据一样也没拿到（MCP 连不上、没有 Search Console 连接、额度为 0 而方法只剩付费调用），文件内容是只有一个对象的数组：

  ```json
  [{ "direction": "pages", "uncollected": "OpenSEO 项目没有连 Search Console" }]
  ```

  拿到了一部分就交回拿到的那部分发现，缺的那块写进交回那一句（例：geo 方向没有 AI 可见性跟踪时，引用数据没采集，免费的站点自检照常交回发现）。
- 写完先验一遍：`node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(a))process.exit(1)' <文件>`，退出码 0 才交回。

## 交回

最后一条消息只有一行，二选一：

```
<方向>：<N> 条发现，写在 <运行目录>/<方向>.json<；有缺口时：缺 <哪块>（<原因>）>
<方向>：未采集（<原因>），写在 <运行目录>/<方向>.json
```
