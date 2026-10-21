---
name: setup
description: 把一个目标仓库配置成 idea-loop 能用的样子：根目录的项目规则文件、docs/ 骨架、GitHub label。每个仓库跑一次，项目配置变了再跑。
disable-model-invocation: true
---

在目标仓库的主 checkout 根目录跑。已有文件只补缺的小节，人写过的内容原样保留；改动留在工作区，人说提交才提交。

idea-loop 的其他 skill 和 agent 只从这几处读项目配置，缺了就停下让人跑这个 skill：

| 文件 | 管什么 | 模板 |
|---|---|---|
| `DEVELOPMENT.md` | 基准分支、合并方式、worktree 准备、开发服务器、清理 | [references/development.md](references/development.md) |
| `REVIEW.md` | 验证命令、review 的额外要求 | [references/review.md](references/review.md) |
| `CODING_STANDARDS.md` | 分层、文件划分、命名——代码该怎么写 | [references/coding-standards.md](references/coding-standards.md) |
| `ISSUE_TRACKER.md` | 需求从 GitHub issue 进来：怎么读写 issue、`status:*` label 怎么跟着 spec 走 | [references/issue-tracker.md](references/issue-tracker.md) |
| `PRODUCT.md` | 用户、产品要做成什么、品牌性格、设计原则——访谈和设计做判断的依据 | [references/product.md](references/product.md) |
| `CLAUDE.md` 或 `AGENTS.md` 里的 `## idea-loop` 块 | 指向上面几份，常驻 | [references/agents-block.md](references/agents-block.md) |

## 1 预检

只读，逐项查，给人一张表：每项写「正常 / 缺失 / 可选未装」，缺失的附修法命令。

| 项 | 怎么查 | 谁要用 |
|---|---|---|
| git 仓库与 `origin` | `git remote get-url origin` | 全部 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 基准分支的推荐值 |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | issue-dispatch、implement、pr-review |
| Codex companion | 照 [`agents/pr-reviewer.md`](../../../agents/pr-reviewer.md) 第 2 节第 3 步的找法 | pr-review |
| Refero MCP | 这个会话里有没有 `mcp__refero__*` 工具 | uiux-research，可选 |

缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 2 探查

读这些，给第 3 步的每个问题备一个推荐答案，并记下出处：

- `CLAUDE.md`、`AGENTS.md`、`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`ISSUE_TRACKER.md`、`CONTRIBUTING.md`、`README`
- CI 配置（`.github/workflows/`）、`package.json` 的 scripts、锁文件、`.worktreeinclude`
- `git log --merges -20 --oneline` 和最近合并的 PR（`gh pr list --state merged --limit 10`），看合并方式
- `docs/` 目录树、`.gitignore`、`.gitattributes`
- `GLOSSARY.md`、`DESIGN.md`、`PRODUCT.md` 在不在；没有 `PRODUCT.md` 的，从 `README`、落地页文案、产品里现有的界面推出它每一节的推荐答案

完成条件：第 3 步的每个问题都有推荐答案，或写明「探查不到」。

## 3 问人

只问这几份文件里还没写的。每个问题给推荐答案和出处，一次最多三个，人一句「照推荐」就算确认。

- **基准分支与合并方式**：推荐 `origin/HEAD` 指向的分支，合并方式按最近合并的 PR。
- **worktree 准备**：新 worktree 里开工前要跑什么、端口怎么传。仓库没有这条命令，就写「无」，执行方照默认做法补依赖和配置。
- **开发服务器**：启动命令、端口怎么传、怎么判断起好了（一个 URL 或一行输出）。
- **验证命令**：类型检查、单个测试文件、全量测试、lint。推荐取自 CI 和 `package.json`。
- **已有的代码规范文档**（`CONTRIBUTING.md`、`docs/reference/` 之类）：由 `CODING_STANDARDS.md` 链接过去，还是把内容搬进来。
- **产品**（没有 `PRODUCT.md` 时）：界面类型、用户、产品要做成什么、品牌性格、反面参照、设计原则、无障碍，照模板一节一节问。纯后端项目也要：访谈里的产品判断靠它。
- **做不做 UI 设计**：做的话一起配设计档案的忽略规则和 LFS。
- **GitHub App 代发评论**：要的话给 appId 和私钥文件路径。

完成条件：上面每一项都有人确认过的答案。

## 4 写

- 这几份文件按模板写进仓库根目录。文件已存在就只补模板里它缺的小节。
- `## idea-loop` 块写进 `CLAUDE.md`；没有 `CLAUDE.md` 就写进 `AGENTS.md`；两份都没有，问人建哪份。块已存在就原地更新。
- `docs/` 骨架：`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`index.md`，只建不存在的。
- `.tmp/` 追加进 `$(git rev-parse --git-common-dir)/info/exclude`。
- 做 UI 设计时：`.gitignore` 追加 `docs/design/tmp/`；`.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- label：`node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels docs`，建出缺的 `status:*`。
- GitHub App：在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`。只写路径，私钥文件不打开。

完成条件：这几份文件都在，模板里的小节一个不缺；`git diff` 给人看过。

## 5 交回

- 写了、改了哪些文件，建了哪些 label。
- 第 1 步缺的必需项，各附修法命令。
- 留给人的事：安装或登录 `gh`、Codex、Refero；创建 GitHub App；往 `CODING_STANDARDS.md` 里写规则。`GLOSSARY.md` 由 `grill` 建，`DESIGN.md` 由 `uiux-imagine` 或 `dreaming` 建。
