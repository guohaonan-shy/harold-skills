# spec 合进主分支，然后收工

loop 只从知识库的主分支取活，所以 spec 先经知识库的 PR 合进知识库的主分支，label 才不会指向主分支上没有的 spec。以下都在 `<知识库>`（`root --write` 的输出，`.tmp/kb/`）里跑，`gh` 作用在知识库的 PR 上。调用方说了提交和合并由它来做的（比如 `idea-loop:issue-verify`），整段留给它。

1. 提交到从知识库最新主分支开出的 `spec/<slug>` 分支（`root --write` 开的同名分支就是它，没有就从知识库的主分支开），只带这份 spec 的目录、`docs/raw/<topic>/` 里这次写的文件和 `docs/spec/index.md`；工作区里有别的改动，就另开一个 worktree 提交。推送，`gh pr create`。
2. `gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`，失败就停下告诉人。label 由 `idea-loop:issue-dispatch` 下一轮对账按主分支挂；在 issue 会话里的由会话跑 `issues advance`；都没有的在知识库的主 checkout 跑 `issues reconcile <docs>`（`<docs>` 此时用 `knowledge-base.mjs root` 的输出加 `/docs`）。
3. 告诉人这份 spec 到了哪个状态。`正式` 的按碰不碰 UI 进「设计」或「实现」：issue 会话里的由会话接着走，不在的人用 `/idea-loop:issue-session <号>` 接上，或自己跑 `/idea-loop:uiux-imagine`、调 `idea-loop:to-ticket`。人改了某个决定，牵出的图、story 树和测试决策同一轮改掉。
