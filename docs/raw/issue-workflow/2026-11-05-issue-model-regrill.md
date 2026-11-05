---
type: raw
source_type: conversation
captured: 2026-11-05
title: grill —— #242 重定 issue 模型：七个状态对上 Linear，triage 可跳过，实现开始即开 PR，一个仓库一个 PR，issue 正文格式
tags: [issue-workflow, issue-model, linear]
related: ["[[issue-model]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现。这是 #242、#243、#226 放进同一个会话、基于 main（b4c612a，idea-loop 0.1.9）做 0.1.10 时的重新 grill；同日早些时候的 [2026-11-05 九个状态的 grill](https://github.com/guohaonan-shy/harold-skills/blob/claude/optimistic-northcutt-c71462/docs/raw/issue-workflow/2026-11-05-issue-model-grill.md)（九个状态）被这一场取代。末尾一张「本轮决议」表。

## A0

开工前取的事实（2026-11-05）：

- 三个 issue 的 label：#242、#243 是 `status:todo`（0.2.0 的新状态，人手打的），#226 是 `status:搁置`。main 上的 `issues.mjs` 不认 `todo`，`set 验证中 242` 被拒（「能翻成：无」）。
- 旧中文 label 还在用：Tofelair 开着的 issue 里实现中 4、审核中 2、待实现 2、搁置 7、没有 `status:*` 的 134；harold-skills 里 todo 7、搁置 5、没有的 42。
- #242 的旧 spec（分支 `backup/242-issue-model`）定的是九个状态（backlog、todo、spec、design、implement、review、blocked、done、canceled）、一个 issue 一个 PR、Linear 只写对照不接。

摆了两题：迁移怎么办、#226 Linear 做到哪。

## U1

迁移：「这个我们讨论下，首先最开始的时候是backlog，然后我觉得会有两个分支，一个是ready-for-agent（即问题得到了验证且不需要我，即维护者评估），另一个则是needs-triage，即需要我来评估（包括需要grill、需要设计），待我评估完成之后，状态变成ready-for-agent，这个状态可以被调度，然后变成实现中，进入pr review之后，将issue和pr关联，状态变成reviewing，最后进入完成归档。我觉得这样会简单很多」

Linear：「linear 我倾向于通过mcp来接入，然后具体issue的结构，我倾向于setup过程中，完成linear得授权之后，针对linear的issue 状态进行整理，放到项目纬度的文档。

上一个问题，我理解我们说的是github的，但我希望无论是linear还是github，在我们这套调度内尽可能issue的实体是一样的。

我可以连接linear，然后告诉你我现在工作所处的team，issue的状态等，然后我们再具体讨论，我们先摸底」

## A1

- 人的状态线跟 Linear 默认的 Backlog / Triage / Todo / In Progress / In Review / Done / Canceled 一一对上；GitHub 用 `status:<名>` label 表达同一组状态。
- 推荐（人没有逐条回，下一轮直接定了状态线）：backlog 往两边分由每周分拣判；needs-triage 的会话做 grill 与设计，人评估完翻成可调度；blocked 不设状态、用平台的 blocked by；先放着回 backlog 带评论；canceled 是关闭成 not planned。
- Linear MCP 已连上，工作区 Hanabi AI，8 个 team。

## U2

「这个已经很明显了，状态完全可以对上，backlog -> triage -> todo -> in progress -> in review -> done，backlog 有时候应该也可直接到todo。我觉得你可以参考Agent Platform进行更深度的探查。」

## A2

Agent Platform（FA）的摸底，2026-11-05，最近 60 天新建的 250 个 issue，另抽 16 个看状态历史：

- 团队没开 Triage（`triageEnabled: false`）。状态是 Backlog / Todo / In Progress / In Review / Done / Canceled / Duplicate。子状态用单选 label 组表达：`design status`（UIUX Needed → Scheduled → In Progress → Submitted）、`QA status`。
- In Progress、In Review、Done 由 PR 推：FA-575 Backlog → In Progress（02:07）→ In Review（02:17）→ Done（04:13 合并）。
- 一个 issue 常在几个仓库各一个 PR：抽到的 13 个完成的里 4 个（FA-520、FA-524、FA-505、FA-571）在 fish-agent、platform-api、platform-web 各开一个。
- 12 个完成的里只有 2 个经过 Todo；6 个 Backlog → In Progress，3 个从 In Progress 开始，1 个 Backlog → Done。
- 分类：type 组单选 Bug / Feature / Improvement（130 / 250），模块 label（telephony 60、sessions 29……），`customer:*`，`behavior-change` 31。project 1 个、milestone 0、estimate 0；cycle 174；优先级 192。
- 父子：52 / 250 有父，父是 `[Epic]`（FA-475）或汇总单（FA-559「Agent 页面走查问题汇总」下 10 个）。
- 正文没有 Linear 模板，写法统一：背景 / 问题 / 已确认原因 / 影响范围。

摆了三题：没开 Triage 怎么表达、in progress 之后谁翻、一个 issue 多个 PR。

## U3

「1 团队如果没有开triage，我觉得在对应的项目文件内，我们可以将triage选择跳过。
2 linear 这个pr是自动开的吗？
3 一个issue允许每个仓库各一个pr，我觉得在这一期一起做了。

另外，issue的格式我们也需要定义下。」

## A3

- PR 不是 Linear 开的：fishaudio/fish-agent#298、fishaudio/platform-api#2977 由 Him188 开，分支 `him188/phone-dispatch-notices`（不是 Linear 给的名字），fishaudio/platform-web#3983 由 virgoone 开；靠标题 `[FA-571]` 和正文 `Linear: FA-571` 挂上 issue，之后 Linear 的 GitHub 集成推状态。
- issue 正文提案：标题一句现象；背景（可选）、问题（必填，带例子和在哪）、证据（必填）、影响范围（必填）、从哪发现（必填）、已确认原因（可选）。类型、模块、优先级不进正文。
- 多仓库提案：项目文档列仓库和本地路径；一个会话在每个要改的仓库各开 worktree 和 PR，都挂同一个 issue 号；全部合并才 done。GitHub 上不用 `Closes #n`（合一个就关），由脚本在全部合并后关。

## U4

「明白了，开始实现的时候就将pr打开。

必填没问题。多仓库我觉得FA-577这个issue作为dog food将0.1.10进行使用后测试。」

## 本轮决议

| 话题 | 决议 | 出处 |
|---|---|---|
| 状态 | backlog → triage → todo → in-progress → in-review → done，另有 canceled；backlog 可以直接到 todo | U1、U2 |
| triage 是什么 | 要人评估（grill、设计）；评估完翻 todo，todo 才被调度 | U1 |
| 没开 Triage 的团队 | 项目文档里写明跳过 triage，状态线是 backlog → todo → … | U3 |
| 平台 | GitHub、Linear 上 issue 实体一样；Linear 走 MCP，setup 授权后把团队的状态整理进项目文档 | U1 |
| PR | 开始实现时就开 PR；Linear 靠标题、正文里的 issue 号挂上，状态由集成推 | U3、U4 |
| 多仓库 | 一个 issue 每个仓库各一个 PR，这一期就做；0.1.10 发版后拿 FA-577 dogfood | U3、U4 |
| issue 正文 | 问题、证据、影响范围、从哪发现必填；背景、已确认原因可选 | U3、U4 |
