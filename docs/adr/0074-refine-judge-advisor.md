---
type: adr
status: 生效
tags: [design-workflow, refine-judge-advisor, uiux-refine, uiux-research, design-archive]
summary: 设计收敛改由人定：评委降为顾问，每轮交配参考图和用户路径的评审报告；冻结后走交给调度，搁置的设计放主 checkout 的 pending
related: ["[[2026-11-16-refine-advisor-grill]]", "[[2026-09-11-lenny-ai-world-class-designer]]", "[[0002-design-loop-v2-imagine-refine]]", "[[0016-design-research-agent]]", "[[0015-uiux-imagine-agent]]"]
---

# ADR-0074 — 设计收敛改由人定：评委降为顾问，每轮交设计评审报告

> 由 spec `refine-judge-advisor` 蒸馏而来，该 spec 已删除。覆盖 issue #230、#287、#289。

## 1 背景（why）

`uiux-refine` 是设计收敛的 skill：designer 出画布的下一版，评委（现在的 `ui-master` agent）看截图打分，一轮轮改到停。下面的数字来自 2026-11-01 到 11-15 在一个真实项目里真跑过 refine 的 9 个会话（子代理逐场读会话记录得出）：

- **评委的分数决定停不停，但没有一场停得下来**：规则是 9 分通过、连续 3 轮不涨算瓶颈、判「方向」也停。9 场里最高 8 分，没有一场到 9；#584 出到第 17 版，连续 10 轮停在 7 分。评委意见不经过人直接交给 designer，人回头发现不对就整体回退，9 场里 6 次（例如 #481 人说「将画布推回到 v1」，v2–v7 的 22 条决定作废）。评委自己也来回摆（#738 上一轮嫌锁图标「实心太重」，下一轮嫌「线条太轻」，人最后把锁删了）。
- **人看不懂评委、手上没有参考**：人约 128 条回复里 33% 只说「照推荐」或「保留」，16% 明确跟评委审美相反，11%（12 次）是「找不到在哪看 / 看不懂指什么」。每次停下交的是一份长文字清单。designer 为回应评委还会做人没要过的改动（#688 手机端卡片加了收起展开，事先没讲）。
- **#230**：评委判「方向」、人在这次 refine 里已嫌弃那一块（#738 的新徽章），旧规则表只有「保留 / 改」，照表只能推荐保留；人回「既然方向有问题，我们就暂停 refine，重新回到 imagine」。
- **#287**：冻结后那句话叫 issue 会话「换到实现阶段」，指向 `issue-session` 里并不存在的小节「换阶段」，并把「自己调 to-ticket」列成选项；#688 的 triage 会话因此直接切了 10 张工单，issue 还停在 triage。
- **#289**：设计做到一半先不做了（#689：466 份报告里 6.0 分的只有 14 份，约 3%，人决定回到不动界面），全仓库没有约定认识 `docs/design/pending/`，设计成果留在 `tmp/` 会被合并前的归档清掉。
- **调研数据源只配在一个项目里**：调研员工具写死 Refero，插件不带它，换项目起调研员直接失败；人判断 Refero「很多素材很老」，改订 Mobbin。

## 2 决策（how）

- **评委是顾问，人签字就冻结。** 评委交意见、对人每条思路的评估（成立 / 存疑）和 1–10 分，分数只是参考，不再有「通过」「瓶颈」。签字前会话把还没解决的方向性意见列给人看一遍。打分脚本只校验格式（`state` 必须是画布状态名）并标出有没有 `direction`，不输出继续或停止。
- **每轮交一份设计评审报告**：一页 HTML，由脚本拼（每轮结构相同、图要内嵌）。顺序：没声明却变了的地方（改前改后）→ 评委意见逐条（配调研员的用户路径与 Mobbin 参考图、一句新的设计意图）→ 对人思路的评估 → 分数。人在对话里按编号回，每一条都要回应过才进下一轮，人没提到的会话接着问，不替人定。发出走运行环境已有的「发布审阅页」，不新增能力。参考图只给人看，不放进 designer 和评委的上下文（人：会「引导 agent 作出偏移人设计意图的内容」）。
- **ledger 记讨论后定下的决策**（按轮次、编号 `<轮次>.<序号>`），由编排者在人确认后写；评委的「不算差距」清单从它抽出；取消方向说明里的「人保留」行，旧行搬进 ledger 第 0 轮。
- **designer 每版交改动集**（逐条对决策编号），会话用 `ui-measure` 的两版画布比对（`canvas-diff` 模式，只比锚点区域）找出改动集外的改动；designer 交付前自检（减法、清 AI tells）改的地方也列成没声明的改动，带它写的理由，由人定留还是撤。评委每轮都带「哪里可以没有」和 AI tells 两个角度，取消单独的减法轮和动效阶段（动效是某一轮决策里的一种）。designer 做不下去（两条决策打架）交「卡住」，不自行取舍。
- **#230**：评委判「方向」且人在这次 refine 里对这一块表示过不满意，报告推荐「回 imagine 重开这一块」并把评委原文交给新的 imaginer。
- **调研员两种用法**：整页调研仍只在人说「查一下」时起；每轮的轻用法由会话自动起、不用人批，只覆盖这轮评委意见碰到的部分，交回结构化文件，由 `research-check` 加 `--light` 模式校验。调研员仍是单独的 agent，会话只收文件。数据源换 Mobbin：远程 MCP 写进插件 `.mcp.json`，工具名 `mcp__plugin_idea-loop_mobbin__*`；没连上时轻用法照出报告并写明「这一轮没有参考图」，整页调研停下告诉人怎么连。
- **#287**：冻结后的话按会话类型分：triage 会话回 `issue-session` 的「交给调度」，todo 会话回「实现」（先开 draft PR 再切工单），不在 issue 会话里由人定；删掉「换阶段」和「自己调 to-ticket」；`to-ticket` 在 issue 会话里发现 issue 还在 triage 就停下。
- **#289**：人说「这块界面先不做」，编排者把 `docs/design/tmp/<spec-slug>/` 原样挪到主 checkout（`git worktree list` 第一行）的 `docs/design/pending/<spec-slug>/`，spec 里留指针和人原话的理由；只放本地不提交，设计档案校验跳过；imagine、refine 起手时查它、问人接不接着做；dreaming 对账时列出并提议删已了结的。
- **版本**：Refero 换 Mobbin 按规则算 major（只配了 Refero 的项目调研会不可用），人定升 patch（0.x 期间行为改动常走 patch，并让开 `release/idea-loop-0.2.0`）。
- 没做：画布外壳（#288，用新流程设计它当第一次 dogfood）；往桌面端加 mod 把画布放进侧栏；ui-measure 的颜色空间归一化和减弱动效（#223 第 2、3 条，仍在原 issue）；imagine 每轮收尾必须取舍（另开 issue）；Toeflair 项目里的 Refero 配置不迁移。
- 未做：spec 测试决策里的「#287 回放用例」（只有 #230 的 `refine-direction-dislike`）；`uiux-research` baseline 用 Mobbin 重跑交人标注，查不到已做的证据（`evals/uiux-research/cases/` 里只有 `leave-confirm` 有 `annotations.md`）。

## 3 结果（result）

- 评委与打分：`idea-loop/agents/ui-master.md`（输出 JSON：`findings`、`reasoning`、`score`、`note`）、`idea-loop/scripts/critic-score.mjs`（只校验格式、标 `direction`）。
- 流程：`idea-loop/skills/design/uiux-refine/SKILL.md`（每轮六步、签字冻结，主体 4806 字）与 `references/ledger-and-report.md`（ledger 格式、「人保留」迁移、报告怎么发）、`references/after-freeze.md`（按会话类型分的出口，含「这块界面先不做」）；`idea-loop/agents/designer.md`（改动集、自检说明）；`idea-loop/skills/design/design-change-sync/SKILL.md`（评委给意见、人定）。
- 报告与比对：`idea-loop/scripts/design-review-report.mjs`（含 `RECOMMEND_REOPEN`）、`idea-loop/scripts/ui-canvas-diff.mjs` 与 `ui-measure.mjs` 的 `canvas-diff` 模式。
- 调研：`idea-loop/.mcp.json` 有 `mobbin`；`idea-loop/agents/uiux-researcher.md`、`idea-loop/skills/design/uiux-research/references/light-return.md`、`idea-loop/scripts/research-check.mjs` 的 `--light`。
- #287：`idea-loop/skills/engineering/to-ticket/SKILL.md` 的 triage 前提；#289：`idea-loop/skills/productivity/wiki-conventions/SKILL.md` 目录表 `design/pending/` 一行、`idea-loop/scripts/design-archive-check.mjs` 跳过 `pending/`、`uiux-imagine/SKILL.md` 起手查 pending、dreaming 的 `references/pending-designs.md`。
- 守护：`idea-loop/scripts/critic-score.test.mjs`、`design-review-report.test.mjs`、`ui-canvas-diff.test.mjs`、`ui-canvas-diff-browser.test.mjs`、`research-check-light.test.mjs`、`research-light-doc.test.mjs`、`refine-round-flow-doc.test.mjs`、`after-freeze-exit-doc.test.mjs`、`pending-design-doc.test.mjs`；回放用例 `idea-loop/evals/retro/cases/refine-direction-dislike/`（#230）。
- 合并：PR #346（设计收敛改由人定：评委降为顾问，每轮交设计评审报告）；issue #230、#287、#289 均已关闭。讨论见 [[2026-11-16-refine-advisor-grill]]，评委角色来源见 [[2026-09-11-lenny-ai-world-class-designer]]。
- 对旧决定的改动：[[0002-design-loop-v2-imagine-refine]] §2.4 的「评委双模型打磨环」「静态冻结后才接动效段与减法、AI tells 轮」被 §2 取代；[[0016-design-research-agent]] §2 的「由人调起」只保留整页调研，数据源由 Refero 改 Mobbin；[[0015-uiux-imagine-agent]] 里「人保留」的写回处改记进 ledger。
