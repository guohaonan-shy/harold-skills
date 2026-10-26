---
type: record
captured: 2026-10-26
title: "retro 候选 #103：idea-loop decision-rules：执行方已按推荐做了、不削弱 spec 目标的 spec 缺口，照规则沿用"
tags: [retro-candidates]
---

> 原 issue：https://github.com/guohaonan-shy/harold-skills/issues/103（开于 2026-10-26，2026-10-26 随 retro 整合撤回关成 not planned）。改写成候选池的统一形状，原文的段落尽量原样保留；去处见 #115。

# idea-loop decision-rules：执行方已按推荐做了、不削弱 spec 目标的 spec 缺口，照规则沿用

- 信号：对题的选择（来自 #55 的 retro，人批了）
- 落点：`idea-loop:decision-rules`「自己定的四条」第 4 条「默认改动最小」下面
- 旧文：
> 4. **默认改动最小。** 结构性的重排（目录重构、换框架）单独起，不顺手并进来。
- 新文（加在下面）：
> 执行方交回的 spec 缺口，它已经按推荐做了、也不削弱 spec 要达成的目标的，**沿用**，列进「已按规则处理」（依据写它做了什么、为什么不影响目标），人可以推翻。会让 spec 的目标只达成一部分的（例：spec 要把对账都交给钉了模型的 agent，执行方留了一段在编排者自己手里），仍是「要你决定」。

- 例子：

**候选**（来自 #55 的 retro，人批了）：执行方交回的 spec 缺口，它已经按推荐做了、也不削弱 spec 要达成的目标的，沿用，列进「已按规则处理」，人可推翻；会让 spec 目标只达成一部分的，仍是「要你决定」。

- 反例 #55：「我倾向于选择B。」执行方把档案对账的源码波留在 dreaming，人改成交给 ui-reviewer。差别：前三次是不影响目标的细节；反例那次让 spec「对账都交给钉了模型的 agent」的目标只达成一半。

- 状态：在池里

## 出现

- harold-skills#55（2026-10-26）：「03 选 A，其余没有意见，可以进 review。」（ui-reviewer 跳过时记未完成，已做，PR #90）；决定记录：[[55]]
- harold-skills#55（2026-10-26）：「区域组件按 A，……」（已做，PR #90）；决定记录：[[55]]
- harold-skills#51（2026-10-23）：题 12「大的回放什么时候进队列」，「前两个问题选择A。」；决定记录：[[51]]

## 备注

决定记录：`docs/raw/decisions/55.md`。
