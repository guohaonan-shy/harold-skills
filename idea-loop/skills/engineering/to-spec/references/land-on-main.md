# spec 提交，然后收工

spec 提交在这个需求的工作分支上，跟代码同一个 PR 合进主分支，不单独开 spec PR（`idea-loop:wiki-conventions` 的「知识库落地」）。调用方说了提交由它来做的（比如 `idea-loop:issue-session`），整段留给它。

1. 提交到这个需求的工作分支（从最新主分支开出；还没有就开一个），只带这份 spec 的目录、`docs/raw/<topic>/` 里这次写的文件和 `docs/spec/index.md`；工作区里有别的改动，就另开一个 worktree 提交。没有代码要跟的（「知识库落地」列的那几种），推送，`gh pr create`，`gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`，失败就停下告诉人。
2. 告诉人这份 spec 里还有几样等人定（没有就说都定完了）。定完了的按碰不碰 UI 进「设计」或「实现」：issue 会话里的由会话接着走，不在的人用 `/idea-loop:issue-session <号>` 接上，或自己跑 `/idea-loop:uiux-imagine`、调 `idea-loop:to-ticket`。人改了某个决定，牵出的图、story 树和测试决策同一轮改掉。
