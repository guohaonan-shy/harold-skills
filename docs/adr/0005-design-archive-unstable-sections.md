---
type: adr
status: 生效
tags: [idea-loop, ui-archive, sections]
summary: 分段拍图把页面时钟与 CSS 动画时间线都停住、只按固定步长拨，拍不稳的段改用 uncontrolled 信号，滚动驱动的段每步建成状态
related: ["[[2026-10-26-unstable-sections]]", "[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0005 — 设计档案：拍不稳的段怎么稳定取证

> 由 spec `design-archive-unstable-sections` 蒸馏而来，该 spec 已删除。
> 在 ADR-0004（`design-archive-sections`）的拍图一节上改，不改「一张图、不考虑动效」这条决定。

## 1 背景（why）

2026-10-26 对着「每段单独截、冻结页面时钟」的分段拍法，用一个夹具页复现了四类拍不稳的段（夹具照一个真实营销站的组件写，对照见 [[2026-10-26-unstable-sections]]）：

- **钉住随滚动切换的段**：段高 2400px，只有一屏钉在视口里，截整个文档范围得到「第 1 步加约 1600px 空白」，第 2、3 步档案里没有图；两次像素差 0.00%，对账判一致，改坏了也看不出。
- **悬停才暂停的轮播**：点出来的标签状态，因为测量和拍图都要滚动、鼠标离开，轮播恢复，存进档案的「Speak 状态」画的是 Listen。真实站点上的标签靠 CSS 进度线动画播完才切，页面时钟管不到，截图的 `animations: 'disabled'` 还会把它快进到底、当场切走。
- **脚本动画与自动轮播**：同一页面拍两次，各停在不同一刻，像素差 4.04% / 2.67%，对账误报。
- 原有兜底全靠 `stable`，但它比的是冻结之后的两张，必然为真，三处文档里的兜底都没起作用。

## 2 决策（how）

- **页面时间在页面打开之前就停住，之后只按固定步长拨。** 两条时间一起管：页面时钟（计时器、`requestAnimationFrame`、`Date`、`performance.now`）和文档的 CSS 动画时间线（Chromium 的 `Animation.setPlaybackRate` 置 0）。「拨一步」= 时钟往前走 N 毫秒，同时把每个还没播完的动画的当前时间加 N，于是动画正常播完、正常触发结束事件，只是发生在固定的页面时间。拍图不拨时间，也不再用 `animations: 'disabled'`。只有 Chromium（DevTools 协议）。
- **新增「装时间」一步**：`browser_navigate` 到入口之后、做交互之前先跑；一个页面一次会话装一次。点出来的状态由 agent 交互，之后要等界面变化时用小步拨，拨到「应看到什么」成立为止。
- **「还是拍不稳」换一个信号：** 每张图拍完，时间不拨、隔 500ms 再截一张，两张不同说明有页面时间管不到的东西在动（视频、WebGL、网络推送），`shoot` 返回 `uncontrolled: true` 并带差异区域框，替换 `stable`。标出的段：写档案时在「这一屏」里注明「截图是某一刻」；对账时容差外先按「应看到什么」逐条核，都成立判一致、交回注明没按像素比，不再「再拍一次」。
- **测量时检出滚动驱动的段**（钉住的容器比视口高，且不同滚动位置可见文字不同），分段声明加可选字段 `scrollDriven: true`（只能写 `true`）；检出了却没声明，`attribute` 退出码 1，与落空、重叠同样「不处理就会存下错图」，所以拦。
- **滚动驱动的段每一步建成一个段内状态**（选项是继续整段拍，否掉的理由是只会得到第 1 步加空白）：入口这一段的图是第 1 步，只截钉住的那一屏；第 2 步起每步一个状态，写 `section`；滚轮一下换一张写 `user` 边，按滚动位置切换写 `system` 边；结构相同的步骤只记第一个。这些状态用单独的拍图命令按此刻视口直接截。
- **不分段的单屏状态一起换拍法**（首屏有自动轮播的页同样误报），用同一套代码把它当一段、范围是主视口。那段关动画样式只留在 UI 实现环的 `ui-measure` 里。

人的原话是「全部交给你了，你直接开始按照推荐」，所以滚动驱动段的建法与单屏状态一起换，是按推荐定的。

## 3 结果（result）

- `idea-loop/scripts/design-archive-sections.mjs` 有子命令 `time`（装时间）、`step`（拨一步）、`measure`（含滚动驱动检出，`attribute` 的 `undeclaredScrollDriven`）、`shoot`（返回 `uncontrolled`）、`screen`（单屏状态）、`pinned`（按此刻视口直接截）。真 Chromium 浏览器测试覆盖脚本动画、计时器轮播、CSS 进度线轮播、点出来的标签、钉住的段、Worker 驱动的段。
- 校验规则 7 认 `scrollDriven`，只能写 `true`。
- 文档：`design-archive` skill 的 `references/shooting.md`（「共用的规矩」「滚动驱动的段」「看到什么 → 做什么」），`review-reconcile.md`（`uncontrolled` 的对账判法）、`review-archive.md`、dreaming 的 `initial-scan.md` 都已改用新信号。

**已知限制（原 spec 的 Out of scope，仍有效）：** 页面时间管不到的内容只检出不做到按像素比；随滚动变的窄侧栏会让整段被认成滚动驱动、没有「不是滚动驱动」的声明（issue #128，仍开着，status:triage）；入口是加载中的长页面不能分段（issue #69，仍开着，status:triage）。
