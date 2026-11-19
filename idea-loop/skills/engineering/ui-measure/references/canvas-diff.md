# 两版画布对比：矩阵、改动集、输出

`"mode": "canvas-diff"` 的矩阵怎么写、脚本交回什么。它是什么、什么时候用，见 SKILL.md 的「两版画布对比」。

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

- `changed`：变了的锚点，每项有 `cell`、`state`、`anchor`、`kind`（`changed` / `added` / `removed`）、`changes`（`property`、`before`、`after`、`delta`）、`pixelPercent`，和 `shots.before` / `shots.after`：两版区域截图的文件路径（存在矩阵旁的 `shotsDir`，默认 `ui-measure-shots/`）。什么时候有、什么时候没有：只有两版里这个锚点都没有面积（两边都隐藏）时才没有 `shots`，别的变了的锚点都有。两版页面长短不同时照样有：新版在旧版页尾以下新加的一块（哪怕整块都在旧版页尾之外），两张图按同一个区域截，旧版那张是该处的空白（旧版页面补到够长，底色是旧版自己的页面底色），不会缺图，也不会只剩页尾内的一条细线。
- 给了改动集，另外有：`undeclared`（没声明却变了的，排在给人的报告最前面）、`declared`（每项多一个 `decisions`）、`declaredUnchanged`（改动集声明了、却没变：`decision`、`state`、`anchor`）、`unchecked`（改动集声明的状态，矩阵里没有这一格，没比，不算没变）。

退出码：`0` 两版没有变化，或有改动集且变的都声明过；`2` 其余（有改动集时有没声明的；没改动集时有任何变化）。`declaredUnchanged` 只列出来，不改退出码。

跟别的矩阵一样，canvas-diff 矩阵可以和普通矩阵一起交给同一条命令，共用一个浏览器、各占一个上下文。多份时 `--json` 的 `matrices` 里，它那一项是 `{ "matrix": <路径>, "mode": "canvas-diff", … }`，字段同上；两版对比不判瓶颈，不记上一轮。
