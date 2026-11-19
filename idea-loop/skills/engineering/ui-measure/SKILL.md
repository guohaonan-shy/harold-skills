---
name: ui-measure
description: 把 UI 实现和冻结的设计画布逐格测量比对，让「像不像」变成一个会红的测试。实现 UI 工单、review 时对画布、冻结时定容差时用。
---

两个标签页，一边是冻结的画布，一边是项目里的实现，按验收矩阵逐格比。判据是 `dyna ui measure`，不是另一个模型的意见：差多少、差在哪，输出一串带严重度的发现（finding）。它就是测试决策里「视觉正确性」那一行的红绿测试，在实现的红绿环里主动跑。

## 三条环境约定

两个标签页比的必须是同一个东西。写画布的那一段（`/idea-loop:uiux-refine`）执行这三条，实现侧原样保持。这三条只给 UI 实现环；设计档案的拍图不用，拍法见 `idea-loop:design-archive` 的「拍档案截图」。

1. **锚点**：画布里的块和关键元素带稳定的 `data-anchor` 属性。移植到项目框架时原样保留（跟 test id 同理），两个 DOM 靠它对齐。锚点丢了，报的是最高严重度的缺失，不是「差一点」。
2. **渲染环境一致**：画布的字体走目标项目自己的加载方式（自托管文件或项目已有链路），不走公共 CDN；两个标签页同 viewport、同 DPR、同色彩模式；截图前等 `document.fonts.ready`，并关闭动画与过渡。
3. **状态格靠 URL，且只在开发构建里存在**：画布每个状态是一帧，用 `?state=<名字>` 切；实现侧由项目里一条只在开发构建里注册的路由（下文叫状态路由）提供同名状态。冻结摘要的矩阵每格记状态名，脚本按名拼 URL。状态路由覆盖不了的格标「人看」，不算绿。

## 默认容差

工单可以按格覆盖，覆盖要在工单里写明理由。

| 属性类别 | 判据 |
|---|---|
| 位置类（top / left / width / height / padding / margin / gap） | ±1px |
| token 类（颜色、字号、行高、字重、字距、圆角、边框、阴影、透明度） | 精确匹配 |
| 像素层每格差异 | ≤ 1% |
| 抗锯齿 | 感知色距 0.1（YIQ 归一化，与 pixelmatch 同源）：两个像素在光栅化意义上算同一个颜色。它跟位置容差是两回事，各管各的 |

颜色差一个色阶是一条发现，不是舍入误差：它意味着用错了 token。

## 矩阵怎么写

矩阵是一份 JSON，喂给测量脚本。`canvas` 指画布的本地 URL，`local` 指项目开发服务器上的状态路由：

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

- 格的 `name` 出现在每条发现的位置字段里，写得让人一眼知道是哪一格。
- `review: "human"` 的格脚本跳过，单独列出来，不计入绿。
- 像素层看的是 viewport 那一帧（不是整页）；折叠线以下靠锚点覆盖，要单独看就再加一格。

## 跑，然后照发现改

```
dyna ui measure matrix.json        # 人读
dyna ui measure matrix.json --json  # 机读
dyna ui measure en-light.json zh-light.json en-dark.json zh-dark.json --json  # 多份矩阵
```

它驱动机器上的 Chrome 或 Chromium（找不到再用 Playwright 缓存里的 chromium，或用 `IDEA_LOOP_CHROME` 指定），项目里不用装 playwright。多份矩阵（语言 × 深浅色这类）一次交给同一条命令：脚本只开一个浏览器，每份矩阵一个独立的上下文；同时跑几份由脚本按本机此刻的可用内存（每份约 0.5 GiB，外加浏览器约 0.6 GiB）和空闲 CPU（每份约 1 核）自己定，最多 4 份，定下的份数和依据打在 stderr 第一行。机器忙时它会降到 1 份：CPU 不够时同时跑，测量层不受影响，但像素差会在 1% 阈值附近抖。`--concurrency N` 可以强行指定，同样不超过 4。不要每份矩阵各开一个进程：每个进程是另一个浏览器，内存按份数翻倍；也不用加 `--max-old-space-size`，截图在脚本里直接解码比对，一格只占几 MB。一份矩阵时 `--json` 的输出跟以前一样；多份时是 `{ "matrices": [{ "matrix": <路径>, "findings", "瓶颈", "humanReviewCells" }, …] }`，有一份有发现退出码就是 `2`。每份矩阵各记各的上一轮（`matrix.json` 记在同目录的 `.ui-measure-last.json`，别的文件名记在 `.ui-measure-last.<文件名>.json`），所以几份矩阵可以放在同一个目录。

退出码：`0` 全绿，`2` 有发现。每条发现带 `id`（缺陷类型）、`severity`、位置（`cell` · `anchor` · `property`）、画布值与实现值（`expected` · `actual` · `delta` · `detail`）和 `why`。严重度是机械的：

- **P0 `missing-anchor`**：画布有这个锚点、实现的路由上没有。两边不在比同一个东西，这一格其余数字都不作数，先修它。
- **P1 `position-drift` / `token-mismatch`**：测量层报的，点名了锚点和属性，改哪里是明确的。
- **P2 `pixel-mismatch`**：像素层的兜底，知道有东西不一样但说不出是什么。要么在那儿补一个锚点让测量层接手，要么写明这个差异为什么可以接受。

测量层为主：像素层永远不压过一条点名了锚点的发现。

## 终止条件

- **全绿**：发现为空。`review: human` 的格不算绿，列出来等人看。收工只核这一件事：最后一轮是绿的，或剩下的都是标了「人看」的格。
- **瓶颈**：同一批发现两轮不变。脚本自己判（比对上一轮的缺陷指纹，不比数字），在输出里打「瓶颈」。判到了就停下，判断残留差异是哪一种，连同判断按调用你的那一方的规矩处理：
  - **实现问题**：还没找到对的做法。
  - **设计决策**：项目的组件库出不了那个样子，要改的是设计。

轮数不设上限，瓶颈就是停的信号。
