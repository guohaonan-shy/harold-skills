---
name: to-spec
description: 把当前上下文（一场讨论，或一组复现过的 issue）写成一份 spec，经 PR 合进主分支。讨论收尾要落成 spec 时用。
---

把当前上下文和你对代码库的理解综合成一份 spec。不访谈，只把已知的写下来。综合时发现思考本身有洞，停下，用 Skill 工具调 `idea-loop:grill` 把洞问清，spec 只写问清了的。

issue tracker 怎么用、状态 label 是什么意思，在目标仓库根目录的 `ISSUE_TRACKER.md`；没有这份文件，告诉人先跑 `/idea-loop:setup`。

先用 Skill 工具调 `idea-loop:wiki-conventions`（目录、frontmatter、slug）和 `idea-loop:spec-status`（状态只走脚本）。下文 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指目标项目的 `docs/`。

## 过程

1. **查布局**：跑 `spec-status check <docs>`，报的问题照 `idea-loop:spec-status` 处理。

2. **落 raw transcript**：上下文里有跟人的讨论才写。写进 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`，正文照下面的 `<raw-template>`。frontmatter 写 `type: raw`、`source_type: conversation`、`captured: <今天>`、`title`（人读的标题）、`tags: [<topic>, <feature-slug>]`、`related: ["[[<spec-slug>]]"]`。讨论里引用过的外部材料（网页、PDF、查询结果、截图）抓进同一个 `docs/raw/<topic>/` 目录，各自带 `source_type` 和 `captured`；图片下载到 `assets/`，每张配一段文字描述，没有文字的图不算捕获。

3. **探代码**：没探过就先探，探到 spec 里要写的每条现状都能指出出处。目标项目有 `GLOSSARY.md` 就用它的标准叫法、不用 `_Avoid_` 里的词，缺词不问、不写，先用描述性的说法；这一块有 ADR 就守它。

4. **谈 seam**：seam 是测试观察行为的那个公共边界，测试从这里喂输入、读输出，不伸手进它背后的实现。定准备在哪些 seam 上测：优先复用已有的，用能用的最高一层，越少越好，理想是一个；要新的就提在尽可能高的位置。每个 seam 带一行「它能抓到什么、漏掉什么」。人在场就摆给人确认再往下写；不在场就自己定。都写进「测试决策」。

5. **写 spec**：写进 `docs/spec/<slug>/<slug>.md`，slug 全局唯一，且不同于 transcript 的 slug。frontmatter 写：
   - `type: spec`；
   - `status: 草稿`；
   - `tags`、`summary`（一句话，≤60 字）；
   - `related`：有 transcript 挂 `"[[<transcript-slug>]]"`，再挂相关的 spec 与 ADR，没有就留空列表。

   让 spec 在 tracker 上有入口：覆盖了已有的 issue，每个跑一次 `issues handoff <docs> <slug> <号>`，号码进 frontmatter 的 `issues`（不挂，loop 会把同一个 issue 再拿去验证一遍）；一个都没覆盖，跑 `issues open <docs> <slug>` 开一个 spec issue。两条都只写号码，label 等合进主分支后由对账挂。

   frontmatter 之后第一行是 `# <标题>`，再往下照 `<spec-template>`。几条贯穿全文的规则在 `idea-loop:decision-rules`，模板里只写它落在哪一节：
   - 现状的陈述都带出处，讲影响带规模数字（「现状先查清」）；
   - 先写交付物，再写做法（「先写交付物，再列做法」）；
   - 能按规则判的自己定，写成已定的决定并注明依据；依据不成立的才写成选项（「自己定的四条」「交给人时」）。

   图怎么画、放哪：用 Skill 工具调 `idea-loop:evidence`，照它的「spec 里的图」。

6. **分流**：跑 `spec-status route <docs> <slug>`。覆盖的 issue 在「验证」表里全都不存在的，翻成 `完成`；还有等人定的（开头的「需要 grill」、「实现决策」里的「待定」），翻成 `审核中`，并说出还剩哪几样；都没有就是 `正式`。不等人通读：人答过的、规则能判的，已经写成定下的决定。人在场又是 `审核中` 的，就在这里接着定，定完删掉对应的标记，`spec-status set <docs> <slug> 正式`。

7. **合进主分支**：loop 只从主分支取活，所以 spec 先经一个只改 `docs/` 的 PR 合进主分支，issue 再挂 label，label 才不会指向主分支上没有的 spec。调用方说了提交和合并由它来做的（比如 `idea-loop:issue-verify`），这一步整个留给它。
   1. 提交到从最新主分支开出的 `spec/<slug>` 分支，只带这份 spec 的目录、`docs/raw/<topic>/` 里这次写的文件和 `docs/spec/index.md`；工作区里有别的改动，就另开一个 worktree 来提交。推送，`gh pr create`。
   2. `gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`；检查失败就停下告诉人。issue 的 label 由 `idea-loop:issue-dispatch` 下一轮对账按主分支挂；在 issue 会话里的，由会话跑 `issues advance` 挂；都没有的，在主 checkout 上跑 `issues reconcile <docs>`。

8. **收工**：告诉人这份 spec 到了哪个状态。`正式` 的，按碰不碰 UI 进「设计」或「实现」：在 issue 会话里的由会话接着往下走，不在的人用 `/idea-loop:issue-session <号>` 接上，也可以自己跑 `/idea-loop:uiux-imagine` 或调 `idea-loop:to-ticket`。人改了某个决定，牵出的图、User Stories 的树和测试决策同一轮改掉。

工单归 `idea-loop:to-ticket`，ADR 归 `/idea-loop:dreaming`，这里只写 spec。

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

## 验证

spec 覆盖了已有的 issue 才写：每个 issue 一行，结论只写「存在」或「不存在」，脚本按这两个词判断 spec 能不能直接完成、issue 该不该关。

| issue | 结论 | 证据 |
|---|---|---|
| #<号> <标题> | 存在 / 不存在 | 存在：一句话的复现现象，详情在「问题」；不存在：试了什么、卡在哪（或现在的规则、代码在哪），什么时候对着哪个基准分支、用什么手段核的 |

覆盖的 issue 全都不存在的 spec，只写这一节和「关联」。

## 问题

用户现在卡在哪，用户视角；不是「我们要建 X」。每个问题一个小节，先证据、后文字。证据是复现时挑出来、标注好的图，形式按问题性质选（`idea-loop:evidence` 里「问题的复现证据」）：有 raw 目录的放 `docs/raw/<topic>/assets/`，没有的放这份 spec 目录下的 `assets/`，只取挑好的图，`.tmp/` 下的工作文件留在原处。新功能也有图：现在的 UI 加红色光圈，标出哪里不够用。

复现的结论写成人读得懂的话：测了什么、看到什么、本该是什么，带一个具体例子。测试的失败输出、堆栈、查询语句、整段日志不进 spec，要指回原始材料就在小节末尾写一行「复现材料：`<路径>`」。

### 根因

放在全部证据之后。一条根因对应一处证据。没复现的，句末标「（未复现：卡在哪；依据：…）」，只用于人确认过不复现的。复现推翻了先前的说法，写「修正：原先认为 X，实测是 Y」。不涉及根因的新功能写「不涉及」。

## 方案

用户视角的解法。先写用户最终得到什么、由哪些输入决定，再写怎么做。同一行为的其他入口（页面、接口、调用方）逐个标纳入还是排除，排除的写理由。

## User Stories

一份很长的 story 列表，覆盖这个特性的每一面：`idea-loop:pr-review` 的 Spec 轴逐条比对它。每条写成：

1. 作为 <角色>，我想要 <能力>，以便 <收益>

<user-story-example>
1. 作为备考的学生，我想要重做一道错题时不扣练习次数，以便放心把错题再做一遍
</user-story-example>

按场景分组，每个场景一棵 story 树（画法照 `idea-loop:evidence` 的「User Stories 的树」），图下是同样的编号列表。编号在每个场景内从 1 开始；别处引用写「场景名 + 编号」。

只修问题、不加能力的 spec 不画树：每个问题一行「期望行为」，编号跟「问题」的小节对上。

## 实现决策

要建或改的模块、它们的接口、技术澄清、架构选择、schema 变更、API 契约、具体交互。能按规则判的写成已定的决定，注明依据（规则原文、人的原话或现存实例），边缘情形在这里定好，不留给 implement 停下。依据不成立的才写成选项，每条一个小节，标题是「### 待定：<要定的问题>」：选项差在用户能感到的地方，每个选项配一个具体例子，写上推荐。人定了，就把小节改写成定下的决定、删掉「待定」两个字。

不写文件路径和代码片段，它们烂得最快。例外：原型里产出的片段比散文更准地说清了一个决定（状态机、reducer、schema、类型形状），就内联进那条决定，注明出自原型，只留带决定的部分。

碰 UI 的再写访谈里定下的结构决策：这块界面按什么结构组织。下游设计在这个结构之内做，不重开它。

## 技术方案总览

把实现决策按「谁和谁说话、按什么顺序」串起来。理由留在实现决策里，这里只引用那一小节。三个小节都要有，不涉及的写「不涉及」：

### 后端

浏览器、API、DB、对象存储或第三方之间的时序图，图下几行列出接口变化。

### 前端内部

缓存、状态这类看不见的部分，同样用时序图画清各层的读写顺序，图下写读路径、写路径和每层的生命周期。

两张时序图的画法照 `idea-loop:evidence` 的「时序图」。

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

判据是能不能先写出一个会红的测试：前三行能，走 TDD（循环怎么跑见 `idea-loop:tdd`）；后三行的输出不确定、靠感知或跨系统，换别的仪器。prompt 改动本身走 eval，但 prompt 产出的结构（schema、字段、枚举闭集）走 TDD。具体工具用目标项目自己的。

然后写：

- **seam**：「谈 seam」那步定下的那几个。
- **增量功能测试**：新行为的黑盒验收，用户视角、可证伪，写成前置 / 步骤 / 期望 / 覆盖（场景名 + 编号），标明落在哪个页面。
- **prompt / eval 变动**：改了哪些 prompt、要加或改哪些 eval。没有就写「无 prompt/eval 变动」。
- **照着谁写**：仓库里同类测试的先例。

mock 只在系统边界，规则见 `idea-loop:tdd` 的「mock 只在系统边界」。

## Out of scope

明确的非目标。方案里排除的入口在这里再列一遍，各带一句理由。

## 关联

raw 素材、相关 spec、相关 ADR；覆盖的 issue 逐个写 `#<号>` 加标题。相邻还没完成的 spec 与 issue：查过，写明有没有重叠、谁先谁后，没有写「无」。

</spec-template>
