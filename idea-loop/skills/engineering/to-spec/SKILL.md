---
name: to-spec
description: 把刚才的对话写成一份 spec（连同 raw transcript）；或把一组 GitHub issue 起草成 spec 草稿。
---

把当前对话和你对代码库的理解，综合成一份 spec 和它的 raw transcript。不再访谈：该问的 `grill` 已经问完了，这里只把已知的东西写下来。综合时发现思考本身有洞，停下回 `grill`，别在 spec 里粉饰。

输入是一组 GitHub issue、没有对话时（通常由 `idea-loop:issue-explorer` 调），照 [`references/from-issues.md`](references/from-issues.md) 走，它只写跟下面不同的地方。

先读 `../wiki-conventions/SKILL.md`（目录、frontmatter、slug）和 `../spec-status/SKILL.md`（状态只走 `spec-status.mjs`）。下文的 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/`。

## 过程

1. **查布局**：跑 `spec-status check <docs>`。报了旧平铺布局就停下，提议照 wiki-conventions 的「从平铺布局迁移」迁移。

2. **落 raw transcript**：写进 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`，照下面的 `<raw-template>`。讨论里引用过的外部材料（网页、PDF、查询结果、截图）抓进同一个桶，各自带 `source_type` 和 `captured`；图片下载到 `assets/`，每张配一段文字描述，没有文字的图不算捕获。

3. **探代码，谈 seam**：没探过就先探，看清现状。目标项目有 `GLOSSARY.md` 就用它的标准叫法、不用 `_Avoid_` 里的词，缺词不问、不写，先用描述性的说法；这一块有 ADR 就守它。然后定准备在哪些 seam 上测：优先复用已有的，用能用的最高一层，越少越好，理想是一个；要新的就提在尽可能高的位置。每个 seam 带一行「它能抓到什么、漏掉什么」，摆给人确认再往下写。

4. **写 spec**：写进 `docs/spec/<slug>/<slug>.md`，slug 全局唯一，且不同于 transcript 的 slug。照下面的 `<spec-template>`。几条贯穿全文的规则在 `../decision-rules/SKILL.md`，下面模板里只写它落在哪一节：
   - 现状的陈述都带出处，讲影响带规模数字（「现状先查清」）；
   - 先写交付物，再写做法（「先写交付物，再列做法」）；
   - 能按规则判的自己定，写成已定的决定并注明依据；依据不成立的才写成选项（「自己定的四条」「交给人时」）。

   图怎么画、放哪照 [`references/spec-figures.md`](references/spec-figures.md)：excalidrawer 的图在 `.tmp/to-spec/<spec-slug>/` 里渲染，`docs/` 里只放 PNG。

5. **刷索引，挂 issue**：`spec-status index <docs>` 刷新 `docs/spec/index.md`。对话里谈的是某几个 GitHub issue 的，每个跑一次 `issues.mjs handoff`，再跑一次 `issues.mjs sync`（见 spec-status 的「issue 的 label」）；不挂，`issue-dispatch` 会为同一个 issue 再起草一份。

6. **收工**：告诉人下一步是通读这份 spec。人审完之后：碰 UI 的（「前端交互」标着「待补图」）跑 `/idea-loop:uiux-imagine`，它开工时把状态翻成 `设计中`；不碰 UI、人明说同意的，接 `to-ticket`。

spec 一律落 `审核中`，碰不碰 UI 都一样：grill 里人答过的问题不等于人同意了整份 spec。翻 `在飞` 归 `to-ticket`。人审完改了某个决定，牵出的图、User Stories 的树和测试决策同一轮改掉。

这里不建工单（`to-ticket` 的事），不写 ADR（`dreaming` 的事）。

<raw-template>

```markdown
---
type: raw
source_type: conversation
captured: <today>
title: <人读的标题>
tags: [<topic>, <feature-slug>]
related: ["[[<spec-slug>]]"]
---

<一段格式约定，让这份文件自解释：U 是人的原话，A 是 AI 的结论>

## U1
<人的发言，逐字保留，不改写不精简：决策住在这里>

## A1
<AI 的回应，只留结论与发现；取证过程、工具调用、中间推演都略去。引用的外部产物留链接，不复制正文>

…

## 本轮决议
| 议题 | 决议 |
|---|---|
```

</raw-template>

<spec-template>

```markdown
---
type: spec
status: 审核中
tags: [...]
summary: <一句话，≤60 字>
related: ["[[<transcript-slug>]]"]
---

# <标题>

## 问题

用户现在卡在哪，用户视角；不是「我们要建 X」。每个问题一个小节，先证据、后文字。证据是 grill 复现时挑出来的图（raw 桶的 `assets/`，不取 `.tmp/grill/` 下的工作文件），形式按问题性质选，见 spec-figures 的「问题的复现证据」。新功能也有图：现在的 UI 加红色光圈，标出哪里不够用。

### 根因

放在全部证据之后。一条根因对应一处证据。没复现的，句末标「（未复现：卡在哪；依据：…）」，只用于 grill 里人确认过不复现的。复现推翻了先前的说法，写「修正：原先认为 X，实测是 Y」。不涉及根因的新功能写「不涉及」。

## 方案

用户视角的解法。先写用户最终得到什么、由哪些输入决定，再写怎么做。同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由。

## User Stories

`作为 <角色>，我想要 <能力>，以便 <收益>`。铺得足够全，覆盖这个特性的每一面：pr-review 的 Spec 轴逐条比对它。

按场景分组，每个场景一棵 story 树（excalidrawer `tree`，场景 → story，从左到右），图下是同样的编号列表。编号在每个场景内从 1 开始；别处引用写「场景名 + 编号」。

## 实现决策

要建或改的模块、它们的接口、技术澄清、架构选择、schema 变更、API 契约、具体交互。能按规则判的写成已定的决定，注明依据（规则原文、人的原话或现存实例），边缘情形在这里定好，不留给 implement 停下。依据不成立的才写成选项：差在用户能感到的地方，每个选项配一个具体例子。

不写文件路径和代码片段，它们烂得最快。状态机、schema、类型形状这类散文说不清的可以内联，注明出处。

碰 UI 的再写访谈里定下的结构决策：这块界面按什么结构组织。下游设计从下一层高度开始，不重开它们。

## 技术方案总览

把实现决策按「谁和谁说话、按什么顺序」串起来。理由留在实现决策里，这里只引用那一小节。三个小节都要有，不涉及的写「不涉及」：

### 后端

excalidrawer `sequence`：浏览器、API、DB、对象存储或第三方。本 spec 新增或改动的消息用红色，响应用虚线。图下几行列出接口变化。

### 前端内部

缓存、状态这类看不见的部分，同样用 `sequence` 画清各层的读写顺序。图下写读路径、写路径和每层的生命周期。

### 前端交互

不碰 UI 写「不涉及」。碰 UI 的，每个场景一行文字（触发 → 变化），小节开头标「待补图：uiux-refine 冻结时按冻结画布补交互图，替换本节文字」。

## 测试决策

先逐行过下表，标出这次碰到哪几行、各自怎么验；碰不到的写「不涉及」，不留空。写不出对应的仪器，就是还没想清楚要改什么。

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | |
| API 契约（路由、schema、序列化） | TDD API 测试 | |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | |
| 视觉正确性 | UI 实现环（uiux-refine 的 `ui-implementation-standard.md`） | |
| 端到端用户流程 | 浏览器端到端测试 | |

判据是能不能先写出一个会红的测试：前三行能，走 TDD；后三行的输出不确定、靠感知或跨系统，换别的仪器。prompt 改动本身走 eval，但 prompt 产出的结构（schema、字段、枚举闭集）走 TDD。具体工具用目标项目自己的。

然后写：

- **seam**：第 3 步跟人谈拢的那几个。
- **增量功能测试**：新行为的黑盒验收，用户视角、可证伪，写成前置 / 步骤 / 期望 / 覆盖（场景名 + 编号），标明落在哪个页面。
- **prompt / eval 变动**：改了哪些 prompt、要加或改哪些 eval。没有就写「无 prompt/eval 变动」。
- **照着谁写**：仓库里同类测试的先例。

mock 只在系统边界，规则见 `tdd` 的「mock 只在系统边界」。

## Out of scope

明确的非目标。方案里排除的入口在这里再列一遍，各带一句理由。

## 关联

raw 素材、相关 spec、相关 ADR。相邻在飞的 spec 与 issue：查过，写明有没有重叠、谁先谁后，没有写「无」。
```

</spec-template>
