---
type: raw
source_type: conversation
captured: 2026-11-05
title: grill —— #242 issue 模型：搁置与 blocked、子 issue 何时拆、父子会话、review 的边界、联调
tags: [issue-workflow, issue-model]
related: ["[[issue-model]]", "[[2026-11-04-idea-loop-0-2-0-restructure-grill]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现。题号 Q1–Q9 是这场会话出题的编号，跟 [[2026-11-04-idea-loop-0-2-0-restructure-grill]] 的 Q1–Q46 不是一套。事实对着 origin/release/idea-loop-0.2.0 16812ce 与 GitHub 上 harold-skills 的 issue 取，日期 2026-11-05。末尾一张「本轮决议」表。

## A0

出题前取的事实：

- harold-skills 开着的 issue：42 个没有 `status:*`，7 个 `status:todo`，4 个 `status:搁置`（#237 Codex、#227 cmux、#226 Linear、#61 长页面分段）。新状态清单里没有「搁置」，这 4 个是它的真实用法。
- GitHub 原生有「blocked by」关系，`gh api repos/<o>/<r>/issues/<号>/dependencies/blocked_by` 本机可调；#243 依赖 #242、#247 依赖 #244 目前只写在正文里。
- 现在一份 spec 一个 PR，`to-ticket` 的标准是「一份 spec 塞得进一个 PR，就只切一张工单」。

出了 Q1–Q7：搁置去哪、blocked 的意思与解除、什么时候拆子 issue、子 issue 的出生状态、父 issue 拆完后的状态、review 的起点、skill 名与分类。

起头的会话随后转来决定记录新补的 Q44–Q46（跨仓库的需求按仓库拆子 issue、子 PR 先不合、父会话联调），据此改了 Q5，加了 Q8（同仓库的子 PR 要不要等联调）。

## U1

Q1 - Q2 同意

Q3 子issue和ticket的区别是什么？按你现在说的，一个issue spec 定稿之后才进行issue的拆分，这个跟ticket拆分的区别是什么？我读了Q4，现在的工作流是backlog -> todo阶段进行issue的拆分，subissue变成issue 等待调度？

## A1

- 子 issue 和工单都是切小，差在要不要单独 review、单独合并：子 issue 是 issue 平台上的一条，一个子会话、一条分支、一个 PR；工单是一个 PR 里的切片，`docs/spec/<slug>/tickets/` 下的文件，一张一个 commit，几张一起 review、一起合。例子：F5 知识库（PR #233）一份 spec 6 张工单，都在一个 PR 里。
- 拆分不在 backlog → todo：那一步只判问题在不在、做不做。拆分在父会话里 spec 定稿（碰 UI 的设计冻结）之后；拆出的子 issue 直接进 todo 等调度，不再过 backlog。
- 重问 Q3：拆不拆在 spec 定稿后、按「一个 PR 装不装得下」由 AI 判，跨仓库一定拆，汇报里写拆法、人能推翻。

## U2

Q3 - Q5 我同意

Q6 拆分成subissue 之后的每个pr是单独合并主干/集成分支？

Q7 我倾向于就叫issues

同一个repo不同的子issue没必要联调；是否要联调，我倾向于spec里面的测试计划判断。

## A2

- 子 PR 各自 review、各自合进所在仓库的主分支，不开父级的集成分支（像 `release/idea-loop-0.2.0` 那样的只在发版时用）。
- 要不要联调由 spec 测试计划定，Q8 不再按仓库数问：测试计划说要联调的，子 PR 开出先不合，全部开好后父会话联调，人逐个说合并、知识库分支最后合；不要的，各自 review 完人说合并就合，先后靠 blocked by。
- 「工单」写进 `GLOSSARY.md`。
- 出 Q6（review 起点，补一句等联调的子 PR 也停在 review）、Q7 后半（分类）、Q9（测试计划里「联调」一行的写法）。

## U3

没问题

## A3

（2026-11-05，起头的会话转来）决定记录 41c07de 补了 U14、U15：0.2.0 不搬知识库，公司项目照旧在单个仓库里维护，Q44–Q46（跨仓库按仓库拆子 issue、父会话联调）撤出 0.2.0。据此：本场 Q9（测试计划的「联调」一行）一起撤；Q5 退回最初的推荐：父会话拆完子 issue 就归档，子 issue 全关后由调度对账关父 issue；子 PR 各自合。下表相应几行已改，改前的写法见本文件的 git 历史。

## 本轮决议

| 议题 | 决议 | 出处 |
|---|---|---|
| 搁置 | 「先放着」回 backlog：会话归档前在 issue 上评论停在哪个阶段、分支名，分支留着；周汇总时人重新放行回 todo，新会话从评论接上；没有单独的搁置状态 | Q1 |
| blocked | 被一个具体的东西挡住：别的 issue（用平台的 blocked by 关系记）或等人给条件（评论「等你：X」）。blocked 不占会话，会话照 Q1 评论后归档；挡路的 issue 全关了，调度对账把它翻回 todo；等人给条件的由人翻回 todo | Q2 |
| 何时拆子 issue | 父会话里 spec 定稿（碰 UI 的设计冻结）之后；判据是一个 PR 装不装得下；AI 判，汇报里写拆法，人能推翻；spec 加一节「子 issue」写每块范围，先后用 blocked by | Q3、U1 |
| 子 issue 与工单 | 子 issue 单独 review、单独合并，一个子会话一个 PR；工单是一个 PR 里的切片 | U1 |
| 子 issue 的出生与路径 | 直接开在 todo，优先级随父；子会话认领直接进 implement：todo → implement → review → done；工单由子会话自己切，放父 spec 目录的 `tickets/<子号>/` | Q4 |
| 父 issue 拆完后 | 翻 implement，父会话归档；子 issue 全关后由调度对账关成 done | Q5、A3 |
| 子 PR 合到哪 | 各自 review、各自合进主分支，不开父级集成分支，不等别的子 PR | U2、A3 |
| 联调 | 撤出 0.2.0，随跨仓库需求留给以后处理知识库的 issue | A3 |
| review | PR 转 ready、第一轮 Review 汇报交给人时 implement → review；人批了要改仍留 review；合并后 done | Q6 |
| 命名 | `spec-status` skill 改名 `issues`，跟唯一写入口 `issues.mjs` 同名 | Q7 |
| harold-skills 分类 | 按 #241 拆完后的最终形状：父类插件名，子类 skill 或 agent 名（如 `type:design/ui-reviewer`），跨几个的只打父类 | Q7 |
