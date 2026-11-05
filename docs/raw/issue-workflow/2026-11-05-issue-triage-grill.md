---
type: raw
source_type: conversation
captured: 2026-11-05
title: grill —— #243 issue-triage：issue-verify 的去留、什么进 todo、每周分拣怎么装、P0 先复现、「不做」清单、存量分批
tags: [issue-workflow, issue-triage]
related: ["[[issue-triage]]", "[[2026-11-04-idea-loop-0-2-0-restructure-grill]]", "[[issue-model]]"]
---

> 格式约定：`## U<n>` 是人的发言，逐字保留；`## A<n>` 只保留结论与发现。题号 Q1–Q6 是这场会话出题的编号，跟 [[2026-11-04-idea-loop-0-2-0-restructure-grill]] 的 Q1–Q43 不是一套。事实对着 origin/release/idea-loop-0.2.0 1a7496b、#242 的 spec（提交 e84fa07）与 GitHub 上 harold-skills 的 issue 取，日期 2026-11-05。末尾一张「本轮决议」表。

## A0

出题前取的事实：

- harold-skills 开着 53 个 issue，42 个没有 `status:*`：按新规则都算 backlog，第一次分拣要一次面对 42 个。
- #242 的 PR 还没开，`issues.mjs` 和新状态 label 还没落地。
- 现在的验证在 `issue-verify`：issue 会话开头复现、打分类、起草 spec。0.2.0 把验证挪到每周分拣，这个 skill 的活一分为二。
- #242 的 spec 定了：AI 评论前缀「🤖 idea-loop：」（由 `issues set --comment` 加）；`issue-verify` 只改翻状态的句子、去留归 #243；`issues open` 的去留归 #243；`candidates` 只按最早在前，优先级排序归 #243。

出了 Q1–Q5：`issue-verify` 怎么办、什么进 todo 什么进 backlog、每周分拣怎么装和汇总给到哪、P0 进 todo 前要不要复现、「不做」清单的格式。另外直接定了评论前缀跟 #242 用同一个。

## U1

Q1–Q5 我都同意

## A1

出 Q6：第一次分拣 42 个，要不要设上限（每次 15 个 / 不设上限）；另外直接定了标「还要你补」的，人没补新评论、没改就不再验。

## U2

现在是一个issue一个agent来查看？

## A2

是：每个 issue 一个子代理查重、查「不做」清单、查是否已实现、复现，只交回一句结论、证据评论链接、建议去向；分拣会话只拼汇总表。原因是复现的输出（读代码、起服务、跑测试）塞进一个会话，15 个查下来上下文就满了。同时最多 5 个。

## U3

子代理用sonnet + medium，我倾向于这样我们上线之后先对存量issue 分批跑一次吧，之后我们限制下数量？

## A3

落成：新 agent `idea-loop:issue-triager`（sonnet、medium，钉在定义里）；人手敲 `/idea-loop:issue-triage 全部` 把存量分批跑完，每 15 个一张汇总表，批完一张接着下一张；定时任务不带参数，每次最多 15 个，最早的先。收拢了 7 条决定请人确认。

## U4

开工

## 本轮决议

| 议题 | 决议 | 出处 |
|---|---|---|
| issue-verify | 删掉：复现、打分类搬进 `issue-triage`；起草 spec 那段并进 issue 会话的 spec 阶段，分拣贴在 issue 上的证据评论是输入 | Q1 |
| 什么直接进 todo | 只有人在这场会话里 grill 过、并明说了状态（todo / 关闭 / 搁置）的；retro、pr-review、dreaming 这类人只批了一句「开」的照样进 backlog | Q2 |
| 每周分拣 | `setup` 问装不装桌面 app 定时任务 `triage-<仓库名>`；汇总表摆在定时任务开出的会话里，人逐行批，照批翻状态，PushNotification 通知；`issue-triage` 可被模型调用 | Q3 |
| P0 | 开 issue 的一方当场复现一次：复现到了进 todo、打 `priority:P0`、通知人；复现不出降成普通 backlog | Q4 |
| 「不做」清单 | 知识库里一个概念一份文件，写是什么、为什么不做、相关 issue 号 | Q5 |
| 评论前缀 | 跟 #242 同一个「🤖 idea-loop：」 | A0 |
| 一个 issue 一个子代理 | 新 agent `idea-loop:issue-triager`，sonnet + medium，同时最多 5 个 | U2、U3 |
| 存量与上限 | 上线后人手敲 `全部` 分批跑完存量，每 15 个一张表；定时任务每次最多 15 个，最早的先 | Q6、U3 |
| 不重复问 | 标「还要你补」的，人没补新评论、没改正文就不再验 | A1 |
