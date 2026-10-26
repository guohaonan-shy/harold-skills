---
type: raw
source_type: issue
captured: 2026-10-26
title: "retro 候选 #100：idea-loop issue-verify：issue 正文里对现状的说法也是推断，起草 spec 前先核过"
tags: [retro-candidates]
---

> 原文取自 guohaonan-shy/harold-skills#100（开于 2026-10-26，2026-10-26 随 retro 整合撤回关成 not planned）。正文与评论逐字保留；去处见 #115。

# idea-loop issue-verify：issue 正文里对现状的说法也是推断，起草 spec 前先核过

**候选**（来自 #55 的 retro，人批了）：issue 正文里对现状的说法（某个流程定时跑、某个检查已经存在、某个角色会兜底）也是推断，spec 要靠它的，起草前先在代码里核过。

**落点**：`idea-loop:issue-verify` 的「先复现」一节，核现状的那段。

**旧文**：
> 方案、选项、范围依赖的现状也在这时核清：代码现在怎么做、影响多大、同类入口有哪些、相邻还没完成的 spec 与 issue。issue 是不是已经被做掉了，也靠这一步查出来。

**新文**（加在后面）：
> issue 正文里对现状的说法（某个流程定时跑、某个检查已经存在、某个角色会兜底）也是推断：spec 要靠它的，先在代码里核过；核不上的，在「问题」里写「修正：issue 原先认为 X，实测是 Y」。例：#55 写「靠每周 dreaming 兜底」，实际 dreaming 没有定时任务。

**会话里的原话**：#55 的 spec 照抄了 issue 里「靠每周 dreaming 兜底」，实际 dreaming 只能人手敲。人在 PR 审核时问：「S3的核心问题是dreaming里面的设计对账是否要开浏览器，我觉得要开无头浏览器，通过浏览器截图跟设计档案内的图片进行对比（我理解dreaming是定时的，可以根据距离上次dreaming到现在之间的变更页面进行对账，还是说完全全量），dreaming现在是这样做的吗？」核过才发现没有定时任务，后面补了一整块「定时跑」的设计。

**跟 #82 的区别**：#82 管「issue 点名的实现手段不等于诉求」；这条管「issue 写的现状要核」。都落在 issue-verify，可以一起做。
