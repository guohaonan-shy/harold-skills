---
type: raw
source_type: conversation
captured: 2026-10-26
title: #65 拍不稳的段：复现、对上 TOEFLAIR 营销站的组件、人把两条待定交给推荐
tags: [idea-loop-decisions, design-archive-unstable-sections]
related: ["[[design-archive-unstable-sections]]"]
---

U 是人的原话，A 是 AI 的结论（取证过程略去，复现材料在 spec 里指出）。

## A1

在主分支（#67 合进来的每段单独截、冻结页面时钟的拍法）上用夹具复现了四类段：滚动驱动段只存第 1 步加大片空白；悬停暂停的轮播在段内状态里拍成了另一个标签；脚本动画和自动轮播两次拍出来差 4.04% / 2.67%，对账误报；三处兜底都靠 `stable`，冻结后它必然为真，没有起作用。原型验证了「页面时钟加载前就停住、按固定步长拨」能让两次一致。spec 起草成审核中，两条待定：滚动驱动段怎么建（推荐每一步建成段内状态），不分段的单屏状态要不要一起换拍法（推荐一起换）。

## U1

这些case是针对当时在toeflair项目里的什么内容开设的？

## A2

对到了 TOEFLAIR 营销站的组件：讲三步的段是 /listen-repeat 的 `CauseLayers`（滚轮接管的传送带），演示段下面的空白是 /email-writing 的 `EmailFeedbackProof`（GSAP 钉住、按滚动位置逐条点亮），首屏内嵌动画是四个题型页的 `HeroShowcase`（iframe 里 `setTimeout` 循环），悬停暂停的标签是 /interview 的 `InterviewFeatures`（/toefl-score 的 `speaking-tabs` 同一写法）。

两处要改 spec：真实的标签是 CSS 进度线动画播完（`animationend`）才切，截图的 `animations: 'disabled'` 会把它快进到底、当场切走，页面时钟管不到；滚动驱动段在档案里已经有两种凑合的做法（L&R 第二张建成了状态、用户边「向下滚一次滚轮」；Email Writing 写成「不算状态」加一张全亮的主视口图），待定该用这两段当例子。

## U2

这块内容我对于前端不是很懂，全部交给你了，你直接开始按照推荐to-spec、拆分工单实现以及合并吧

## A3

原型补验了 CSS 动画：只停页面时钟时，CSS 进度线驱动的标签两次停在不同的标签、点出来的状态也被切走；把文档的动画时间线也停住（CDP `Animation.setPlaybackRate` 0），每拨一步页面时钟就把每个动画的时间拨同样多，两次一致、点出来的状态拍对。两条待定按推荐定下，spec 定稿。

## 本轮决议

| 议题 | 决议 |
|---|---|
| 滚动驱动的段怎么建 | 每一步建成段内状态（推荐的 A）；人原话「全部交给你了，你直接开始按照推荐」 |
| 不分段的单屏状态要不要一起换拍法 | 一起换（推荐的 A）；依据同上 |
| CSS 动画播完就切换的组件 | 纳入：CSS 动画的时间线跟页面时钟一起停、一起拨，拍图不再用 `animations: 'disabled'` |
| 合并 | 人授权到合并为止：「拆分工单实现以及合并吧」 |
