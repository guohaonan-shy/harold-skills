---
type: adr
status: 生效
tags: [ai-eval, ai-eval-plugin, eval, idea-loop]
summary: toeflair 的 ai-eval 迁成 harold-skills 的 ai-eval plugin，补报数口径参考与回放型 eval（eval-replay）
related: ["[[293]]", "[[2026-11-17-ai-eval-shape]]"]
---

# ADR-0061 — ai-eval 进 harold-skills：报数口径与回放型 eval

> 由 spec `ai-eval-plugin` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

这里的 eval 指：判断一次 prompt、工具定义或模型参数的改动有没有让 LLM 的输出变差的评测。#293 立项时（2026-11-17，对着当时的 main 核过），harold-skills 里讲 eval 的只有 `idea-loop/skills/engineering/to-spec/SKILL.md`「测试决策」表里的一行，写的是「LLM 输出质量（prompt 改动）→ eval」，门槛怎么定、报什么数、平台报错怎么处理、回放型 eval 怎么写，都没有。

另一个项目 toeflair 里有一套 `ai-eval` 插件（6 个 skill、9 个带测试的脚本，共 3193 行），只装在它自己的仓库里。#293 记录的那次需求给一个 LLM 工具调用加参数，没走 ai-eval，自己写了回放脚本，下面几件事是人在会话里一条条纠正出来的（数字出自那个私有项目，这里没法复现，照 issue 原文记）：

- 判官打分的门槛写成绝对值「≥ 90%」，可线上本身只有 49.8% / 54.6%，过不过都说明不了问题；
- 基线组 246 次里 30 次是平台超时，被当成失败算进数字，结论写「+11.8 个点」，重跑到没有超时后差是 +0.8，区间跨 0；
- 报告只写「每次通过」「三次全过」，评审追问是 pass¹ 还是 pass³；
- 同一会话里截出的几个 case 被当成相互独立，没按会话分组出区间。

ai-eval 本身也只有一部分覆盖：门槛对基线已有；pass¹ / pass³ 没有这套叫法；`--retry-failed` 存在但没有哪个 skill 把「先重跑」写成算数前必须做的一步；没有回放型 eval。它还带着 60 多处写死的 toeflair 路径和领域词，称不上项目无关。

## 2 决策（how）

- **新 plugin `ai-eval`，放仓库顶层**，从 toeflair 原样迁过来再去项目信息：路径与命令改读目标项目的 `EVAL.md`，领域词换成通用说法，PostHog（存样本和 scorer）与 Codex（当判官）留作声明的依赖、写进 README，不抽象成可替换后端（只有一个项目在用，抽象没有第二个用户可对照）。加防泄漏测试，照 idea-loop 的 `no-project-leak.test.mjs`。起始版本 `0.0.1`，人定（起草时写的是 `0.1.0`）。
- **报数口径写成插件级一份参考**，eval-run、eval-baseline、eval-replay 引它、不复述：门槛写「候选不比基线差」；pass¹ 是单次通过率、pass³ 是同一 case 跑三次全过的占比，第一次出现时给定义，只跑 1 次不报 pass³；平台报错（超时、连接失败、5xx、限流）不算失败也不进分母，候选和基线两边都重跑到零，最多 3 轮，之后还有就停下报人；差别看区间，统计单位必须相互独立，区间整个在 0 上算变好、整个在 0 下算变差、跨 0 算持平。
- **eval-replay 是新 skill**：改的是多轮对话里的一步（工具定义、说明文字、某一轮提示词、模型参数）时用，跑产品流水线的改动仍走 eval-run。回放脚本由项目用自己的语言写，skill 给八条完成清单（只回放一步、异步并发有上限、请求形状照抄线上并逐级退避、逐条追加可续跑、能用代码判就不用判官、生成与聚合分开并有空跑模式、含用户原文的数据不进仓库、变体开关默认保持首轮写法）。结果文件一行一个 JSON，字段 `case, group, variant, run, status, pass, score`，是回放脚本和统计脚本之间唯一的接口。
- **回放统计脚本**读结果文件出 pass¹ / pass³ 和每个变体对 `baseline` 的差、按 `group` 重抽 2000 次的 95% 区间，种子固定；还有 `platform_error` 行就拒绝出数、退出码 1。夜间 review 补了两条（人白天看过没推翻）：通过率和分数各自判定，一好一坏整体报「冲突」交人，一持平一变差判「变差」；判官判不出来（`pass` 为 `null`）的次数不进 pass¹ 分母，报告报出共几次。
- **to-spec 那一行**改成指向 ai-eval；仓库 `AGENTS.md` 加 `ai-eval` 的 issue 分类；idea-loop 升 patch（人定，起草时按 minor）。
- 取舍（没做）：toeflair 那边的切换（更新 `EVAL.md`、改装法、删旧副本）另开 #361，迁移期间两份并存互不影响；`paired-stats.mjs` 不改（ai-eval 的样本本来相互独立）；不给 ai-eval 自己做定量 eval（`AGENTS.md` §5）；idea-loop 的 tdd skill 和 implementer 只说 eval 归 spec 的测试决策，不动。

## 3 结果（result）

- plugin 在 `ai-eval/`：`.claude-plugin/plugin.json`（`0.0.1`）、`README.md`（含依赖一节）、7 个 skill（`eval-baseline`、`eval-judge`、`eval-metrics-review`、`eval-replay`、`eval-run`、`eval-samples`、`eval-setup`）、`references/reporting-rules.md`（报数口径）、`scripts/` 下迁来的 9 个脚本加 `replay-stats.mjs`。`.claude-plugin/marketplace.json` 有 `ai-eval` 一项，仓库 `AGENTS.md` 的「当前 plugins」与「issue 分类」都有它。
- `eval-run`、`eval-baseline`、`eval-setup` 引用 `references/reporting-rules.md`；`idea-loop/skills/engineering/to-spec/SKILL.md` 测试决策表的 eval 一行指向 eval-run / eval-replay。
- 合并在 PR #410（ai-eval 进 harold-skills：报数口径与回放型 eval），#293 已关闭。决定记录 [[293]]（版本档位、冲突判定、判不出来不进分母等夜间与白天的决定）；形状怎么定的见 [[2026-11-17-ai-eval-shape]]。
- 守护：`ai-eval/scripts/replay-stats.test.mjs`（算法与拒绝出数）、`ai-eval/scripts/eval-replay.test.mjs`（skill 的完成清单与结果行形状）、`ai-eval/scripts/reporting-rules.test.mjs`（口径只在一处写）、`ai-eval/scripts/no-project-leak.test.mjs`（防泄漏）、`idea-loop/scripts/to-spec-by-deliverable-doc.test.mjs`（to-spec 那一行）。本次对账跑 `ai-eval/scripts/*.test.mjs`，150 条全过。
- 未做：toeflair 的切换在 harold-skills#361，2026-11-22 仍开着。
