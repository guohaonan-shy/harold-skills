---
type: spec
tags: [idea-loop, design-archive]
summary: 入口是加载中的长页面，改由加载完的状态声明分段
related: []
issues: [69]
---

# 设计档案：入口是加载中的长页面，由加载完的状态声明分段

> #69 存在：一打开就要请求数据的长页面（报告页），按规则入口是「加载中」骨架，真正长的「加载完」状态写 `sections` 会被校验判违规，`measure` 也拒绝量它，详情在「问题陈述」

## 问题陈述

### 报告页写不出分段

设计档案（`idea-loop:design-archive`）里有两条规则，对着 origin/main `a7c8129`（2026-11-12）查：

- 「入口是加载中」（`references/writing.md`「建模的取舍」）：页面一打开就发请求的，入口状态是加载中那一屏，加载完、加载失败各用一条 `system` 边连出去，回到这个页面的边都指向加载中。
- 「`sections` 只写在入口状态，一页只由一个入口状态声明」（`SKILL.md`「分段」）。校验脚本 `design-archive-check.mjs` 的规则 7 和 `design-archive-sections.mjs measure` 都按这条查。

两条合起来，报告页只有骨架那一屏能声明分段，可骨架用不着分段；真正长的「加载完」不能声明。结果是首屏以下的内容只能用文字写，首屏以下的可点组件连出去的边没有出发段可挂，段里的交互状态也写不成 `section`。

实测（issue 正文，Toeflair 2026-10-21 全站初扫）：写作报告约 3500px、面试报告约 4770px、听后复述报告约 2200px，都只拍到加载完的首屏。这三页不在本仓库，没法在这里核对。

本次复现（2026-11-12，对着 `a7c8129`）：拿测试夹具里的长营销页 `mkt-pricing` 改成报告页的样子：入口 `mkt-pricing--entry` 改成加载中骨架，不分段，只有一条 `system` 边连到新加的 `mkt-pricing--loaded`；五段分段和全部用户边挪到 `mkt-pricing--loaded` 上，别的页面跳进来的边照规则仍指向入口、落在 `#feature-b`。

- 校验退出码 1，报 9 条规则 7 违规，没有别的规则报错：`mkt-pricing--loaded` 不是入口，不能写 `sections`；它的 5 条用户边的 `from` 全部「没有声明过」；页内锚点的落点要求目标是入口；段内状态 `mkt-pricing--feature-b-expanded` 的 `section` 和跨页跳进来那条边的 `section` 都「没有声明过（入口状态没有 sections）」。
- `measure <仓库根> mkt-pricing--loaded` 退出码 2：「不是入口状态：只有入口状态声明 sections」。

应该是：加载完声明这五段，这些引用全部成立，`measure` 能量它。

复现材料：`.tmp/to-spec/design-archive-loaded-sections/repro/`（`repro.mjs`、`check.txt`、`measure.txt`，不提交）。分拣评论：https://github.com/guohaonan-shy/harold-skills/issues/69 （「🤖 idea-loop：」那条，结论一致）。

### 根因

分段建模时假定页面一打开看到的就是长内容，所以把「声明分段的状态」直接等同于「入口状态」：校验、`measure`、查询（`sectionEntries` 只认有 `entry` 的状态）都用「是不是入口」来找这一页的分段。后来加的「入口是加载中」让这两者在报告页上分开了，没人把分段的归属跟着改。

## 方案

改完后：入口是加载中的长页面，由加载完的那个状态声明分段。首屏以下的每个可点组件连出去的边都挂在一段上（`from: <页面>#<段>`，那一段有图），段内交互的状态写 `section`，`measure` 能量加载完那一屏。入口本身就是长页面的，跟现在完全一样。

**声明分段的状态**（下文简称「分段状态」）是一页里写了 `sections` 的那一个状态。它只能是以下两种之一：

- 入口状态（现状）；
- 从这一页的入口状态出发、只经过 `system` 边（不带 `blocked`）能到的状态，也就是加载完。

一页仍只有一个分段状态，`<页面>#<段>` 仍指向唯一一处。

依据：人定于 2026-11-12，选「入口或加载完」。理由是这一档已经覆盖三个报告页，量的时候打开入口、放行请求就能到；放开到任意状态还得回放点击路径，三个报告页都用不上。人当初的顾虑是首屏以下的可点组件连出去的边不准，这一档用已有的「分段状态上的用户边必写 `from`」解决了。

跟着分段状态改的引用规则（规则 7）：

| 引用 | 现在 | 改成 |
|---|---|---|
| `sections` 写在哪 | 只在入口状态 | 在分段状态（入口，或从入口只经 system 边能到的状态）；写在别的状态上报违规，提示里说明这两种 |
| 一页几个 | 两个入口都写报违规 | 两个状态都写就报违规（不论是不是入口） |
| 用户边的 `from` | 有分段的入口上必写 | 分段状态上必写 |
| 边的 `section`（落点） | 目标必须是入口状态 | 目标必须是这一页的分段状态，或这一页的入口状态（跨页跳进来照规则指向加载中，落点理解为加载完之后落到那一段） |
| 状态的 `section` | 入口状态不写 | 分段状态不写；入口不是分段状态时，入口也不写（骨架不在任何一段里） |

`measure`：分段状态不是入口时，`measure <仓库根> <分段状态 id>` 接受它，**不重载页面**（重载会回到加载中）。agent 先照它的进入方式走到这一屏（`time` 装好页面时间，打开入口的 URL，放行请求，等加载完），再跑打印出的代码。页面时间没在打开前装好的，照现有的「装晚了」报。初扫时档案里还没有这个状态，第二种形式 `--state <id> --page <页面> --sections-file` 照旧可用，不做检查。

查询：`page` 的 `sections[].declaredBy` 改为分段状态的 id（现在是入口状态的 id）。截图名照旧是 `<分段状态 id>@<段 id>.png`，放在分段状态同目录的 `assets/` 里。

同一行为的其他入口：

- 校验规则 7（`design-archive-check.mjs`）和它的提示：纳入。
- `measure`（`design-archive-sections.mjs`）：纳入；`attribute`、`shoot` 用 `measure` 的结果，不单独改。
- 查询（`design-archive-query.mjs` 和 MCP 的 `design_page`）：纳入，`declaredBy` 的含义改一句。
- `diff`（delta 对 prod 的分段比对）：按状态文件逐个比，分段状态是谁不影响它。排除。
- 给 agent 读的说明，把「入口状态声明分段」改成「分段状态」：纳入。涉及 `design-archive` 的 `SKILL.md`「分段」、`references/writing.md`（分段、边的 `from` / `section`、状态文件按段排开、截图命名）、`references/check.md` 规则 7、`references/shooting.md`（情形怎么选、长页面的入口状态）、`references/query.md`、`references/review-archive.md`、`references/review-reconcile.md`，以及 `dreaming` 的 `references/initial-scan.md` 第 7 步。这些文档的读者是 ui-reviewer、design-steward、dreaming 的初扫，都在「入口状态」这个词上找分段规则。改法：在 `SKILL.md`「分段」定义一次「分段状态」，其余文件只换叫法，不各自重复定义。

## User Stories

1. 期望行为：入口是加载中的长页面，在加载完的状态上写 `sections`，五段分段、五条带 `from` 的用户边、页内锚点、段内状态的 `section`、别的页面跳到入口并落在某一段的边，校验全部通过；`measure` 能量这个加载完状态，不重载页面。入口本身就是长页面的档案，校验结果和现在一字不差。

## 实现决策

- **谁能当分段状态**：入口，或从入口只经 `system` 边（不带 `blocked`）能到的状态。依据：人定于 2026-11-12（见「方案」）。从入口经过任何一条 `user` 边才能到的状态写 `sections`，报规则 7 违规，提示写「只写在入口状态或加载完的状态（从入口只经 system 边能到）上」。
- **「只经 system 边能到」怎么判**：在同一页的状态里，从这一页的入口状态出发，沿 `kind: system`、不带 `blocked` 的边做可达。依据：「入口是加载中」规定加载完、加载失败各用一条 `system` 边连出去；跨页的边不算，因为分段属于一页。一页有多个入口时，从任一入口出发能到就算。
- **分段状态的找法**集中在一处：现在的 `sectionEntries` / `sectionsOfPage` 改成按「一页里写了 `sections` 的状态」找，校验、查询、`measure` 都用它，不在三处各判一次。
- **跨页落点**：边的 `section` 指向入口状态时，按这一页分段状态的分段来核。依据：`writing.md`「回到这个页面的边都指向加载中」，跨页的边只能指向入口，不放开就写不出跳进报告页某一段的边。
- **`measure` 不重载**：分段状态不是入口时，`reload` 关掉，跟 `--for` 段内状态同一个分支。依据：重载会回到加载中；入口是分段状态时行为不变。
- **改的都是现有文件，不加新组件**：沿用规则 7、`measure` 和查询。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 规则 7 的分段状态判定、引用核对；`measure` 的参数检查与 `reload`；查询的 `declaredBy`。先在现状上红 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了给 agent 读的说明，只换叫法、不改流程；验收用文档测试（`SKILL.md`「分段」里有「分段状态」的定义，各参考里不再写「只有入口状态声明分段」），不加回放用例 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及；`measure` 打印的浏览器代码不改，`design-archive-sections-browser.test.mjs` 照旧跑（它在 darwin 本机跑全量时会卡住，见 #192，单独跑它） |

- **seam**：两个 CLI 加查询函数。`design-archive-check.mjs`（喂一个档案目录，读违规列表）能抓到引用规则改错、旧档案的判定变了；漏掉 agent 实际怎么写档案。`design-archive-sections.mjs measure`（喂档案和状态 id，读退出码和打印的配置）能抓到拒绝 / 接受、是否重载；漏掉真实浏览器里走到加载完这一步。查询直接调 `design-archive-query.mjs` 的 `page`，读 `sections[].declaredBy`。
- **增量功能测试**：
  - 前置：长营销页夹具改成报告页形状（入口是加载中、一条 system 边到加载完，分段和用户边在加载完上，跨页边指向入口并落在一段）。步骤：跑校验。期望：没有违规。覆盖：期望行为 1。
  - 同一夹具，在段内状态（经 user 边才到的状态）上也写 `sections`。期望：一条规则 7 违规，点名文件和 `sections`，提示里说明入口或加载完两种。
  - 同一夹具，入口和加载完都写 `sections`。期望：一条规则 7 违规，说一页只能有一个分段状态。
  - 同一夹具，`measure <根> mkt-pricing--loaded`。期望：退出码 0，打印的配置不重载；`measure <根> mkt-pricing--feature-b-expanded`（经 user 边才到）退出码 2。
  - 现有夹具 `marketingFiles()`（入口自己分段）：校验、`measure`、查询的结果跟改前一样。
- **照着谁写**：`idea-loop/scripts/design-archive-check.test.mjs` 的「rule 7」一组（`bendMkt` + `BREAKS` 表）；`design-archive-sections.test.mjs` 里 `measure` 的 CLI 用例；`design-archive-query.test.mjs` 的 `page` 用例；文档测试照 `design-archive-sections-doc.test.mjs`。

## Out of scope

- 从入口经 `user` 边才能到的状态声明分段（点了「展开全部」才变长的页面）：人定只放开到加载完；这种页面点开后长出来的那块，按现有规则是分段状态某一段里的交互状态。
- 已知限制：加载失败、空结果也是从入口只经 system 边能到的状态，规则上允许它声明分段。一页只能有一个分段状态，所以不会撞，也没有真实页面需要拦，不另加限制。

## 关联

- raw：无（从 issue 起草，讨论在本会话，结论已写进「方案」的依据）。
- 相关 spec：无。
- 相邻未完成的 issue 与 PR：
  - #128（随滚动变的窄侧栏被认成滚动驱动）：同在分段这一块，它改 `scrollDriven` 的判定，这里改谁来声明分段，内容不重叠，都要改 `design-archive-check.mjs` 规则 7 附近和 `SKILL.md`「分段」，谁先合，后一个照着 rebase。
  - #192（sections 浏览器测试在 darwin 本机卡住）：只影响验证怎么跑，见「测试决策」。
  - PR #250（把 idea-loop 拆成三个插件）：会搬动 `design-archive` 的文件位置；这份 spec 写的是文件名和小节名，不写目录前缀，谁先合，后一个照新位置改。
