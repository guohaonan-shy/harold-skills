# 01 — knowledge-base.mjs：从任何 checkout 找到这个业务的知识库

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件多一个脚本 `knowledge-base.mjs`（放在插件的 `scripts/` 下，跟 `issues.mjs` 同级），所有 skill 和脚本以后都问它「知识库在哪」。spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md` 的「方案」里「每台机器怎么找到它」「一个会话怎么拿到知识库」两节，以及「实现决策」的「`.tmp/kb/` 与 `.tmp/repos/<仓库名>/`」。

概念：
- **知识库**：一个 git 仓库，根目录有 `idea-loop.json`（`{"business": "<业务>", "issues": "<owner/name>", "repos": {"<仓库名>": "<owner/name>"}}`）就是知识库。
- **本机映射** `~/.idea-loop/projects.json`：`{"<业务>": {"knowledgeBase": "<知识库主 checkout 绝对路径>", "home": "<会话在哪跑的 checkout>", "repos": {"<仓库名>": "<代码仓库主 checkout 绝对路径>"}}}`。环境变量 `IDEA_LOOP_HOME` 给了就用它代替 `~/.idea-loop`（测试靠它）。
- 当前 checkout 属于哪个业务：取它的主 checkout（`git rev-parse --path-format=absolute --git-common-dir` 的上一层），在映射里找等于某业务 `knowledgeBase` 或 `repos` 里某个路径的那一项。

子命令（都在当前目录上算，也接受 `--cwd <dir>`）：

| 子命令 | 输出 |
|---|---|
| `root` | 当前 checkout 是知识库（git 根有 `idea-loop.json`）→ 它的 git 根；当前 git 根下 `.tmp/kb/` 是知识库 → 它；否则 → 业务的 `knowledgeBase` |
| `root --write` | 当前 checkout 是知识库 → 它的 git 根；否则保证 `<当前 git 根>/.tmp/kb/` 是知识库的 worktree、分支名同当前分支（先 `git worktree prune`；分支本地或远端已存在就用它，否则从知识库 `origin` 的默认分支开），输出它 |
| `repo [<仓库名>]` | `<root 的输出>/repos/<仓库名>`，不给仓库名就是当前 checkout 那个仓库（映射里路径对上的那个名字）；当前 checkout 是知识库且没给名字时报错 |
| `worktree <仓库名>` | 保证 `<当前 git 根>/.tmp/repos/<仓库名>/` 是那个代码仓库（映射里的路径）的 worktree、分支同当前分支，输出它 |
| `business` | JSON：`{business, knowledgeBase, home, repos: {<仓库名>: {path, github}}}`，`github` 取自知识库 `idea-loop.json` 的 `repos` |

查不到业务（映射文件不存在、没有匹配项、不在 git 仓库里）：stderr 写「这个仓库还没配进任何业务（~/.idea-loop/projects.json 里找不到 <主 checkout>）：跑 /idea-loop:setup」，退出码 1。

脚本同时导出这些逻辑的函数，供 `issues.mjs`、设计档案 MCP 复用（如 `knowledgeBaseRoot(cwd)`、`readBusinessConfig(kbRoot)`）。

## 验收标准
- [ ] 单元测试在临时目录建真 git 仓库：代码仓库 `app`（主 checkout + 分支 `feature/x` 的 worktree）、知识库 `biz-kb`（带 `idea-loop.json`、有 `origin` 远端）、`IDEA_LOOP_HOME` 下的 `projects.json`
- [ ] 在 `app` 的 worktree 里：`root` → `biz-kb` 主 checkout；`root --write` → `<worktree>/.tmp/kb`，且它是 `biz-kb` 的 `feature/x` 分支；之后 `root` → `.tmp/kb`
- [ ] `root --write` 再跑一次不报错、输出同一路径（幂等）；`.tmp/kb` 被删掉后再跑能重开（靠 prune）
- [ ] 在 `biz-kb` 的主 checkout 或它的任一 worktree 里：`root` 和 `root --write` 都输出那个 checkout 的 git 根
- [ ] `repo` 在 `app` 里输出 `<root>/repos/app`；`repo api` 输出 `<root>/repos/api`
- [ ] 业务里配了第二个仓库 `api` 时，`worktree api` 在 `app` 的 worktree 里开出 `.tmp/repos/api`，是 `api` 的 `feature/x` 分支
- [ ] `business` 输出的 JSON 含业务名、知识库、home、每个仓库的本机路径与 GitHub 名
- [ ] `projects.json` 里没有 `app` 时，`root` 退出码 1，stderr 含 `/idea-loop:setup`
- [ ] 插件全量 `node --test idea-loop/scripts/` 全绿

## 选中的存量回归
无：新脚本，不碰已有脚本。
