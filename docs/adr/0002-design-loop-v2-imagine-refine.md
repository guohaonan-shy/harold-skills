---
type: adr
status: 生效
tags: [design-workflow, idea-loop, prototype, critic-loop]
summary: 设计拆成两次触碰，design plugin 退役并入 idea-loop，发散与收敛分成两个 skill
related: ["[[2026-09-11-design-loop-prototype-critic]]", "[[2026-09-11-aihero-prototype-skill]]", "[[2026-09-11-lenny-ai-world-class-designer]]", "[[0001-design-workflow-into-harold-skills]]"]
---

# ADR-0002 — 设计工作流 v2：两次触碰、imagine 与 refine、一条评委收敛环

> 由 spec `design-loop-v2` 蒸馏而来，该 spec 已删除。
> 本 ADR 取代 [[0001-design-workflow-into-harold-skills]] 的 §2.1 / §2.2 / §2.5 / §2.6，
> 那份 ADR 的其余小节仍然生效。

## 1 背景

v1 的接法是：`grill` 的设计子树长出来后，一次性 handoff 给独立 plugin 的总入口跑完整条高保真流水线，产物回访谈里由人判定。实跑下来五个卡点：

1. **人在错误的时机评错误的东西。** 结构还在访谈里讨论，摆到人面前的却是高保真视觉稿 —— 人会去评品味而不是评结构，「不满意」这个信号分不清是产品判断错了还是像素没调好。
2. **一个访谈被一整条流水线打断。** 浏览器循环、lint 输出、截图把 `grill` 的主会话上下文撑满。spec 的状态闭集里早就有 `等设计冻结` 一档，却没有任何路径真正让它发生。
3. **收敛环没有独立的品味约束。** 原来的 isolated critique 是同一个模型自己再看一遍加读 checklist：没有分模型、评委看得到代码和历史、没有可依赖的评分标准（9 分和 8 分说不出差别）。而 refero 被当成开工前的约束读，等于把模型的路径依赖换成了行业的路径依赖。
4. **状态模型类的问题没有仪器。** 「这个状态机该长什么样」这类讨论定不了的问题，只能靠文字硬答。
5. **design 作为独立 plugin 的前提已经不存在。** 它每个阶段的输入（spec、prototype）和输出（ticket 消费的冻结、implement 调用的仪器）都是 idea-loop 的产物，却要靠跨 plugin 调用衔接，两边各自升版本时契约会漂；同时五个入口让一条线性流程看起来像一张路由表。

## 2 决策

### 2.1 设计拆成两次触碰，放在两个不同时机

| 触碰 | 时机 | 回答什么 | 产物 | 强制吗 |
|---|---|---|---|---|
| **prototype** | `grill` 中，某条 frontier 问题文字定不了时 | 选哪个结构 / 状态模型 / 行为 | 答案写进 spec §4；一次性 HTML 进 raw 桶当证据 | 否，按需 |
| **设计冻结** | `to-spec` 之后、UI ticket 开工之前 | 这个 surface 想要什么、做到什么程度 | HTML 画布 + ledger + 截图进 raw；冻结摘要进 spec | UI ticket 是 |

这直接解掉卡点 1 与 4：结构问题用可点击的灰盒取证，在访谈里当场解决；视觉问题推迟到 spec 落盘之后，人在那时评的才是视觉。

### 2.2 design 独立 plugin 退役，内容整体并入 idea-loop

不留别名、兼容层或过渡期双份安装。marketplace 条目移除，`design/` 目录删除。设计侧的 taste 与 craft references 住进 `idea-loop/references/design/`，确定性 design-lint hook 与脚本住进 `hooks/` 与 `scripts/`，headless Playwright 走 plugin 自带的 `.mcp.json`。

### 2.3 uiux-imagine：发散，准出一份方向说明

只能人调。spec 停在 `等设计冻结` 之后才跑。在**还没定下来的最高高度**上出几个真正不同的变种（随机种子 / ambition / 已有 DESIGN.md 三种起点），人看着变种给方向性 note，模型**调向**到人说「方向没有要补的了」。

准出物**只有一份方向说明**（固定七节，写进 spec §4），形状由 `direction-note-check.mjs` 校验。变种的渲染只服务于人当下的反应，不留存、不往下传。项目没有 `DESIGN.md` 的，语言在这一段被选出来并写成文件。原 `design-brief` 溶解在这里。

### 2.4 uiux-refine：收敛，准出一个 HTML 画布

也只能人调，且要一个全新会话。它读 spec 里那份方向说明，在 `DESIGN.md` 之下**从方向说明重建** preview（绝不从 imagine 的渲染物继续），执行者对评委跑双模型打磨环 —— **评委只收截图，分数从 finding 推导**，由 `critic-score.mjs` 对着它自己的 finding 复算。静态构图冻结之后才接动效段与素材段，再各跑一轮减法与 AI tells。

人签字后，HTML 画布、逐格截图与 ledger 冻结进 raw 桶，**冻结摘要取代 spec §4 里的方向说明，状态翻 `在飞`**。`to-ticket` 的设计冻结字段从这份冻结摘要誊写（取代 ADR-0001 §2.5 的「从 spec §4 誊写」）。

### 2.5 UI 实现标准是 reference 加脚本，不是 skill

`implement` 接到 UI ticket 时读一份 plugin 级 reference，把 HTML 画布整理成项目自己框架的代码，按 ledger 里签字过的验收矩阵逐格对着画布比 mismatch，**红绿判定**。判据是脚本（`ui-measure.mjs` + `ui-compare.mjs`）而不是另一个模型的意见。原 `design-port` 溶解在这里。

### 2.6 前向环的形状

```
grill（按需 prototype）→ to-spec → [uiux-imagine → /clear → uiux-refine] → to-ticket → implement → pr-*
```

**方括号里那两段是条件段**，只在 spec 落成 `等设计冻结`（即这次需求碰 UI）时才走；纯后端、埋点、bug fix 从 `to-spec` 直接进 `to-ticket`。

三封「给失忆者的信」分别在三道人工闸门各压缩一次：prototype 的一句话问题与裁决进 raw；方向说明从 imagine 交给 refine；冻结摘要从 refine 交给 to-ticket 与 implement。

### 2.7 原则

**人拥有方向，机器拥有执行。**

## 3 结果

**做了。** 随 PR #15（`feat(idea-loop): 设计侧整体并入 —— prototype / uiux-imagine / uiux-refine 与 UI 实现环`）合并落地，切出的 9 张 ticket 全部完成。

核实（2026-09-16 对 `origin/main`）：`idea-loop` 现为 **10 个 skill**、版本 0.0.8；`prototype` / `uiux-imagine` / `uiux-refine` 的 `SKILL.md`、`ui-measure.mjs` / `ui-compare.mjs` / `critic-score.mjs` / `direction-note-check.mjs`、`evals/` 的 baseline 均在树上；`design/` 目录 0 条目，全仓无退役残留引用；`node --test idea-loop/scripts/*.test.mjs` 84/84 通过。

三个新 skill 被钉在 `evals/` 的一个真实 case 上，这是对本仓库「主观输出跳过 quantitative eval」约定的一处**有意例外**，理由写在根 `CLAUDE.md` §5。

## 4 关联

- 素材：[[2026-09-11-design-loop-prototype-critic]]、[[2026-09-11-aihero-prototype-skill]]、[[2026-09-11-lenny-ai-world-class-designer]]
- 被本 ADR 取代四节的前序决策：[[0001-design-workflow-into-harold-skills]]
