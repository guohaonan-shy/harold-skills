---
type: raw
source_type: conversation
captured: 2026-10-31
title: "#80 审核：「交给人时」拆开归位、to-spec 与 pr 按交付物重写、全局沟通风格从读者出发"
tags: [idea-loop-decisions, decision-rules-who-decides]
related: ["[[decision-rules-who-decides]]"]
---

> 格式：U 是人的原话，逐字保留；A 是 AI 的结论与发现。

## A1

复现：`decision-rules` 除了「谁来定」还带「交给人时」一节和一份参考，七处读者指向它；issue 说 dreaming 两份参考读它，实测不读。起草 spec 时留了两条待定：讲话方式在插件里留不留、留哪（推荐按场景在 to-spec 与 pr 汇报写法里各补一两句）；「现状先查清」归哪（推荐按场景拆）。

## U1

第一题，按照交付物拆分成两个方向：
1 spec（markdown file）和pr（github）作为交付物的其中之一 我觉得这些内容是需要放在 to-spec 以及 pr 这两个skills内。这两个需要定义清楚交付物的结构，每个章节主要内容是什么。借此机会，我在想这两个skills哪些内容是可以简化，哪些规则可以通用化的

* matt的pr：https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md
* matt的to-spec: https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md

2 还有一个就是claude和我的对话风格（即全局的claude.md），我理解其实也不是说case by case的枚举，而是要站在我的角度上看，什么样的内容可以让我快速了解你说的内容，快速根据你说的内容提供对应的证据让我明白你所说的内容并可以快速作出决策。绝大部分的情况，其实都是我只清楚事情的大致方向以及高层设计，但是具体的实现细节我是不清楚。

第二题，关于现状其实是一个共享的内容，无论是跟我沟通还是产出交付物，我觉得都需要，其实skills和全局沟通风格都是需要添加的。

## A2

读了 Matt 的两份 skill（2026-10-31 的 main）。Matt 的 `pr` 一份交付物三节：摘要（能说清要点的最小一张图）、证据（改前改后）、合并风险（能不能撤回、影响面），约 3K 字符；我们的 `pr` 四份交付物（PR 描述 7 节、停下汇报、review 汇报、review loop 文件），5 个文件约 26K 字符。Matt 的 `to-spec` 七节只有模板，约 2.5K；我们的十节加 8 步流程，约 12K。两边可通用的一条：「用能说清要点的最小一张图，图放在它支撑的那句话旁边」，跟人说的「快速看懂、快速拿到证据、快速决定」是同一原则。（更正，写 spec 时发现：上面我们这边的字数是 C locale 下 `wc -m` 数的字节；按 UTF-8 字符数，`pr` 5 个文件共 11841、`to-spec` 主体 6033。）提了三题：重写进不进这份 spec（当时以「默认改动最小」为依据之一）、共用的放哪（推荐 `evidence`）、全局骨架（读者模型开头 + 四条做法 + 两条操作性的）。

## U2

> 插件规则「默认改动最小」写着结构性的重排单独起

这句话是出自哪里的？我之前就发现了，你习惯性的给skill append规则，但是没有像我预期一样每次增加内容时，考虑这个内容是否可以让某个规则成为通俗的规则之类的

## A3

出处是 `decision-rules`「自己定的四条」第 4 条，讲的是实现和 review 时不顺手塞重排，用在「spec 要不要含重写」上是用错了，撤回。只追加不归并的原因在插件里找得到：retro 候选只有「落点 / 旧文 / 新文」，天然是一处加一句；`writing-for-agents` 没有「加之前先看能不能归进已有原则」的要求；这份 spec 的选项本身也是「补一两句」。提议把这条写进 `writing-for-agents`，`retro` 候选加一栏「它是哪条已有原则的特例」。

## U3

首先，to-spec 和 pr 的重写放在这个spec内，关于共用的那几条，我觉得放进evidence没什么毛病

其次，全局的claude.md用中文。

decision-rule 这个skill现在是在什么场景使用的？

## A4

`decision-rules` 的使用场景：起草 spec（issue-verify、to-spec）、切工单、实现（implementer 开工必调、implement 编排者）、停下汇报与 PR 描述的「已按规则处理」、review（pr-review、pr-reviewer、喂给 Codex）、只改 docs 的 PR 自动合并、retro 提「自己定」规则、dreaming 的两个 agent、回放用例 explain-mechanism。用到「交给人时」那一半的只有决定题怎么写和那个回放用例。问了剩下两题：全局骨架；「加规则先找通用原则」写进这份 spec。

## U4

没问题，我暂时没有其他问题了。

## 本轮决议

| 议题 | 决议 |
|---|---|
| 讲话方式在插件里放哪 | 按交付物：spec 的写法进 `to-spec`，PR 上的东西进 `pr`；两份交付物的结构重新定义清楚，每节放什么 |
| to-spec 与 pr 的简化、通用化 | 放进这份 spec，参照 Matt 的两份 skill |
| 两个 skill 共用的那几条 | 放进 `evidence` |
| 「现状先查清」 | skill 里和全局沟通风格里都加 |
| 全局 CLAUDE.md 沟通风格 | 从读者出发，不逐条枚举；读者模型开头 + 四条做法 + 后台不沉默、转述用人的语言两条操作性的；用中文 |
| 「默认改动最小」作依据 | 撤回：那条管实现与 review，不管 spec 范围 |
| 加规则先找能不能归进已有原则 | 写进 `writing-for-agents`，`retro` 候选加一栏「它是哪条已有原则的特例」；本次重写是第一次应用 |
