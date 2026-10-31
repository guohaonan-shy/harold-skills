---
type: spec
status: 实现中
tags: [idea-loop, decision-rules, to-spec, pr, evidence, communication-style]
summary: decision-rules 只管谁来定；讲给人看的写法进 evidence，to-spec 与 pr 按交付物重写，全局沟通风格从读者出发
related: ["[[2026-10-31-handing-to-human-split-grill]]", "[[pr-review-report-followups]]", "[[51]]"]
issues: [80]
---

# decision-rules 只管谁来定；to-spec 与 pr 按交付物重写，全局沟通风格从读者出发

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #80 | 存在 | 2026-10-31 对着 `origin/main`（2368079）读插件原文：`decision-rules` 除了「谁来定」，还带一节「交给人时」和一份讲题怎么写的参考，七处文字指向它。详情在「问题」 |

## 问题

### 1. decision-rules 里装着一半不属于它的东西

人在 #51 的 retro 里定了 `decision-rules` 的边界：「decision rules核心是哪些内容可以自己判断，哪些内容需要交给人判断。」

现在它正文最后一节「交给人时」指向一份参考（`references/handing-to-human.md`，979 字符；正文 1831 字符），三组功课都不是「谁来定」：

| 组 | 讲的是 | 实际用在 |
|---|---|---|
| 现状先查清 | 关于现状的话要有出处、规模数字、同类入口、相邻工作，出题前对最新基准再核 | 起草 spec；写汇报；跟人说话 |
| 先写交付物，再列做法 | 先写用户得到什么再列做法，选项差在用户能感到的地方，后续写全，改文字同步改图和测试表 | 起草 spec |
| 每个问题、每个选项配具体例子 | 真实例子、陌生记号先解释、不用裸编号、同条件比对、评判前先给标准 | 任何摆给人的题 |

`decision-rules` 本身在这些场景被调用（2026-10-31 grep）：起草 spec（`issue-verify`、`to-spec`）、切工单、实现（`implementer` 开工必调、`implement` 编排者）、停下汇报与 PR 描述的「已按规则处理」、review（`pr-review`、`pr-reviewer`、喂给 Codex 审查者）、只改 `docs/` 的 PR 自动合并、retro 提「自己定」规则、dreaming 的两个 agent。用到「交给人时」那一半的只有：

- `to-spec` 第 5 步（三行里两行是这份参考的组名）、`to-ticket` 的「唯一会停的情况」、`pr` 停下汇报写法、`implementer` 的 spec 缺口；
- 插件 `README.md` 两处（实现阶段表格一行、目录树注释）；
- 回放用例 `evals/retro/cases/explain-mechanism`（prompt：「/idea-loop:decision-rules … 按『交给人时』把它摆给我」）；
- 候选池 `docs/records/retro-candidates/` 里 4 条还在池里的候选，落点写的是这份参考。

### 2. to-spec 和 pr 是一条条攒出来的，不是从读者推出来的

两份 skill 的交付物都是给人看的：spec（markdown 文件）、PR 上的东西（PR 描述、停下汇报、review 汇报、review loop 文件）。读的人清楚方向和高层设计，不清楚实现细节，要的是快速看懂、快速拿到证据、快速决定。但现在两份 skill 的结构是一次次加规则长出来的，没有一处写「这一节给读者什么」。

对照 Matt Pocock 的同名 skill（2026-10-31 的 main，原文见 raw）：

| | Matt | 我们（字符数按 UTF-8 计） |
|---|---|---|
| `pr` | 一份交付物三节：摘要（能说清要点的最小一张图：伪代码、调用树、文件树、diff、时序图）、证据（改前改后）、合并风险（能不能撤回、影响面） | 四份交付物，5 个文件共 11841 字符；另有脚本按节写入和检查 |
| `to-spec` | 七节模板，没有流程 | 十节模板加 8 步流程，主体 6033 字符，超过仓库「SKILL.md 主体 < 5000 字」的上限 |

Matt 两份里通用的一条，「用能说清要点的最小一张图，图放在它支撑的那句话旁边」，我们两份 skill 各写了各的一部分，`evidence` 管图，正文怎么配图没有一处统一写。

### 3. 加规则只会追加，不会归并

- `retro` 的候选只有「落点 / 旧文 / 新文」三栏（`retro/SKILL.md` 第 52–54 行），每条候选天然是「在一处加一句」。候选池里落点是 `handing-to-human.md` 的 4 条，每条都是往那份文件再加一句。
- `writing-for-agents` 只要求同一分支的同义触发词合并，没有「加之前先看它是不是哪条已有原则的特例」。
- 这份 spec 的初稿也是这样：两条待定的推荐都是「补一两句」（人在审核时指出，raw 的 U2）。

### 4. 全局沟通风格是逐条枚举的

人的 `~/.claude/CLAUDE.md`「Communication style」现有五条（不用裸编号、机制第一次出现讲清、后台工作不沉默、转述用人的语言、说清改的是什么在哪），每条是一次纠正攒下来的，跟插件的讲话方式重叠了一半（裸编号、陌生记号），又各写各的。人的原话：「也不是说case by case的枚举，而是要站在我的角度上看，什么样的内容可以让我快速了解你说的内容」。

### 根因

`decision-rules` 是从 [[pr-review-report-followups]] 的「决策规则」长出来的，那时就定成「自己定」「交给人时」两半（`docs/raw/idea-loop-decisions/2026-10-19-pr-decision-friction.md` 的「规则放哪」）；人后来收窄了它的定义，结构没跟上。`to-spec`、`pr`、全局沟通风格都只有「出了问题加一条」的入口，没有「从读者推结构」的那一步，见问题 3。

修正：issue 原先认为「dreaming 的两份参考」读这份参考；实测 `candidate-distillation.md`、`design-md-reconcile.md` 里的「交给人时出候选卡 / 维护卡」是 dreaming 自己的步骤名，不指向它。issue 漏列了 `to-ticket`、`README.md`、回放用例和候选池 4 条。

## 方案

改完之后，读的人得到的：

- **`decision-rules` 只讲谁来定**：自己定的四条、依据不成立交给人、PR 流程里代价相称只定推荐、不自动的、人能推翻。没有讲题怎么写的段落。
- **`evidence` 成为「给人看的东西怎么写、怎么配证据」的那一处**：开头写读者模型，由它推出的共用写法（结论在前；用最小的一张图，图贴着它支撑的那句话；现状带出处和数字；陌生叫法第一次出现讲清；比对同条件；要人定的写成题：选项、真实例子、推荐、评判标准），再接它现有的「spec 里的图」「交付证据」两份参考。`to-spec`、`pr` 只写各自每一节放什么，共用写法引它一句。
- **`to-spec` 按交付物重写**：每一节写一行「这一节给读者什么」，节的取舍从读者模型推，参照 Matt 的七节；能并进 `evidence` 共用写法的条文并过去，推不出来的删。主体回到 5000 字以内。
- **`pr` 按交付物重写**：四份交付物各一张节表（节名 + 这一节给读者什么），参照 Matt 的「摘要 / 证据 / 合并风险」；同样并进或删掉推不出来的条文。
- **加规则先归并**：`writing-for-agents` 加一条「加内容之前，先看它是不是哪条已有原则的特例；是，就改写那条原则，不加新条」；`retro` 的候选多一栏「它是哪条已有原则的特例（没有写无）」。
- **全局沟通风格从读者出发、用中文**：开头一段写读者是谁，推出四条做法，另列两条操作性的（见实现决策）。
- 原来指向「交给人时」的读者全部改指新位置；候选池 4 条的「落点」改成 `evidence`，「旧文」照抄原文不动。

同类入口：

| 入口 | 处置 |
|---|---|
| `to-spec`、`to-ticket`、`implementer`、插件 `README.md` 两处 | 纳入：改指 `evidence` 的共用写法 |
| `pr` 的四份交付物（PR 描述、停下汇报、review 汇报、review loop 文件） | 纳入：整份按交付物重写 |
| 回放用例 explain-mechanism | 纳入：prompt 改成驱动 `idea-loop:evidence` 摆题 |
| 候选池 4 条 | 纳入：只改「落点」一行 |
| `retro` 候选格式、`writing-for-agents` | 纳入：加「先归并」 |
| `issue-verify` 的「现状也在这时核清」与自检 6、7 | 纳入：重写 `to-spec` 时一起看，跟 `evidence` 的现状写法对齐，不重复 |
| dreaming 的 `candidate-distillation.md`、`design-md-reconcile.md` | 排除：只是同名步骤，不读这份参考 |
| `grill` | 排除：它定的是一轮怎么问（编号、推荐、等人），不是交付物；讲话方式由全局与 `evidence` 管 |

## User Stories

只改文档结构，每个问题一行期望行为。

1. 期望行为：`decision-rules` 的正文里只剩「谁来定」，没有参考目录；插件里搜「交给人时」「handing-to-human」只剩 dreaming 的同名步骤。
2. 期望行为：`to-spec` 和 `pr` 的每份交付物都有一张节表，每节一行「这一节给读者什么」；共用写法只在 `evidence` 写一次；`to-spec` 主体（UTF-8 字符数）在 5000 以内。
3. 期望行为：`writing-for-agents` 写着「加内容之前先看能不能归进已有原则」；`retro` 的候选格式有「它是哪条已有原则的特例」一栏。
4. 期望行为：全局「沟通风格」是中文，开头是读者模型，下面的做法都能从它推出来，没有两条讲同一件事；原有五条的意思都还在。

## 实现决策

### 已定（人在本轮审核里定的，原话见 raw）

- **讲话方式按交付物归位**：spec 的写法进 `to-spec`，PR 上的东西进 `pr`，两份交付物「需要定义清楚交付物的结构，每个章节主要内容是什么」（U1）。
- **重写放在这份 spec 里**：「to-spec 和 pr 的重写放在这个spec内」（U3）。
- **共用的进 `evidence`**：「关于共用的那几条，我觉得放进evidence没什么毛病」（U3）。`evidence` 的 description 改成同时路由「写给人看的东西」和「配图」。
- **「现状先查清」两边都加**：「skills和全局沟通风格都是需要添加的」（U1）。插件里写在 `evidence` 的共用写法里，全局写在「证据贴着结论」那条下。
- **全局沟通风格的骨架与语言**（U3「全局的claude.md用中文」，U4 接受骨架）：
  1. 开头一段：读者清楚方向和高层设计，不清楚实现细节；要快速看懂、快速拿到证据、快速决定。
  2. 四条做法：结论在前，先说对读者来说什么变了；把实现翻译成读者认识的东西（机制是什么、谁触发、结果去哪；东西叫什么、在哪；不用裸编号）；证据贴着结论（现状带出处和数字，比对同条件，给真实例子）；要读者定的写成一道题（选项、一个具体例子、推荐、评判标准）。
  3. 另列两条操作性的：后台工作不沉默、转述用读者的语言。
  整份文件改成中文；「Diagrams」一节只翻译、不改意思；文件开头「只放跨项目个人偏好」那句保留。
- **全局 CLAUDE.md 由 issue 会话改，人看过全文再写入**：这份文件在人的本机、不进仓库、不进 PR（#80 正文「issue 会话改它要人在场批」）。
- **加规则先归并**（U4 接受）：写进 `writing-for-agents`；`retro` 候选格式加一栏；本次重写 `to-spec`、`pr` 按这个方法做。
- **「默认改动最小」不作这份 spec 范围的依据**：那条管实现与 review 时不顺手塞重排，不管 spec 的范围（A3，人未推翻）。

### 已定（照规则）

- **`decision-rules` 删掉「交给人时」一节和 `references/handing-to-human.md`**，description 去掉讲题写法。依据：人在 #51 的原话「decision rules核心是哪些内容可以自己判断，哪些内容需要交给人判断」。
- **读者同步改指新位置，候选池 4 条只改落点**：依据「自己定的四条」第 1 条「说明文字跟已定的做法对不上：本次同步改」。候选内容进不进规则由 dreaming 数次数，这次不动。
- **`to-spec` 主体回到 5000 字以内**：依据仓库 `AGENTS.md`「SKILL.md 主体保持精简（< 5000 字）」；字数按 UTF-8 字符数量（`LC_ALL=en_US.UTF-8 wc -m`，C locale 下数的是字节，见 #132）。
- **脚本绑着的格式要么守住、要么同一张工单连脚本和测试一起改**：`spec-status` 读「验证」表的「存在 / 不存在」、开头的「> 需要 grill」、「实现决策」下以「待定」开头的标题；`pr-body.mjs` 按固定节名写 PR 描述并拒绝代码层面的指称；`review-loop.mjs` 认「**要你决定**」和「需要你决定」标题判断汇报要不要等人；`review-check.mjs` 查 review 汇报的处置与措辞。依据：「自己定的四条」第 2 条，让 CI 变红的这次修。
- **新的节表先摆给人，再落其余改动**：`to-spec` 和 `pr` 的新节表（节名 + 这一节给读者什么，加上跟现在比删了、并了什么）由实现方起草，在实现的第一次停下汇报里作为决定题摆给人；人批了，才按节表改写正文和脚本。依据：方案形状由人定（`decision-rules`「不自动的」）。

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：文档测试，断言插件里不再指向 `handing-to-human.md` 与「交给人时」、`to-spec` / `pr` 每份交付物有节表、`to-spec` 主体在 5000 字符内、`retro` 候选格式有归并一栏；脚本格式改了的，脚本自己的测试跟着改 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 碰到：回放用例 explain-mechanism 改 prompt 后，改前改后各跑一次（小用例，当场跑） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：插件文档文本本身（`node --test` 读文件、正则断言），抓得到指针漏改、旧段落残留、超长；抓不到改写后的话 agent 照不照着做，那一半靠回放用例和人读节表。
- **增量功能测试**：
  - 前置：实现合并后的主分支。步骤：在 `idea-loop/` 下 grep「交给人时」「handing-to-human」。期望：只剩 dreaming 两处同名步骤。覆盖：期望行为 1。
  - 前置：同上。步骤：打开 `to-spec`、`pr` 的每份交付物写法。期望：每份有节表，每节一行「给读者什么」；共用写法只引 `evidence`。覆盖：期望行为 2。
  - 前置：重写后的 `~/.claude/CLAUDE.md`。步骤：人通读「沟通风格」。期望：中文；读者模型开头；没有两条讲同一件事。覆盖：期望行为 4。
- **prompt / eval 变动**：改 `evals/retro/cases/explain-mechanism/case.json` 的 prompt。
- **照着谁写**：`idea-loop/scripts/pr-review-slim-doc.test.mjs`（断言「decision-rules 已有的规则是指针、不重写」）、`implementer-standards-doc.test.mjs`。

## Out of scope

- 候选池 4 条候选的内容进不进规则：dreaming 数次数决定，这次只改落点。
- 其余 SKILL.md 超过 5000 字：#137 管；这份只负责 `to-spec`。
- `grill` 一轮怎么问：它不产交付物，讲话方式归全局与 `evidence`。
- dreaming 的「交给人时出候选卡 / 维护卡」：同名步骤，不读这份参考。

## 关联

- 覆盖：#80 idea-loop decision-rules 只管谁来定：「交给人时」拆开归位，并重写用户级 CLAUDE.md 的沟通风格
- raw：[[2026-10-31-handing-to-human-split-grill]]（本次审核的 grill，含 Matt 两份 skill 的对照）
- 决定记录：[[51]] 候选 4（本 issue 的来由）、候选 2、3（全局沟通风格已有条目的来由）
- 相关 spec：[[pr-review-report-followups]]（`decision-rules` 的来由；frontmatter 仍是「实现中」，不重叠）
- 相邻还没完成的：
  - #137 其余 SKILL.md 超过 5000 字：`to-spec` 由这份负责，#137 的清单里划掉它；谁先都行
  - #132 字数怎么量：这份按它的结论用 UTF-8 字符数量，不依赖它先做
  - #154 to-spec：改 agent 文档的 spec 方案先从 writing-for-agents 推：也改 `to-spec`，重写后它要落在新节表的「方案」一节；这份先，#154 后
  - 候选池 `2026-10-31-handing-to-human-name-references`、`2026-10-26-examples-from-real-material`、`2026-10-26-goal-figures-for-human`、`retro-candidate-95`：落点随本 spec 改到 `evidence`
