---
type: spec
status: 实现中
tags: [idea-loop, implement, implementer, issue-session, token]
summary: implementer 不再写死 skill 清单、可读 spec 全文、读 CODING_STANDARDS；卡住的工单复用原执行方；to-ticket 落盘后提交工单（进实现前压缩已移除）
related: ["[[pr-review-report-followups]]", "[[design-archive-skill-length]]"]
issues: [147, 149]
---

# implementer：按工单挑 skill、读写法规范、复用原执行方；进实现前压缩上下文

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #147 idea-loop implementer 不读目标仓库的 CODING_STANDARDS.md，照不到它链接的写法规范 | 存在 | implementer 定义里搜不到 `CODING_STANDARDS` 和 `writing-for-agents`，review 却按它们审；详情在「问题」3 |
| #149 idea-loop：去掉 implementer agent，implement 用通用子代理 + 薄提示词派工，skill 由子代理自己判断 | 存在 | 定义写死了开工调哪三个 skill，并规定 spec「只读测试决策」；详情在「问题」1、2。修正：人在本会话决定保留 implementer，只改定义 |
| #153 idea-loop issue-session：进 implement 之前压缩上下文，编排者不再背着审核阶段的历史 | 存在 | 编排者进 implement 时上下文中位约 23 万 token，implement 加 review 两段约 $1754；详情在「问题」5 |

## 问题

2026-10-28 对着 `origin/main` 核过（定义文本用 grep，花费用本机会话记录统计）。

### 1. 工单要用的 skill 不在定义的固定清单里，只能手写进工单

`idea-loop/agents/implementer.md` 开头写死了「开工先用 Skill 工具调 `idea-loop:wiki-conventions`、`idea-loop:tdd`、`idea-loop:decision-rules`」。工单要用别的 skill，只能切票时写进工单：

- Toeflair#534（spec seo-toefl-speaking-score-grading）的工单要写博客正文，编排者在工单里手写了「必须调 seo-writing」。执行时子代理确实调了 seo-writing（#149 原文），所以能力不是问题，是清单写死了。
- harold-skills#125 的两张工单都手写了「开工前调 writing-for-agents」（#147 原文）。

本机会话记录里，implementer 调这三个固定 skill 各约 215 次，调 writing-for-agents 32 次、seo-writing 4 次。

### 2. 执行方读不到 spec 里工单要用的内容

定义的「输入」写着 spec「**只读它的「测试决策」**……别的部分不读」。Toeflair#534 的内容 brief 在 spec 的「方案」里，编排者只好在工单里补一句「可以读 brief」。

### 3. 执行方不读目标仓库的写法规范，要等 review 指出来

- implementer 定义里搜 `CODING_STANDARDS`、`writing-for-agents`，没有结果。
- `pr-review/references/review-standards.md`：「读目标仓库的 `CODING_STANDARDS.md`……它们链接到的文档」，并按它审 Standards 轴。
- 本仓库 `CODING_STANDARDS.md`「链接」把 `idea-loop/skills/productivity/writing-for-agents/` 列为 skill、agent 定义、AGENTS.md 的写法。

例子：改 skill 文档的工单，执行方不读 writing-for-agents；第 1 轮 review 按它审出问题，再派一次修。

### 4. 工单卡住、人做完决定后，接着做的是一个新执行方

`implement` 的规则：人回复后，「工单回到可派，派时带上半成品分支」；它开头还写着「每张工单的执行方都是新上下文」。新执行方只拿到工单（里面加了 `> 人的决定`）和半成品分支，上一个执行方为什么卡住、看过哪些代码，都要重新摸一遍。原执行方的 id 也没有记在任何地方：`pending.md` 只记「工单号、问题、选项、推荐、半成品的 worktree 和分支」。

现在只有两处会用 SendMessage 回到原执行方：交回核对不过，以及落地时 fast-forward 不了。

### 5. 编排者进 implement 时背着整段审核历史

issue-session 把审核、grill、写 spec、切票、implement、pr-review 放在同一个会话，换阶段时上下文原样带过去。本机会话记录（按公开价估算）：

| | 数 |
|---|---|
| 跑过 implement 的会话 | 77 个，合计约 $5086，其中编排者占 49% |
| 编排者进 implement 时的上下文（中位） | 约 23 万 token |
| 编排者在 implement / review 阶段的花费 | 约 $926 / $828 |

implement 要用的东西都在磁盘上：spec、工单、review loop 文件。spec 本来就按「写给没在场的人看」写，审核阶段的对话历史只是每轮被 Opus 重读一遍。

复现材料：`.tmp/to-spec/implementer-reuse-and-compact/repro/grep.txt`；花费统计脚本与结果记在 issue #153 正文。

### 根因

- 1、2、3：执行方定义把「该读什么、该调什么」写成固定清单，清单里没有工单类型对应的 skill，也没有 `CODING_STANDARDS.md`。
- 4：implement 把「接着做」设计成新上下文加半成品分支，原执行方的 id 不进账本。
- 5：issue-session 的「换阶段」只翻 label、移 section、切分支，不动上下文。

修正：#149 原先提议删掉 implementer、改派通用子代理。人在本会话决定先不删（原话：「算了，我觉得先不删除implementer吧」），这两条问题改在定义里修。

## 方案

改完之后：

- **执行方开工**：读目标仓库的 `CODING_STANDARDS.md` 和它链接的文档（跟 review 读的同一套）；看工单内容自己挑要用的 skill，不再有固定清单；spec 全文可读，这次做什么以工单为准。
- **工单卡住、人做完决定**：只要原执行方还联系得上、它的 worktree 还在，编排者用 SendMessage 让它带着原来的上下文接着做；联系不上再照现在的做法新起一个，从半成品分支接上。
- **issue-session 进实现阶段**：切完工单、开始实现之前，先停下，打出一条填好的 `/compact` 指令让人复制执行，人说「继续」之后才调 implement。**已移除（2026-10-30），依据见 harold-skills#165 的 spec issue-consolidation「实现一律放在子会话里」。**

同一行为的其他入口：

| 入口 | 处理 |
|---|---|
| `implement` 的「人回复后」：决定、推翻、设计变更之后重派卡住的工单 | 纳入：能复用就复用 |
| `implement`「人回复后」的人验反馈、pr-review 的「修」：工单已经落地 | 排除：照旧新起，见「已经落地的工单照旧新起，只复用卡住的」 |
| issue-session 从「审核」或「设计」换到「实现」 | 纳入：都先压缩 |
| issue-session 换到「设计」、实现合并后的「关闭」 | 排除：人只要求进实现前压缩；设计阶段要用审核时的讨论 |
| 人直接敲 `/idea-loop:implement`，不经 issue-session | 排除：上下文归人自己管，implement 不强制 |
| pr-review 开始前 | 排除：人只要求进实现前；review 要用 implement 阶段的停下汇报和批示 |

## User Stories

只修问题、不加能力，每个问题一行期望行为：

1. 工单要用某个 skill 时，执行方看工单内容自己调它，工单里不用写「必须调 X」。
2. 执行方能读 spec 里工单要用的部分（如「方案」里的内容 brief），编排者不用往工单里补「可以读 X」。
3. 执行方开工就读目标仓库的 `CODING_STANDARDS.md` 和它链接的文档；第 1 轮 review 里不再出现「实现时就能读到的规则没照着写」这一类问题。
4. 工单卡住、人做完决定后，原执行方带着自己的上下文接着做；它联系不上时才新起一个。
5. ~~issue-session 切完工单、开始实现前一定先压缩上下文，implement 的编排者不再背着审核阶段的对话。~~ 已移除（2026-10-30），依据见 harold-skills#165 的 spec issue-consolidation「实现一律放在子会话里」。

## 实现决策

### 保留 implementer，只改它的定义

依据：人的原话「算了，我觉得先不删除implementer吧」。模型和思考强度不动（`sonnet` · `high`），派工方式不动。

### 开工调哪些 skill：只留契约要用的，其余看工单挑

依据：人在本会话选了「在定义里顺手改」。

- 定义里「停，还是延后」整节引用 `idea-loop:decision-rules`，交回里的判断都靠它，这一个保留为开工必调。
- `wiki-conventions`、`tdd` 不再写成开工必调，跟其它 skill 一样看工单挑。定义里写一句怎么挑，给几个例子：按 TDD 实现代码的工单调 `idea-loop:tdd`；往 `.tmp/` 放东西前调 `idea-loop:wiki-conventions`；改 skill、agent 定义、AGENTS.md 的工单，照 `CODING_STANDARDS.md` 链接到的写法；写站点文章调 `idea-loop:seo-writing`。例子只用来说明怎么挑，不是清单。
- 「做」「UI 工单与设计档案」「改规则的工单」几节里本来就按条件点名的 skill（`ui-measure`、`design-archive`、`browser`、`evidence`），原样保留。

### spec 全文可读，范围以工单为准

依据：人在本会话选了「在定义里顺手改」，那个选项写的是「spec 全文可读、范围以工单为准」。

「输入」里那句改成：spec 是背景，可以读任何一节；这次做什么由工单划定，spec 里有、工单没要的不做。越界有 review 的 Spec 轴兜底。

### 读目标仓库的写法规范（#147）

依据：`pr-review/references/review-standards.md` 原文「读目标仓库的 `CODING_STANDARDS.md`（分层、文件划分、命名）、`REVIEW.md`、根目录与适用子目录的 `AGENTS.md` / `CLAUDE.md`、它们链接到的文档」。review 按什么审，实现就按什么写。

「开工前」加一步，读法照抄这句，包括「`@` 导入不会自动展开，被引用的文件要显式去读」。链接指到一个 skill 目录时，照着读或调那个 skill。

### 卡住的工单：原执行方能联系上就复用

依据：人的原话：「把能复用原来的ticket 的agent这条加上」。

- **账本**：`pending.md` 每条多记一项：原执行方的 agent id（Agent 工具返回的那个）。会话压缩或重启之后，就靠这一项找回它。
- **人回复后**：照现在的步骤把决定写进工单、提交之后，工单要「回到可派」时：
  - pending 里有 agent id、worktree 还在：SendMessage 给它，内容只给指针：「人的决定已写进工单 `<路径>`，提交 `<SHA>`」，加上要它先合进的集成分支最新提交。它按定义的「停下时把半成品提交在你的分支上」接着做，交回格式不变，编排者照常核对、落地、回收。
  - SendMessage 报错（id 找不到、会话重启过）或没记 id：照现在的做法新起一个执行方，带上半成品分支。
- **定义这边**：「输入」里「这张工单不是第一次做」那条补一句：可能是同一个你被 SendMessage 叫回来，这时先把集成分支的最新提交合进来，再只做没勾的格。
- **已知代价**（人知情后选的）：叫回来的执行方带着整段旧上下文，人隔了很久才回复时，提示缓存已经过期，第一轮要按全价重读这段历史，可能比新起一个更贵。所以不复用的分支照旧保留，作为兜底。

### 进实现前压缩上下文（#153）

> **已移除（2026-10-30），依据见 harold-skills#165 的 spec issue-consolidation「实现一律放在子会话里」。** 这一节保留作由来。其中「to-ticket 落盘后把工单和 spec 提交进当前分支」（人 2026-10-29 的决定，见工单 03）跟压缩无关，保留。#153 按人的决定 drop（关成 not planned）。

依据：人的原话：「进入实现之前一定要compact上下文」；位置按人后来的原话：「我倾向于切分工单之后，实现之前压缩」。

- 位置：issue-session 的「实现」一节，`idea-loop:to-ticket` 切完工单（工单已提交）之后，调 `idea-loop:implement` 之前。从「审核」或「设计」进实现都这样。切工单要读 spec，留在压缩前做；implement 只读磁盘上的 spec 和工单，压缩后做。
- 谁来压缩：`/compact` 只能人敲，agent 自己调不了；压缩也不会开启新的一轮。所以会话停下，打出一条填好的压缩指令给人复制执行，再请人说一句「继续」。指令是一份通用模板，写在 issue-session 里，停下时把 `<号>`、`<slug>`、`<绝对路径>` 换成这一次的值（依据：人的原话「我们可以准备一套通用的/compact 的instruction，然后每次实现之前，可以让我直接复制执行」）：

  ```
  /compact 下一步：在这个 issue 会话里调 idea-loop:implement <slug>。保留：issue #<号>（及同一份 spec 覆盖的其它号）、spec docs/spec/<slug>/、工单已切好在它的 tickets/ 下、当前分支 impl/<slug>、worktree <绝对路径>；本会话跑的是 idea-loop:issue-session，实现 PR 合并后去它的「换阶段」；还没写进 spec 或工单的人的决定，原话逐条保留。丢掉：审核、grill、设计阶段的讨论过程，复现和查询的输出，工具调用的原始记录。
  ```

- 为什么说「继续」就够、不用再调一次 issue-session：本机最近一个月几十次压缩的记录里，压缩后 Claude Code 会用 `invoked_skills` 附件把会话里调过的 skill 原文挂回来，issue-session 的规则还在。万一没挂回来、人重敲了 `/idea-loop:issue-session <号>`，「开场」读到「实现中」、人直接调起，照现有规则进「实现」；所以「实现」一节仍要写明：spec 的 `tickets/` 下已经有工单，就不再切，直接调 implement。
- 用 PushNotification 发一句话，告诉人要压缩，然后停下等。

### 已经落地的工单照旧新起，只复用卡住的

依据：人在本会话选了「只复用卡住的」。

人验反馈、review 的「修」、推翻已落地工单的处置，都发生在工单落地之后；照「回收」，那时执行方的 worktree 和分支已经删了。这些情况照旧新起执行方，「回收」的时机不改。理由：落地后的返工往往隔几个小时，叫回原执行方要按全价重读整段旧上下文；推迟回收还会让一份 spec 的十几份 worktree 同时留着。例子：工单 03 卡在「全部失败时出不出结果」，人回了「不出」，原执行方被叫回来接着做；工单 05 落地后人验说按钮颜色不对，新起一个执行方，从集成分支做那一格。

## 技术方案总览

### 后端

不涉及：没有服务端。改动只在编排顺序上：

- 卡住的工单：编排者（implement）→ pending 记 agent id → 人回复 → 决定写进工单并提交 → SendMessage 叫回原执行方（失败就新起）→ 交回 → 核对、落地、回收。
- 进实现：issue-session 换阶段（advance、移 section、切分支）→ to-ticket 切工单并提交 → implement（压缩停点已移除（2026-10-30），依据见 harold-skills#165 的 spec issue-consolidation「实现一律放在子会话里」）（人重敲 issue-session 时，已有工单，跳过切票）。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 涉及：改的是规则文字。能机械判的做文档检查，要判断的走 retro 回放 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：
  - 文档检查（`node --test` 跑的 `*.test.mjs`，读插件文件断言文字）。能抓到：定义里还写着固定的三 skill 清单、还写着「只读测试决策」、没指向 `CODING_STANDARDS.md`；pending 的字段里没有 agent id；implement 的「人回复后」没有「先 SendMessage、失败再新起」；issue-session 的「实现」在切完工单、调 implement 之前没有停下请人压缩，已有工单时还会再切。抓不到：执行方实际挑不挑对 skill、编排者实际会不会叫回原执行方。
  - retro 回放（`idea-loop/evals/retro/`）。能抓到：同一张历史工单，改前和改后，执行方在工单没点名时有没有读写法规范、调对 skill。抓不到：回放没覆盖的工单类型。
- **增量功能测试**：
  - 文档检查：先在改前的 `origin/main` 上跑，看到它红；改完变绿。覆盖：期望行为 1、2、3、4、5 的文字部分。
  - 回放：拿 #125 的一张改 skill 文档的工单，把它手写的「开工前调 writing-for-agents」去掉当输入，停在执行方交回那一刻。是/否题出自 #147：「执行方没被工单点名，也照 `CODING_STANDARDS.md` 链接读了 writing-for-agents 吗？」改前应答否，改后应答是。会起子代理，算大的，进夜间队列。覆盖：期望行为 3，顺带 1。
- **prompt / eval 变动**：改 `agents/implementer.md`、`implement`、`issue-session`；加一个 retro 回放用例。
- **照着谁写**：文档检查照 `idea-loop/scripts/design-archive-skill-doc.test.mjs`、`ui-reviewer-archive-doc.test.mjs`；回放用例照 `idea-loop/evals/retro/cases/` 下已有的。

## Out of scope

- 删掉 implementer、改派通用子代理：人决定先不做。
- issue-session 换到「设计」、关闭时压缩，pr-review 开始前压缩：人只要求进实现前。
- 人直接敲 `/idea-loop:implement` 时强制压缩：不经 issue-session 时，上下文归人管。
- Toeflair `blog-publisher` 的描述（写着「in the main thread with the user present」）：在 Toeflair 仓库里，这里改不了。
- implementer 开工时 `git reset --hard <起点 SHA>` 被 auto mode 分类器拦（本机最近两天 6 次）：跟这三个 issue 无关，另开 issue。

## 关联

- 覆盖：#147 idea-loop implementer 不读目标仓库的 CODING_STANDARDS.md，照不到它链接的写法规范；#149 idea-loop：去掉 implementer agent，implement 用通用子代理 + 薄提示词派工，skill 由子代理自己判断；#153 idea-loop issue-session：进 implement 之前压缩上下文，编排者不再背着审核阶段的历史。
- 相邻还没完成的：
  - [[pr-review-report-followups]]（实现中）：定了执行方「停 / 沿用 / 存量」的规矩，没有工单碰到这次改的几处。没有重叠。
  - [[design-archive-skill-length]]（#125）：PR #152 已合并，它改的是 implementer 定义写档案那段的节名，跟这次改的「开工前」「输入」不在同一处。没有重叠。
  - #131（没有决定题的 issue 一路做到 PR）：它改调度和停点；这次在换阶段加了一个「停下请人压缩」的停点，#131 要把它算进去。#131 后做。
  - #137（其余 10 份 SKILL.md 超 5000 字）：issue-session 和 implement 会各多几行，实现时要量字数。
