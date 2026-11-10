---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, linear]
summary: issue 在 Linear 上时 setup 经 MCP 接入、团队状态整理进 ISSUE_TRACKER.md，前提仍由 issues.mjs 判，读写走 MCP
related: ["[[2026-11-05-issue-model-regrill]]"]
---

# ADR-0024 — issue-linear：issue 在 Linear 上时经 MCP 接入，流程照 GitHub 走同一个实体

> 由 spec `issue-linear` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#226。`setup` 只配 GitHub，`issues.mjs` 的读写全走 `gh`；`issues check` 对 Linear 号（`FA-577`）取不到状态，`spec.mjs` 的 `issuesOf` 只认数字（`FA-577` 读成 `577`，被当成 GitHub 的 #577）。Linear 团队装上 idea-loop 后，调度和会话找不到 issue。2026-11-05 对一个真实团队的摸底：没开 Triage、状态名是 Backlog/Todo/In Progress/In Review/Done/Canceled/Duplicate，In Progress/In Review/Done 由 GitHub 集成按 PR 推，类型是单选 label 组，模块是普通 label，自带 priority，一个 issue 常在多个仓库各一个 PR。别的团队可能改过状态名或开了 Triage，所以要在 setup 时对着团队整理一次。

## 2 决策（how）

- **读写走 Linear 的 MCP，不写直连脚本**（人定）；**状态翻法的前提、PR 怎么算、正文格式仍由 `issues.mjs` 判**。`issues check <docs> <状态> <号> --from=<现在>` 不读 issue 而用调用方给的当前状态，号可以是 Linear 号；没给 `--from` 就拒绝。
- **平台写在 `ISSUE_TRACKER.md` 第一个标题**（`# Issue tracker：Linear`），脚本用 `platformOf` 读，其余算 GitHub，现有项目不用改。Linear 项目上写 GitHub issue 的命令（`set`、`new`、`candidates`、`reconcile`、`backlog` 等）一律拒绝并指向 `references/linear.md`；`show` 照常给 spec、PR、分支但 `state` 为 null；`body` 照常校验正文；带 `--repo` 的 `new` 不拒。
- **团队配置放项目文档**：setup 多问“issue 在哪个平台”，选 Linear 的连 MCP（能调 `list_teams` 算连上）、列团队让人选、读状态/Triage 开没开/label 组，整理成表给人确认再写 `ISSUE_TRACKER.md`（Linear 版模板：团队、七个状态各对应的团队状态名、`triage：用/跳过`、优先级对照、类型与模块 label、仓库表、PR 挂法）；跳过 GitHub label 的步骤。“follow 公司与团队内已有标准”由这一步落实。
- **PR 怎么找**：在“仓库”表的每个仓库里按标题 `[<号>]` 开头或正文一行 `Linear: <号>`。
- **in-progress/in-review/done 由集成推**，会话认领时先翻一次 in-progress，其余不手翻；收尾时核一次 Done。重复的 issue 翻 Duplicate 并带 `duplicateOf`。
- **`spec.mjs` 认 Linear 号**：`issues: [FA-577]` 读成字符串，数字仍读成数字。
- **MCP 不放进 plugin 的 `.mcp.json`**：加了每个装 idea-loop 的项目都会多一个 Linear 连接，绝大多数用不上；由 setup 按需让人连。skill 里只写工具名，不写随连接方式变化的前缀。
- **`references/linear.md` 从对照表改成“怎么做”**：每个操作对应的 MCP 工具与参数；会话、调度、分拣的 skill 只加一句“Linear 项目照 `idea-loop:issues` 的 Linear 做法”，不各写一遍。
- 不读不写 Linear 的 Project、Cycle、Estimate、父子关系。

## 3 结果（result）

- 脚本：`idea-loop/scripts/issues.mjs` 的 `platformOf`、`check --from`、Linear 项目上的拒绝名单、`prsOfLinear`；`idea-loop/scripts/spec.mjs` 的 `issuesOf`。
- skill：`idea-loop:issues` 的 `references/linear.md`；`setup` 的 `references/linear-setup.md`、`issue-tracker-linear.md`，`questions.md` 与 `survey.md` 的平台一项；`issue-session`、`issue-dispatch`、`issue-triage`、`issue-triager` 里均有 Linear 项目一句。
- 插件的 `.mcp.json` 里没有 Linear。
- 文档测试 `idea-loop/scripts/linear-docs.test.mjs` 守着。真实团队的端到端验证（多仓库 issue 的 dogfood）未在本次核对范围。

## 取代线索

- 在 ADR-0022 的七个状态与多仓库 PR 挂法之上落地；无冲突。
- 被后来改写的细节（不冲突，取代的是写法）：接 MCP 的步骤（桌面 app Connectors / `claude mcp add`）现在经 ADR-0026 的“装与设置”“调用 MCP”两个能力按运行环境做（magi 里优先用 magi 托管的 MCP）；调度在 Linear 上取候选时多了 `assignee: "me"` / `"null"` 两档（ADR-0026，#264）。
