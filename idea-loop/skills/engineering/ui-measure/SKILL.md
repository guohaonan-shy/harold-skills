---
name: ui-measure
description: 把实现和冻结的设计画布逐格比对，让「像不像」变成一个会红的测试：三条环境约定、默认容差、矩阵怎么写、怎么跑、什么时候停。实现 UI 工单、review 时对画布、冻结时定容差时用。
---

两个标签页，一边是冻结的画布，一边是项目里的实现，按验收矩阵逐格比。判据是 `scripts/ui-measure.mjs`，不是另一个模型的意见：差多少、差在哪，出来的是一串带严重度的 finding。

## 三条环境约定

两个 tab 比的必须是同一个东西，否则比对没有价值。这三条**由写画布的那一段（`uiux-refine`）执行**，实现侧负责不破坏它们。

1. **锚点**：画布里的块和关键元素带稳定的 `data-anchor` 属性。**port 到项目框架时必须原样保留**（跟 test id 同理）——两个 DOM 靠它对齐。锚点丢了，测量层报的是最高严重度的缺失 finding，不是"差一点"。
2. **渲染环境一致**：画布的字体走**目标项目自己的加载方式**（自托管文件或项目已有链路），**不走公共 CDN**；两个 tab 同 viewport、同 DPR、同色彩模式；截图前等 `document.fonts.ready`，并关闭动画与过渡。
3. **状态格靠 URL，且只在 dev 存在**：画布每个状态是一帧，用 `?state=<名字>` 切；本地侧由项目里只在 dev 存在的状态 harness 提供同名状态（实现侧怎么搭，是 `implement` 的 UI 工单做法）。冻结摘要的矩阵每格记状态名，脚本按名拼 URL。**harness 覆盖不了的格标「人看」，不假装绿。**

## 默认容差

写在这里，**ticket 可以按格覆盖**，覆盖要在 ticket 里写明理由。

| 属性类别 | 判据 |
|---|---|
| 位置类（top / left / width / height / padding / margin / gap） | **±1px** |
| token 类（颜色、字号、行高、字重、字距、圆角、边框、阴影、透明度） | **精确匹配**，不吃容差 |
| 像素层每格 mismatch | **≤ 1%** |
| 抗锯齿容差 | 与位置容差**是两个概念**，各走各的：位置容差说"这个盒子可以偏一个像素"，抗锯齿容差说"这两个像素在光栅化意义上是同一个颜色"。默认取感知色距 0.1（YIQ 归一化，与 pixelmatch 同源）。 |

"颜色差一个色阶"是一条 finding，不是舍入误差——差一个色阶意味着用错了 token。

## 矩阵怎么写

矩阵是一份 JSON，喂给测量脚本。`canvas` 指画布的本地 URL，`local` 指项目 dev server 上的 harness 路由：

```json
{
  "canvas": "http://localhost:8000/canvas/settings.html",
  "local": "http://localhost:5173/__design/settings",
  "dpr": 2,
  "tolerance": { "position": 1, "antialias": 0.1, "pixel": 1 },
  "cells": [
    { "name": "desktop/light/default", "viewport": { "width": 1440, "height": 900 }, "colorScheme": "light", "state": "default" },
    { "name": "mobile/dark/empty", "viewport": { "width": 390, "height": 844 }, "colorScheme": "dark", "state": "empty",
      "tolerance": { "pixel": 2 }, "byAnchor": { "chart": { "position": 3 } } },
    { "name": "desktop/light/live-data", "viewport": { "width": 1440, "height": 900 }, "state": "live", "review": "human" }
  ]
}
```

- 格的 `name` 用在每条 finding 的位置字段里，写得让人一眼知道是哪一格。
- `review: "human"` 的格脚本**跳过**，单独列出来，不计入绿。
- 像素层看的是 **viewport 那一帧**（不是整页），所以两张截图必然同尺寸；折叠线以下的覆盖靠锚点，需要单独看就再加一格。

## 跑，然后照 finding 改

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-measure.mjs" matrix.json        # 人读
node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-measure.mjs" matrix.json --json  # 机读
```

退出码：`0` 全绿，`2` 有 finding。

finding 的形状与本仓库 lint 输出同构，字段是闭集：

| 字段 | 含义 |
|---|---|
| `id` | 缺陷类型，闭集：`missing-anchor` / `position-drift` / `token-mismatch` / `pixel-mismatch` |
| `severity` | `P0` / `P1` / `P2` |
| `cell` · `anchor` · `property` | 位置：哪一格、哪个锚点、哪个属性 |
| `expected` · `actual` · `delta` · `detail` | 缺陷：画布是多少、你的实现是多少、差多少 |
| `why` | 这条为什么算缺陷 |

严重度是机械的，不是感觉：

- **P0 `missing-anchor`** —— 画布有这个锚点、你的路由上没有。**两边根本不在比同一个东西**，这一格其余所有数字都不作数，先修它。
- **P1 `position-drift` / `token-mismatch`** —— 测量层报的，点名了锚点和属性，改哪里是明确的。
- **P2 `pixel-mismatch`** —— 像素层报的兜底，它知道有东西不一样但说不出是什么。要么在那儿补一个锚点让测量层接手，要么解释为什么这个差异是可以接受的。

**测量层为主，像素层为辅**：像素层永远不压过一条点名了锚点的 finding。

## 终止条件

- **全绿**：finding 为空（`review: human` 的格不算绿，它们等人看）。
- **瓶颈**：**同一批 finding 两轮不变**——脚本自己判（比对上一轮的缺陷指纹，不是比对数字），判到了就在输出里打「瓶颈」。这时**停下交人**，并说明你判断残留差异是哪一种：
  - **实现问题** —— 还没找到对的做法，人来看一眼。
  - **设计决策** —— 项目的组件库出不了那个样子。这种回 `uiux-refine` 把设计弯一下并记进 ledger，**不在 implement 里硬磨**。
- 不设轮数上限。瓶颈是机械判定，不需要拍一个"最多修三轮"。

## 触发时机

- **在 TDD 环里主动跑**，它就是「视觉正确性」那一行的红绿测试，跟真 DB 测试、eval 同级。
- **不挂在每次 Write/Edit 的 hook 上**：它要一个跑着的 dev server、每次要几秒、而且半成品状态下会大片假红——挂上去只会训练你忽略它。
- 收工时那一道检查**只查一件事：最后一轮是绿的**（或者剩下的都是标了「人看」的格）。
