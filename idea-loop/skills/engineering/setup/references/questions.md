# 问人的问题清单

- **基准分支与合并方式**：推荐 `origin/HEAD` 指向的分支，合并方式按最近合并的 PR。
- **worktree 准备**：新 worktree 里开工前要跑什么、端口怎么传。仓库没有这条命令，就写「无」，agent 照模板里的默认做法补依赖和配置。
- **开发服务器**：启动命令、端口怎么传、怎么判断起好了（一个 URL 或一行输出）。
- **验证命令**：类型检查、单个测试文件、全量测试、lint。推荐取自 CI 和 `package.json`。
- **已有的代码规范文档**（代码仓库里的 `CONTRIBUTING.md`、`docs/reference/` 之类）：由 `CODING_STANDARDS.md` 链接过去（写代码仓库里的路径），还是把内容搬进来。
- **产品**（没有 `PRODUCT.md` 时）：照模板一节一节问。纯后端项目也要，访谈里的产品判断靠它。
- **做不做 UI 设计**：做的话一起配设计档案素材的 Git LFS。
- **issue 在哪个平台**：GitHub 或 Linear。推荐 GitHub；会话里有 Linear MCP 连接（能调 `list_teams`）、或人提到 Linear 时推荐 Linear。选 Linear 的，团队、状态、label 由 SKILL 的「写」里 Linear 那一步读出来给人确认，不在这里问。
- **GitHub App 发评论**：要的话给 appId 和私钥文件路径。
- **团队用不用 triage**：triage 是验证过的 issue 等人评估（grill、设计）的那一段。推荐「用」；团队的 issue 平台没开 triage、或所有 issue 都不要人评估的选「跳过」，backlog 直接到 todo，grill 与设计在 todo 的会话里做。答案写进 `ISSUE_TRACKER.md` 状态表后面那一行（`triage：用` 或 `triage：跳过`），模板里的「用 / 跳过」占位不算选了。
- **issue 分类**：有哪些父类，每个父类下有没有子类；推荐从现有 label 和 issue 推出。名字里不能有 `/`（它分隔子类），比如 `UI/UX` 写成 `uiux`。答案写进 `ISSUE_TRACKER.md` 的「分类 label」一节。
- **别的 label**：现有 label 里，状态和分类之外哪些要留（写进「保留的 label」）；还有 open issue 在用、又不留的，各迁成哪个分类，或直接去掉。
