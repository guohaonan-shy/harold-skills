# 01 — 会话断了重进来，执行方已做完的工单先落地

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

`idea-loop:implement` 的编排者（调它的会话）在会话断掉后重进来时，`git worktree list` 里可能还留着 pending 没记着的执行方 worktree。现在「账本」一节「可派的工单」那段一律让编排者照「回收」收掉它（强删 worktree 和分支）再重派，执行方已做完、只差落地的提交因此被删、整张工单重做。

做完以后：编排者先逐个看这些 worktree，分支上有一个带这张工单 `Ticket:` 的提交、比集成分支只多这一个、工单格全勾或带 `⏭ 延后` 的，当它交回了 `landed`，照「核对与落地」落地再回收；不是这样的才回收重派；然后重算可派的工单。

规则文字一字照下面这段（retro 里人批过的原文，见 `docs/raw/decisions/125.md` 候选 4 与 issue #157 正文的「候选」），替换「账本」里以「会话断了：」开头的那一句：

> 会话断了：先查 `git worktree list` 里 pending 没记着的执行方 worktree：它的分支上有一个带这张工单 `Ticket:` 的提交、比集成分支只多这一个、工单格全勾或带 `⏭ 延后`，就当它交回了 `landed`，照「核对与落地」落地再回收；不是这样的，才照「回收」收掉后重派。然后重算可派的工单。

不改「核对与落地」「回收」两节，不加脚本。SKILL.md 主体本来就超过 5000 字（收短归 #137），这次只多几十字，不在这里收短。

配一个 retro 回放用例（`idea-loop/evals/retro/cases/` 下新目录，照已有用例 `implement-no-stop-without-decision` 的写法：由 prompt 交代状态，从中途一步接着判；同目录带 `annotations.md`）：

- 提交：`4e42c73`（harold-skills#125 工单 01 落地后的集成分支）。
- prompt：`/idea-loop:implement design-archive-skill-length`，交代会话断过、`pending.md` 是空的、没有在跑的执行方；`git worktree list` 里有一个 pending 没记着的执行方 worktree（给出路径与分支名），分支上比集成分支只多一个提交 `6becd9e`、message 带工单 02 的 `Ticket:` 行、工单 02 的验收格全勾。回放禁 git 提交推送、gh 写操作、起 Agent，要跑的命令原样写进最后一段回复；最后一段写明对这个 worktree 做了什么。不要把「先落地」写进 prompt，否则改前的 skill 也会照做，用例抓不住问题。
- 是/否题：编排者有没有把工单 02 的执行方当交回 `landed` 落地（命令里有 `git merge --ff-only 6becd9e` 或等价的 fast-forward），而不是回收它的 worktree、删分支、重派工单 02？
- 当时的原话：「工单02搞定了吗」。
- 改前应答「否」、改后应答「是」。用例按 `size` 估成 small 就照 implement 的「没活了就停下」把它放进回放队列，交回的 `verified` 写明「回放在队列里」。

再加一条文档测试（`idea-loop/scripts/` 下按已有 `*-doc.test.mjs` 的写法），守住「账本」里这句：先判已做完的、当交回 `landed` 落地，回收重派只给不是这样的。

## 验收标准
- [x] 「账本」里以「会话断了：」开头的句子与上面引文逐字一致，旧句不再出现
- [x] 新回放用例目录在，`case.json` 过 `idea-loop/evals/retro/cases.mjs` 的校验（commit、prompt、stop_at、question、quote、size 齐全），带 `annotations.md`
- [x] 回放用例已放进夜间队列，或说明为何没放（没放：size 是 small，已当场跑过两次，改前改后都答「是」，用例没抓住问题；原因写在用例的 annotations.md「已知的局限」，交回 verified 里也标了）
- [x] 新文档测试先在旧文上红、改后绿
- [x] `idea-loop/scripts/` 下全部测试绿（含 `no-project-leak.test.mjs`）

## 选中的存量回归
- `idea-loop/scripts/no-project-leak.test.mjs`：插件文字里不能出现项目信息，新句和用例 prompt 要过它（用例在 evals 下，看它是否被扫）。
- `idea-loop/scripts/issue-session-implement-doc.test.mjs`：同读 implement 的文字结构，改句子不能碰到它守的内容。
