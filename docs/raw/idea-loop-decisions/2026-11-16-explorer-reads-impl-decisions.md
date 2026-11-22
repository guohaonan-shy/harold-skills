---
type: raw
source_type: conversation
captured: 2026-11-16
title: explorer 读 spec 的范围：加读「实现决策」
tags: [idea-loop-decisions, explorer-reads-impl-decisions]
related: ["[[0068-explorer-reads-impl-decisions]]"]
---

> 格式：U 是人的原话，逐字保留；A 是 AI 的结论与发现，取证过程略去。讨论发生在 harold-skills#161 的 triage 会话里。

## A1

给出三个选项（保持只读「测试决策」加一句理由 / 加读「实现决策」/ 全放开对齐 implementer），推荐保持只读。

## U1

这个问题当时的背景是什么？explorer本意是让并行的implementer可以共享一部分内容

## A2

查 git 历史：2026-10-14 `d0d579c` 加 explorer 时，implementer 也规定只读「测试决策」，explorer 照抄同一句，两边对齐；2026-10-28 `adcf0f5`（#147，spec implementer-reuse-and-compact）implementer 放开成全文可读，explorer 不在那份 spec 范围里，同一分钟由那次实现开出 #161。按 explorer「替 implementer 先找共享的东西」的本意，它该读 implementer 拿来找位置的那几节；「实现决策」点名要动的模块，几个执行方会各自去搜一遍。推荐改成加读「实现决策」。

## U2

我还是没有理解这个issue提出的背景，所以无法选择

## A3

用大白话重讲来由（同 A2），说明只是文字口径不一致、没查到出过错，再摆一次三个选项加「关掉不做」。

## U3

加读实现决策

## 本轮决议

| 议题 | 决议 |
|---|---|
| explorer 读 spec 的范围 | 「测试决策」+「实现决策」；后者只当找位置的起点，笔记仍只写指针；不全放开 |
