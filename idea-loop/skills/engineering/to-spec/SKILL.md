---
name: to-spec
description: 把当前上下文（一场讨论，或一组复现过的 issue）写成一份 spec。讨论收尾要落成 spec 时用。
---

把当前上下文和你对代码库的理解综合成一份 spec，交付是写好并提交到 home 的 `docs/spec/<slug>/<slug>.md`。不访谈，只把已知的写下来。综合时发现思考本身有洞，停下，用 Skill 工具调 `idea-loop:grill` 把洞问清，spec 只写问清了的。

spec 只给下游 agent 读（切工单、探路、实现、review），节的取舍从模板每节的「给下游什么」推出来；人读的是第 5 步写在会话里的那一段。

## 过程

1. **开工**：issue tracker 怎么用在项目目录的 `ISSUE_TRACKER.md`，没有就告诉人先跑 `/idea-loop:setup`。用 Skill 工具调 `idea-loop:wiki-conventions` 和 `idea-loop:issues`。`<docs>` 指 `<项目目录>/docs/`（`idea-loop:wiki-conventions` 的「项目目录」）。先跑 `dyna spec check <docs>`，报的问题照 `idea-loop:issues` 处理。完成条件：它没有未处理的报告。

2. **落 raw**：上下文里有跟人的讨论才写，进 `<docs>/raw/<topic>/<YYYY-MM-DD>-<slug>.md`，frontmatter 和正文照 [`references/raw-template.md`](references/raw-template.md)。

3. **探代码并谈 seam**：没探过就先探，探到 spec 要写的每条现状都能说清在哪、什么时候查的：照 `idea-loop:evidence` 的「证据是什么」核，现状要对，下游照它找代码。要改的是给 agent 读的文档（skill、参考、agent 定义、`AGENTS.md`）时，再读 [`references/agent-docs.md`](references/agent-docs.md)。项目目录有 `GLOSSARY.md` 就照 `idea-loop:wiki-conventions` 的「术语表」读它来命名；这一块有 ADR 就守它。
   seam 是测试观察行为的公共边界，测试从这里喂输入、读输出。优先复用已有的，用能用的最高一层，越少越好，理想是一个；要新的就提在尽可能高的位置，每个带一行「它能抓到什么、漏掉什么」。人在场就摆给人确认，不在场自己定。写进「测试决策」。

4. **写 spec**：写进 `docs/spec/<slug>/<slug>.md`，slug 全局唯一，且不同于 transcript 的 slug。frontmatter：`type: spec`、`tags`、`summary`（一句话，≤60 字）、`related`（有 transcript 挂 `"[[<transcript-slug>]]"`，再挂相关的 spec 与 ADR，没有留空列表）。完成条件：模板每节都有内容，或写明「不涉及」。

   spec 没有自己的状态，走到哪只看它覆盖的 issue。覆盖了已有的 issue，号码写进 frontmatter 的 `issues`；一个都没覆盖：人在场，照 `idea-loop:issues` 的「开一个 issue」按人说的用 `dyna issues new` 开成 todo 并写进 `issues`，不在场，停下问人。

   frontmatter 之后是 `# <标题>`，再照 `<spec-template>`。

5. **交 spec**：在会话里给人写一段「现状 → 目标 → 要你定」：现状是用户在哪遇到什么问题，目标是改完用户得到什么，要你定是要人定的每件事，各写成一道题，写法照 home 固定文案的「要我定的事写成一道题」（没有就写没有）；证据照 `idea-loop:evidence`。再点名还剩的标记：开头的 `> 需要 grill`、「实现决策」里的 `### 待定` 原样留在 spec 里，它们由 triage 里的会话定，定完删掉标记，issue 翻 todo 时命令核这两样都没了（`idea-loop:issues` 的「状态」）；人在场就在这里接着定。最后跑 `dyna spec index <docs>`。完成条件：会话里有现状、目标、要你定，还剩的标记都点了名，索引已刷新。

6. **提交并收工**：spec 提交到 home，再告诉人它到了哪个状态；怎么提交、挂 label、接着往下走，见 [`references/land-on-main.md`](references/land-on-main.md)。调用方说了提交由它来做的（比如 `idea-loop:issue-session`），这一步留给它。完成条件：spec 已进 home，人知道它到了哪个状态。

工单归 `idea-loop:to-ticket`，ADR 归 `/idea-loop:dreaming`，这里只写 spec。

<spec-template>

以下每节的「给下游什么」是写这一节的依据，不写进 spec。

开头（标题下，spec 里还有没问清的洞才写）：`> 需要 grill：<为什么>`。

给下游什么：这份 spec 还没定稿，issue 翻 todo 前它要被删掉。

## 问题陈述

给下游什么：用户现在遇到什么问题，下游照它找代码、定验收。用户视角，不是「我们要建 X」；每个问题一个小节，只写文字：测了什么、看到什么、本该是什么，带一个具体例子，原因写在同一段里，一条原因对应一处证据。没复现的，句末标「（未复现：卡在哪；依据：…）」，只用于人确认过不复现的；复现推翻了先前的说法，写「修正：原先认为 X，实测是 Y」。新功能写现在哪里不够用。失败输出、堆栈、查询语句、整段日志放文件，小节末尾写「复现材料：`<路径>`」。

## 方案

给下游什么：改完用户得到什么，以及怎么做的全貌，不用翻代码。按这四点写：

1. 先写用户最终得到什么、由哪些输入决定，再写做法；
2. 选项差在用户能感到的地方，只差内部结构的不是选项；
3. 每个选项牵出的中间状态写全；
4. 改了方案，测试表同步改。

同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由，只在这里列。

涉及前端交互的，加 `### 前端交互` 子小节：每个场景一行（触发 → 变化），小节开头标「待补图：uiux-refine 冻结时按冻结画布补交互图，替换本节文字」。`uiux-imagine`、`uiux-refine` 和设计师读它，命令靠有没有这一小节判断 spec 碰不碰 UI；不涉及的不写。

## User Stories

给下游什么：这个特性每一面的期望行为，`idea-loop:pr-review` 的 Spec 轴逐条对，目标用例的 `goal_from` 指它。一个编号列表，每条：

1. 作为 <角色>，我想要 <能力>，以便 <收益>

按场景分组，编号在每个场景内从 1 开始，别处引用写「场景名 + 编号」。只修问题、不加能力的 spec：每个问题一行「期望行为」，编号跟「问题陈述」的小节对上。

## 实现决策

给下游什么：已经定下的决定和它的依据；还要人定的题。

模块、接口、schema、API 契约、具体交互这类决定。每条先照用户规则 `~/.claude/CLAUDE.md` 的「思考与决策」判：落在「只由我做」「停下问我」里的才写成选项（写法照「沟通」），每条一个小节，标题「### 待定：<要定的问题>」，带推荐；人定了，改写成定下的决定、删掉「待定」两个字。其余的自己定，写成已定的决定，注明目标原文和这个做法为什么达成它（再加规则原文、人的原话或现存实例这类依据），边缘情形在这里定好，不留给 implement 停下。

不写文件路径和代码片段，它们烂得最快；例外是原型里产出的片段比散文更准地说清了一个决定（状态机、schema、类型形状），内联进那条决定并注明出自原型。碰 UI 的再写访谈里定下的结构决策（这块界面按什么结构组织），下游设计在它之内做，不重开。

## 测试决策

给下游什么：怎么证明做对了，`idea-loop:to-ticket`、`idea-loop:tdd` 和执行方照它选仪器。过一遍下表，只写这次碰到的行、各自怎么验；写不出对应的仪器，就是还没想清楚要改什么。

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | |
| API 契约（路由、schema、序列化） | TDD API 测试 | |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | |
| LLM 输出质量（prompt 改动） | eval，门槛对线上基线、不写绝对值；装了 `ai-eval` 的项目，跑流水线的改动走 eval-run，多轮对话里的一步走 eval-replay | 改了哪些 prompt、要加或改哪些 eval；skill 改动写「见杠杆诊断各处的验证」 |
| 视觉正确性 | UI 实现环（`idea-loop:ui-measure`，逐格比对冻结画布） | |
| 端到端用户路径 | 浏览器端到端测试 | |

判据是能不能先写出一个会红的测试：前三行能，走 TDD（`idea-loop:tdd`）；后三行输出不确定、靠感知或跨系统，换别的仪器。prompt 产出的结构（schema、字段、枚举闭集）走 TDD。工具用目标项目自己的。然后写：

- **seam**：第 3 步定下的那几个。
- **增量功能测试**：新行为的黑盒验收，用户视角、可证伪，写成前置 / 步骤 / 期望 / 覆盖（场景名 + 编号），标明落在哪个页面。
- **照着谁写**：仓库里同类测试的先例。

## Out of scope

给下游什么：明确不做的事，下游不顺手做。

## 关联

给下游什么：这份 spec 跟别处的关系。raw 素材、相关 spec、相关 ADR；相邻还没完成的 spec 与 issue：查过，写明有没有重叠、谁先谁后，没有写「无」。

</spec-template>
