# 一次运行开头的分支

## 开工：先开 PR

PR 从 spec 提交就挂着，不等工单做完：平台据此在 issue 上看到它改到了哪。issue 会话已经在切工单之前开了（`.tmp/implement/<spec-slug>/prs.md` 在，接着上次的会话时也在），先于派工核一遍：

1. **PR 都在**：`prs.md` 列的仓库覆盖了工单头 `**仓库**` 收齐的那些（都没写就是当前仓库）。没有 `prs.md`（人直接调进来的），或工单用到了没开 PR 的仓库，照 `idea-loop:pr` 的「开 draft PR」补开。
2. **翻状态**：todo 会话认领时已经翻成 in-progress，是的就跳过；不是的（人直接调进来），`issues set <docs> in-progress <号>`。Linear 上 PR 一开集成就推，不手翻。
3. **补 `reference`**：开 PR 时工单还没切，`reference` 只有 spec 的链接；工单切好后，用 `pr-body.mjs set` 把 spec 与工单补进去。

## 会话断了

会话断了：先查 `git worktree list` 里 pending 没记着的执行方 worktree：它的分支上有一个带这张工单 `Ticket:` 的提交、比集成分支只多这一个、工单格全勾或带 `⏭ 延后`，就当它交回了 `landed`，照「核对与落地」落地再回收；不是这样的，才照「回收」收掉后重派。然后重算可派的工单。
