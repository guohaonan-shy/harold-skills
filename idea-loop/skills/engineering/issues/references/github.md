# GitHub 上的 issue

`dyna issues` 用 `gh`（带 `-R <owner/repo>`）对着项目清单里登记的仓库跑。下表是实体的每个字段在 GitHub 上的样子，和命令读写它用的接口。

| 字段 | GitHub 上 | 读 | 写 |
|---|---|---|---|
| 状态 | 开着的四个状态各一个 label：`status:triage`、`status:todo`、`status:in-progress`、`status:in-review`；backlog 是开着、没有 `status:*`；done 是 closed，reason completed；canceled 是 closed，reason not planned，不留 label | 列表接口的 `labels`、`state`、`state_reason` | `gh issue edit --add-label / --remove-label`，`gh issue close --reason completed` 或 `"not planned"` |
| 类型 | label `kind:bug` / `kind:feature` / `kind:improvement`，最多一个 | 同上 | `dyna issues kind` |
| 模块 | label `type:<父类>`、`type:<父类>/<子类>`（名字是历史沿用，表达的是模块） | 同上 | `dyna issues type` |
| 优先级 | label `priority:P0` / `priority:P1` / `priority:P2`，最多一个 | 同上 | `dyna issues priority` |
| blocked by | 原生 issue dependencies：列表里的 `issue_dependencies_summary.blocked_by` 是还开着的挡路数 | `GET repos/{owner}/{repo}/issues/<号>/dependencies/blocked_by` | `dyna issues block add / remove` |
| 父 issue / 子 issue | 原生 sub-issues：子 issue 在列表里带 `parent_issue_url`，父 issue 的 `sub_issues_summary` 有总数和已关的数 | `dyna issues sub list`；`dyna issues list --top-level` / `--parent <号>` | `dyna issues sub add / remove`（挂、摘之后同步父 issue 的优先级）；开父 issue 用 `dyna issues new --sub` |
| 挂着的 PR | PR 正文里的 `Refs <owner>/<repo>#<号>` | `gh pr list --repo <仓库> --state all --search "<号> in:body" --json number,body,state,isDraft` | 开 PR 时写进正文 |
| 评论 | issue 评论，第一行是 `<!-- idea-loop -->` 标记（旧评论以「🤖 idea-loop：」开头，照认） | `gh issue view --comments` | `gh issue comment`，或 `gh issue close --comment` |

- **PR 挂 issue 写 `Refs`，不写 `Closes`**：issue 的 done 由合并步骤翻，不靠 PR 一合并就关。不带仓库的 `Refs #<号>` 只在 issue 自己的仓库里认。
- **指派人**：`dyna issues candidates` 按指派人排候选。本人是 `gh api user` 的登录；指派给别人的不派；未指派的先按优先级排，同一优先级里按在该状态（todo，`--state=triage` 时是 triage）里停留的时间排，时间取 issue events 里最后一次加上 `status:<该状态>` 的时刻，没有这条事件就用创建时间，只对与别的未指派 issue 同一优先级的读 events。
- 列表接口会混进 PR（带 `pull_request` 字段），命令跳过它们。
- 人在 GitHub 上直接开的 issue 没有 `status:*`，就是 backlog。旧的中文 `status:*` label 调度认不出，`dyna issues migrate` 换成上表的。
