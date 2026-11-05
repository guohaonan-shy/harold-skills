# spec 落进知识库，然后收工

spec 写在这个需求的知识库分支上，不开 PR，落地照 `idea-loop:wiki-conventions` 的「知识库落地」。调用方说了提交和合并由它来做的（比如 `idea-loop:issue-verify`），整段留给它。

1. 在知识库 worktree（`business.mjs kb issue-<号>`；没有 issue 的按「知识库落地」起名）里提交，只带这份 spec 的目录、`docs/raw/<topic>/` 里这次写的文件和 `docs/spec/index.md`。不推送、不开 PR，分支什么时候合进知识库 main 照「知识库落地」。label 由 `idea-loop:issue-dispatch` 下一轮对账挂；在 issue 会话里的由会话跑 `issues advance`；都没有的在主 checkout 跑 `issues reconcile <docs>`。
2. 告诉人这份 spec 到了哪个状态。`正式` 的按碰不碰 UI 进「设计」或「实现」：issue 会话里的由会话接着走，不在的人用 `/idea-loop:issue-session <号>` 接上，或自己跑 `/idea-loop:uiux-imagine`、调 `idea-loop:to-ticket`。人改了某个决定，牵出的图、story 树和测试决策同一轮改掉。
