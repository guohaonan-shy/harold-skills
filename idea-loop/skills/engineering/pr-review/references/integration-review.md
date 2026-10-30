# 集成审查：版本根在集成 PR 上跑的那一轮

调用方是版本根的会话（`idea-loop:issue-session`），PR 是「集成分支 → 主分支」。这个 PR 不属于哪一份 spec：它收的是几份已经各自 review 并合进集成分支的 spec，所以这一轮**只查几份 spec 合在一起有没有冲突**，别的都在各自子 PR 的 review 里查过了。没写的地方照 [`../SKILL.md`](../SKILL.md)。

## 什么时候跑

- 第一个子 PR 合进集成分支后，根的会话开这个 PR；之后每合进一个子 PR（子会话合并后给根的会话发消息：PR 号、spec slug）跑一轮。人说「再跑一轮」时也跑。
- **这个 PR 一直保持草稿，到人说合并。** 所以「前提」里的 draft 在这里**放行、不退回** `idea-loop:implement`：那条前提防的是工单没落地完，这里没有工单要落地。

## 跟一份 spec 的 review 不同的地方

**前提和输入**

- 根的会话 worktree 在 spec 分支上，不是集成分支。另起一份当审查的 worktree：`git worktree add --detach .tmp/pr-review/<PR 号>/worktree origin/<集成分支>`，其路径就是交给 `idea-loop:pr-reviewer` 的 worktree；它的 HEAD 等于 PR 的 head，工作区干净。review loop 文件仍是根的 worktree 里的 `.tmp/review-loop/<PR 号>.md`。
- 回放排队不用核：各子 PR 进 review 前已核过。
- 给审查者的 spec 是**全部已合进集成分支的 spec**：每份的路径 `docs/spec/<spec-slug>/<spec-slug>.md`，slug 取自子会话发来的消息。各自的工单已随子 PR 删了，不给工单目录；审查者要读时从删它的提交的父提交取。

**跑一轮**

- 只起一个 Codex 进程，用集成模板：`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-prompt.mjs" integration <工作目录>/integration-prompt.md worktree=<worktree> base=<merge-base> specs=<spec 路径，逗号隔开> wontfix=<工作目录>/wontfix.md`。它专查两类冲突：同一处规则被改成两样；一份的改动让另一份的说法失效。不起 Standards 进程，候选里 `standards` 留空；不起 `idea-loop:ui-reviewer`。
- 机械检查照跑，结果交给审查者当线索：每个子 PR 单独绿、合在一起红的，是冲突的证据，写成一条 Spec 条目。
- 条目的 `quote.file` 取这几份 spec 之一，其余照 `review-standards` 的「Spec 轴」。

**处理条目**

- 冲突要留哪一边是人定的事，条目多半是「要你决定」。
- 「回工单」在这里没有归属工单（已删）。人批了修：改的是 spec 或说明文字的，根的会话直接提交到集成分支并推送；要改代码的，开一个待验证的 issue（`idea-loop:spec-status` 的「开一个待验证的 issue」），不在集成 PR 上直接改。

**一轮之后**

- **不自动起下一轮**：下一轮由下一个子 PR 合进来触发，或人说「再跑一轮」。
- 不交审核报告（它是每份 spec 的子 PR 的事）。一轮处理完，在会话里把结果给人看，停下，等下一个子 PR 或人说合并。

## 人说合并

全部子 PR 合完、人说合并后，根的会话：

1. `gh pr ready <PR 号>`（草稿合不了）。
2. 照 [`merge.md`](merge.md) 的「合并」第 3 步起：归档 review loop、合并、清理。第 1、2 步不适用：spec 完成、工单删除、设计归档都在各子 PR 合并时做过。
3. 清理时先 `git worktree remove --force .tmp/pr-review/<PR 号>/worktree`，再删 `.tmp/pr-review/<PR 号>/`。合并后升版本，由根的会话接着做。
