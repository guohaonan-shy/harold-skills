# 问人的问题清单

- **基准分支与合并方式**：推荐 `origin/HEAD` 指向的分支，合并方式按最近合并的 PR。
- **worktree 准备**：新 worktree 里开工前要跑什么、端口怎么传。仓库没有这条命令，就写「无」，agent 照模板里的默认做法补依赖和配置。
- **开发服务器**：启动命令、端口怎么传、怎么判断起好了（一个 URL 或一行输出）。
- **验证命令**：类型检查、单个测试文件、全量测试、lint。推荐取自 CI 和 `package.json`。
- **已有的代码规范文档**（`CONTRIBUTING.md`、`docs/reference/` 之类）：由 `CODING_STANDARDS.md` 链接过去，还是把内容搬进来。
- **产品**（没有 `PRODUCT.md` 时）：照模板一节一节问。纯后端项目也要，访谈里的产品判断靠它。
- **要不要知识库，放在哪**：三选一。推荐「仓库里的 `docs/`」；仓库已有 `docs/spec/` 或 `docs/adr/`，就是它。
  - **仓库里的 `docs/`**：照旧建骨架，idea-loop 的 spec、设计、dreaming 都读写它。
  - **仓库外的目录（或单独一个仓库）**：仓库要照别的标准维护、放不进这套文件时选。不在仓库里建 `docs/` 骨架，只在 `## idea-loop` 块里记下位置，人在那里照 `idea-loop:wiki-conventions` 的格式自己维护；idea-loop 的 skill 只读写仓库里的 `docs/`，所以 spec、设计、dreaming 这些流程在这个仓库里用不了。
  - **不要**：不建骨架，不记位置；同样用不了那些流程。
- **做不做 UI 设计**：做的话一起配设计档案的忽略规则和 LFS。
- **GitHub App 代发评论**：要的话给 appId 和私钥文件路径。
- **团队用不用 triage**：triage 是验证过的 issue 等人评估（grill、设计）的那一段。推荐「用」；团队的 issue 平台没开 triage、或所有 issue 都不要人评估的选「跳过」，backlog 直接到 todo，grill 与设计在 todo 的会话里做。答案写进 `ISSUE_TRACKER.md` 的 `triage：用` / `triage：跳过` 那一行。
- **这个产品的 issue 会改到哪几个仓库**：每个仓库的 `owner/name`、本地路径、主分支、管产品的哪一块。推荐只填当前仓库一行（从 `git remote` 和基准分支推出）；人说还有别的仓库再加。答案写进 `ISSUE_TRACKER.md` 的「仓库」表，第一行是知识库所在的仓库，模板里的占位行删掉。
- **issue 分类**：有哪些父类，每个父类下有没有子类；推荐从现有 label 和 issue 推出。名字里不能有 `/`（它分隔子类），比如 `UI/UX` 写成 `uiux`。
- **别的 label**：现有 label 里，状态和分类之外哪些要留（写进「保留的 label」）；还有 open issue 在用、又不留的，各迁成哪个分类，或直接去掉。
