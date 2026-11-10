---
type: adr
status: 生效
tags: [idea-loop, decision-rules, to-spec, pr, evidence, communication-style]
summary: decision-rules 只管谁来定；写给人看的写法归 evidence，to-spec 与 pr 按交付物重写，加规则先归并
related: ["[[2026-10-31-handing-to-human-split-grill]]", "[[2026-10-19-pr-decision-friction]]", "[[51]]", "[[80]]"]
---

# ADR-0036 — decision-rules 只管谁来定；to-spec 与 pr 按交付物重写

> 由 spec `decision-rules-who-decides` 蒸馏而来，该 spec 已删除。
> 其中「evidence 带共用写法与两份参考」「decision-rules 保留自己定的四条」两点后被 `ADR-0035` 取代，其余仍然生效。

## 1 背景（why）

人在一次 retro 里给 `decision-rules` 划了边界：核心是哪些内容自己判断、哪些交给人。但它正文最后一节「交给人时」连同一份参考（讲题怎么写：现状先查清、先写交付物再列做法、每个选项配真实例子）并不属于「谁来定」。真正用到那一半的只有 `to-spec`、`to-ticket`、`pr` 的停下汇报、`implementer`、README 两处。

连带发现三个同源问题：`to-spec` 和 `pr` 是一条条加规则攒出来的，没有一处从读者推结构（对照外部同名 skill，`to-spec` 主体超过仓库 5000 字上限，`pr` 有四份交付物、五个文件）；加规则只会追加，`retro` 的候选格式只有落点、旧文、新文三栏，天然是「在一处加一句」；用户级沟通风格是逐条枚举的，一半与插件重叠。

## 2 决策（how）

- **decision-rules 只讲谁来定**，删掉「交给人时」一节和 `handing-to-human` 参考；讲题怎么写的共用写法并入 `evidence`（结论在前、最小一张图贴着它支撑的话、现状带出处和数字、陌生叫法第一次出现讲清、比对同条件、要人定的写成题）。
- **to-spec 按交付物重写**：每一节写一行「这一节给读者什么」；「验证」节去掉，标题下用引用块写每个 issue 存在与否；「问题」改名「问题陈述」并配标注过的复现图；「方案」开头放一张时序图，原「技术方案总览」的后端、前端内部、前端交互成为「方案」的子小节。issue 不存在也照写 spec，方便 dreaming 归档成 ADR。读结论的脚本改读引用块，仍认旧 spec 的「验证」表。主体回到 5000 字以内。
- **pr 按交付物重写**：给人看的只剩两份，GitHub 上的 PR 描述和对话里的 Review 汇报（停下汇报并进来）；review loop 文件只是汇报的存档格式。「要你决定」每条同一格式，选项带能否回滚；PR 描述与汇报各加「能否回滚」一节。
- **加规则先归并**：`writing-for-agents` 加「加内容之前先看是不是已有原则的特例」，`retro` 候选格式加「归并」一栏。
- **全局沟通风格从读者出发、改中文**：开头写读者模型，推出结论在前、把实现翻译成读者认识的东西、证据贴着结论、要读者定的写成一道题，另列后台不沉默、转述用读者语言两条。该文件在人的本机、不进仓库，由人看过全文再写入。
- 节表先摆给人批，批了才改正文和脚本；脚本绑着的格式（`spec-status`、`pr-body.mjs`、`review-loop.mjs`、`review-check.mjs`）同一张工单连测试一起改。
- 回放用例 `explain-mechanism` 撤掉：它测的规则在全局沟通风格里，改前改后两边都读到，分不出插件改动。

## 3 结果（result）

- 树上已无「交给人时」与 `handing-to-human` 的引用（只剩 dreaming 里同名的「交给人时出候选卡 / 维护卡」步骤名，是另一回事）。
- `idea-loop/skills/engineering/to-spec/SKILL.md` 主体 4871 字符，每节有「给读者什么」；`idea-loop/skills/engineering/pr/SKILL.md` 有两份交付物各一张节表；`writing-for-agents` 与 `retro` 里有归并要求。
- 用户级 `~/.claude/CLAUDE.md` 的沟通风格已是中文、以读者为开头（树外，仅按本机读到的确认）。
- 文本断言在 `idea-loop/scripts/decision-rules-who-decides-doc.test.mjs`、`pr-by-deliverable-doc.test.mjs`、`to-spec-by-deliverable-doc.test.mjs`。合并为 PR #203。

## 取代线索

- `ADR-0035` 取代本 ADR 的 decision-rules 四条与 evidence 的结构（见顶部）。
- 与 ADR-0001、ADR-0002 无冲突。
