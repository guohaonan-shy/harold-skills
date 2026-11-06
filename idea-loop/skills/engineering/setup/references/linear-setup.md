# Linear 项目的 setup

人在「问人」里选了 Linear，「写」里 `ISSUE_TRACKER.md` 这一步这样做：

1. **连 MCP**：用『调用 MCP』能力调 `list_teams`，能调就算连上。没连上，用『装与设置』能力告诉人怎么接 Linear（MCP 地址 `https://mcp.linear.app/mcp`，做法照当前运行环境的『装与设置』；用 Skill 工具调 `idea-loop:runtime` 读它）。人连好再往下。
2. **选团队、读设置**：`list_teams` 列团队给人选；对选定的团队读 `list_issue_statuses`（状态）、`get_team`（Triage 开没开）、`list_issue_labels`（`includeGroups: true`，找类型和模块的 label 组）。
3. **整理成表**：照 [issue-tracker-linear.md](issue-tracker-linear.md) 填：团队与 key、七个状态各对应团队的哪个状态名、`triage：用 / 跳过`（没开 Triage 的写跳过）、优先级对照、类型用哪个 label 组、模块用哪些 label、仓库表、PR 怎么挂。团队里对不上七个状态的，问人怎么对。**整理结果给人看，人确认再写进 `ISSUE_TRACKER.md`**；第一个标题保持 `# Issue tracker：Linear`，脚本靠它认平台。
4. **跳过 GitHub label 的步骤**：不跑 `issues labels`、`migrate`，也不建 `status:*` 一类 label。

完成条件：`ISSUE_TRACKER.md` 经人确认写好，状态表里每个状态名都是团队里真有的。
