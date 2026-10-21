# 查询：每个入口返回什么

命令行打印 JSON；MCP 工具（`design_<入口>`）原样转发同一份 JSON。

| 入口 | 参数 | 返回什么 |
|---|---|---|
| `page` | 页面名 | `page`（对象）、`regions`（区域 → 组件，带代码路径）、`components` 与 `motions`（页面用到的，各带 `usedBy` 全部页面）、`states`（每个状态的 `entry`、`components`、`motions`，加 `outgoing` 与 `incoming` 两组边，跨页的边也在内）、`journeys`（经过这一页任一状态的用户路径）、`decisions` 与 `candidates`（页面自己的，加它用到的组件、动效和经过它的用户路径的，每条带 `of: { id, kind }`） |
| `state` | 状态名 | `enter`（进入方式，见下）、`shouldSee`（「应看到什么」原文）、`screen`（「这一屏」）、`screenshots`（正文里内嵌的截图 / GIF 路径） |
| `journey` | 用户路径名 | `journey`（意图）、`start`（第一个状态的进入方式）、`steps`：按顺序每一步 `state`、`page`、`trigger`（从上一步到这一步的那条边；第一步为 `null`）、`shouldSee`。上一项写了 `via` 就按它选边；没写而有多条时取第一条，并把全部边 id 列在 `ambiguous`；两状态之间根本没有边标 `noEdge` |
| `diff` | spec 名 | `added` / `removed`（对象：`id`、`kind`、`summary`、`file`）、`changed`（对象加 `fields` 与 `sections`）、`unknownRemoved`（`removed.md` 里列了但 `prod/` 没有的 id）。`fields` 逐字段给 `before` / `after`，状态的边按边 id 展开成 `edges[<id>].<字段>`；`sections` 按 `##` 小节比对，标 `added` / `removed` / `changed`。`delta/` 里与 `prod/` 一字不差的副本不算改动 |
| `refs` | 组件名、组件代码路径或动效名 | `target`、`matchedBy`（`name` / `code`）、`edges`（经过它的边）、`states`（列了它或有这样的边的状态，`via` 说明是 `components` / `motions` / `edges` 哪种）、`journeys`（某一步的边经过它，或某个状态列了它）、`pages`（用它的全部页面，来自反向引用，不读 `usedBy` 字段） |
| `keyword` | 一段文字 | `matches`：名字、summary（用户路径还有 `intent`）、正文（连同 frontmatter 里的文字值）里含有任一个词的对象，不分大小写；按命中位置 `name` > `summary` > `body` 排序，同位置里命中词多的在前。每条带 `hit`、命中的 `terms` 与 `snippet`。整段没有空格、一个都没命中时，把其中的中文长串拆成相邻两字再找一遍（`expanded: true`） |

## 进入方式

`state` 的 `enter`、`journey` 的 `start` 按「进入方式从图上推导」给出：

- 进得去：`{ reachable: true, entry: { state, url, preconditions }, steps: [边…] }`。`steps` 里 `user` 边带 `component` / `locate` / `action`，`system` 边带 `trigger` / `how`，都可能带 `motion`；入口节点本身 `steps` 为空。最短路径相同时取 id 较小的入口、先写的边。
- 进不去：`{ reachable: false, verdict: '进不去', blocked: [边 + missing + tried…], undeclared }`。`blocked` 是这个状态的入边和它上游（走到入口能到达的状态为止）所有带 `blocked` 的边；一条都没有时 `undeclared: true`，表示没有路径也没人解释，校验规则 1 会报它。

## MCP 工具

插件自己的 `.mcp.json` 启动 `design-archive`，目标项目零配置。入参是入口的参数（`name`、`spec` 或 `text`），除 `design_diff` 外都可选带 `delta`（需求名）。仓库根取会话工作目录的 git 顶层。名字对不上、不在 git 仓库里、缺参数，都返回错误结果（`isError`，原因写在文本里）。
