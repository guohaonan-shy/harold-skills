# Linear 上的 issue

项目的 `ISSUE_TRACKER.md` 第一个标题写 `Linear`，issue 就在 Linear 上。读写 issue 用 Linear 的 MCP，调用经『调用 MCP』能力（用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的这一节；工具名和参数名不随运行环境变），工具只写名字（前缀随连接方式不同，到工具列表里找）；**翻状态之前的前提、PR 怎么算、正文格式仍由 `issues` 判**。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指知识库的 `docs/`，`<号>` 是 Linear 的 issue 号（形如 `ENG-123`）。

**状态名、label 组名从 `ISSUE_TRACKER.md` 取**：下面写 `<某状态的名字>` 的，都是它的状态表里那一行「Linear 上」一列的字，团队改过名也照那一列。`list_issue_statuses`（`team`）能看团队实际有哪些。

## 字段

| 字段 | Linear 上 |
|---|---|
| 状态 | 团队的 workflow state，名字取 `ISSUE_TRACKER.md` 的状态表。不用 label 表达状态 |
| 类型 | 单选 label 组里的 Bug / Feature / Improvement，组名取 `ISSUE_TRACKER.md` 的「分类」 |
| 模块 | 另一组 label（或普通 label），名字取 `ISSUE_TRACKER.md` 的「分类」，父类名就是 label 名 |
| 优先级 | Linear 自带的 priority，对照见「优先级」 |
| blocked by | issue relation「blocked by」 |
| 挂着的 PR | PR 标题前缀 `[<号>]`，正文第一行 `Linear: <号>`；平台据此把 PR 挂到 issue 上 |
| 评论 | comment，带「🤖 idea-loop：」前缀 |

## 谁翻状态

- **in-progress、in-review、done 由 GitHub 集成按 PR 推**：PR 一开到 in-progress，转 ready 到 in-review，全部 PR 合并到 done。会话不手翻 in-review、done；in-progress 只在认领时先翻一次（集成要等 PR 才推）。
- 其余（backlog、triage、todo、canceled）会话用 `save_issue` 翻。
- **翻之前先核前提**：`issues check <docs> <要翻成的状态> <号> --from=<现在的状态>`。Linear 项目上 `check` 不读 issue 状态，现在的状态由你用 `get_issue` 读出来，换算回七个状态名之一（对着状态表）传给 `--from`；它核 spec 有没有定完、PR 是不是全合并，不过就按它说的原因处理，不翻。没带 `--from` 它会拒绝。
- `issues show <docs> <号>` 照常给 spec、PR、分支；`state` 是 null。

## 每个操作

| 操作 | 工具与参数 |
|---|---|
| 读 issue | `get_issue`（`id`: `<号>`；要挡路的关系加 `includeRelations: true`，要标签和优先级 `fields` 里带 `labels`、`priority`） |
| 读评论 | `list_comments`（`issueId`: `<号>`）；最近一条「🤖 idea-loop：」写着上次停在哪、分支叫什么 |
| 列某状态的 issue | `list_issues`（`team`、`state`: 那个状态的名字、`orderBy`: `createdAt`、`limit`；`fields` 带 `priority`、`createdAt`、`labels`）；多页用返回的 `cursor` 接着取。**结果是新的在前**，要最早的，得一页页翻到最后一页（带 `cursor` 取，直到 `hasNextPage` 为 false）再从末尾往前数 |
| 翻状态 | 先 `issues check … --from=…`，再 `save_issue`（`id`: `<号>`、`state`: 目标状态的名字） |
| 评论 | `save_comment`（`issueId`: `<号>`、`body`: 以「🤖 idea-loop：」开头） |
| 先放着 | 先 `check --from=…`；`save_comment` 写停在哪、分支名；再 `save_issue` 翻 `state` 到 backlog 的名字 |
| 取消（不做、验证为不存在） | 先 `check --from=…`；`save_comment` 写理由；再 `save_issue`（`id`、`state`: Canceled 的名字） |
| 取消（重复） | 同上，但 `save_issue` 翻到 Duplicate 的名字（`ISSUE_TRACKER.md` canceled 那行的第二个名字；团队没有 Duplicate 就翻 Canceled），并带 `duplicateOf`: 原 issue 的号；评论写「跟 <原号> 重复」 |
| 打类型 | `save_issue`（`id`、`addLabels`: [类型 label 名]）；单选组里已有别的类型的，同一次调用 `removeLabels` 去掉 |
| 打模块 | `save_issue`（`id`、`addLabels`: [模块 label 名]，换模块时 `removeLabels` 去掉旧的）；`list_issue_labels`（`team`）看有哪些 |
| 优先级 | `save_issue`（`id`、`priority`），见下表 |
| blocked by | 读：`get_issue` 带 `includeRelations: true`；写：`save_issue`（`id`、`blockedBy`: [挡路的号]） |
| 开 issue | 先 `issues body <docs> <正文文件>` 过了（打印「正文齐了」，不过会退出 1 并说缺哪节），再 `save_issue`（`team`、`title`、`description`: 正文、`state`: backlog 的名字；有了类型、模块、优先级一并给 `labels`、`priority`）。开之前 `list_issues`（`team`、`query`: 标题关键词）查重，已有同一个问题的用那一条 |
| 列团队、团队设置 | `list_teams`；`get_team`（`query`: 团队 key，看开没开 Triage）；`list_issue_statuses`（`team`）；`list_issue_labels`（`team`、`includeGroups: true`） |

## 优先级

| idea-loop | Linear `priority` |
|---|---|
| P0 | 1（Urgent） |
| P1 | 2（High） |
| P2 | 3（Medium） |
| 没有 | 0（No priority）和 4（Low） |

读出来是 0 或 4 的按「没有」排；要清掉优先级写 0。

## 调度与分拣怎么取

- **派发候选**：先取指派给本人的，再取未指派的，指派给别人的不取。
  1. `list_issues`（`team`、`state`: todo 的名字、`assignee`: `"me"`、`fields`: `priority`、`createdAt`、`labels`），结果是新的在前，要翻到最后一页（`cursor` 直到 `hasNextPage` 为 false）才取全；每个再 `get_issue`（`includeRelations: true`）去掉 blocked by 还没关的；按 P0 → P1 → P2 → 没有排，同级按 `createdAt` 早的在前。
  2. 这一步剩下的是空的（没有指派给本人、又没被挡着的），才取未指派的：`list_issues` 同上，`assignee` 换成 `"null"`，`fields` 加 `updatedAt`；同样去掉被挡的；按 P0 → P1 → P2 → 没有排，同级按 `updatedAt` 早的在前。Linear 不给「进入当前状态的时间」，`updatedAt`（最近一次改动，评论、改字段、翻状态都算）是最接近「在 Todo 里放了多久没动」的字段。

  独立队列按 `labels` 里有没有那个父类名分，主队列是不带任何独立队列父类的。
- **分拣取 backlog**：`list_issues`（`state`: backlog 的名字、`orderBy`: `createdAt`），结果是新的在前，翻到最后一页（`cursor` 直到 `hasNextPage` 为 false），从末尾取最早的 15 个；最近一条带前缀的评论含「还要你补」、之后没人更新的，跳过、不占这 15 个的名额。

## 要知道的几件事

- **Triage 团队可能没开**：没开的，`ISSUE_TRACKER.md` 写「triage：跳过」，backlog 直接到 todo。
- **一个 issue 常在几个仓库各有一个 PR**，每个 PR 都带同一个号；全部合并才算 done，跟 GitHub 一致。
- **不读不写**：Linear 的 Project、Cycle、Estimate、父子关系。
- Linear 的 PR 与 issue 是多对多的，idea-loop 仍按一个 issue 一个会话、每个仓库一个 PR 用。
- `issues` 里写 GitHub issue 的命令（`set`、`new`、`candidates`、`reconcile` 这些）在 Linear 项目上会被拒绝，就是要你改用上面的工具。例外是 `issues new … --repo=<owner/repo>`：它自己点名了一个 GitHub 仓库（比如把插件的问题开到插件仓库），Linear 项目也能用。
