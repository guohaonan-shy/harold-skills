# implement-resume-landed-worktree

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle implement-resume-landed-worktree --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：工单02搞定了吗

**是/否题**：编排者有没有把工单 02 的执行方当交回 landed 落地（命令里有 `git merge --ff-only 6becd9e` 或等价的 fast-forward），而不是回收它的 worktree、删分支、重派工单 02？

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：`4e42c73`，harold-skills#125 工单 01 落地后的集成分支：工单 02 还在，`6becd9e`（工单 02 的完成提交）是它的下一个提交，所以这个快照里工单 02 确实是「没落地」。
- **prompt**：原 prompt 是 `/idea-loop:implement design-archive-skill-length`，会话在执行方交回 landed 之后、编排者落地之前断掉。回放不能起执行方，也解不出真实的 git worktree（回放只给一个提交的快照），所以 prompt 把「pending 空、没有在跑的执行方、`git worktree list` 里多一个 pending 没记着的执行方 worktree、分支只多 `6becd9e` 一个提交、带 `Ticket: 02-shooting-reference`、验收格全勾」交代成状态，只列这些事实，不指到「账本」那一句。另加回放必须的补充：人不在场、禁止会改仓库的 git 写命令和 gh 写操作、不起 Agent、最后说明对这个 worktree 做了什么。**没有把「先落地」写进 prompt**：写了改前的 skill 也会照做，用例就抓不住问题。
- **缺的**：当时人问「工单02搞定了吗」是在会话重进之后；决定记录没留编排者当时说了什么，只记了它「临场先查了提交再落地，没照规则走」。路径 `/tmp/replay-wt-02` 与分支名 `worktree-agent-02` 是回放里编的占位，真实的执行方 worktree 路径、分支名不在记录里。
- **改前预计答「否」**：改前的 implement 在「账本」里只有一句：会话断了，pending 没记着的执行方 worktree 照「回收」收掉后重派；照它走会 `git worktree remove --force` 再 `git branch -D`，工单 02 重派。改后的「账本」先判已做完的，当交回 landed 照「核对与落地」落地再回收，命令里会有 `git merge --ff-only 6becd9e`。
- **判定依据**：看最后一段回复列出的命令里，对 `6becd9e` 是 fast-forward 合并，还是 `git worktree remove` / `git branch -D` 后重派；以及有没有写「工单 02 已落地」。

## 已知的局限（实现时跑过两次，都是「用例没抓住问题」）

- 第一版 prompt（写明「从账本里会话断了这一步接着判」、工作区干净、`Blocked by` 已落地）：改前、改后都答「是」（run 20261110T140850，合计 $1.23）。
- 第二版（只列上面那几条事实，不指到账本）：改前、改后仍都答「是」（run 20261110T141142，合计 $1.26）。改前的会话读到「账本」一句叫它一律回收、「回收」一节又写「只在工单落地之后做」，自己看出两句打架，选了落地。
- 所以这个用例现在**不能**证明改后比改前好：改前的模型会靠「回收」那句自己补上分支。它仍然守得住一件事：改后的文字不会让编排者把已做完的工单回收重派。机械守护在 `idea-loop/scripts/implement-resume-landed-doc.test.mjs`。要让用例真的抓到问题，得有一个改前的会话照「账本」那一句走到底的状态，现在还没找到。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
