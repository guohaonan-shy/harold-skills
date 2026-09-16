---
type: raw
source_type: web
captured: 2026-09-11
title: aihero.dev —— /prototype skill（Matt Pocock）
tags: [design-workflow, prototype, idea-loop]
related: ["[[0002-design-loop-v2-imagine-refine]]", "[[2026-09-11-design-loop-prototype-critic]]"]
---

> 来源：https://www.aihero.dev/skills-prototype 与 https://www.aihero.dev/skills-wayfinder（后者只取与 prototype 相关的部分）。抓取于 2026-09-11。以下是页面内容的忠实摘录，非本仓库观点。

## 定义

"Throwaway code that answers a question"（回答一个问题的一次性代码）。原描述："Answer a design question with code you then delete"，但删除这条实践后来改了（见"产物处理"）。"The question comes first and decides the shape of everything that follows."

刻意的约束：没有测试、没有超出功能所需的错误处理、没有抽象、没有持久化。理由："none of that helps you learn the one thing you're trying to learn."

## 两个分支

**逻辑 / 状态模型分支**：产出一个自包含的单文件 HTML（双击即开，不需要 build 或 server）。含：
- 每次交互后重渲染的带标签状态面板
- 自由探索模型的按钮
- 分 tab 的引导 walkthrough，按顺序排好的按钮序列
- 用领域语言标注，给非技术 stakeholder 看
- 底层是 DOM-free 的纯逻辑模块（reducer / 状态机 / 函数），可以直接抬进生产

**UI 外观分支**：同一路由上多个**结构上根本不同**的变体，浮动工具栏加 `?variant=` URL 参数切换，尽可能用真实数据和真实密度渲染。原话："Variants must disagree about structure, not colour; three tweaked card grids is wallpaper, not a prototype."

## 在工作流里的位置

- 上游：`grill-me`、`grill-with-docs`。用于"讨论定不了的问题"。
- 下游：`to-spec`。验证过的模型喂给 spec。
- 消费者：`wayfinder`（多会话规划）在遇到"这该长什么样 / 该怎么表现"这类"talking cannot settle"的问题时，自动开一张 HITL 类型的 prototype 决策票，"resolved by prototype, with the built artifact linked from the ticket as an asset"。作者自注：选择权是人的，"the skill does not currently say so loudly enough"。
- 路由：`ask-matt`。

## 产物处理

两个产物分开：
1. **答案**（问题 + 裁决）：写进 commit message、ADR 或 implementation issue，合进 main。
2. **原型本身**：提交到 `prototype/<name>` 分支，永不合并；implementation issue 上留一个指向分支的上下文指针。

"Main stays clean; the exploration stays findable and re-runnable by whoever picks the work up next."

演化理由：原来是抽完答案就删原型，改成保留分支是因为"A prose summary of a prototype loses the thing that made it convincing."。从终端应用改成单文件 HTML 是因为"A terminal app can only be driven by someone with the repo cloned and a runtime installed, which rules out exactly the people whose opinion the prototype needs."

## 成功判据

- 问题能用一句话说清，并显示在 demo 顶部
- 非技术用户能通过界面自己驱动逻辑 demo
- 反馈暴露的是想法层面的 bug（"That shouldn't be possible"）
- UI 变体在结构上不同，不是外观上不同
- 一次坐下来能做完
- main 只含决策；分支持有原型

## 反模式

- 对已经定了的设计做 prototype（该用 `/implement`）
- 做整个应用的原型而不是单问题探索
- 原型因惯性变成生产代码
- 对讨论就能解决的问题做原型

成本观："The comparison that matters isn't tokens against zero; it's tokens against building the wrong state model and finding out after it has production callers."
