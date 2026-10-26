---
type: record
captured: 2026-10-26
title: "retro 候选 #82：idea-loop issue-verify：起草前分清 issue 的核心诉求和它点名的实现手段"
tags: [retro-candidates]
---

> 原 issue：https://github.com/guohaonan-shy/harold-skills/issues/82（开于 2026-10-23，2026-10-26 随 retro 整合撤回关成 not planned）。改写成候选池的统一形状，原文的段落尽量原样保留；去处见 #115。

# idea-loop issue-verify：起草前分清 issue 的核心诉求和它点名的实现手段

- 信号：纠正与追问（人推翻了 issue 点名的手段）
- 落点：插件的 `issue-verify`，起草之前（人在 #51 的 retro 里批的）
- 旧文：无。
- 新文：「issue 里点名的实现手段（某个 skill、某种数据源）先当成手段、不当成需求：起草时把核心诉求单独写一句；手段是不是定死的，判不了就作为『需要 grill』的第一个问题。」

例子：#51 的标题和正文写着「让 dreaming 定期回看已合并 PR 的 review loop 归档」。issue 会话把「dreaming」「PR 归档」当前提，第一版 spec 整份建在上面（读 PR 归档、dreaming 多一节提议表）。人一开口就推翻了：核心诉求是「在实际决策中把问题和决策点整理成规则、迭代 skill」，用不用 dreaming 不重要。spec 重写了一遍（见 `docs/raw/idea-loop-decisions/2026-10-22-retro-grill.md` 的 U1）。

- 状态：在池里

## 出现

- harold-skills#51（2026-10-22）：「其实这个issue的核心诉求是我之前看了matt的一个改动（/retro）以及poteto最近的一个skill（writing-verificable-skill），其实这个核心诉求就是再实际的决策中，将问题以及决策点整理成规则迭代skills。其实这个用不用dreaming，我觉得不重要根本。主要的是我上面说的内容。」；决定记录：[[51]] 题 1
- harold-skills#55（2026-10-23）：「我其实这么想的，UI reviewer其实就是真实设计师来进行走查，看看当前的产品的实现跟UI设计稿的实现是否一致，不一致需要将问题反馈出来，让工程师进行解决。……所以，我觉得仍然只负责review是没有问题的。」；讨论记录：[[2026-10-23-design-truth-after-freeze]]；决定记录：[[55]]

## 备注

第二次出现（#55 的 retro 补来的证据）：#55 的 issue 正文点名了「ui-reviewer 以当前代码为真相源、照实现改写 delta/」这个手段，issue-verify 照抄进了 spec 初稿；审核时人推翻了这个手段，真正的诉求是「冻结后设计变了，要有人去改设计稿」。

怎么证明生效：
要判断的规则，按 retro 的回放：用 #51 开场时的提交和 issue 正文作输入，让 `issue-verify` 起草到 spec 写完停下，是/否题「草稿是否把核心诉求和 issue 点名的手段分开写，并把『dreaming 是否定死』列为要人定的问题」。改前应「否」、改后应「是」。
