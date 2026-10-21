---
name: evidence
description: 要人判断的东西怎么做成一眼能判断的图：spec 里的图（复现证据、story 树、时序图、交互图）和交付证据（人验素材、review 配图）。截图、拼流程图、录动图时用。
---

人读不出一段文字描述的东西到底长什么样，让人自己起服务、搭场景去看，又往往会一直拖着不看。所以凡是要人判断的，都做成一眼能判断的图。

图分两类，按合并之后还有没有用分：

| | 例子 | 去处 | 怎么做 |
|---|---|---|---|
| **spec 里的图**，进知识库 | 问题的复现证据、story 树、时序图、冻结画布派生的交互图 | git，`docs/` 下 | [`references/spec-figures.md`](references/spec-figures.md) |
| **交付证据**，用完即弃 | 工单的人验流程图与动图、review 给问题配的图、PR 描述的之前 → 之后 | 每个 PR 一条素材分支，合并即删 | [`references/delivery.md`](references/delivery.md) |

## 两类共用的

- **截图只截那个组件**，必要时连同它弹出的浮层。整页截图会把要看的东西缩到看不清。2 倍像素密度，用 spec 的主语言，手机宽度默认 390。
- **截图来源看要判断的是什么**：问题图取自复现，设计图取自冻结画布，交付证据取自实现本身。不重画。
- **流程图只用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-compose.mjs"` 拼**：截图横排，箭头上写触发条件，截图下一句状态，红色光圈圈出要看的地方。同一个 spec、下一个 spec 的图都要长得一样。构图规则和 JSON 格式在 [`references/spec-figures.md`](references/spec-figures.md) 的「交互图（screen flow）」。
- **叠上去的东西要说明**：为了让人看懂而叠加的光圈、鼠标位置点、角落的秒表都不属于产品，在这一组图的开头用一句话说明。
