---
type: adr
status: 生效
tags: [idea-loop, implement, design, ui-tickets]
summary: UI 工单参考里「画布在执行方 worktree 里有、delta 没有、都走 tmp 绝对路径」只留一种说法，文档检查钉住
related: ["[[375]]"]
---

# ADR-0088 — UI 工单参考里画布在不在执行方 worktree 的说法统一

> 由 spec `ui-ticket-canvas-in-worktree` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

执行方（implementer）做 UI 工单时读 implement skill 的参考 `idea-loop/skills/engineering/implement/references/ui-tickets.md`。issue #375 记下：这份参考里两处对「画布在不在执行方 worktree 里」互相矛盾（2026-11-20 对着 origin/main `1e0c2b92` 核）：「输入」节说画布冻结时提交在工作分支上、「worktree 里就有」；「设计档案与最小差异」节却说「`tmp/` 不进版本库，你自己的 worktree 里没有它」。

对的是前一句：冻结时画布用 `git add -f` 强制提交在需求分支上，执行方的 worktree 对齐到派工时集成分支的起点，所以 `canvas/` 在执行方 worktree 里有一份；最小差异 `delta/` 不提交，只在集成 worktree 里。后一句把两样混成一句，是从画布还不提交的旧版本原样挪来的，冻结改成提交画布后没跟着改。

真实例子：PR #371 的工单 02 执行方（2026-11-18）在交回里指出这两句冲突。行为没出错，因为两种读法下它都走派工给的 tmp 绝对路径。

## 2 决策（how）

- **保留「画布和最小差异都用 tmp 绝对路径读写」，只改错的那半句**：画布在 worktree 里有一份，`delta/` 和 `tmp/` 下其余没提交的东西只在集成 worktree 里；仍用绝对路径，理由写明——两样在同一处，读到的画布是集成分支上最新的那份（冻结后设计变更推上去的新版本不会自动进执行方已开好的 worktree）。
- **「输入」节的「worktree 里就有」保留**（它是事实），补半句指向「设计档案与最小差异」：读写仍用 tmp 绝对路径。
- 没做：不删「输入」节那句（事实，不该删）；不改执行方读写画布的实际路径，也不改冻结时提交哪些文件；`agents/implementer.md` 与 `implement/SKILL.md` 的派工说法核过不矛盾，不动。
- 同一事实在参考里写了两处，与「每个意思只放一处」冲突：issue 会话夜里按推荐保留两处，靠文档检查把两处绑住，漂开就变红；人合并时没有推翻（见 [[375]]）。
- 验证走文档检查，不做回放：判禁用旧写法、必含新写法。版本 patch 升（合入时 main 已到 0.1.41，升到 0.1.42）。

## 3 结果（result）

- `idea-loop/skills/engineering/implement/references/ui-tickets.md`：第 9 行「worktree 里就有」后补了指向；「设计档案与最小差异」节分开讲画布（已提交、worktree 里也有）与 `delta/`（只在集成 worktree），并写明走绝对路径的理由。全文没有「worktree 里没有它」。
- 守护：`idea-loop/scripts/ui-tickets-canvas-location-doc.test.mjs`，五条检查：禁旧写法、画布已提交且在执行方 worktree、`delta/` 只在集成 worktree、都走绝对路径并写理由、「输入」节保留且指向绝对路径。
- 合并：PR #412（UI 工单参考：画布在不在执行方 worktree 里，两处说法统一）；决定记录 PR #423；issue #375 已关闭。决定记录见 [[375]]。
