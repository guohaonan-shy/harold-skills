---
type: raw
source_type: issue
captured: 2026-10-26
title: "retro 候选 #86：idea-loop：每个 issue 会话要知道相关的在飞工作，按需 handoff，别让多个会话做同一件事（待讨论）"
tags: [retro-candidates]
---

> 原文取自 guohaonan-shy/harold-skills#86（开于 2026-10-23，2026-10-26 迁进候选池后关成 not planned）。正文与评论逐字保留；去处见 #115。

# idea-loop：每个 issue 会话要知道相关的在飞工作，按需 handoff，别让多个会话做同一件事（待讨论）

## 是什么

一个 issue 一个会话，几个会话同时在跑。现在每个会话只看自己的 issue：to-spec 的模板要求在「关联」里写「相邻还没完成的 spec 与 issue：查过，写明有没有重叠、谁先谁后」，但只要求写清重叠，没有说重叠了怎么办——要不要把一部分工作交给已经在做的那个会话、怎么交。结果可能是两个会话各自改同一个页面、各设计一遍。

## 例子

Tofelair#527（听后复述介绍页 /listen-repeat 的核心词排第 9 位）审核时，正文要加一节、重构卖点段。同一页的三步段正由 Tofelair#407 的会话在设计（已在 imagine）。agent 只在 spec 的「关联」里记了 #407「改的地方不重叠」，是人想到把要设计的部分并过去：#527 只留不用设计的标题、博客内链、两条 FAQ，正文重构的需求由 #527 会话用 SendMessage 发给 #407 会话。

## 人的方向（原话，2026-10-23，Tofelair#527 的 issue 会话 retro）

「这个问题其实算是每一个会话都需要知道当前在做的事以及issue有哪些事儿是跟当前内容相关，然后以合理的方式handoff（https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md）。说白了，不要让多个会话做一样的事儿，这个可以记一个issue，然后在后面讨论」

之前的相关原话（同一会话）：「内链的修改放在这里，章节的调整我觉得可以和 @[Tofelair#407 …] 这个会话合并，它也要改失分原因（痛点），你觉得怎么样。」

## 参考

mattpocock/skills 的 handoff：把当前会话压成一份交接文档给下一个会话或 agent，已经在 spec / issue / 提交里的只给链接不复述，按下一个会话的目标组织。

## 要讨论的

- 会话怎么知道「当前在做的事」：在飞的 issue 会话、各自的 spec 和改动范围（页面、文件）从哪里读。
- 什么时候判定相关：同一页面、同一组文件、同一个 spec 的相邻部分。
- 发现相关时的处置：并过去（交接一份 handoff 文档给那个会话，并改它的 spec 范围）、排先后、还是各做各的；谁拍板。
- 交接的载体：SendMessage、共享笔记目录、spec 里的「关联」，还是 handoff 文档。
- 和 issue-verify / to-spec 的「关联」一步、issue-dispatch 的派发怎么衔接。

## 为什么这次不做

retro 只出候选、不改规则文件；这是流程设计，人说先记下、之后讨论。
