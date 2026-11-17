# spec 提交，然后收工

spec 写好就提交到 home，不进代码分支、不开 PR（`idea-loop:wiki-conventions` 的「知识库落地」）。调用方说了提交由它来做的（比如 `idea-loop:issue-session`），整段留给它。

1. 提交到 home：`commit` 只列这份 spec 的目录、`docs/raw/<topic>/` 里这次写的文件和 `docs/spec/index.md`，别的文件不碰。输出里有「home 没推上去」就在告诉人的话里带上这一句，往下照走。
2. 告诉人这份 spec 里还有几样等人定（没有就说都定完了）。定完了的按碰不碰 UI 进「设计」或「实现」：issue 会话里的由会话接着走，不在的人用 `/idea-loop:issue-session <号>` 接上，或自己跑 `/idea-loop:uiux-imagine`、调 `idea-loop:to-ticket`。人改了某个决定，牵出的图、story 树和测试决策同一轮改掉。
