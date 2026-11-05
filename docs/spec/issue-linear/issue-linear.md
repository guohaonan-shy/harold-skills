---
type: spec
tags: [idea-loop, issue-workflow, linear]
summary: issue 在 Linear 上的项目：setup 经 MCP 授权、把团队状态整理进 ISSUE_TRACKER.md，会话、调度、分拣用 MCP 读写同一个实体
related: ["[[2026-11-05-issue-model-regrill]]", "[[issue-model]]", "[[issue-triage]]"]
issues: [226]
---

# issue-linear：issue 在 Linear 上时，setup 经 MCP 接入，流程照 GitHub 走同一个实体

> #226 存在：`setup` 只配 GitHub，`issues.mjs` 的读写全走 `gh`；`idea-loop:issues` 的 `references/linear.md` 写着「脚本还不接 Linear」，Linear 团队装上 idea-loop 后调度、会话都找不到 issue，详情在「问题陈述」

## 问题陈述

对着 origin/main 801c8d2 核过，取数日期 2026-11-06；Linear 一侧的事实取自 2026-11-05 对 Hanabi AI 工作区 Agent Platform（FA）团队的摸底（[[2026-11-05-issue-model-regrill]] 的 A2、A3）。

### 1. 装上就断：setup 只问 GitHub，脚本只会 `gh`

- `setup` 的「问人」清单（`skills/engineering/setup/references/questions.md`）没有「issue 在哪个平台」；`ISSUE_TRACKER.md` 模板只有 GitHub 一份。
- `issues.mjs` 每个命令都经 `gh` 读写 GitHub issue。`issues check` 在 `idea-loop:issues` 里写着「平台无关，Linear 上先跑它再用 MCP 翻」，实际它先 `gh api repos/{owner}/{repo}/issues/<号>` 取当前状态：对一个 Linear 号（`FA-577`）它取不到。
- `spec.mjs` 的 `issuesOf` 只认数字：spec frontmatter 写 `issues: [FA-577]`，读出来是 `[577]`，会被当成 GitHub 的 #577。

### 2. Linear 团队的状态、分类不一定是默认的

FA 团队的实际情况（2026-11-05）：

| 方面 | FA 团队 | 对 idea-loop 意味着 |
|---|---|---|
| Triage | 没开（`triageEnabled: false`） | 要「triage：跳过」 |
| 状态 | Backlog / Todo / In Progress / In Review / Done / Canceled / Duplicate | 名字跟七个状态对得上，Duplicate 也是 canceled |
| 谁推状态 | In Progress、In Review、Done 由 GitHub 集成按 PR 推（FA-575：Backlog → In Progress 02:07 → In Review 02:17 → Done 04:13 合并） | 会话不手翻这三个 |
| 类型 | 单选 label 组 `type`：Bug / Feature / Improvement（250 个里 130 个打了） | 对上 `kind:*` |
| 模块 | 普通 label（telephony 60、sessions 29…） | 对上 `type:*` |
| 优先级 | 自带 priority（250 个里 192 个有） | 对上 P0/P1/P2 |
| 多仓库 | 13 个完成的里 4 个在 fish-agent、platform-api、platform-web 各一个 PR | 已由 #242 支持 |

别的团队可能改过状态名、开了 Triage、用别的 label 组名，所以每个项目要在 setup 时对着自己的团队整理一次。

### 根因

Linear 只在 `idea-loop:issues` 里有一张字段对照表；接入方式（人定的：走 MCP）、团队配置放哪（人定的：setup 整理进项目文档）、各流程在 Linear 上怎么做，都没写。

## 方案

改完之后，Linear 项目跟 GitHub 项目走同一套状态、同一套会话与调度，差别只在「读写 issue 用什么」：GitHub 用 `issues.mjs`（`gh`），Linear 用 Linear 的 MCP；**状态翻法的前提、PR 怎么算、正文格式仍由 `issues.mjs` 判**。

- **setup 多问一题「issue 在哪个平台」**。选 Linear 的：
  1. 查 Linear MCP 连上没有（能调它的 `list_teams`）；没连上，告诉人怎么连（桌面 app：设置里的 Connectors 加 Linear；CLI：`claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp`，再在 `claude` 里 `/mcp` 授权），连上再继续。
  2. 列团队让人选，读这个团队的状态（`list_issue_statuses`）、开没开 Triage（`get_team`）、label 组（`list_issue_labels`）。
  3. 照 Linear 版模板写 `ISSUE_TRACKER.md`：团队、七个状态各对应团队的哪个状态名、`triage：用 / 跳过`、优先级对照、类型用哪个 label 组、模块用哪些 label、仓库表、PR 怎么挂。整理结果给人看，人确认再写。
  4. 跳过 GitHub label 的几步（`issues labels`、`migrate`）。
- **`ISSUE_TRACKER.md` 第一行说平台**：`# Issue tracker：GitHub` 或 `# Issue tracker：Linear`，脚本读它。
- **`issues.mjs` 在 Linear 项目上**：
  - 写 GitHub issue 的命令（`labels`、`type`、`set`、`candidates`、`reconcile`、`migrate`、`new`、`priority`、`backlog`、`note`）拒绝，原因写「Linear 项目：用 Linear MCP 做这一步，见 `idea-loop:issues` 的 references/linear.md」。
  - `check <docs> <状态> <号> --from=<现在的状态>`：不查 issue，用 `--from` 给的当前状态，照常核 spec 与 PR。→ done 时 PR 在「仓库」表的每个仓库里按标题 `[<号>]` 或正文 `Linear: <号>` 找。
  - `show <docs> <号>`：给 spec、PR、分支，`state` 为 null（状态由 MCP 读）。
  - `body` 照常校验正文（[[issue-triage]] 加的）。
  - 带 `--repo` 的 `new` 不拒：它自己点名了一个 GitHub 仓库（retro 把插件的问题开到插件仓库用），Linear 项目也能用。
- **`spec.mjs` 认 Linear 号**：`issues: [FA-577]` 读成 `['FA-577']`，数字仍读成数字。
- **`references/linear.md` 从「只是对照」改成「怎么做」**：每个操作对应哪个 MCP 工具、参数怎么填、状态名从 `ISSUE_TRACKER.md` 的表取。会话、调度、分拣的 skill 在用 `issues` 的地方加一句「Linear 项目照 references/linear.md 用 MCP」，不各写一遍。

同一行为的其他入口，逐个标：

- **纳入**：`setup`（SKILL、`questions.md`、新模板 `references/issue-tracker-linear.md`、`survey.md` 的平台一项）；`idea-loop:issues`（SKILL 的平台一句、`references/linear.md` 重写）；`issue-session`（认领与收尾的 Linear 一句）；`issue-dispatch`（候选的 Linear 一句）；`issue-triage`（取 backlog、贴评论、翻状态的 Linear 一句）；`issues.mjs`、`spec.mjs`；`README.md`。
- **排除**：
  - `pr` 的「开 draft PR」：已经写了 Linear 的标题前缀 `[<号>]` 和正文 `Linear: <号>`，不改。
  - `pr-review` 的合并：合并后 Done 由集成推；会话在「收尾」里用 MCP 核一次 issue 已是 Done，不是就提醒人（集成没装或没推）。
  - Linear 的 Project、Cycle、Estimate、父子关系：idea-loop 不读不写（#242：不用父子归组）。
  - plugin 的 `.mcp.json` 不加 Linear：加了每个装 idea-loop 的项目都会多一个 Linear 连接，绝大多数用不上；由 setup 按需让人连。

## User Stories

### 场景：接入

1. 作为 Linear 团队的人，我想要 setup 问我 issue 在哪、帮我连上 Linear、列出我的团队让我选，以便不用自己读文档配
2. 作为人，我想要 setup 把团队现有的状态、Triage 开没开、类型和模块的 label 整理成一张表给我确认，以便 idea-loop 跟着团队已有的标准走、不另造一套
3. 作为人，我想要 Linear 项目的 `ISSUE_TRACKER.md` 跟 GitHub 项目的读起来是同一份结构，以便两边的 issue 在流程里是同一个实体

### 场景：流程

1. 作为调度，我想要从 Linear 取团队的 Todo、去掉还被挡着的、按优先级排，以便跟 GitHub 项目派发顺序一致
2. 作为 issue 会话，我想要用 MCP 认领 In Progress、写评论，In Review 与 Done 交给集成，以便不跟集成抢状态
3. 作为 issue 会话，我想要在翻状态前仍由 `issues check` 核前提（spec 定完、PR 全合并），以便 Linear 项目守同样的规矩
4. 作为分拣，我想要从 Linear 取 Backlog、贴评论、打 type label 和 priority，以便每周分拣在 Linear 上也能跑
5. 作为人，我想要 spec 的 `issues:` 能写 `FA-577`，以便 spec 指得到 Linear 上的 issue

## 实现决策

人 2026-11-06 交代两个 issue 一个 PR 做完后去休息，下面标「按推荐」的没有逐条问过；接入方式和团队配置放哪是人定的（[[2026-11-05-issue-model-regrill]] U1），FA 的事实是 A2、A3 的摸底。

### 平台写在 `ISSUE_TRACKER.md` 第一行（按推荐）

`# Issue tracker：Linear`。脚本用 `platformOf(md)` 读：第一个一级标题含 `Linear` 就是 Linear，其余（包括没有这份文件）是 GitHub。依据：GitHub 模板第一行已经是 `# Issue tracker：GitHub`，现有项目不用改。

### Linear 版 `ISSUE_TRACKER.md`

```
# Issue tracker：Linear

## 团队
<团队名>（key `<KEY>`），issue 号形如 `<KEY>-123`

## 状态
| 状态 | Linear 上 | 谁翻 |
| backlog | <团队的 backlog 类状态名> | 开出来就是；分拣、先放着时会话用 MCP 翻 |
| triage | <Triage，没开写「—」> | 分拣后会话用 MCP 翻 |
| todo | <Todo> | 同上 |
| in-progress | <In Progress> | PR 一开集成推；会话认领时先用 MCP 翻 |
| in-review | <In Review> | 集成按 PR 转 ready 推 |
| done | <Done> | 集成在全部 PR 合并后推 |
| canceled | <Canceled>、<Duplicate> | 会话用 MCP 翻：重复的翻 Duplicate（`save_issue` 带 `duplicateOf` 指向原 issue），其余翻 Canceled |
triage：用 / 跳过

## 优先级
P0 = Urgent，P1 = High，P2 = Medium；No priority 与 Low 都按「没有」排

## 分类
类型：label 组 `<组名>` 的 Bug / Feature / Improvement
模块：<label 名或 label 组>，跟 AGENTS.md「issue 分类」一节的父类一一对应

## 仓库
（同 GitHub 版）

PR：标题前缀 `[<号>]`，正文第一行 `Linear: <号>`。
```

状态表第二列是团队里实际的状态名，`save_issue` 的 `state` 直接用它。

### `check --from` 与 Linear 号

`check` 收到 `--from` 时不调 `gh` 取 issue；号可以是 `FA-577` 这种。没给 `--from` 而项目是 Linear，拒绝并说要 `--from`。PR 找法：`gh pr list --repo <仓库> --state all --search "<号> in:title"` 加 `"<号> in:body"`，标题以 `[<号>]` 开头或正文有一行 `Linear: <号>` 的算。

### 调度在 Linear 上（按推荐）

`list_issues`（`team`、`state` 取 todo 那一行的名字、`fields`: priority、createdAt、labels）；结果按 `createdAt` 是新的在前，要翻到最后一页（`cursor` 直到 `hasNextPage` 为 false）才取全；每个再 `get_issue`（`includeRelations: true`）去掉 blocked by 还没关的；按 P0 → P1 → P2 → 没有，同级按 `createdAt`。独立队列照「issue 分类」一节，父类名就是 Linear label 名。会话数、卡片照旧。

### 会话在 Linear 上

- 认领：`issues check <docs> in-progress <号> --from=todo` 过了，`save_issue`（`id`、`state`: in-progress 那一行的名字）。
- 翻回 triage、先放着、canceled：先 `check --from=…`，再 `save_issue`，评论用 `save_comment`（带前缀）。canceled 里重复的翻团队的 Duplicate 状态（`save_issue` 带 `duplicateOf` 指向原 issue），其余翻 Canceled。
- in-review、done 不手翻；收尾时 `get_issue` 核一次 Done。

### 分拣在 Linear 上

取 backlog：`list_issues`（`state` 取 backlog 那一行，`orderBy: createdAt`）；结果是新的在前，翻到最后一页（`cursor` 直到 `hasNextPage` 为 false），从末尾取最早的 15 个；跳过规则同 GitHub（最新一条带前缀的评论含「还要你补」、之后没更新）。翻状态、priority、类型 label 都用 `save_issue`（`addLabels` / `removeLabels`、`priority`）。开 issue：`issues body` 校验正文，再 `save_issue`（`team`、`title`、`description`、`state` 取 backlog）。

### MCP 不放进 plugin（按推荐）

理由见「方案」的排除。setup 查得到 `list_teams` 就算连上；工具名前缀随连接方式不同（桌面 app 的 connector 是一串 id），skill 里只写工具名（`list_issues`、`save_issue`…），不写前缀。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `platformOf`；Linear 项目上写命令被拒；`check --from` 不调 `gh issue`、核 spec 与 PR；按标题与 `Linear:` 找 PR；`issuesOf` 读 `FA-577` |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不加 eval（顶层 AGENTS.md §5）；文档测试钉住 setup 问平台、有 Linear 模板、linear.md 点名 MCP 工具、会话 / 调度 / 分拣都指向 linear.md |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及；0.1.10 发版后拿 FA-577 dogfood（人定的，U4） |

- **seam**：同 [[issue-triage]]，`issues.mjs` 的导出函数加假 `gh`、临时目录里的 `ISSUE_TRACKER.md`。抓不到 MCP 真实返回，由 FA-577 的 dogfood 补。
- **增量功能测试**：
  - 前置：`ISSUE_TRACKER.md` 第一行 `# Issue tracker：Linear`。步骤：`set`。期望：拒绝，原因指向 linear.md，假 `gh` 没被调。覆盖：流程 2。
  - 前置：同上，spec `issues: [FA-577]`，里面还有「### 待定」。步骤：`check todo FA-577 --from=triage`。期望：拒绝，报待定；没调 `gh issue`。覆盖：流程 3、5。
  - 前置：两个仓库各一个 PR，一个标题 `[FA-577] …` 已合并，一个正文 `Linear: FA-577` 还是 draft。步骤：`check done FA-577 --from=in-review`。期望：拒绝，报 draft 那个。覆盖：流程 3。
  - 前置：Linear 项目没给 `--from`。步骤：`check`。期望：拒绝，说要 `--from`。
- **照着谁写**：`issues.test.mjs`、`spec.test.mjs`、`issues-skill-doc.test.mjs`。

## Out of scope

- 把现有 Linear 团队的旧 issue 迁到某种格式：Linear 上状态就是团队自己的，不需要迁。
- 写一个直连 Linear API 的脚本：人定了走 MCP。

## 关联

- [[issue-model]]（#242）：七个状态、多仓库、PR 挂法；本 spec 让它在 Linear 上落地。
- [[issue-triage]]（#243）：同一个 PR，分拣、`issues new` / `body`、优先级。
- 原始需求 #222 的第 1 点（setup 可选平台），当时的 spec `setup-platform-env` 没合；人 2026-11-03 的原话「我倾向于follow 公司以及团队项目内的标准」由「setup 整理团队已有的状态与 label」落实。
- dogfood：0.1.10 发版后 FA-577（多仓库）。
