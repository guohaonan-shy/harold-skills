---
type: adr
status: 生效
tags: [idea-loop, pr-review, pr-review-round-cap]
summary: pr-review 自动起下一轮的上限从 2 放到 5，审到没有要修的为止；每轮开审前先合入最新主分支
related: ["[[0038-pr-review-report-followups]]", "[[271]]"]
---

# ADR-0073 — pr-review 自动 review 最多 5 轮，每轮先合入最新主分支

> 由 spec `pr-review-round-cap` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

pr-review 是对一个 open 的 PR 跑一轮两轴 review（Spec / Standards）并处理人批示的 skill。一轮里有要修的，修复落地后自动起下一轮，但原来只起到第 2 轮（上限来自 [[0038-pr-review-report-followups]] 的依据：「10 个 PR 里 5 个跑了第二轮……没有一个跑到第三轮」）。第 2 轮的修复落地后编排者停下问「再跑一轮还是合并」，这次修复没人审过。

两次真实记录，人都没选直接合并：Tofelair#493（PR #880，2026-11-09）第 2 轮后人回「再跑一轮」，第 3 轮后推荐合并，人回「先处理下和main的冲突，再review这次的修复」，第 4 轮 0 条才合并；harold-skills PR #300（2026-11-13）第 2 轮后人回「除了冲突之后再进行一轮review」，第 3 轮查出漏拍、第 4 轮查出第 3 轮修复带来的多拍。这两条推翻了「没有一个跑到第三轮」。

第二个问题：摆「合并」时 PR 已经跟主分支冲突。PR #300 第 2 轮摆题时主分支已被 #298 推进，PR 是 CONFLICTING；Tofelair#522（PR #916，2026-11-11）报告交出后主分支合进 3 个 PR，spec 索引同一位置各加一行冲突，人说「合并吧，先处理冲突在合并」。pr-review 的「前提」只要求 CI 绿、worktree 干净、HEAD 已推送，不要求没冲突。

## 2 决策（how）

决定记录 [[271]]。

- **上限是 5，不是不设上限**：人的原话「放开agent review轮次的限制到5轮（最多），终止条件是没有问题」。一轮有修复就自动起下一轮，直到某一轮没有要修的（交审核报告）或有要人定的事（停下）；第 5 轮的修复落地后停下，说「已跑满 5 轮，第 5 轮的修复还没审，要再跑或合并请直接说」。上限只约束自动起，不约束人；人触发的轮次也计入。「同一发现连续两轮复现就停」的保险丝不另加，由这个上限回答。
- **上限数字只写在一处**（pr-review 的 SKILL.md「一轮之后往哪走」）：pr-reviewer 定义和 review 汇报模板里的「已跑满两轮」提示删掉（审查者不知道这一轮之后停不停，由编排者在停下时说）；其他参考文件改成不带数字的说法。这是 review 第 1 轮把「数字写进三份参考」判为会漂移后定的。
- **每轮开审前先把最新主分支 `git merge` 进 PR 分支**，放在「前提」、CI 那条之前（合入后要重新等 CI）：有冲突就解，脚本生成的文件（例：spec 索引）重新生成、不手拼，判断不了保留哪边的照 `idea-loop:decision-rules` 停下问人，推送，已是最新就什么都不做；人说合并时再做一次。用 merge 不用 rebase：PR 已推送，改历史会让 review loop 文件里记的提交链接失效。合并参考开头「合并时不再等 CI」加了例外：除非第 1 步合入了新的主分支。
- 版本：patch（人依 #327 的结论定，0.1.35；起草时按旧三档判的是 minor，档位规则后来改写，见 ADR-0089）。

取舍（没做）：合并时机与是否自动合并不变，仍只由人说合并；implement 收尾转 ready 前不重复合入（转 ready 后第 1 轮开审前会合）。

## 3 结果（result）

- `idea-loop/skills/engineering/pr-review/SKILL.md`：「前提」有「每个 PR 先合入最新主分支」一条，「一轮之后往哪走」第 1 点写 5 轮上限与停下时的话；`references/merge.md` 的「合并」第 1 步引用该条。
- `idea-loop/agents/pr-reviewer.md` 与 `idea-loop/skills/engineering/pr/references/review-report.md` 不再含「已跑满」提示（2026-11-22 grep 核过）。
- 合并在 PR #395（pr-review 自动 review 放到最多 5 轮，每轮先合入最新主分支）；issue #271 已 CLOSED（2026-11-19）；决定记录 [[271]]，该 PR 自己跑了 4 轮 review。
- 守护：`idea-loop/scripts/pr-review-slim-doc.test.mjs`（上限 5 与停下的话、前提里的合入步骤在 CI 之前、数字只在 SKILL.md 一处、合并参考与总述不矛盾）。
- 候选池 `2026-11-11-merge-check-conflicts-first`（合并前查冲突）的期望行为已被本决定覆盖。

**取代线索：** 本决定取代 ADR-0038 §2 的「自动起下一轮」一条（上限两轮）与 §3 里「一轮之后自动起下一轮（两轮上限）」的说法。
