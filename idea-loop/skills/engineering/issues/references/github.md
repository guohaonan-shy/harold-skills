# GitHub 上的 issue

`issues.mjs` 用 `gh` 在知识库的 `docs/` 下跑，作用于那个仓库（或业务配置指定的 issue 仓库）。下表是实体的每个字段在 GitHub 上的样子，和脚本读写它用的接口。

| 字段 | GitHub 上 | 读 | 写 |
|---|---|---|---|
| 状态 | label `status:<名>`；done / canceled 同时关闭，reason 分别是 completed / not planned，label 留着 | 列表 `GET repos/{owner}/{repo}/issues?state=open` 的 `labels` | `gh issue edit --add-label / --remove-label`，`gh issue close --reason` |
| 分类 | label `type:<父类>`、`type:<父类>/<子类>` | 同上 | `gh issue edit` |
| 优先级 | label `priority:<级>`（#243 定义） | 同上 | `split` 照抄父 issue 的 |
| 父 / 子 | 原生 sub-issue：列表里的 `parent_issue_url`、`sub_issues_summary.total` | `GET …/issues/<号>/sub_issues` | `POST …/issues/<父号>/sub_issues -F sub_issue_id=<子 issue 的 id>`（id 是数据库 id，不是号） |
| blocked by | 原生 issue dependencies：列表里的 `issue_dependencies_summary.blocked_by`（还开着的挡路数）、`total_blocked_by` | `GET …/issues/<号>/dependencies/blocked_by` | `POST …/issues/<号>/dependencies/blocked_by -F issue_id=<挡路 issue 的 id>` |
| milestone | milestone（版本） | 列表里的 `milestone.number` | `gh issue create --milestone <标题>` |
| 评论 | issue 评论，带「🤖 idea-loop：」前缀 | `gh issue view --comments` | `gh issue comment`，或 `gh issue close --comment` |

- 列表接口会混进 PR（带 `pull_request` 字段），脚本跳过它们。
- 一个父 issue 最多 100 个子 issue、最多 8 层；idea-loop 只用两层。
