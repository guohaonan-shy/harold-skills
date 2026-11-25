# 早上汇总

早上的第一轮（上一轮落在 `todo` 时段、此刻不在）出一份昨夜的汇总：昨夜开出了哪些 issue，各自走到哪，按项目分节。完成条件：每个昨夜开出的 issue 一行，完整的表在汇报里，推送发出一句话。

1. **取昨夜开出的会话**：记录文件仍按项目分开，逐个项目（`dyna home projects`，跳过 `skip` 里的）读 `~/.idea-loop/dispatch/<仓库名>.json`（『怎么交出 issue』每开一个会话追加一条）里 `period` 是 `todo`、开出时间在昨晚夜里时段开始（`dyna home dispatch --at=<上一轮的时刻>` 的 `period.start`）之后的条目；每条的会话 id 取 `sessionId`，旧记录里它叫 `desktopSessionId`，两个字段名都认。
2. **每个 issue 一行**：
   - 停在 PR 的：PR 链接；review loop 文件（它的 worktree 用 `dyna worktree list --repo <主 checkout>` 按分支找，文件是里面的 `.tmp/review-loop/<PR 号>.md`）最近一轮的 review 结论，和批示写着「夜间模式，人不在，按推荐」的条数。
   - 没停在 PR 的：它在哪个分组、最后活动时间、最后一条 idea-loop 评论（认法照 `idea-loop:issues` 的「评论」）说停在哪。
3. **汇报与推送**：完整的表写进汇报，再用『推送』发一句话：开了几个、几个等审、几个卡住。
