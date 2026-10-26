---
type: raw
source_type: issue
captured: 2026-10-26
title: "retro 候选 #109：idea-loop to-spec：往给 agent 读的参考文件加规则时，写明候选落点各由谁、在哪一步读到"
tags: [retro-candidates]
---

> 原文取自 guohaonan-shy/harold-skills#109（开于 2026-10-26，2026-10-26 随 retro 整合撤回关成 not planned）。正文与评论逐字保留；去处见 #115。

# idea-loop to-spec：往给 agent 读的参考文件加规则时，写明候选落点各由谁、在哪一步读到

## 是什么

`to-spec` 的 spec 模板「方案」一节要求「同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由」。当 spec 改的是给 agent 读的参考文件（skill 的 references、agent 定义）时，候选落点（放进哪份参考文件）也是入口，但模板没要求写这些文件**由谁、在哪一步读到**。落点的取舍其实取决于读到的时机：常驻核心每次都读，按需文件只在特定问题时读，评审清单只在画布做出来之后读。

## 在哪、怎么看到

harold-skills#57（结束整个任务的入口用 X）的 issue 会话里，spec 说明了为什么选 `ui-craft-checklist.md`、不选 `heuristics-checklist.md`，但没讲这两份文件什么时候被 designer 读到。人审 spec 时只能追问（2026-10-26，审 spec 时的原话）：

> 「这个点严格来说是一个通用的ux交互规则，我看现在UI相关的reference挺多的，这些内容是怎么进行渐进式加载的」

讲清加载链后（两份清单都在 refine 的 G 阶段评审时才读），人才定下落点。

## 要改成什么

落点：插件 `idea-loop:to-spec` 的 spec 模板「方案」一节。

- 旧文：「同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由。」
- 新文：「同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由。改的是给 agent 读的参考文件（skill 的 references、agent 定义）时，候选落点也算入口：每个候选写明谁、在哪一步读到它（常驻、按需、评审时），取舍按读到的时机讲。」

## 为什么这次不做

来自 #57 收尾的 retro，人批了候选，按流程开成待验证 issue，由调度接手。
