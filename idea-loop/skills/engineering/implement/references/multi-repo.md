# 多个仓库

工单头写了 `**仓库**` 的，那张工单属于那个仓库，在那个仓库的 worktree 里做；没写的属于当前仓库。派工时给执行方的起点 SHA、集成分支名、端口都取工单所属仓库的；spec、工单、笔记、tmp、浏览器锁的绝对路径仍是当前仓库（知识库所在）的。别的仓库的工单：

- 用 `git -C <路径> worktree add <执行方 worktree 路径> -b <执行方分支> <起点 SHA>` 给它开 worktree，起 `idea-loop:implementer` 时不带 `isolation`，把这个路径当它的 worktree 给它；
- 它的 commit 只含该仓库的代码（工单文件不在那个仓库里），带 `Ticket: <NN>-<slug>`；落地（`git -C <该仓库 worktree> merge --ff-only`）后由编排者照交回的 `acceptance` 勾好工单的框，提交 `docs(tickets): <NN> — 落地`；账本的「已落地」在那个仓库的 worktree 里跑 `ticket-ledger.mjs landed <base>`；
- 其余核对、回收照常，回收的 `git worktree remove` 也在那个仓库里跑。
