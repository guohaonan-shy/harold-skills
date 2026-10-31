---
name: to-spec
description: 把当前上下文（一场讨论，或一组复现过的 issue）写成一份 spec，经 PR 合进主分支。讨论收尾要落成 spec 时用。
---

把当前上下文和你对代码库的理解综合成一份 spec。不访谈，只把已知的写下来。综合时发现思考本身有洞，停下，用 Skill 工具调 `idea-loop:grill` 把洞问清，spec 只写问清了的。

spec 的读者清楚方向和高层设计，不清楚实现细节，要快速看懂问题、看到证据、做出决定；下游的 agent（切工单、实现、review）也照它做。模板每一节写一行「这一节给读者什么」，节的取舍从这里推出来。

## 过程

1. **开工**：issue tracker 怎么用在目标仓库根目录的 `ISSUE_TRACKER.md`，没有就告诉人先跑 `/idea-loop:setup`。用 Skill 工具调 `idea-loop:wiki-conventions` 和 `idea-loop:spec-status`（状态只走脚本）。下文 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指目标项目的 `docs/`。先跑 `spec-status check <docs>`，报的问题照 `idea-loop:spec-status` 处理。

2. **落 raw**：上下文里有跟人的讨论才写，进 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`，正文照 [`references/raw-template.md`](references/raw-template.md)。frontmatter：`type: raw`、`source_type: conversation`、`captured: <今天>`、`title`、`tags: [<topic>, <feature-slug>]`、`related: ["[[<spec-slug>]]"]`。

3. **探代码并谈 seam**：没探过就先探，探到 spec 要写的每条现状都能照 `idea-loop:evidence` 说清在哪、什么时候查的。目标项目有 `GLOSSARY.md` 就用它的标准叫法、不用 `_Avoid_` 里的词，缺词先用描述性的说法；这一块有 ADR 就守它。
   seam 是测试观察行为的公共边界，测试从这里喂输入、读输出。优先复用已有的，用能用的最高一层，越少越好，理想是一个；要新的就提在尽可能高的位置，每个带一行「它能抓到什么、漏掉什么」。人在场就摆给人确认，不在场自己定。写进「测试决策」。

4. **写 spec**：写进 `docs/spec/<slug>/<slug>.md`，slug 全局唯一，且不同于 transcript 的 slug。frontmatter：`type: spec`、`status: 草稿`、`tags`、`summary`（一句话，≤60 字）、`related`（有 transcript 挂 `"[[<transcript-slug>]]"`，再挂相关的 spec 与 ADR，没有留空列表）。

   让 spec 在 tracker 上有入口：覆盖了已有的 issue，每个跑一次 `issues handoff <docs> <slug> <号>`，号码进 frontmatter 的 `issues`；一个都没覆盖，跑 `issues open <docs> <slug>` 开一个 spec issue。两条都只写号码，label 等合进主分支后由对账挂。

   frontmatter 之后是 `# <标题>`，再照 `<spec-template>`。写给人看的方法（结论在前、最小视图、现状和选项怎么写）用 Skill 工具调 `idea-loop:evidence`，图照它的「spec 里的图」，这里不复述。能按规则判的自己定，写成已定的决定并注明依据，依据不成立的才写成选项（`idea-loop:decision-rules` 的「自己定的四条」）。

5. **分流**：跑 `spec-status route <docs> <slug>`。覆盖的 issue 在开头那几行里全都「不存在」的，翻成 `完成`；还有等人定的（开头的「需要 grill」、「实现决策」里的「待定」），翻成 `审核中` 并说出还剩哪几样；都没有就是 `正式`。人在场又是 `审核中`，就在这里接着定，定完删掉标记，`spec-status set <docs> <slug> 正式`。

6. **合并并收工**：spec 先经一个只改 `docs/` 的 PR 合进主分支，再告诉人它到了哪个状态；怎么提交、合并、挂 label、接着往下走，见 [`references/land-on-main.md`](references/land-on-main.md)。调用方说了提交和合并由它来做的（比如 `idea-loop:issue-verify`），这一步留给它。

工单归 `idea-loop:to-ticket`，ADR 归 `/idea-loop:dreaming`，这里只写 spec。

<spec-template>

以下每节的「给读者什么」是写这一节的依据，不写进 spec。

开头（标题下，覆盖了已有的 issue 才写）：

给读者什么：每个 issue 现在是真问题，还是已经没了。每个 issue 一行引用，结论只写「存在」或「不存在」，脚本按这两个词判断 spec 能不能直接完成、issue 该不该关：

> #<号> 存在：一句话的复现现象，详情在「问题陈述」
> #<号> 不存在：试了什么、卡在哪（或现在的规则、代码在哪）；什么时候、对着哪个基准分支、用什么手段核的

覆盖的 issue 全都不存在的 spec，只写这几行和「关联」。

## 问题陈述

给读者什么：用户现在到底遇到什么问题，配标注过的复现图。用户视角，不是「我们要建 X」。每个问题一个小节，先图后文字；图的形式和放哪照 `idea-loop:evidence` 的「问题的复现证据」，新功能就在现在的 UI 上加红色光圈标出哪里不够用。

复现结论写成人读得懂的话：测了什么、看到什么、本该是什么，带一个具体例子。失败输出、堆栈、查询语句、整段日志不进 spec，要指回去就在小节末尾写「复现材料：`<路径>`」。

### 根因

放在全部证据之后，一条根因对应一处证据。没复现的，句末标「（未复现：卡在哪；依据：…）」，只用于人确认过不复现的。复现推翻了先前的说法，写「修正：原先认为 X，实测是 Y」。新功能没有根因就不写这一小节。

## 方案

给读者什么：改完用户得到什么，以及怎么做的全貌，不用翻代码。

开头一张前后端或模块之间的交互时序图（画法照 `idea-loop:evidence` 的「时序图」），新增或改动的消息标出来。图下按这四点写：

1. 先写用户最终得到什么、由哪些输入决定，再写做法；
2. 选项差在用户能感到的地方，只差内部结构的不是选项；
3. 每个选项牵出的中间状态写全；
4. 改了文字，图和测试表同步改。

同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由，只在这里列。

下面三个子小节，不涉及的不写：

- `### 后端`：图下几行列出接口变化。
- `### 前端内部`：缓存、状态这类看不见的部分，写读路径、写路径和每层的生命周期；需要图就再画一张时序图。
- `### 前端交互`：每个场景一行（触发 → 变化），小节开头标「待补图：uiux-refine 冻结时按冻结画布补交互图，替换本节文字」。脚本靠有没有这一小节判断 spec 碰不碰 UI。

## User Stories

给读者什么：这个特性每一面的期望行为，`idea-loop:pr-review` 的 Spec 轴逐条对。每条：

1. 作为 <角色>，我想要 <能力>，以便 <收益>

<user-story-example>
1. 作为备考的学生，我想要重做一道错题时不扣练习次数，以便放心把错题再做一遍
</user-story-example>

按场景分组，每个场景一棵 story 树（画法照 `idea-loop:evidence` 的「User Stories 的树」），图下是同样的编号列表。编号在每个场景内从 1 开始，别处引用写「场景名 + 编号」。只修问题、不加能力的 spec 不画树：每个问题一行「期望行为」，编号跟「问题陈述」的小节对上。

## 实现决策

给读者什么：已经定下的决定和它的依据；还要人定的题。

模块、接口、技术澄清、架构选择、schema、API 契约、具体交互。能按规则判的写成已定的决定，注明依据（规则原文、人的原话或现存实例），边缘情形在这里定好，不留给 implement 停下。依据不成立的才写成选项，每条一个小节，标题「### 待定：<要定的问题>」，带推荐；人定了，改写成定下的决定、删掉「待定」两个字。

不写文件路径和代码片段，它们烂得最快；例外是原型里产出的片段比散文更准地说清了一个决定（状态机、schema、类型形状），内联进那条决定并注明出自原型。碰 UI 的再写访谈里定下的结构决策（这块界面按什么结构组织），下游设计在它之内做，不重开。

## 测试决策

给读者什么：怎么证明做对了。先逐行过下表，标出这次碰到哪几行、各自怎么验；碰不到的写「不涉及」，不留空。写不出对应的仪器，就是还没想清楚要改什么。

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | |
| API 契约（路由、schema、序列化） | TDD API 测试 | |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了哪些 prompt、要加或改哪些 eval |
| 视觉正确性 | UI 实现环（`idea-loop:ui-measure`，逐格比对冻结画布） | |
| 端到端用户流程 | 浏览器端到端测试 | |

判据是能不能先写出一个会红的测试：前三行能，走 TDD（`idea-loop:tdd`）；后三行输出不确定、靠感知或跨系统，换别的仪器。prompt 产出的结构（schema、字段、枚举闭集）走 TDD。工具用目标项目自己的。然后写：

- **seam**：第 3 步定下的那几个。
- **增量功能测试**：新行为的黑盒验收，用户视角、可证伪，写成前置 / 步骤 / 期望 / 覆盖（场景名 + 编号），标明落在哪个页面。
- **照着谁写**：仓库里同类测试的先例。

## Out of scope

给读者什么：明确不做的事。方案里已经排除的入口不再重复列。

## 关联

给读者什么：这份 spec 跟别处的关系。raw 素材、相关 spec、相关 ADR；相邻还没完成的 spec 与 issue：查过，写明有没有重叠、谁先谁后，没有写「无」。

</spec-template>
