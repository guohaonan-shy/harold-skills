---
type: adr
status: 生效
tags: [idea-loop, design-archive, design-archive-loaded-sections]
summary: 比主视口高、不分段的状态，首屏以下会连出边的组件按屏补拍进截图，边用 shot 指向图
related: ["[[69]]", "[[2026-10-26-sections-below-fold-interactions]]", "[[0004-design-archive-sections]]"]
---

# ADR-0046 — 设计档案：首屏以下会连出边的组件，按屏补拍进截图

> 由 spec `design-archive-loaded-sections` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

一打开就要请求数据的长页面（报告页），入口状态是「加载中」骨架，加载完是另一个状态，从入口经一条 `system` 边过去。这个「加载完」状态比主视口高得多，但档案只给不分段的状态拍一张主视口图；首屏以下的按钮、链接照样连出边（例如写作报告详评里的「查看范文」、页脚链接），可这些边的组件在哪、长什么样，任何一张图里都没有，只能靠文字描述。

真实页面的高度（取自 issue #69 正文，2026-10-21 一个真实项目的全站初扫）：写作报告约 3500px，面试报告约 4770px，听后复述报告约 2200px，三页都只拍到首屏。

issue 原先的想法是让加载完的状态也能声明分段，2026-11-12 对着当时的树复现，这条路走不通：把夹具里的长营销页改成报告页的形状后，校验规则 7 报了 9 条违规（`sections` 只许写在入口状态，挂在段上的 `from`、`section` 全部失效），`measure` 退出码 2「不是入口状态」，不分段又只有 `screen` 一张主视口图。

根因是截图规则只按页面高度分两种：不比主视口高的拍一张，比主视口高的分段，而分段又绑在入口状态上。不是入口、又比主视口高的状态没人想到，落进了「拍一张主视口图」。档案里也没有一条规则说「边的组件要在图里」，漏拍了，校验和对账都发现不了。

## 2 决策（how）

2026-11-13 人推翻了 issue 的手段：分段适合营销页的结构组织，这里要守的是「如果有交互导致设计内容需要出边，截图就要包含可交互的组件」。所以：

- **守的是「会连出边的组件进截图」，不放开分段。** 分段规则（规则 7、`sections` 只写在入口状态）一点不动。
- **一个不分段、比主视口高的状态：主视口图之外，首屏以下每个会连出边的组件，按屏合并进补拍图。** 几个组件装得进一屏的共用一张。选「按屏合并」而不是一条边一张图，理由是图少、页脚那种成排链接不会拍出一堆重复图；代价是页面内容变了、分组会跟着变，对账时要重写 `shot`，这个代价已经说给人。
- **补拍图叫 `<状态 id>@<这一屏第一条边的 id>.png`**，用边 id 不用屏的序号：内容往上加一屏时序号会整体错位，边 id 不会；分段图 `<状态 id>@<段 id>.png` 已经是这个形状。
- **`user` 边可写 `shot`**，指向它的组件所在的补拍图；没写 `shot` 的边，组件就在主视口图里。校验加规则 8「边的截图」：`shot` 的写法是 `<出发状态 id>@<边 id>.png`、边 id 得是出发状态的边、不能写在声明了 `sections` 的状态上、不能写在 `system` 边上；几条边指向同一张图允许；图文件在不在不查（图可能是 LFS 指针，在不在由查询的 `shotExists` 报），跟分段图一样。
- **新命令 `cover` 在状态已经走到的那一屏上跑**，不重载页面、不拨页面时间（跟 `screen` 一样，点出来的状态一重载就丢）；用每条边的 `locate` 找组件，找不到或不唯一的列进 `unlocated`，退出码 1。放在现有的 `design-archive-sections.mjs`，复用 `shoot` 的拍法，不新做组件。
- **「组件在不在首屏里」由浏览器当场量，不由校验判**：只有量了才知道有没有组件落在主视口外，校验只核对写出来的 `shot` 对不对。每屏起点在第一个组件上沿往上 1/4 个主视口高，页面底部不够一屏时起点往上收，让图仍是整屏高，这样补拍图跟主视口图同尺寸，才好逐张对账。
- **「算在首屏里」的判法是实际画面**：组件的盒子整个在主视口高度以内，且在组件真正画出来的地方取点问浏览器「这一点最上面是谁」，每一点都得是组件自己。被底部栏、浮层、容器下沿盖住或裁掉一部分、或只露出一半的，都要补拍。起草时写的是「整个落在主视口高度以内」，review 前三轮每轮出现一种新的盖住写法（贴底栏、叠在内容区上的标签栏、容器下沿裁掉），第四轮又出圆角和折行链接外接矩形里没字的角被误判，所以不再按栏的写法逐种列举，改成问浏览器。
- **拍图手册、对账、初扫都加这一步**：`shooting.md` 加「比主视口高、不分段的状态」一种情形；dreaming 对账与合并前归档拍单屏状态的地方都跑 `cover`，补拍图逐张跟 `prod/` 里同名的图比；`cover` 合出来的分组跟 `prod/` 里不一样，算「档案过期」，按新分组重写 `shot`。
- **取舍**：没放开分段（issue 原提议，人撤回，因为营销页的结构组织和报告页的交互出边是两件事）；没做「一条边一张图」（图太多）；没给没有连出边的纯展示内容补拍（没有真实例子说明需要，记成已知限制）；顶部被贴顶固定栏压住的组件不查（用户在任何滚动位置都点不到它，不会有边从它连出，也是已知限制）。

## 3 结果（result）

- `idea-loop/scripts/design-archive-sections.mjs`：`cover` 子命令（`coverScreens` 分屏纯函数、`buildCoverCode`、`coverCommand`；声明了 `sections` 的状态退出码 2）。落地时又加了 `--delta <spec-slug>`：状态或边还只在 `delta/` 里（合并前归档、初扫的草稿）时，`cover` 也读得到，这是 spec 里没写、工单阶段补的。
- `idea-loop/scripts/design-archive-check.mjs`：规则 8 `shotRules`，违规名称「边的截图」。`idea-loop/scripts/design-archive-query.mjs`：`state` / `page` 里每条边多带 `shot`、`shotExists`。
- 文档：`design-archive` 的 `references/shooting.md`（命令与「比主视口高、不分段的状态」）、`review-reconcile.md`、`review-archive.md`、`writing.md`、`check.md`、`query.md`；`dreaming` 的 `references/initial-scan.md`。
- 守护它的测试：`design-archive-check.test.mjs`（规则 8 一组，夹具 `shotFiles()`）、`design-archive-sections.test.mjs`（`coverScreens` 的合并、余量、贴底、盖住判定）、`design-archive-sections-browser.test.mjs`（真 Chromium 里的 `cover`，默认跳过，设 `IDEA_LOOP_BROWSER_TESTS=1` 单独跑，见 [[0078-sections-browser-test-out-of-full-suite]]）、`design-archive-sections-doc.test.mjs`（各处拍单屏状态的地方都有 `cover` 的命令行、对账写了分组变了算档案过期）、`design-archive-query.test.mjs`。
- 合并在 PR #300「设计档案：首屏以下会连出边的组件，要出现在截图里」（review 4 轮；决定记录进 PR #310）。issue #69 已 COMPLETED 关闭（2026-11-13）。

**与 ADR-0004、0005 的关系：** 分段的规则（只写在入口状态、规则 7）照旧有效；本条是分段之外给「不分段、比主视口高」的状态补的第二条路。
