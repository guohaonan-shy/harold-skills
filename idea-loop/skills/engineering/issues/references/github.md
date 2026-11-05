# GitHub 上的 issue

`issues.mjs` 用 `gh` 在知识库的 `docs/` 下跑，作用于那个仓库。下表是实体的每个字段在 GitHub 上的样子，和脚本读写它用的接口。

| 字段 | GitHub 上 | 读 | 写 |
|---|---|---|---|
| 状态 | 开着的四个状态各一个 label：`status:triage`、`status:todo`、`status:in-progress`、`status:in-review`；backlog 是开着、没有 `status:*`；done 是 closed，reason completed；canceled 是 closed，reason not planned，不留 label | 列表接口的 `labels`、`state`、`state_reason` | `gh issue edit --add-label / --remove-label`，`gh issue close --reason completed` 或 `"not planned"` |
| 类型 | label `kind:bug` / `kind:feature` / `kind:improvement` | 同上 | `gh issue edit --add-label` |
| 模块 | label `type:<父类>`、`type:<父类>/<子类>`（名字是历史沿用，表达的是模块） | 同上 | `issues type` |
| 优先级 | label `priority:P0` / `priority:P1` / `priority:P2`，最多一个 | 同上 | `issues priority` |
| blocked by | 原生 issue dependencies：列表里的 `issue_dependencies_summary.blocked_by` 是还开着的挡路数 | `GET repos/{owner}/{repo}/issues/<号>/dependencies/blocked_by` | `POST …/dependencies/blocked_by -F issue_id=<挡路 issue 的 id>`（id 是数据库 id，不是号） |
| 挂着的 PR | PR 正文里的 `Refs <owner>/<repo>#<号>` | `gh pr list --repo <仓库> --state all --search "<号> in:body" --json number,body,state,isDraft` | 开 PR 时写进正文 |
| 评论 | issue 评论，带「🤖 idea-loop：」前缀 | `gh issue view --comments` | `gh issue comment`，或 `gh issue close --comment` |

- **PR 挂 issue 写 `Refs`，不写 `Closes`**：一个 issue 在几个仓库各有一个 PR，写 `Closes` 的 PR 一合并就把 issue 关了。不带仓库的 `Refs #<号>` 只在 issue 自己的仓库里认。
- **改哪些仓库**：`ISSUE_TRACKER.md` 的「仓库」一节第一列列出的仓库，脚本在这些仓库里找挂着的 PR；没有这一节就只找 issue 所在的仓库。
- 列表接口会混进 PR（带 `pull_request` 字段），脚本跳过它们。
- 人在 GitHub 上直接开的 issue 没有 `status:*`，就是 backlog。旧的中文 `status:*` label 调度认不出，`issues migrate` 换成上表的。
