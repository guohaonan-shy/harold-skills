---
name: to-spec
description: 把当前上下文写成一份 spec 并发布到项目的 issue tracker。
---

把当前上下文和你对代码库的理解综合成一份 spec。不访谈，只把已知的写下来。综合时发现思考本身有洞，停下回 `idea-loop:grill`，别在 spec 里粉饰。

issue tracker 怎么用、状态 label 是什么意思，setup 已经写进目标仓库根目录的 `ISSUE_TRACKER.md`；没有这份文件，告诉人先跑 `/idea-loop:setup`。

先用 Skill 工具调 `idea-loop:wiki-conventions`（目录、frontmatter、slug）和 `idea-loop:spec-status`（状态只走脚本）。下文 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指目标项目的 `docs/`。

## 过程

1. **查布局**：跑 `spec-status check <docs>`。报了旧平铺布局就停下，提议照 wiki-conventions 的「从平铺布局迁移」迁移。

2. **落 raw transcript**：上下文里有跟人的讨论才写。写进 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`，正文照下面的 `<raw-template>`。frontmatter 写 `type: raw`、`source_type: conversation`、`captured: <今天>`、`title`（人读的标题）、`tags: [<topic>, <feature-slug>]`、`related: ["[[<spec-slug>]]"]`。讨论里引用过的外部材料（网页、PDF、查询结果、截图）抓进同一个桶，各自带 `source_type` 和 `captured`；图片下载到 `assets/`，每张配一段文字描述，没有文字的图不算捕获。

3. **探代码**：没探过就先探，看清现状。目标项目有 `GLOSSARY.md` 就用它的标准叫法、不用 `_Avoid_` 里的词，缺词不问、不写，先用描述性的说法；这一块有 ADR 就守它。

4. **谈 seam**：seam 是测试观察行为的那个公共边界，测试从这里喂输入、读输出，不伸手进它背后的实现。定准备在哪些 seam 上测：优先复用已有的，用能用的最高一层，越少越好，理想是一个；要新的就提在尽可能高的位置。每个 seam 带一行「它能抓到什么、漏掉什么」。人在场就摆给人确认再往下写；不在场就自己定，等人审 spec 时确认。

5. **写 spec**：写进 `docs/spec/<slug>/<slug>.md`，slug 全局唯一，且不同于 transcript 的 slug。frontmatter 写：
   - `type: spec`；
   - `status: 审核中`；
   - `tags`、`summary`（一句话，≤60 字）；
   - `related`：有 transcript 挂 `"[[<transcript-slug>]]"`，再挂相关的 spec 与 ADR，没有就留空列表。

   让 spec 在 tracker 上有入口：覆盖了已有的 issue，每个跑一次 `issues handoff <docs> <slug> <号>`，号码进 frontmatter 的 `issues`，不挂的话 `issue-dispatch` 会为同一个 issue 再起草一份；一个都没覆盖，跑 `issues open <docs> <slug>` 开一个 spec issue。两条都只写号码，label 等合进主分支后才挂。

   frontmatter 之后第一行是 `# <标题>`，再往下照 `<spec-template>`。几条贯穿全文的规则在 `idea-loop:decision-rules`，模板里只写它落在哪一节：
   - 现状的陈述都带出处，讲影响带规模数字（「现状先查清」）；
   - 先写交付物，再写做法（「先写交付物，再列做法」）；
   - 能按规则判的自己定，写成已定的决定并注明依据；依据不成立的才写成选项（「自己定的四条」「交给人时」）。

   图怎么画、放哪照 `idea-loop:evidence` 的「spec 里的图」：excalidrawer 的图在 `.tmp/to-spec/<spec-slug>/` 里渲染，`docs/` 里只放 PNG。

6. **分流**：跑 `spec-status route <docs> <slug>`。spec 里没有等人定的（开头的「需要 grill」、「实现决策」里的「待定」、「建议关闭」），它就按碰不碰 UI 翻成 `待设计` 或 `待实现`；有，就留在 `审核中`，并说出还剩哪几样。不用等人审：人在对话里答过的、规则能判的，已经写成定下的决定了。

7. **合进主分支，发布到 issue tracker**：loop 只从主分支取活，所以 spec 先经一个只改 `docs/` 的 PR 合进主分支，再给 issue 挂 label，免得 label 指向一份主分支上没有的 spec。
   调用方说了提交、合并和发布由它来做的（比如 `issue-dispatch` 的起草），这一步整个留给它。

   1. 提交到从最新主分支开出的 `spec/<slug>` 分支，只带这份 spec 的目录、raw 桶和 `docs/spec/index.md`；工作区里有别的改动，就另开一个 worktree 来提交。推送，`gh pr create`。
   2. `gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`，然后在更新过的主分支上跑 `issues sync <docs> <slug>`，按 spec 的状态挂上 label。检查失败就停下告诉人。

8. **收工**：告诉人这份 spec 到了哪个状态。`待设计` / `待实现` 的，由 `issue-dispatch` 对应状态的 loop 接手，人也可以自己调 `/idea-loop:uiux-imagine` 或 `idea-loop:to-ticket`。留在 `审核中` 的，说清还剩哪几样等人定：人在场就接着在这里定，定完删掉对应的标记，`spec-status set` 翻状态，照第 7 步合进主分支；不在场就等审核的 loop 开会话。人改了某个决定，牵出的图、User Stories 的树和测试决策同一轮改掉。

这里不建工单（`idea-loop:to-ticket` 的事），不写 ADR（`/idea-loop:dreaming` 的事）。

<raw-template>

<一段格式约定，让这份文件自解释：U 是人的原话，A 是 AI 的结论>

## U1

<人的发言，逐字保留，不改写不精简：决策住在这里>

## A1

<AI 的回应，只留结论与发现；取证过程、工具调用、中间推演都略去。引用的外部产物留链接，不复制正文>

…

## 本轮决议

| 议题 | 决议 |
|---|---|

</raw-template>

<spec-template>

## 问题

用户现在卡在哪，用户视角；不是「我们要建 X」。每个问题一个小节，先证据、后文字。证据是复现时挑出来、标注好的图，形式按问题性质选，见 `idea-loop:evidence` 里「问题的复现证据」：有 raw 桶的放桶里的 `assets/`，没有的放这份 spec 目录下的 `assets/`，不取 `.tmp/` 下的工作文件。新功能也有图：现在的 UI 加红色光圈，标出哪里不够用。

复现的结论写成人读得懂的话：测了什么、看到什么、本该是什么，带一个具体例子。测试的失败输出、堆栈、查询语句、整段日志不进 spec，要指回原始材料就在小节末尾写一行「复现材料：`<路径>`」。

### 根因

放在全部证据之后。一条根因对应一处证据。没复现的，句末标「（未复现：卡在哪；依据：…）」，只用于人确认过不复现的。复现推翻了先前的说法，写「修正：原先认为 X，实测是 Y」。不涉及根因的新功能写「不涉及」。

## 方案

用户视角的解法。先写用户最终得到什么、由哪些输入决定，再写怎么做。同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由。

## User Stories

一份很长的 story 列表，覆盖这个特性的每一面：pr-review 的 Spec 轴逐条比对它。每条写成：

1. 作为 <角色>，我想要 <能力>，以便 <收益>

<user-story-example>
1. 作为备考的学生，我想要重做一道错题时不扣练习次数，以便放心把错题再做一遍
</user-story-example>

按场景分组，每个场景一棵 story 树（excalidrawer `tree`，场景 → story，从左到右），图下是同样的编号列表。编号在每个场景内从 1 开始；别处引用写「场景名 + 编号」。

只修问题、不加能力的 spec 不画树：每个问题一行「期望行为」，编号跟「问题」的小节对上。

## 实现决策

要建或改的模块、它们的接口、技术澄清、架构选择、schema 变更、API 契约、具体交互。能按规则判的写成已定的决定，注明依据（规则原文、人的原话或现存实例），边缘情形在这里定好，不留给 implement 停下。依据不成立的才写成选项，每条一个小节，标题是「### 待定：<要定的问题>」：选项差在用户能感到的地方，每个选项配一个具体例子，写上推荐。人定了，就把小节改写成定下的决定、删掉「待定」两个字。

不写文件路径和代码片段，它们烂得最快。例外：原型里产出的片段比散文更准地说清了一个决定（状态机、reducer、schema、类型形状），就内联进那条决定，注明出自原型，只留带决定的部分。

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
| 视觉正确性 | UI 实现环（`idea-loop:ui-measure`，逐格比对冻结画布） | |
| 端到端用户流程 | 浏览器端到端测试 | |

判据是能不能先写出一个会红的测试：前三行能，走 TDD；后三行的输出不确定、靠感知或跨系统，换别的仪器。prompt 改动本身走 eval，但 prompt 产出的结构（schema、字段、枚举闭集）走 TDD。具体工具用目标项目自己的。

然后写：

- **seam**：第 4 步定下的那几个。
- **增量功能测试**：新行为的黑盒验收，用户视角、可证伪，写成前置 / 步骤 / 期望 / 覆盖（场景名 + 编号），标明落在哪个页面。
- **prompt / eval 变动**：改了哪些 prompt、要加或改哪些 eval。没有就写「无 prompt/eval 变动」。
- **照着谁写**：仓库里同类测试的先例。

mock 只在系统边界，规则见 `idea-loop:tdd` 的「mock 只在系统边界」。

## Out of scope

明确的非目标。方案里排除的入口在这里再列一遍，各带一句理由。

## 关联

raw 素材、相关 spec、相关 ADR；覆盖的 issue 逐个写 `#<号>` 加标题。相邻在飞的 spec 与 issue：查过，写明有没有重叠、谁先谁后，没有写「无」。

## 建议关闭

有才写。覆盖的 issue 里复现不出、或已经被做掉的，不进正文，列在这里，每条三样，缺一样人审核时就得自己去查：

- **现象**：issue 说的是什么，一句话，带 `#<号>`。
- **现状证据**：为什么现在不成立。复现不出的，写试了什么、卡在哪；已经做掉的，指出现在的规则或代码在哪。
- **怎么验证的**：什么时候、对着哪个基准分支、用什么手段核的。

</spec-template>
