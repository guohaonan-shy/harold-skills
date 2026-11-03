# 01 — knowledge-base.mjs：从任何 checkout 找到这个业务的知识库

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件多一个脚本 `knowledge-base.mjs`（放在插件的 `scripts/` 下，跟 `issues.mjs` 同级），所有 skill 和脚本以后都问它「知识库在哪」。spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md` 的「方案」里「每台机器怎么找到它」「一个会话怎么拿到知识库」两节，以及「实现决策」的「`.tmp/kb/` 与 `.tmp/repos/<仓库名>/`」。

概念：
- **知识库**：一个 git 仓库，根目录有 `idea-loop.json`（`{"business": "<业务>", "issues": "<owner/name>", "repos": {"<仓库名>": "<owner/name>"}}`）就是知识库。
- **指针块**：代码仓库 git 根下 `AGENTS.md`（没有这一节就看 `CLAUDE.md`）里的 `## idea-loop` 一节，有两行 ``- 业务：`<业务>` `` 和 ``- 知识库：`<owner/name>` ``（格式见 spec「代码仓库怎么指向它」）。当前 checkout 属于哪个业务只看它。
- **本机映射** `~/.idea-loop/projects.json`：`{"<业务>": {"knowledgeBase": "<知识库主 checkout 绝对路径>", "home": "<会话在哪跑的 checkout>", "repos": {"<仓库名>": "<代码仓库主 checkout 绝对路径>"}}}`，只放跟机器有关的路径。环境变量 `IDEA_LOOP_HOME` 给了就用它代替 `~/.idea-loop`（测试靠它）。
- 当前仓库的 `<仓库名>`：`origin` 的 GitHub `owner/name` 在知识库 `idea-loop.json` 的 `repos` 里对上的那个键；对不上就取 `origin` 的仓库名（不带 owner）。

子命令（都在当前目录上算，也接受 `--cwd <dir>`）：

| 子命令 | 输出 |
|---|---|
| `root` | 当前 checkout 是知识库（git 根有 `idea-loop.json`）→ 它的 git 根；当前 git 根下 `.tmp/kb/` 是知识库 → 它；否则 → 业务的 `knowledgeBase` |
| `root --write` | 当前 checkout 是知识库 → 它的 git 根；否则保证 `<当前 git 根>/.tmp/kb/` 是知识库的 worktree、分支名同当前分支（先 `git worktree prune`；分支本地或远端已存在就用它，否则从知识库 `origin` 的默认分支开），输出它 |
| `worktree <仓库名>` | 保证 `<当前 git 根>/.tmp/repos/<仓库名>/` 是那个代码仓库（映射里的路径）的 worktree、分支同当前分支，输出它 |
| `business` | JSON：`{business, knowledgeBase, home, repos: {<仓库名>: {path, github}}}`，`github` 取自知识库 `idea-loop.json` 的 `repos` |

查不到时退出码 1：不在 git 仓库里或没有指针块，stderr 写「这个仓库还没配进任何业务：跑 /idea-loop:setup」；有指针块、本机映射里没有这个业务（或路径不存在），写「这台机器还没 clone 知识库 <owner/name>：跑 /idea-loop:setup」。

> 人的决定（2026-11-03，#220 会话转达）：「我倾向于仓库的agent.md仍然维护，但是知识库可以一个指针指向对应的地方即可～」——业务归属改读代码仓库 `AGENTS.md` 的指针块，`projects.json` 只留跟机器有关的项。

脚本同时导出这些逻辑的函数，供 `issues.mjs`、设计档案 MCP 复用（如 `knowledgeBaseRoot(cwd)`、`readBusinessConfig(kbRoot)`）。

> 人的决定（2026-11-03）：「我觉得DEVELOPMENT.md、REVIEW.md、CODING_STANDARDS.md 这些仍然放在project 纬度吧，之后再考虑将一部分通用的内容拆分到业务这块。」——仓库级设置留在代码仓库，知识库里没有 `repos/<仓库名>/`，不做 `repo` 子命令。

## 验收标准
- [x] 单元测试在临时目录建真 git 仓库：代码仓库 `app`（`AGENTS.md` 带指针块；主 checkout + 分支 `feature/x` 的 worktree）、知识库 `biz-kb`（带 `idea-loop.json`、有 `origin` 远端）、`IDEA_LOOP_HOME` 下的 `projects.json`
- [x] 在 `app` 的 worktree 里：`root` → `biz-kb` 主 checkout；`root --write` → `<worktree>/.tmp/kb`，且它是 `biz-kb` 的 `feature/x` 分支；之后 `root` → `.tmp/kb`
- [x] `root --write` 再跑一次不报错、输出同一路径（幂等）；`.tmp/kb` 被删掉后再跑能重开（靠 prune）
- [x] 在 `biz-kb` 的主 checkout 或它的任一 worktree 里：`root` 和 `root --write` 都输出那个 checkout 的 git 根
- [x] 业务里配了第二个仓库 `api` 时，`worktree api` 在 `app` 的 worktree 里开出 `.tmp/repos/api`，是 `api` 的 `feature/x` 分支
- [x] `business` 输出的 JSON 含业务名、知识库、home、每个仓库的本机路径与 GitHub 名
- [x] `app` 没有指针块时，`root` 退出码 1，stderr 含 `/idea-loop:setup`
- [x] 有指针块、`projects.json` 里没有这个业务时，`root` 退出码 1，stderr 含知识库的 GitHub 名和 `/idea-loop:setup`
- [x] 指针块在 `CLAUDE.md` 而 `AGENTS.md` 没有这一节时也认得
- [x] 插件全量 `node --test idea-loop/scripts/` 全绿
- [x] review 第 1 轮 S2（2026-11-03）：`root --write` 时 `.tmp/kb/` 已经存在但不在跟当前分支同名的分支上（会话从审核换到实现、切了新分支），要把它切到同名分支（本地或远端有就用，没有就从知识库 origin 默认分支开）；切不过去（有未提交改动）就报错退出、不改东西。单元测试复现：先在分支 A 上 `root --write`，代码 worktree 切到分支 B 再跑，`.tmp/kb` 在 B 上

## 选中的存量回归
无：新脚本，不碰已有脚本。
