---
name: ui-measure
description: 把 UI 实现和冻结的设计画布逐格测量比对，让「像不像」变成一个会红的测试。实现 UI 工单、review 时对画布、冻结时定容差、比较两版画布找没声明的改动时用。
---

两个标签页，一边是冻结的画布，一边是项目里的实现，按验收矩阵逐格比。判据是 `node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-measure.mjs"`，不是另一个模型的意见：差多少、差在哪，输出一串带严重度的发现（finding）。它就是测试决策里「视觉正确性」那一行的红绿测试，在实现的红绿环里主动跑。

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
- 像素层默认看 viewport 那一帧（不是整页）。一格写 `"shotAnchor": "<锚点名>"`，这一格只截这个锚点的区域再比像素：两边按同一个框裁（框是这个锚点在两边范围的并集，再裁到两个页面都有的部分），尺寸一定相同，折叠线以下的锚点也能截。不写就照旧截 viewport。
- `canvas` 和 `local` 两边都只是地址：填画布某一版的地址（`.../v3.html`），就是两版画布对比，输出还是上面那种发现。要的是「变了哪些锚点、哪些没声明」的清单，用下面的「两版画布对比」。

## 跑，然后照发现改

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-measure.mjs" matrix.json        # 人读
node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-measure.mjs" matrix.json --json  # 机读
```

退出码：`0` 全绿，`2` 有发现。每条发现带 `id`（缺陷类型）、`severity`、位置（`cell` · `anchor` · `property`）、画布值与实现值（`expected` · `actual` · `delta` · `detail`）和 `why`。严重度是机械的：

- **P0 `missing-anchor`**：画布有这个锚点、实现的路由上没有。两边不在比同一个东西，这一格其余数字都不作数，先修它。
- **P1 `position-drift` / `token-mismatch`**：测量层报的，点名了锚点和属性，改哪里是明确的。
- **P2 `pixel-mismatch`**：像素层的兜底，知道有东西不一样但说不出是什么。要么在那儿补一个锚点让测量层接手，要么写明这个差异为什么可以接受。

测量层为主：像素层永远不压过一条点名了锚点的发现。

## 两版画布对比：找出「没声明却变了的地方」

拿这一版画布跟上一版比，只回答「变了哪些锚点」，再按改动集分成声明过的和没声明的。矩阵里 `"mode": "canvas-diff"`，两边写 `before`（上一版）和 `after`（这一版），其余（`cells`、`dpr`、`tolerance`、`byAnchor`）照上面；`state` 同样拼成 `?state=`。第一轮没有上一版，`before` 填 imagine 的交接画布，`changeSet` 写 `[]`。

```json
{
  "mode": "canvas-diff",
  "before": "http://127.0.0.1:8000/v2.html",
  "after": "http://127.0.0.1:8000/v3.html",
  "changeSet": [
    { "decision": "2.1", "states": ["default", "empty"], "anchors": ["card", "card-title"] },
    { "decision": "2.3", "states": ["default"], "anchors": ["cta"] }
  ],
  "shotsDir": "shots",
  "cells": [
    { "name": "mobile/light/default", "viewport": { "width": 390, "height": 844 }, "state": "default" },
    { "name": "mobile/light/empty", "viewport": { "width": 390, "height": 844 }, "state": "empty" }
  ]
}
```

**改动集**是 designer 每版交的一份清单，一条对应人上一轮的一条决策：`decision` 是决策编号 `<轮次>.<序号>`，`states` 是动过的状态名，`anchors` 是动过的锚点名。一条可以写多个状态和锚点，同一个锚点可以被几条决策覆盖。状态名和锚点名要跟矩阵、画布里的写得一样。没有 `changeSet` 这个键时不分类，只列变了的锚点。

每个状态、每个锚点：先比计算样式（位置 ±1px，token 精确，规则同上），再按锚点区域截图比像素。**默认只要有一个像素可见地不同就算变了**（两版都是画布，没有渲染环境差）；矩阵的 `tolerance.pixel` 可以放宽。锚点只在一版里有，算 `added` / `removed`。

输出（`--json`）：

- `changed`：变了的锚点，每项有 `cell`、`state`、`anchor`、`kind`（`changed` / `added` / `removed`）、`changes`（`property`、`before`、`after`、`delta`）、`pixelPercent`，和 `shots.before` / `shots.after`：两版区域截图的文件路径（存在矩阵旁的 `shotsDir`，默认 `ui-measure-shots/`）。区域已经没有面积（两边都隐藏）的锚点没有 `shots`。
- 给了改动集，另外有：`undeclared`（没声明却变了的，排在给人的报告最前面）、`declared`（每项多一个 `decisions`）、`declaredUnchanged`（改动集声明了、却没变：`decision`、`state`、`anchor`）、`unchecked`（改动集声明的状态，矩阵里没有这一格，没比，不算没变）。

退出码：`0` 两版没有变化，或有改动集且变的都声明过；`2` 其余（有改动集时有没声明的；没改动集时有任何变化）。`declaredUnchanged` 只列出来，不改退出码。

## 终止条件

- **全绿**：发现为空。`review: human` 的格不算绿，列出来等人看。收工只核这一件事：最后一轮是绿的，或剩下的都是标了「人看」的格。
- **瓶颈**：同一批发现两轮不变。脚本自己判（比对上一轮的缺陷指纹，不比数字），在输出里打「瓶颈」。判到了就停下，判断残留差异是哪一种，连同判断按调用你的那一方的规矩处理：
  - **实现问题**：还没找到对的做法。
  - **设计决策**：项目的组件库出不了那个样子，要改的是设计。

轮数不设上限，瓶颈就是停的信号。
