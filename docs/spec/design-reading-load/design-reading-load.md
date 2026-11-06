---
type: spec
tags: [idea-loop, design, uiux-refine, designer, ui-reviewer]
summary: 16 份设计原则合成 6 份、内容全留；ui-reviewer 按模式按需读，designer 一次 refine 少读三成
related: ["[[design-md-write-entry]]", "[[confirm-only-on-loss]]", "[[end-task-close-icon]]"]
issues: [246]
---

# 设计部分读得太多：16 份设计原则合成 6 份，ui-reviewer 按模式按需读

> #246 存在：designer 在一次 refine 里要读 12–15 份设计原则、约 122–130KB；ui-reviewer 每次被起都读整份 36KB，其中三分之二是另外两种模式的内容。2026-11-05 对着 `main`（`9a33407`）逐份量字节、逐份读引用链核的。

**结论**：内容一条没删，文件少了一半，designer 一次完整 refine 要读的设计原则从 **130KB 降到 91KB（−30%）**，只做静态那一段从 **73KB 降到 50KB（−31%）**；ui-reviewer 每轮走查从 **36KB 降到 13KB（−63%）**。

## 问题陈述

### designer 要读的原则太多、太散

`uiux-refine/references/design/` 下 16 份设计原则共 140KB，只有 designer 读：它的定义直接点 6 份，其余由这 6 份互相链出（`static-ui-protocol` 一份就链出 11 份）。量出来是这样（designer 是活过整个 refine 的同一个 agent，读过的留在上下文里，所以按「一次 refine 读进去的不同文件」算）：

| 一次 refine 走到哪 | 要读的设计原则 | 字节数 |
|---|---|---|
| 起手、按意见改（组件路由） | static-ui-protocol、design-core、expression-framework、replication、component-protocol、color-application | 63,937 |
| 同上（页面路由） | 再加 surface-protocol、module-protocol | 72,660 |
| + 清 AI tells | + ui-craft-checklist | 83,621 |
| + 签字前检查 | + heuristics-checklist、accessibility-baseline | 99,222 |
| + 动效 | + motion-stage、motion-protocol、motion-spec、motion-craft-checklist | 130,428 |

读得多的主要原因是同一件事写了好几遍：

- 「降一层高度」的 R / B / C / W / G 五段，在 `static-ui-protocol`、`surface-protocol`、`module-protocol`、`component-protocol` 里各写一遍；四份互相引用。
- 「状态矩阵先于视觉」写了三遍（expression-framework、static-ui-protocol 的 B、component-protocol 的 B1）；「子组件分四类」写了三遍；「Distill-back 只写候选」写了五遍；「没有 `DESIGN.md` 就降级、不中止」写了五遍；对比度底线写了四遍；文字压在色块上的规则写了两遍。
- `ui-craft-checklist` 和 `heuristics-checklist` 都叫「Gate 2」、都在同一步读；marquee、image-hover-transform 同时出现在视觉和动效两份 slop 清单里。
- 动效的预算、reduced-motion、冻帧时间轴，在 motion-stage、motion-protocol、motion-spec、motion-craft-checklist 四份里各说一遍。

### ui-reviewer 每次读三种模式

`agents/ui-reviewer.md` 36KB，管三件事：每轮走查（对画布）、归档（写 `delta/` 草稿）、对账（逐个状态核档案）。每次只跑一种模式，却整份进上下文：归档那节 8KB、对账那节 14KB，走查一轮用不到其中任何一行。

### 根因

- 设计原则按「来源」拆文件（taste-skill 一份、impeccable 一份、Laws of UX 一份……），不是按「什么时候读」拆；每份为了能单独读，开头都再交代一遍上下文和别的文件的关系。
- ui-reviewer 把三种模式的步骤都写在 agent 定义里，没有按分支放到指针后面（`idea-loop:writing-for-agents`「什么时候拆」：按分支拆，让每条路径只带它需要的东西）。

## 方案

改完 designer 拿到的是按**读的时机**分的 6 份：每个任务只读那个时机的那份，读到的每条规则只出现一次。ui-reviewer 定义里只留三种模式都用的部分和每轮走查，归档、对账两种模式的步骤搬进 `idea-loop:design-archive` 的「按需读」，只在被起成那个模式时读。

```text
designer 一次 refine                     ui-reviewer 一次被起
起手 ─┬─ design-law.md   (总是)           定义 13KB（共用步骤 + 每轮走查 + 交回）
      └─ static-protocol.md               │
清 AI tells / 签字前 ── critique.md        ├─ 归档：+ design-archive「UI 审查的归档模式」8KB
签字前 ── accessibility-baseline.md        └─ 对账：+ design-archive「UI 审查的对账模式」15KB
动效 ── motion.md
碰到对应问题才读 ── accessibility-baseline.md、laws-of-ux.md
```

### 逐个文件：合并前 → 合并后

字节数是 `wc -c`，改前取 `main` 的 `9a33407`，改后取本 PR 的头。

| 合并前（`uiux-refine/references/`） | 字节 | 去向 |
|---|---:|---|
| `design/design-core.md` | 20,587 | `design/design-law.md` 全文（posture、Design Read、register、brand floors、anti-slop、copy、close-out、proof map、responsive、runtime states、escalation） |
| `design/expression-framework.md` | 8,455 | `design/design-law.md` 的「Expression framework」 |
| `design/color-application.md` | 2,370 | `design/design-law.md` 的「Color application」（对比度并进 brand floors 的 a11y 一条） |
| `design/static-ui-protocol.md` | 19,523 | `design/static-protocol.md` 的主干；「DESIGN.md governance」与 Distill-back 并进 `design-law.md` 的「DESIGN.md governance and candidates」 |
| `design/surface-protocol.md` | 4,600 | `design/static-protocol.md` 各段表格的 Surface 行 |
| `design/module-protocol.md` | 4,123 | `design/static-protocol.md` 各段表格的 Module 行、「Crossing altitude」 |
| `design/component-protocol.md` | 7,745 | `design/static-protocol.md` 各段的 Component 行、状态矩阵表、Variant Board、「Descent」的四类子组件 |
| `design/landing-ia.md` | 2,983 | `design/static-protocol.md` 的「Landing / IA」 |
| `design/replication.md` | 5,257 | `design/static-protocol.md` 的 R 段（取线上基准、复刻比对循环）、G 段（真 DOM 截图）、「Handoff to motion」 |
| `design/ui-craft-checklist.md` | 10,961 | `design/critique.md`（排版阈值、视觉 slop、布局完整性、实用清单、drift check） |
| `design/heuristics-checklist.md` | 6,348 | `design/critique.md`（Nielsen 十条、严重度、认知负荷、五人格） |
| `design/motion-protocol.md` | 12,733 | `design/motion.md` 的「The loop」A–D |
| `design/motion-spec.md` | 7,768 | `design/motion.md` 的原则、时长与缓动 token、预算、白名单、冻帧时间轴、recipe、DoD |
| `design/motion-craft-checklist.md` | 6,349 | `design/motion.md` 的「Performance and craft rules」、Motion Pyramid、motion slop、两条 lint 的说明 |
| `motion-stage.md` | 4,356 | `design/motion.md` 的「开不开」与「C · ui-master on frames, then the human」 |
| `design/accessibility-baseline.md` | 9,253 | 保留原文件（9,217），只改指向新文件名 |
| `design/laws-of-ux.md` | 10,971 | 保留原文件（11,045），只改指向新文件名 |
| **合计 17 份** | **144,382** | **6 份 102,287（−29%）** |

| 合并后（`uiux-refine/references/design/`） | 字节 | 谁读、什么时候 |
|---|---:|---|
| `design-law.md` | 28,654 | designer 起手时读一次，静态、动效都用 |
| `static-protocol.md` | 21,838 | designer 起手、按意见改 |
| `critique.md` | 13,443 | designer 清 AI tells、签字前检查；动效 Gate 2 涉及可用性时 |
| `motion.md` | 18,090 | 编排者判「开不开」；designer 做动效 |
| `accessibility-baseline.md` | 9,217 | 签字前检查；碰到超出一行底线的 a11y 问题 |
| `laws-of-ux.md` | 11,045 | 只在构图问题 expression framework 答不了时 |

`uiux-refine` 整体：22 个文件 167,565 字节 → 11 个文件 125,474 字节。

### designer 一次 refine 读多少

| 一次 refine 走到哪 | 改前 | 改后 | 降 |
|---|---:|---:|---:|
| 起手、按意见改（组件路由） | 63,937 | 50,492 | −21% |
| 起手、按意见改（页面路由） | 72,660 | 50,492 | −31% |
| 落地页路由 | 75,643 | 50,492 | −33% |
| + 清 AI tells + 签字前检查 | 99,222 | 73,152 | −26% |
| + 动效（一次完整 refine，页面路由） | 130,428 | 91,242 | −30% |

### ui-reviewer

| | 改前 | 改后 |
|---|---:|---:|
| `agents/ui-reviewer.md` | 35,654 | 13,350（开工、输入、共用的步骤、每轮走查、两种模式的指针、交回） |
| `design-archive/references/review-archive.md`（新） | — | 8,473（原「归档模式」全文） |
| `design-archive/references/review-reconcile.md`（新） | — | 15,319（原「对账模式」全文，加上从「共用的步骤」括号里搬来的对账差异） |
| 每轮走查一次读的 | 35,654 | 13,350（−63%） |
| 归档一次读的 | 35,654 | 21,823（−39%） |
| 对账一次读的 | 35,654 | 28,669（−20%） |

`design-archive/SKILL.md` 的「按需读」表多两行（9,098 → 9,598），ui-reviewer 开工时本来就读它。

### 同一行为的其他入口

- **纳入**：`agents/designer.md`（指向新文件名）、`uiux-refine/SKILL.md` 与 `asset-stage.md`（「开不开」改指 `design/motion.md`）、`scripts/design-lint.mjs` 与 `design-lint-hook.mjs` 的提示文字（`design-core:` → `design-law:`）、`idea-loop/README.md`。
- **排除** `agents/ui-master.md`：它只看截图和方向说明的「意图」一句，不读任何设计原则（定义第 22 行），盲评保持不变。
- **排除** `uiux-refine` 的 `freeze.md`、`refine-canvas.md`、`asset-stage.md`、`pinned-findings.md`：读的人和时机各不相同（冻结、画布约定、营销素材、人说保留），合并只会让每次读的更多。
- **排除** `idea-loop/docs/design-modeling.md` 和 `docs/` 下已有的 spec、raw：它们是历史记录，提到旧文件名是当时的事实。
- **排除** 设计入口只能人手动敲、设计档案用得少这两处（决定记录 Q34，这次不改）。

## User Stories

只调整读的方式、不加能力，每个问题一行期望行为：

1. 期望行为（对应「designer 要读的原则太多、太散」）：designer 在一次 refine 里每个任务只读那个时机的那份原则，同一条规则只读到一次；原来 16 份里的每条规则都还在 6 份里的某一处。
2. 期望行为（对应「ui-reviewer 每次读三种模式」）：ui-reviewer 被起成某一种模式时，只读定义加那一种模式的步骤；起它的地方（pr-review、dreaming）不用改。

## 实现决策

- **按读的时机分文件，不按来源分**：总是读的（`design-law`）、静态流程（`static-protocol`）、评审清单（`critique`）、动效（`motion`），加两份只在碰到问题时读的（`accessibility-baseline`、`laws-of-ux`）。依据：人的原话「聚焦整合成更少的文件」；`writing-for-agents`「什么时候拆」：按顺序拆、按分支拆。
- **两份按需读的不并**：`accessibility-baseline` 和 `laws-of-ux` 各自只在一类问题上读，并成一份，碰到 a11y 问题也得把 Laws of UX 一起读进来。依据同上，按分支拆。
- **同一条规则只写一处，别处一句指过去**：例如 Distill-back 的候选格式只在 `design-law` 的「DESIGN.md governance and candidates」，静态 H 段、动效 C 段、drift check 都指它；对比度底线只在 brand floors 的 a11y 一条。
- **正文保持英文**：原 16 份除 `motion-stage` 外都是英文，规则逐条搬过来、不翻译，免得翻译时改了意思；`motion-stage` 并进来时译成英文，表头的 job 名保留中文（状态 / 结果 / 身份 / 氛围），跟方向说明的叫法一致。小节标题沿用原名（「Anti-slop checklist」「Close-out protocol」……），lint 提示文字里的出处只换文件名。
- **ui-reviewer 瘦身，不拆成三个 agent**：agent 名不变，pr-review、dreaming 和 README 里起它的地方都不用改；#241 正把 `agents/` 和 `skills/design/` 一起搬进 design 插件，三个新 agent 名会跟它的改名大面积冲突。两种模式的步骤放进 `idea-loop:design-archive` 的 references，因为归档与对账本来就是设计档案的事，ui-reviewer 开工时本来就调这个 skill，多出来的只是「按需读」表里的两行；agent 定义里用能力名加小节名指过去，不写文件路径（`ui-reviewer-archive-doc` 测试守着的约定）。
- 你可以推翻上面任何一条，说一句就行。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及：没改脚本逻辑，`design-lint` 只改了提示文字 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了 designer 与 ui-reviewer 读的文档；这两个 agent 没有 eval（`AGENTS.md` §5：主观产出不做 baseline），不加 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：仓库已有的文档守卫测试。`ui-reviewer-archive-doc`、`dreaming-source-wave-doc`、`design-archive-sections-doc` 三份原来钉在 `agents/ui-reviewer.md` 的小节上，改成钉在新位置，并加一条「agent 定义用能力名加小节名指向那一份」；`skill-private-references`、`design-archive-skill-doc`（SKILL.md 主体不超 5000 字）、`no-project-leak` 照原样跑。它们抓得到：规则搬丢了关键词、指针写成文件路径、SKILL.md 超长、混进项目信息；抓不到：某条规则在合并时被改了意思。后一种靠逐份对照（上面「逐个文件」表）和 review。
- **增量功能测试**：
  - 前置：本 PR 的头。步骤：`grep -rnE "design-core|static-ui-protocol|ui-craft-checklist|motion-spec\.md|motion-stage" idea-loop --include='*.md' --include='*.mjs' | grep -v "idea-loop/docs/"`。期望：无输出（除历史文档外不再有指向旧文件的地方）。
  - 步骤：`find idea-loop/skills/design/uiux-refine/references/design -name '*.md' | xargs wc -c`。期望：6 份、合计 102,287 字节。
  - 步骤：`node --test '*/scripts/*.test.mjs'`。期望：全绿。
- **照着谁写**：`design-archive-skill-length` 那次把 design-archive 主体拆进 references 的做法与它的守卫测试。

## Out of scope

- 设计入口只能人手动敲（`disable-model-invocation`）、设计档案用得少，这次不改（决定记录 Q34）。
- 把设计原则翻译成中文。
- `ui-master` 的盲评输入。

## 关联

- 决定记录：[2026-11-04 idea-loop 0.2.0 重构 grill](https://github.com/guohaonan-shy/harold-skills/blob/release/idea-loop-0.2.0/docs/raw/issue-workflow/2026-11-04-idea-loop-0-2-0-restructure-grill.md)「本轮决议」的 design 一行（Q26、Q29、Q30、Q34）；它在 `release/idea-loop-0.2.0` 上，不在 `main`。
- 发版：这次改动作为 idea-loop 0.1.x 的补丁合进 `main`，不跟 0.2.0 耦合；版本号这次不升，等 #245 也从 0.2.0 挪出来后一起升（Harold，2026-11-05）。
- 相邻 issue：#241 插件拆分会把 `skills/design/` 和设计 agent 搬进 design 插件。本次先进 `main`，`release/idea-loop-0.2.0` 同步 `main` 时带进来；#241 搬目录时，照共享笔记里那份文件清单跟着改。#242–#245、#247 不碰这些文件。
- 相邻 spec：[[confirm-only-on-loss]]、[[end-task-close-icon]] 当时改的是 `ui-craft-checklist.md`，那两条规则原文搬进了 `critique.md` 的「Practical craft checklist」。
