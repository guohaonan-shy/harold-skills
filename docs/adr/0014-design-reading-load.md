---
type: adr
status: 生效
tags: [design, uiux-refine, ui-reviewer, reading-load]
summary: 16 份设计原则按读的时机合成 6 份、内容全留；ui-reviewer 的归档/对账步骤挪进 design-archive 按需读
related: ["[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0014 — 设计原则按读的时机合并，ui-reviewer 按模式按需读

> 由 spec `design-reading-load` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

issue #246（2026-11-05 对着 `main` 逐份量字节）：designer 一次完整 refine 要读 12–15 份设计原则、约 130KB；`agents/ui-reviewer.md` 36KB，管走查、归档、对账三种模式，每次只跑一种却整份进上下文。

原因：设计原则按**来源**拆文件（一份来自哪个外部方法就一份），不是按**什么时候读**拆；每份开头都要再交代上下文和别的文件的关系，同一件事（降一层高度、状态矩阵先于视觉、Distill-back 只写候选、对比度底线、动效预算）在多份里各写一遍。ui-reviewer 则是没把按分支走的内容放到指针后面。

## 2 决策（how）

- **按读的时机分 6 份，内容一条不删**：总是读的、静态流程、评审清单、动效，加两份只在碰到对应问题时读的（a11y 底线、Laws of UX）。后两份不并，否则碰到 a11y 问题也得把另一份读进来。
- **同一条规则只写一处，别处一句指过去**：例如候选格式只在总则的「DESIGN.md governance and candidates」，对比度底线只在 brand floors 的 a11y 一条。
- **正文保持英文**，规则逐条搬、不翻译，免得改了意思；唯一中文的原文件译成英文，表头的 job 名保留中文。
- **ui-reviewer 瘦身，不拆成三个 agent**：agent 名不变，pr-review、dreaming、README 里起它的地方都不用改（同期的插件拆分会大面积改 agent 名，新增三个名字会冲突）。归档、对账两种模式的步骤搬进 `idea-loop:design-archive` 的 `references/`，agent 定义里用「能力名 + 节名」指过去，不写文件路径。
- 排除：`ui-master` 不读设计原则，盲评不变；`freeze.md`、`refine-canvas.md`、`asset-stage.md`、`pinned-findings.md` 读的人和时机各不相同，不并。

## 3 结果（result）

- `idea-loop/skills/design/uiux-refine/references/design/` 下 6 份：`design-law.md`、`static-protocol.md`、`critique.md`、`motion.md`、`accessibility-baseline.md`、`laws-of-ux.md`，合计约 102KB（2026-11-10 量 102,453 字节；合并时 102,287，之后小幅增补）。旧的 16 份文件名在插件内已无引用（`design-core`、`static-ui-protocol`、`ui-craft-checklist`、`motion-spec`、`motion-stage` 全插件搜不到，历史文档除外）。
- `idea-loop/agents/ui-reviewer.md` 约 13.3KB，只留共用步骤、每轮走查与交回；归档模式在 `skills/design/design-archive/references/review-archive.md`，对账模式在 `review-reconcile.md`。
- 合并时量得的读量：designer 一次完整 refine 约 130KB → 91KB（−30%），只做静态约 73KB → 50KB；ui-reviewer 每轮走查 36KB → 13KB（−63%）。
- `design-lint.mjs` 与 `design-lint-hook.mjs` 提示里的出处从 `design-core:` 改为 `design-law:`。
- 此前 `confirm-only-on-loss`、`end-task-close-icon` 两条规则的原文，搬进了 `critique.md` 的「Practical craft checklist」。
- 随 PR #248 合入 `main`，#253 是同一改动的 0.1.x 补丁；版本号当时没升。
