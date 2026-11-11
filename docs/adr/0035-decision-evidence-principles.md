---
type: adr
status: 生效
tags: [idea-loop, decision-rules, evidence]
summary: decision-rules 与 evidence 改成讲原则、不讲逐情形的答案；配什么图交给模型，图放哪归调用方
related: ["[[2026-10-19-pr-decision-friction]]", "[[2026-10-31-handing-to-human-split-grill]]"]
---

# ADR-0035 — decision-rules 与 evidence：给原则，不给逐情形的答案

> 由 spec `decision-evidence-principles` 蒸馏而来，该 spec 已删除。
> 本 ADR 取代 `ADR-0036` 里「decision-rules 保留『自己定的四条』」和「evidence 带 spec 图与交付证据两份参考」两处结论，其余仍然生效。

## 1 背景（why）

`decision-rules` 从一次次纠正里攒出来，「自己定的四条」把每种情形的处置写死：有明文规则的规范违规修、对不上已定做法的同步改、存量问题开 issue、超范围删除接受或恢复、代价相称、改动最小，另有一节专讲 PR 流程里「代价相称」只定推荐。`evidence` 连同两份参考约 23KB，按情形规定出什么图、放在哪个目录。

人在 0.2.0 重构的访谈里的态度是：核心是按 spec 的方案解决 spec 提出的问题；依据之间出现冲突，由 agent 告诉人，不要「有依据就照办」。逐情形的答案把判断做死，换一个项目、一个情形就不对。evidence 只讲证据是什么和整体风格，配图交给 AI，具体怎么用证据由更上层的调用方定。另外「要人定的写成一道题」讲的是怎么把决定交给人，却写在 evidence 里，要翻两个 skill 才找得到。

## 2 决策（how）

- **decision-rules 剪枝成六块**：核心（按 spec 的方案解决 spec 的问题）、依据只认三种（仓库规则原文、人已做过的决定、产品已有做法）、依据明确且没冲突就照做并单列「已按规则处理」、依据冲突或没有就停下问人、护栏（术语、动生产数据、真实支付、对外发布、合并改了代码的 PR 只由人定）、要人定的写成一道题。逐情形的处置词、「代价相称」「改动最小」和 PR 流程那一节全部删掉。
- **「一道题」只在 decision-rules**：从 evidence 挪回，单一事实来源。
- **evidence 只留三块**：证据是什么（出处、时间、版本、数字，复现才算证据，证据取自被判断的东西本身）、整体风格（结论在前，图贴着它支撑的那句话）、配什么图由模型判断，并列出可用的几种与各自的工具。
- **「放哪」挪给调用方**：spec 每节配什么图与图的存放，进 `to-spec` 的参考；复现过程文件放哪，进 `grill`；冻结时交互图放哪、怎么命名，进 `uiux-refine` 的冻结参考；交付证据放哪、素材分支怎么上传和删除、人验清单格式，进 `pr` 的参考。「按情形选哪种形态」的两张表直接删，交给模型。
- **不改名**：`decision-rules` 被二十多个文件和脚本按名字引用，改名不改行为，只加冲突。
- **调用方自己的处置表保留**：`pr-review` 的「每条候选标处置」、`implement` 对存量问题开 issue、`implementer` 的「停，还是延后」是各流程自己的做法，不是 decision-rules 的内容；本次只把它们引用的旧节名改成新节名。表里原指向「代价相称」的边缘情形一行，改指「依据冲突或没有：停下问人」，处置仍是「要你决定」。
- **护栏只列五项**：起名定稿、人验素材、分类体系、方案形状不再列（分类不需要；人验素材本来就由 `pr` 交给人看，不是一条决定）。

## 3 结果（result）

- `idea-loop/skills/productivity/decision-rules/SKILL.md` 现为上述六块，没有 `references/`，约 2.7K 字符。
- `idea-loop/skills/productivity/evidence/SKILL.md` 现为三块加几种图的清单，只剩 `references/` 下的 `ui-flow.md` 与 `gif.md`；旧的 `spec-figures.md`、`delivery.md` 已不在树上，插件里没有对它们的引用。
- 放哪的内容分别在 `to-spec` 的 `references/figures.md`、`pr` 的 `references/delivery-evidence.md`、`uiux-refine` 的 `references/freeze.md`。
- 文本断言钉在 `idea-loop/scripts/decision-evidence-principles-doc.test.mjs`。
- 合并为 PR #249。

## 取代线索

- 取代 `ADR-0036` 对 decision-rules 与 evidence 结构的描述（见顶部）。
- 与 ADR-0001、ADR-0002 无冲突（它们讲设计工作流）。
