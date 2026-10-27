---
type: spec
status: 完成
tags: [idea-loop, seo, page-optimizer, cannibalization]
summary: SEO.md 新开「品牌」一节，蚕食判定排除含品牌词的查询，不再把站点链接报成蚕食
related: ["[[2026-10-27-brand-terms-cannibalization]]", "[[idea-loop-seo]]"]
issues: [81]
---

# seo 页面优化：品牌词的站点链接不再报成自相蚕食

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #81 idea-loop seo：页面优化扫描的「自相蚕食」规则把品牌词的站点链接误报成蚕食 | 存在 | 2026-10-27 拿 Toeflair 近 28 天的 Search Console 数据照规则原文判一遍，「toeflair」一个查询报出 9 个页面的蚕食，其中 7 个是站点链接，详情在「问题」 |

## 问题

### 1. 每轮 pages 扫描都把品牌词报成一条假的自相蚕食

规则原文在 page-optimizer 的判定表里：`cannibalization` =「同一个查询有两个及以上页面各有 ≥ 20 次展现」。

2026-10-27 核：用 OpenSEO 的 `get_search_console_performance` 拉 toeflair.com 2026-09-27 至 10-24（page-optimizer 默认的 last_28_days）的 query × page 数据，展现 ≥ 20 的共 20 行，照规则原文逐个查询判。只有一个查询过线，就是品牌词「toeflair」：

| 页面 | 点击 | 展现 | 平均排名 |
|---|---|---|---|
| / | 82 | 95 | 1.0 |
| /about | 0 | 91 | 1.0 |
| /interview | 0 | 86 | 1.0 |
| /listen-repeat | 0 | 86 | 1.1 |
| /pricing | 0 | 84 | 1.0 |
| /blog | 0 | 72 | 1.0 |
| /auth | 0 | 43 | 1.0 |
| /email-writing | 0 | 28 | 1.1 |
| /blog/prepex-ai-vs-toeflair | 0 | 25 | 6.3 |

整个查询 95 次展现、82 次点击。首页拿走全部点击；/about 到 /email-writing 七个页面排名都和首页一样是 1.0–1.1，展现都不超过首页，是首页那条结果下面的站点链接，Search Console 给每条站点链接各记一次展现。/blog/prepex-ai-vs-toeflair 排第 6.3，是另一条独立结果（自家的对比文）。

本该是：品牌词上首页拿下几乎全部点击，这是品牌词的正常形状，不该报蚕食。现在规则会报出一条 `kind: cannibalization`、targets 列 9 个网址的发现。

这条发现每轮都会回来：seo-scan 建 issue 时只跟**开着的** issue 去重，Toeflair 上一次的同一条（guohaonan-shy/Tofelair#530）核实后已关成 not planned，下一轮扫描会再开一条新的，占掉 seo 独立队列的名额。

复现材料：`.tmp/to-spec/seo-cannibalization-sitelinks/repro/`（20 行数据、照规则判的脚本和输出，不提交）

### 根因

判定只看「每个页面各有多少展现」，不看这些展现是不是同一条搜索结果里一起出现的。品牌这类导航型查询，Google 把首页和一排站点链接放在一条结果里，每条站点链接单独记展现、排名和首页相同，所以品牌词每轮都满足「两个以上页面各 ≥ 20 次展现」。

## 方案

用户（接入 seo 的项目维护者）得到的：在 `SEO.md` 新的「品牌」一节写下自己的品牌词，之后 pages 和 keywords 方向都不再把含品牌词的查询报成自相蚕食；真正有几个页面在非品牌词上抢的，照旧报。没写品牌词的项目，判定和现在一样。

由哪些输入决定：`SEO.md`「品牌」节的品牌词清单。seo-setup 第一次接入、或补空小节时会问这一项，推荐值从域名推（toeflair.com → `toeflair`），人确认了才写进去。

同一行为的其他入口：

- **page-optimizer 的 `cannibalization` 判定**：纳入，这是 issue 指的那一处。
- **keyword-clustering 第 6 步的「找出蚕食风险」**：纳入。它被 keywords 方向调用时用同一份 query × page 数据确认蚕食、交回 `cannibalization-` 开头的发现，品牌词会以同样的形状过线。两处用同一条排除。
- **seo-scan 本身**：不改判定。蚕食不是 seo-scan 判的，它只起各方向 agent；它和各方向 agent 读 `SEO.md` 的方式不变，多出的一节由解析脚本带出来。
- **seo-brief 核对模式那一步**：排除，见 Out of scope。
- **page-optimizer 的 `striking-distance`、`low-ctr`**：排除，见 Out of scope。

## User Stories

只修问题，不加能力。

1. 期望行为（对应问题 1）：作为接入 seo 的项目维护者，我想要在 `SEO.md` 写下品牌词后，品牌词上首页加站点链接的查询不再被报成自相蚕食，以便 seo 队列的名额只留给真要处理的问题

## 实现决策

### 品牌词由人写在 SEO.md 新开的「品牌」一节

人定的（2026-10-27，本会话）：「在 seo.md 设置一个品牌词的章节，用户可以自己设定品牌词来排除这种情况」，放法选了新开一节，不放进「站点」。

格式照 `SEO.md` 现有的写法，一行一个键，多个值用 `；` 分隔、各自放反引号里：

```markdown
## 品牌
- 品牌词：`toeflair`；`toefl air`
```

- `SEO.md` 从六节变成七节：格式定义、解析脚本、seo-setup 的完成条件，以及各 seo skill 里写着「读出六节」的地方一起改。
- 解析脚本把它读成一个品牌词数组；没有这一节、这一节没有「品牌词」键、或值里没有反引号的，读成空数组，不报错（照现有「少了的小节当作空」）。
- 「每节读的人」表加一行：品牌｜品牌词｜page-optimizer、keyword-clustering。

### 没写品牌词就不排除

人定的（2026-10-27，本会话）：没填品牌词时选「不排除」，不从域名推。老项目要重跑一次 seo-setup（它只补空的小节）填上才生效。

### 怎么判「含品牌词」

查询和每个品牌词都转小写、去掉空格和连字符后，查询包含任一品牌词就算品牌查询。例：品牌词 `toeflair` 时，「toeflair」「Toeflair pricing」「toefl air」「prepex ai vs toeflair」都算；「toefl listen and repeat」不算。依据：品牌词常被拆开或大小写不一，人写一个就该接住这些写法；包含比相等多接住「品牌 + 功能」「X vs 品牌」这类同样会出站点链接或自家结果的查询（「自己定的四条」第 3 条：误排除一个品牌查询的代价只是少报一条蚕食）。

### seo-setup 怎么问

按 `SEO.md` 的小节顺序、只问空的，和其余小节一样：推荐值取「站点」节的域名去掉后缀，出处写「域名」；人一句「照推荐」就算确认，人也可以加别的写法或说留空。依据：seo-setup 现有的「每个带推荐值和出处」。

### 已定的其余几条

- **排除只作用于蚕食判定**：带品牌词的查询照旧参与 `striking-distance`、`low-ctr`。依据：issue 只报了蚕食这一处，品牌词排名掉出前 5 或点击率异常仍是该看的信号（「自己定的四条」第 2、4 条）。
- **两处用同一条判定文字**：page-optimizer 的判定表和 keyword-clustering 第 6 步写成同一条规则，不各写一版。依据：同一份数据上两个入口对「蚕食」的判法本该一致。
- **规则留在 agent 与 skill 的判定文字里，不挪进脚本**：现在三条判定都是 page-optimizer 读数据后自己判，把判定改成脚本是结构性改动，单独起（「自己定的四条」第 4 条）。
- **不另做站点链接形状识别**：人选了品牌词这条路；不带品牌名的导航型查询目前没有实例。

## 技术方案总览

### 后端

不涉及：不动 OpenSEO 调用和 seo-issues 脚本。变的只有 `SEO.md` 的格式与解析脚本的输出多一个字段（品牌词数组），读它的是 page-optimizer 与 keyword-clustering。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：`SEO.md` 解析多读「品牌」一节 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 碰到：page-optimizer 与 keyword-clustering 的判定文字、seo-setup 的问法。按仓库 AGENTS.md §5 不建 quantitative eval，用下面的一次真实运行验 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：
  - `SEO.md` 解析脚本的输出。能抓到：「品牌」节读成什么、缺节缺键时是不是空数组。漏掉：agent 拿到品牌词后判得对不对。
  - page-optimizer 交回的 `pages.json`。能抓到：品牌词还报不报蚕食。漏掉：Toeflair 当前没有真正的非品牌蚕食，「真蚕食照旧报」在真实数据上验不到，只能靠读判定文字核对。
- **增量功能测试**：
  - 解析：前置一份带「品牌」节、写了 `toeflair`；`toefl air` 的 `SEO.md`；期望读出两个品牌词。另一份没有「品牌」节；期望读出空数组、不报错。覆盖：问题 1 的期望行为。
  - 真实运行：前置 Toeflair 的 `SEO.md` 加上「品牌」节、品牌词 `toeflair`，OpenSEO 项目已连 Search Console（2026-10-27 已连）；步骤是用改后的插件在 Toeflair 上只跑 seo-scan 的 pages 方向（Search Console 部分免费）；期望 `pages.json` 里没有 targets 指向「toeflair」查询的 `cannibalization`。覆盖：问题 1 的期望行为。
- **prompt / eval 变动**：改 page-optimizer 判定表里 `cannibalization` 一行和它读 `SEO.md` 的那句、keyword-clustering 第 6 步和它的工具说明、seo-setup 的问法与完成条件、各 seo skill 的「读出六节」；不加 eval。
- **照着谁写**：`SEO.md` 解析已有的单元测试（同一份测试里已经测了「站点」只写域名、其余小节为空的情形）；agent 改动此前都靠一次真实扫描验收。

## Out of scope

- **seo-brief 核对模式那一步**：它看的是「目标词上已有自家页面有没有展现」来决定改已有页还是新开页，brief 的目标词不会是品牌词，这一步也不产出蚕食发现。
- **`striking-distance`、`low-ctr` 对品牌词的判定**：理由见「已定的其余几条」第一条。
- **品牌词用在别的地方**（比如 keyword-research 去掉品牌词、GEO 查品牌提及）：这次只接蚕食，别的入口要用时各自起。
- **没填品牌词时从域名推**：人定了不推。
- **认站点链接形状**：人选了品牌词这条路。
- **把三条判定挪进脚本**：结构性改动，单独起。
- **seo-scan 去重时也看已关闭的 issue**：能挡住「关成 not planned 后下一轮又开」这一类重复，但它管的是所有发现，不只是这一条规则，另起。

## 关联

- 覆盖：#81 idea-loop seo：页面优化扫描的「自相蚕食」规则把品牌词的站点链接误报成蚕食
- raw：[[2026-10-27-brand-terms-cannibalization]]（本次审核的讨论）
- 相关 spec：[[idea-loop-seo]]（seo-scan 与各方向 agent 的来源）
- 外部：guohaonan-shy/Tofelair#530（这条误报的实例）、guohaonan-shy/Tofelair#548（Toeflair 那边的核实记录）
- 相邻还没完成的 spec 与 issue：查过 open issue 与 `docs/spec/`，seo 相关的只有本 issue；`idea-loop-seo` 的功能已经上线（它的 #72 已关闭，spec 还停在「正式」等 dreaming 对账），本 spec 只改它产出的一条判定规则，不重叠，也不用等它
