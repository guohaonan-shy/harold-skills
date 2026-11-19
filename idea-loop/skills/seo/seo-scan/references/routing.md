# 分流的步骤

`seo-scan` 的「分流」一节指到这里。分拣员的建议去向表（含 SEO 分支）只写在 `idea-loop:issue-triager` 里，这里不重复它的判据，只照它交回的 `route` 翻；每周的 `idea-loop:issue-triage` 照同一个分拣员的建议翻，漏到 backlog 的 SEO issue（例如人手动开的）在那里走同一条规则。

下文 `<docs>` 指 `<项目目录>/docs/`。项目目录照 `idea-loop:wiki-conventions` 的「项目目录」拿。

1. **取号**：读 `<运行目录>/issues.json`，只取 `created` 里的 `number`。`commented` 的是追加到已有 issue 上的，已经在某个状态里，不分流。`created` 为空、`issues.json` 不存在（提 issue 失败）：这一节跳过，计数写 0。
2. **备环境**：`git fetch origin`，主分支取 `<项目目录>/DEVELOPMENT.md` 的「分支」节，`git worktree add --detach <运行目录>/triage-worktree origin/<主分支>`（在代码仓库里跑，这是代码的 worktree）；没有 `DEVELOPMENT.md` 就用 `git rev-parse --abbrev-ref origin/HEAD` 的结果。备不了：记下原因，这一节跳过，issue 留在 backlog（每周的 `issue-triage` 会接手）。
3. **派分拣员**：每个号起一个 `idea-loop:issue-triager`，给 issue 号、项目目录的绝对路径和上面 worktree 的绝对路径；**同时最多 5 个**，一个交回再补下一个。它们各自在 issue 上贴证据评论，交回一行 JSON（`issue`、`conclusion`、`comment`、`route`、`priority`）。
4. **照 `route` 翻**，翻之前不再判断一遍：

   | `route` | 执行 |
   |---|---|
   | `canceled` | `dyna issues set <docs> canceled <号> --comment=<conclusion>` |
   | `triage` | `dyna issues set <docs> triage <号>` |
   | `todo` | `dyna issues set <docs> todo <号>` |
   | `backlog`（分拣员判不了） | 也翻 `todo`：`dyna issues set <docs> todo <号>`，todo 会话照推荐定 |

   `priority` 是 `P1` 或 `P2` 的，翻完再 `dyna issues priority <docs> <P1 或 P2> <号>`；`null` 就不打。项目跳过 triage（`ISSUE_TRACKER.md` 写了「triage：跳过」）时分拣员没有 `triage` 这一路，不会交回它。
5. **失败不重试**：分拣员报错没交回、或 `dyna issues set` 被拒：这个号留在 backlog，原因记下，接着处理下一个；每周的 `issue-triage` 会把它捡起来。
6. **收尾**：`git worktree remove --force <运行目录>/triage-worktree`。数一下三种翻法各几个，填进交回和研究日志的「分流」行；没翻成的号和原因另写进研究日志（超了字数先删它）。
