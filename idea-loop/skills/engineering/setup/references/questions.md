# 问人的问题清单

## 业务与知识库（先问这四题，必须问清）

业务名选了本机 `projects.json` 里已有的（往已有业务加仓库）时，后三题的答案取自那个业务的 `idea-loop.json` 与映射，不再问。

- **业务名**：这个仓库属于哪个业务；本机已有的业务名列出来供选。推荐：仓库名。出处：`origin` 的仓库名。
- **知识库仓库**：已有就填它的 GitHub 名（`<owner>/<name>`）与本机路径；没有就新建。推荐：新建私有仓库 `<owner>/<业务>-kb`，clone 到代码仓库主 checkout 同级的 `<业务>-kb/`。出处：`origin` 的 owner；主 checkout 的父目录。
- **会话在哪跑（`home`）**：调度和 issue 会话开在哪个 checkout。推荐：业务只有一个代码仓库时填那个代码仓库的主 checkout，有几个仓库时填知识库的主 checkout。出处：`idea-loop.json` 的 `repos` 有几个仓库（新业务就是这一个）。
- **issue 在哪个 GitHub 仓库**：写进 `idea-loop.json` 的 `issues`。推荐：当前代码仓库。出处：`gh repo view --json nameWithOwner`。

## 这个代码仓库的

- **基准分支与合并方式**：推荐 `origin/HEAD` 指向的分支，合并方式按最近合并的 PR。
- **worktree 准备**：新 worktree 里开工前要跑什么、端口怎么传。仓库没有这条命令，就写「无」，agent 照模板里的默认做法补依赖和配置。
- **开发服务器**：启动命令、端口怎么传、怎么判断起好了（一个 URL 或一行输出）。
- **验证命令**：类型检查、单个测试文件、全量测试、lint。推荐取自 CI 和 `package.json`。
- **已有的代码规范文档**（`CONTRIBUTING.md` 之类）：由 `CODING_STANDARDS.md` 链接过去，还是把内容搬进来。
- **GitHub App 代发评论**：要的话给 appId 和私钥文件路径，按 PR 所在的仓库配；setup 在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`，只写路径，私钥文件不打开。

## 这个业务的（知识库里还没写才问）

- **产品**（知识库根没有 `PRODUCT.md` 时）：照模板一节一节问。纯后端项目也要，访谈里的产品判断靠它。
- **issue 分类**：有哪些父类，每个父类下有没有子类；推荐从现有 label 和 issue 推出。名字里不能有 `/`（它分隔子类），比如 `UI/UX` 写成 `uiux`。
- **别的 label**：现有 label 里，状态和分类之外哪些要留（写进「保留的 label」）；还有 open issue 在用、又不留的，各迁成哪个分类，或直接去掉。
