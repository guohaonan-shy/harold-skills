---
type: spec
status: 正式
tags: [idea-loop, decision-rules, evidence]
summary: decision-rules 只讲依据与护栏，evidence 只讲证据是什么和整体风格；配什么图交给模型，放哪归调用方
related: ["[[decision-rules-who-decides]]"]
issues: [245]
---

# decision-rules 与 evidence：给原则，不给逐情形的答案

> #245 存在：`decision-rules` 的「自己定的四条」里写着「规范违规就修」「存量问题开 issue」这类逐情形的答案；`evidence` 连同两份参考约 23KB，按情形规定出什么图、放在哪。详情在「问题陈述」

## 问题陈述

2026-11-05 对着 `release/idea-loop-0.2.0`（1a7496b）读插件文本、`wc -c`、grep 核的。

### 1. decision-rules 替模型给出了每种情况的答案

`idea-loop/skills/productivity/decision-rules/SKILL.md` 的「自己定的四条」：第 1 条在「依据只认三种」之后列出四个处置（「有明文规则、没有歧义的规范违规：**修**」「对不上已定的做法：**本次同步改**」「产品已有统一做法：**沿用**」「超范围删除：**接受并补记** / **恢复**」）；第 2 条「存量问题**开 issue**」；第 3 条「代价相称」按丢不丢用户东西给出修 / 接受 / 上线后看；第 4 条「默认改动最小」。另有一节「PR 流程里『代价相称』只定推荐」。

人在 0.2.0 grill 里说（决定记录 Q7）：核心是按 spec 的方案解决 spec 提出的问题；「不要像你说的有依据就照办。如果依据之间出现了冲突，你来告诉我」。逐情形的答案替人把判断做死了，换一个项目、一个情形就不对。

### 2. evidence 规定什么情况出什么图、放在哪

| 文件 | 字节 | 写的是什么 |
|---|---|---|
| `evidence/SKILL.md` | 3895 | 写法六条（含「要人定的写成一道题」）、两类图的表（spec 的图 / 交付证据，各自的去处）、两类共用的截图规矩 |
| `evidence/references/spec-figures.md` | 11565 | spec 哪一节画什么、用什么画、谁画；复现证据按「时序 / 流程 / 单画面」三种情形选形式；每种图放 `docs/raw/…/assets/`、`.tmp/…`、`docs/design/tmp/…` 的哪里；`flow-compose.mjs` 的用法 |
| `evidence/references/delivery.md` | 7728 | 交付证据放哪、怎么上传素材分支、什么时候删；「选哪种形态」一张按情形给图的表；动图怎么录；人验清单每一项的格式 |

人说（Q8）：evidence 只讲证据是什么和整体风格，「配图我更倾向于将我们的配图方式交给 AI」，「具体怎么用证据，是更上层的调用场景来决定的」。Q15：证据放在哪由调用方定。

### 3. 一处规矩挂错了地方

「要人定的写成一道题」讲的是**怎么把一个决定交给人**，却写在 evidence；人问到 decision 时要翻两个 skill。

### 根因

两个 skill 都是从一次次纠正里攒出来的：每遇到一个情形，就加一行这个情形的答案或这类图的去处（`decision-rules-who-decides` 那份 spec 收拢过一次，但只挪了位置，没有把答案收回成原则）。

## 方案

改完，模型读到的是：**decision-rules** 告诉它按什么判断、什么时候必须停下问人；**evidence** 告诉它什么算证据、写给人看的东西长什么样、有哪几种图和工具可用。哪种情形画哪种图由模型判断；图放在哪、怎么命名、要不要上传，写在用它的那个 skill 里。

```
调用方（to-spec / grill / issue-verify / implement / pr / pr-review / uiux-refine …）
   │  1. 先调 decision-rules：按 spec 解决 spec 的问题；依据明确→照做并单列；冲突或没有→停下问人；护栏→人定
   │  2. 再调 evidence：证据要有出处、时间、版本、数字；结论在前、图贴着那句话；从几种图里挑
   └─ 3. 自己的 skill / 参考里写：这份产物里的图放哪、叫什么、要不要上传
```

### decision-rules（对的杠杆：剪枝——删掉逐情形的答案；单一事实来源——「写成一道题」只在这里）

名字不改，节换成六块：

1. **核心**：按 spec 的方案解决 spec 提出的问题。spec 之外的事不在这次做，交回给调用方自己的流程。
2. **依据只认三种**：仓库规则原文、人已经做过的决定（原话）、产品里已有的做法（指得出现存实例）。
3. **依据明确、没冲突：照标准做**，并在汇报里单列「已按规则处理」，每条带依据本身，人能推翻。
4. **依据冲突或没有：停下问人**。宁可多问，不靠推断凑依据。
5. **护栏**：术语、动生产数据、真实支付、对外发布、合并改了代码的 PR，只由人定。只改 `docs/` 的 PR 那一句原样留在这一节（#244 会把它挪进 `wiki-conventions`）。
6. **要人定的写成一道题**：从 evidence 挪过来，内容不变。

删掉：四条里的逐情形处置、「代价相称」「改动最小」、「PR 流程里『代价相称』只定推荐」整节。

### evidence（对的杠杆：剪枝；信息层级——工具用法进参考，放哪进调用方）

- **证据是什么**：出处、时间、版本、数字；比较时条件一致；复现才是证据、读代码写出的是猜测；证据取自要判断的那个东西本身；查不到写明，不估；出题前对最新基准再核。
- **整体风格**：结论在前，图文结合，图放在它支撑的那句话旁边，用能说清的最小一种视图，陌生叫法第一次出现说清。
- **配什么图：你来判断**：可用的几种和各自的工具——UI 页面标注（只截组件、红色光圈）、UI flow 标注（`flow-compose.mjs`，构图和 JSON 在参考 `ui-flow.md`）、excalidrawer 的各种图表（没装时用 mermaid）、动图（参考 `gif.md`）、表或一行例子。一句写明：放在哪由调用方定。
- 删掉两份旧参考 `spec-figures.md`、`delivery.md`。

### 「放在哪」挪给调用方

| 原来在 evidence 的 | 挪到 |
|---|---|
| spec 每一节配什么图（复现证据、story 树、时序图、交互图）、`docs/` 里只留 PNG、各图的文件名与目录、冻结前先写文字 | `to-spec` 新参考 `references/figures.md` |
| 复现过程文件放 `.tmp/grill/…`、证据图进 raw 目录 `assets/problem-<n>-<slug>.png` | `grill` 正文（它做复现） |
| 冻结时交互图放 `docs/design/tmp/<slug>/canvas/flows/`、`flow-<n>-<page>--<state>` 命名、归档时挪进 `prod/` | `uiux-refine` 的 `references/freeze.md` |
| 交付证据放 `.tmp/…/evidence/`、素材分支上传与删除、人验清单每一项的格式、「做素材本身就是一道验证」 | `pr` 新参考 `references/delivery-evidence.md` |
| 「选哪种形态」按情形给图的表、复现证据按三种情形选形式的表 | 删掉，交给模型按 evidence 的「配什么图」判断 |

同一行为的其他入口：所有按节名引用 `decision-rules`、`evidence` 的地方（agent 定义、各阶段 skill 与参考、README、`codex-prompt.mjs` 的路径），逐个改到新节名或新位置，全部纳入。`docs/raw`、`docs/records` 里的历史记录不改：它们记的是当时的样子。

## 期望行为

1. 读 `decision-rules` 找不到逐情形的处置（修 / 开 issue / 沿用 / 接受 / 恢复），只有依据、照做与单列、冲突停下、护栏、一道题。
2. 读 `evidence` 找不到「什么情形出什么图」的表，也找不到任何产物的存放路径；有证据是什么、整体风格、几种图与工具。
3. 「要人定的写成一道题」只在 `decision-rules`。
4. 插件里引用这两个 skill 某一节的地方，节名都对得上现在的标题；引用旧参考文件的一处不剩。

## 实现决策

- **不改名**：依据是 #241 正在改同一批文件里的跨插件调用名，`decision-rules` 被 20 多个文件、`codex-prompt.mjs` 与测试按名字引用；改名不改行为，只加冲突。人可以推翻。
- **调用方自己的处置表保留**：`pr-review` 的 `review-standards.md`「每条候选标处置」那张表、`implement` 对存量问题开 issue、`implementer` 的「停，还是延后」是这些流程自己的做法，不是 decision-rules 的内容（Q8「具体怎么用由上层调用场景决定」同理）。本次只把它们引用的旧节名改成新节名；表里原来指「代价相称」的边缘情形一行，改指「依据冲突或没有：停下问人」，处置仍是「要你决定」。
- **护栏只列决议表的五项**：「起名定稿、人验素材、分类体系、方案形状」不再列（Q14：分类不需要；人验素材本来就由 `pr` 交给人看，不是一条决定）。`review-standards` 那一行改成「护栏里的事、人验素材」。
- **`flow-compose.mjs` 的 `state` 字段与 `flow-<n>-…` 文件名校验**写在 `ui-flow.md`，那是脚本行为；目录选在哪写在 `freeze.md`。
- **excalidrawer 没装时用 mermaid** 写进 evidence 的「配什么图」；插件依赖和 setup 里问不问归 #241 / #247。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约 | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | 改的是两个 skill 的文本；不加 eval（`AGENTS.md` §5：主观产出不做 baseline），改用文本断言钉结构 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：插件文本本身，用 `node:test` 读 SKILL.md 与参考断言结构（已有先例）。能抓到：逐情形的处置词回来了、旧节名和旧参考还有人引用、「一道题」又出现在 evidence；漏掉：模型实际判断得好不好。
- **增量功能测试**：新文件 `idea-loop/scripts/decision-evidence-principles-doc.test.mjs`，覆盖期望行为 1–4；`decision-rules-who-decides-doc.test.mjs`、`to-spec-by-deliverable-doc.test.mjs` 里钉着旧结构（`spec-figures.md`、`delivery.md`、「两类共用的」、evidence 里的「一道题」）的断言改成新结构。全量 `node --test idea-loop/scripts/` 绿。
- **照着谁写**：`idea-loop/scripts/decision-rules-who-decides-doc.test.mjs`。

## Out of scope

- 改名 `decision-rules`（见「实现决策」）。
- 调用方自己的处置表怎么改得更像原则（`review-standards`、`implementer`）：本次只改引用。
- 只改 `docs/` 的 PR 怎么合（#244）、跨插件调用改名与 skill 搬家（#241）、design 参考整合（#246）、setup 里问 excalidrawer（#247）。

## 关联

- 决定记录：[2026-11-04 idea-loop 0.2.0 重构 grill](https://github.com/guohaonan-shy/harold-skills/blob/release/idea-loop-0.2.0/docs/raw/issue-workflow/2026-11-04-idea-loop-0-2-0-restructure-grill.md)（在 `release/idea-loop-0.2.0` 上）的 Q7、Q8、Q13–Q15 与「本轮决议」表。这份改动不随 0.2.0 发，直接合进 main。
- 上一次收拢：[[decision-rules-who-decides]]（把「交给人时」挪进 evidence；本次把「一道题」挪回 decision-rules）。
- 相邻在做的：#241（搬 `skills/design`、`skills/seo`，与本次都碰 `uiux-refine`，后合的 rebase）、#244（挪「只改 docs/ 的 PR」那句，与本次都碰 `decision-rules`、`issue-verify`、`retro`）、#246（design 整合，碰 `freeze.md`）。
