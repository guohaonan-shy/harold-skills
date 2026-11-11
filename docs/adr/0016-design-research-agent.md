---
type: adr
status: 生效
tags: [design, research, uiux-research, agent]
summary: 设计调研交给人调起的 uiux-research 和专职 uiux-researcher，产物是一页 HTML；imagine / refine 不再自己调研
related: ["[[0001-design-workflow-into-harold-skills]]", "[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0016 — 设计调研：由人调起的调研 agent，一页 HTML 交回

> 由 spec `design-research-agent` 蒸馏而来，该 spec 已删除。
> 本 ADR 取代 [[0001-design-workflow-into-harold-skills]] §2.7 里「Refero 三层研究（styles / screens / flows）接成构建段的研究后端」的部分：styles 层不再用，调研也不再是构建段自己的步骤。该 ADR 的其余小节仍然生效。

## 1 背景（why）

2026-10-18 至 20 对真实会话的统计（#46）：

1. **调研过程撑大会话。** 每次调研在 imagine 会话里多出 4–9 次工具调用、上下文涨 2–3 万 token；Refero 取图把整张截图（单次 1.2–6.5 万字符）塞进会话，人看一次就没用，却跟着后面每一轮。
2. **参考图怎么给人看靠临场发挥。** 一场把四张参考临时拷到对比页旁，另一场只在聊天里写结论；refine 里 designer 查过的只在 ledger 记一行。
3. **调研几乎都是人发起的。** 全部会话里调过 Refero 的设计会话只有 3 场、6 次调研，其中 5 次是人看了变种后点名要查；执行者主动去查的一次都没有，有用的都在回答「别人验证过的做法」（UX 惯例、一个没画过的流程、文案语气），没用的都是时间 / 行为维度的问题。
4. **同一份契约被三个调用方各读一遍**（imaginer、designer、静态 UI 协议 C 段），而 imaginer 里写的「自己起调研 agent」指向一个不存在的 agent。

## 2 决策（how）

- **谁来调：人。** 新增 skill `uiux-research`，不设 `disable-model-invocation`（普通对话里人说「查一下别人怎么做」，模型可自调）；imagine / refine 的编排者只在人说要查时才调。备选是由执行者自己起调研 agent，被否：调研从来是人发起的，执行者主动查没有产出。先这样协作一阵子，再看怎么融进流程。
- **谁来查：专职 `uiux-researcher`。** 每次新起、做完即结束；Refero 调用与截图都留在它那里，调用方只收一页 HTML 的路径加一句结论。模型钉 `opus` · medium，工具只有 Refero 的 screens / flows、下载截图的 curl、写文件，不给浏览器，不起子代理。
- **范围：** 查 UX pattern、user flow、某类页面的通常做法、文案语气；不查视觉风格（styles 层删掉，视觉方向归随机种子和 `DESIGN.md`）；去掉「第一批变种之前不读」的硬规则。时间 / 行为类问题静态图答不了，页面里如实写「没有参考能回答」，不硬凑。reference-averaging 禁令保留。
- **执行者不再自己调研：** uiux-imaginer、designer、静态 UI 协议 C 段都不调 Refero；碰到凭判断定不了的 UX 问题，写成「建议调研的问题」（一句具名问题加推荐做法）放进交回，不停下，先按推荐做法往下做，由编排者摆给人。
- **页面形状按 baseline 的人工标注收敛**（2026-10-20 两次）：研究问题（含人的原话与交给 agent 的具名问题、上下文）→ 这些产品的通用结论 → 各来源（按 flow 横排、可点开大图的截图，配「场景」「设计逻辑」两段，不写「对我们」）→ 最后是结合我们需求、要人决策的问题。
- **落图目录：** 有 spec 时放这份 spec 设计过程目录下的 `research/<问题短名>/`，没有 spec 时放设计过程目录下的 `research/<问题短名>/`；都不进 git。调研目录从不算设计产物，不触发 UI 审查与归档。
- **接回流程由人决定：** 人看完说要转哪些，编排者只转解构文字、不转图；imagine 开工前查到的结论，随起 uiux-imaginer 的任务带文字。

## 3 结果（result）

- skill `uiux-research`（收问题、定目录、起 agent、核对页面、摆给人）；agent `idea-loop:uiux-researcher`（`opus`、medium）；契约在 `uiux-research` 的 `references/research-backend.md`。
- 脚本 `research-check.mjs` 机械校验页面形状（研究问题在最前、通用结论在来源之前、决策问题是最后一块、每张图是目录内存在的相对路径、有人的原话）；章节里写什么不做强要求。
- imaginer、designer 的交回里有「建议调研的问题」一项；静态 UI 协议里写明执行者不调研。
- 评估：`idea-loop/evals/uiux-research/` 是有意例外的人工标注 baseline（6 个取自真实会话的 case），不判分；仓库 `AGENTS.md` 的 eval 策略一节记着这条例外。
- 这条决定改变了 `ADR-0015` 的一个设想：imaginer 不自己起调研 agent。
