---
type: raw
source_type: conversation
captured: 2026-11-19
title: ui-measure 矩阵缺口：margin/gap 与 pixelAnchor 两道题
tags: [idea-loop-decisions, ui-measure-matrix-gaps]
related: ["[[ui-measure-matrix-gaps]]"]
---

U 是人的原话（这次是两道单选题的选择），A 是 AI 的结论。issue #223 的 triage 会话。

## A1

实测（Playwright 无头 Chromium 158）坐实三处：oklch 的计算值原样输出 oklch、hex 输出 rgb，字符串永远不等；一行字挪 0.4px 像素层报 4.30%，加邻域比对后 0.29%，挪 2px 仍有 3.55%；margin-top 与 margin-bottom 排出的同一位置盒子 top 都是 120，测量层却会报两条 position-drift。照现有规则直接定的三处：颜色换算成 8 位 sRGB 后精确比，不放宽；邻域比对半径固定 1 个物理像素，归抗锯齿一类；减弱动效照 `colorScheme` 的写法加 `reducedMotion`。

提了两道题：margin/gap 怎么改（不再比 / 盒子没偏就不报 / 不改）；像素层「只截一个锚点区域」的字段叫什么（`pixelAnchor` / `clip`）。

## U1

不再比 margin 和 gap（推荐）

## U2

pixelAnchor（推荐）

## 本轮决议

| 议题 | 决议 |
|---|---|
| margin / gap | 从测量属性里删掉，位置只看锚点盒子；padding 照比 |
| 锚点区域像素比对的字段名 | `pixelAnchor` |
