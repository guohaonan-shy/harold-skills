---
type: spec
tags: [idea-loop, implement]
summary: 会话断了以后，执行方已做完的工单先当交回 landed 落地，不再回收重派
related: ["[[design-archive-skill-length]]"]
issues: [157]
---

# implement：会话断了以后，已做完的工单先落地

> #157 存在：`idea-loop:implement`「账本」里那句仍让编排者把 pending 没记着的执行方 worktree 一律回收重派，执行方已做完的提交会被 `git branch -D` 删掉、整张工单重做，详情在「问题陈述」

## 问题陈述

### 会话断了以后，已做完的工单被当成没做

编排者（调 `idea-loop:implement` 的会话）派出的执行方，各在自己的 worktree 里做一张工单，做完交回 `landed`，编排者核对后 fast-forward 落地。会话在「执行方已交回、编排者还没落地」这一刻断掉（进程结束、会话压缩），重进来时只剩 `git worktree list` 里那个执行方 worktree，它上面已经有一个带 `Ticket:` 的完成提交。

现在的规则（`idea-loop/skills/engineering/implement/SKILL.md`「账本」的「可派的工单」那段，对着 origin/main `92fa448`，2026-11-10 查）只给一条路：

> 会话断了：重算可派的工单；`git worktree list` 里 pending 没记着的执行方 worktree 照「回收」收掉后重派。

「回收」第 4 步是 `git worktree remove --force` 再 `git branch -D`。照这句走，已做完的提交连分支一起删掉，同一张工单再派一个执行方从头做；「核对与落地」只在「一次处理一个交回」时触发，断会话之后没有任何一句让编排者先看看这个 worktree 是不是已经做完。同一份文件里「回收」又写着「只在工单落地之后做」，这句跟它自相矛盾。

真实例子：harold-skills#125（spec `design-archive-skill-length`）。工单 01 落地成 `4e42c73` 之后，工单 02 的执行方在上一个进程结束前交回了 `landed`，它的提交 `6becd9e`（「拍档案截图改写成按情形排步骤的参考，删掉 sections.md」）比集成分支只多这一个。编排者没在那时落地；人问「工单02搞定了吗」（决定记录 `docs/raw/decisions/125.md` 候选 4），编排者临场先查了提交再落地，没照这句规则走。照规则走的话，`6becd9e` 会被删掉、工单 02 重做一遍。

出处：分拣评论 https://github.com/guohaonan-shy/harold-skills/issues/157#issuecomment-6758239257 （2026-11-10）；本次对着 `92fa448` 重读了「账本」「核对与落地」「回收」三节，原文未变。

### 根因

「账本」写会话断了的处理时，把 pending 没记着的执行方 worktree 一律当成半途而废，没区分「已做完、只差落地」这种情形；而「已落地」的账只认集成分支上的提交，执行方分支上的完成提交在账上看不见。

## 方案

改完后：会话断了重进来，编排者先逐个看 pending 没记着的执行方 worktree，已做完的直接当它交回了 `landed`，照「核对与落地」落地再回收；只有没做完的才回收重派。执行方已做完的活不再白费。

会话重进后，编排者对 `git worktree list` 里每个 pending 没记着的执行方 worktree：

- 分支上有一个带这张工单 `Ticket:` 的提交、比集成分支只多这一个、工单格全勾或带 `⏭ 延后` → 当它交回了 `landed`，核对与落地，再回收（**新增**）
- 不是这样的 → 回收，重派（原有）

然后重算可派的工单。

判「已做完」用的三条就是「核对与落地」表里 `landed` 那一行已有的机械核对（只多一个 commit、`ticket-ledger.mjs of` 对得上这张工单、工单格全勾或带延后），不新增判据；落地时照常走那一节，所以 ff 不了、核对不过的处理也照那一节（退回执行方；执行方已不在就算没做完，回收重派）。

改动只有「账本」里这一句，换成 retro 批过的新文（issue 正文「候选」）：

> 会话断了：先查 `git worktree list` 里 pending 没记着的执行方 worktree：它的分支上有一个带这张工单 `Ticket:` 的提交、比集成分支只多这一个、工单格全勾或带 `⏭ 延后`，就当它交回了 `landed`，照「核对与落地」落地再回收；不是这样的，才照「回收」收掉后重派。然后重算可派的工单。

对的杠杆（`idea-loop:writing-for-agents`）：这是一条分支规则，编排者在「会话断了」这个入口读它；缺的是一个分支（已做完），补在原处，不另开一节、不挪进 references。读这句的只有调 `idea-loop:implement` 的编排者（`idea-loop:issue-session` 的「实现」调它；人重敲 `/idea-loop:issue-session` 或 `/idea-loop:implement` 时也走这里）。

同一行为的其他入口：

- pending 记着的卡住工单（`blocked` / `failed`）：纳入不了也不需要，它们照「人回复后」的「重派」叫回原执行方或带半成品新起，不经过这句。排除。
- 「回收」一节本身：不改，「只在工单落地之后做」跟新文一致。
- 多仓库的工单（「多个仓库」一节）：新文的「核对与落地」「回收」在那一节已有多仓库写法，照它走。纳入，不另写。

## User Stories

1. 期望行为：会话断了重进来，执行方 worktree 上已有一个带这张工单 `Ticket:` 的完成提交时，编排者把它当交回 `landed` 核对后 fast-forward 落地，再回收；不删这个提交、不重派这张工单。

## 实现决策

- 文字照 issue「候选」的新文，一字不改：retro 里人批过（`docs/raw/decisions/125.md` 候选 4），依据是批过的原文。
- 不加脚本、不改「核对与落地」：判据已在那一节的表里，新文只是让断会话这个入口也走它。
- `idea-loop:implement` 的 SKILL.md 主体现在已超过 5000 字（量法见仓库 `AGENTS.md`，对着 `92fa448` 量得 8923），这次多几十字；收短归 #137，这里不做。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 文档测试：`idea-loop/scripts/` 下按 `*-doc.test.mjs` 的写法，断言「账本」里断会话那句先查已做完的、当交回 `landed` 落地，再说回收重派 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了 `idea-loop:implement` 的一句规则：加一个 retro 回放用例（`idea-loop/evals/retro/cases/`），改前答「否」、改后答「是」 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：retro 回放（`idea-loop/evals/retro/`）：喂一个提交和一句 prompt，读编排者最后一段回复，判是/否题；能抓到编排者在这一刻落地还是回收，漏掉真实的 git worktree 状态（回放只解出一个提交的快照，执行方 worktree 由 prompt 交代）。文档测试守住这句话不被后来的改动删回去，抓不到行为。
- **增量功能测试**（回放用例）：
  - 前置：提交 `4e42c73`（#125 工单 01 落地后的集成分支）；prompt 交代会话断过、pending 是空的、`git worktree list` 里有一个执行方 worktree，分支上只多一个提交 `6becd9e`、message 带 `Ticket: 02-…`、工单 02 的格全勾；回放禁提交推送和 gh 写操作、不起 Agent，要跑的命令写在最后一段回复里。
  - 步骤：`/idea-loop:implement design-archive-skill-length`，从「会话断了」接着判。
  - 期望：是/否题「编排者有没有把工单 02 的执行方当交回 `landed` 落地（命令里有 `git merge --ff-only 6becd9e`），而不是回收它的 worktree、删分支、重派工单 02？」改前「否」、改后「是」。
  - 覆盖：期望行为 1。
- **照着谁写**：回放用例照 `idea-loop/evals/retro/cases/implement-no-stop-without-decision/`（同样由 prompt 交代状态、从中途一步接着判）；文档测试照 `idea-loop/scripts/issue-session-implement-doc.test.mjs`。

## Out of scope

- 把执行方分支上的完成提交记进账本（比如让 `ticket-ledger.mjs` 也扫执行方分支）：新文用已有的机械核对就能判，不加机制。
- 收短 `idea-loop:implement` 的 SKILL.md 主体：归 #137。

## 关联

- raw：`docs/raw/decisions/125.md` 候选 4（这条规则的来历）。
- 相关 spec：`design-archive-skill-length`（#125，出问题的那次实现）。
- 相邻未完成的 issue：#137（其余 SKILL.md 主体超长，含 implement）：同改这一份文件，不重叠内容；这次只多一句，#137 收短时把新文当现有规则一起处理，谁先都行。#221（子代理交回后编排者漏接）：讲的是会话没断时漏接，另一件事，无重叠。#160（implementer 开工的 `git reset --hard` 被 auto mode 拦）：执行方那一侧，无重叠。
