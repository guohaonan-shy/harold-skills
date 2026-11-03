# 定稿，然后收工

spec 不单独开 PR 先合并：它跟设计、实现在同一条线上，到最后一起合（`idea-loop:issue-session` 的「一个会话一条线」）。定稿是这条线上单独的一次提交。以下都在 `<知识库>`（`root --write` 的输出，`.tmp/kb/`，分支名跟会话分支相同）里跑，`gh` 作用在知识库上。调用方说了提交由它来做的（比如 `idea-loop:issue-verify`），整段留给它。

1. spec 是「正式」（覆盖的 issue 全都不存在的是「完成」）才定稿；还是「审核中」就先跟人定完。
2. 只 `git add` 这份 spec 的目录、`docs/raw/<topic>/` 里这次写的文件和 `docs/spec/index.md`，提交 `docs(spec): <slug> 定稿`；工作区里有别的改动，就另开一个 worktree 提交。这一次提交就是人拍板时 spec 的样子。
3. 推送；知识库里这条线还没有 PR 的，`gh pr create --draft`（base 是知识库的主分支），正文写 slug、状态、覆盖的 `#号`。不合并：它到这条线最后由会话合（`idea-loop:pr-review` 合并时一并合）。
4. 告诉人这份 spec 定稿了、PR 链接。`正式` 的按碰不碰 UI 进「设计」或「实现」：不在 issue 会话里的，告诉人在这个 worktree 里用 `/idea-loop:issue-session <号>` 接上（`<号>` 是 spec 的 issue；它认出会话分支上已有的正式 spec，直接换阶段）。人改了某个决定，牵出的图、story 树和测试决策同一轮改掉，各自是定稿之后的提交。
