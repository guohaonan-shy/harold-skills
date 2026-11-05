# 01 — Linear 项目：setup 问平台并整理团队状态，各流程照 linear.md 用 MCP

**Blocked by**：issue-triage 的 01、02
**设计冻结**：不涉及 UI

## 要建什么

Linear 团队的人跑 `/idea-loop:setup`，被问 issue 在哪；选 Linear 的被带着连上 Linear MCP、选团队，setup 把团队的状态、Triage、label 组整理成 Linear 版 `ISSUE_TRACKER.md` 给人确认。之后会话、调度、分拣在 Linear 项目上照 `references/linear.md` 用 MCP 读写，翻状态前照常 `issues check --from`。

## 验收标准

- [ ] `idea-loop:issues` 的 `references/linear.md` 重写成「怎么做」：每个操作（读 issue 与评论、列某状态的 issue、翻状态、评论、打类型与模块 label、优先级、blocked by、开 issue）对应哪个 MCP 工具与参数（`get_issue`、`list_issues`、`save_issue`、`save_comment`、`list_issue_statuses`、`list_issue_labels`、`list_teams`、`get_team`），状态名从 `ISSUE_TRACKER.md` 的表取；只写工具名、不写前缀；翻状态前 `issues check <docs> <状态> <号> --from=<现在>`；in-review、done 由集成推、不手翻；开 issue 先 `issues body` 再 `save_issue`；优先级对照（P0=1 Urgent、P1=2 High、P2=3 Medium，0 与 4 按「没有」排）
- [ ] `idea-loop:issues` SKILL：平台那句改成「GitHub 用脚本；Linear 用 MCP，见 linear.md；前提都由 `issues check` 核」；去掉「只有对照，脚本还不接」
- [ ] `setup`：`questions.md` 加「issue 在哪个平台」（推荐 GitHub；有 Linear MCP 连接、或人提到 Linear 时推荐 Linear）；`survey.md` 加查平台的一项；新模板 `references/issue-tracker-linear.md`（照 spec「Linear 版 `ISSUE_TRACKER.md`」）；SKILL 的「写」里加 Linear 分支：连 MCP（连不上时给人桌面 app Connectors 与 `claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp` 两种做法）、选团队、读状态与 label 组、整理成表给人确认再写；Linear 项目跳过 `issues labels` 与 `migrate`；文件表里 `ISSUE_TRACKER.md` 一行写两个模板
- [ ] `issue-session`：认领、翻回 triage、先放着、收尾核 Done 在 Linear 项目上各一句指向 linear.md（不在 skill 里复述工具参数）
- [ ] `issue-dispatch`：候选在 Linear 项目上照 linear.md 取（Todo、去掉被挡的、按优先级和创建时间排），对账一步 Linear 项目跳过 `issues reconcile`（集成推状态）
- [ ] `issue-triage` 与 `issue-triager`：取 backlog、贴评论、打 label、翻状态在 Linear 项目上指向 linear.md
- [ ] `spec.mjs` 的 `verdicts` / `allAbsent` 认 `> FA-577 存在：…` / `不存在：…` 的开头结论行（与 `issuesOf` 返回的字符串号对得上），加单元测试
- [ ] `issues new` 加 `--repo=<owner/repo>`：查重与 `gh issue create` 都作用于那个仓库（`-R`），不带时照旧；`retro` 第 5 步「开到插件仓库」改成 `issues new … --repo=<插件仓库>`，不再出现 `gh issue create -R`；加单元测试
- [ ] `idea-loop/README.md`：说明支持 Linear（setup 经 MCP 接入）
- [ ] 文档测试：setup 问平台且有 Linear 模板；linear.md 点名上面的 MCP 工具和 `--from`；会话、调度、分拣都提到 linear.md；`no-project-leak.test.mjs` 过（模板与例子不用 FA、Hanabi 这类真实名字）

## 选中的存量回归

- `issues-skill-doc.test.mjs`：钉着 issues skill 与两份 reference 的说法
- `issue-group-skills.test.mjs`：会话与调度的说法
- `no-project-leak.test.mjs`
