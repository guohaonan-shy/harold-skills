---
name: setup
description: 把一个目标仓库配置成 idea-loop 能用的样子：根目录的项目规则文件、issue 分类、docs/ 骨架、GitHub label。每个仓库跑一次，项目配置变了再跑。
disable-model-invocation: true
---

在目标仓库的主 checkout 根目录跑。已有文件只补缺的小节，人写过的内容原样保留；改动留在工作区，人说提交才提交。GitHub 上删 label 是例外：它立刻生效，人确认过清单才删。

idea-loop 从这几处读项目配置：

| 文件 | 管什么 | 模板 |
|---|---|---|
| `DEVELOPMENT.md` | 基准分支、合并方式、worktree 准备、开发服务器、清理 | [references/development.md](references/development.md) |
| `REVIEW.md` | 验证命令、review 的额外要求 | [references/review.md](references/review.md) |
| `CODING_STANDARDS.md` | 分层、文件划分、命名：代码该怎么写 | [references/coding-standards.md](references/coding-standards.md) |
| `ISSUE_TRACKER.md` | 需求从 GitHub issue 进来：怎么读写 issue、`status:*` label 是什么意思 | [references/issue-tracker.md](references/issue-tracker.md) |
| `AGENTS.md` 里的 `## issue 分类` 一节 | issue 的分类 label（`type:*`）和要保留的别的 label | [references/issue-types.md](references/issue-types.md) |
| `PRODUCT.md` | 用户、产品要做成什么、品牌性格、设计原则：访谈和设计做判断的依据 | [references/product.md](references/product.md) |
| `CLAUDE.md` 或 `AGENTS.md` 里的 `## idea-loop` 块 | 指向上面几份，常驻 | [references/agents-block.md](references/agents-block.md) |

## 预检

只读，逐项查，给人一张表：每项写「正常 / 缺失 / 可选未装」，缺失的附修法命令。

| 项 | 怎么查 | 必需 |
|---|---|---|
| git 仓库与 `origin` | `git remote get-url origin` | 是 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 是（基准分支的推荐值从这里来） |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | 是 |
| Codex companion | `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"` 退出码 0 | 是（review 用） |
| Playwright MCP | `claude mcp get playwright`：用户级，参数带 `--headless --isolated`；修法 `claude mcp add --scope user playwright -- npx -y @playwright/mcp --headless --isolated` | 是 |
| Refero MCP | `claude mcp get refero`：用户级、http、`https://api.refero.design/mcp`；token 由人自己配，修法 `claude mcp add --scope user --transport http refero https://api.refero.design/mcp --header "Authorization: Bearer <token>"` | 可选（设计调研用） |

缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 探查

读这些，给「问人」的每个问题备一个推荐答案，并记下出处：

- `CLAUDE.md`、`AGENTS.md`、`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`ISSUE_TRACKER.md`、`CONTRIBUTING.md`、`README`
- CI 配置（`.github/workflows/`）、`package.json` 的 scripts、锁文件、`.worktreeinclude`
- `git log --merges -20 --oneline` 和最近合并的 PR（`gh pr list --state merged --limit 10`），看合并方式
- `docs/` 目录树、`.gitignore`、`.gitattributes`
- `gh label list --limit 500` 和 open issue 上的 label（`gh issue list --state open --limit 500 --json number,labels`）：哪些 label 在用、用在什么 issue 上，推出分类和要保留的 label
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" check docs`：报了旧状态的，要迁移
- `GLOSSARY.md`、`DESIGN.md`、`PRODUCT.md` 在不在；没有 `PRODUCT.md` 的，从 `README`、落地页文案、产品里现有的界面推出它每一节的推荐答案

完成条件：「问人」的每个问题都有推荐答案，或写明「探查不到」。

## 问人

只问这几份文件里还没写的。每个问题给推荐答案和出处，一次最多三个，人一句「照推荐」就算确认。

- **基准分支与合并方式**：推荐 `origin/HEAD` 指向的分支，合并方式按最近合并的 PR。
- **worktree 准备**：新 worktree 里开工前要跑什么、端口怎么传。仓库没有这条命令，就写「无」，agent 照模板里的默认做法补依赖和配置。
- **开发服务器**：启动命令、端口怎么传、怎么判断起好了（一个 URL 或一行输出）。
- **验证命令**：类型检查、单个测试文件、全量测试、lint。推荐取自 CI 和 `package.json`。
- **已有的代码规范文档**（`CONTRIBUTING.md`、`docs/reference/` 之类）：由 `CODING_STANDARDS.md` 链接过去，还是把内容搬进来。
- **产品**（没有 `PRODUCT.md` 时）：照模板一节一节问。纯后端项目也要，访谈里的产品判断靠它。
- **做不做 UI 设计**：做的话一起配设计档案的忽略规则和 LFS。
- **GitHub App 代发评论**：要的话给 appId 和私钥文件路径。
- **issue 分类**：有哪些父类，每个父类下有没有子类；推荐从现有 label 和 issue 推出。名字里不能有 `/`（它分隔子类），比如 `UI/UX` 写成 `uiux`。
- **别的 label**：现有 label 里，状态和分类之外哪些要留（写进「保留的 label」）；还有 open issue 在用、又不留的，各迁成哪个分类，或直接去掉。

完成条件：上面每一项都有人确认过的答案。

## 写

- 这几份文件按模板写进仓库根目录。文件已存在就只补模板里它缺的小节。
- `## idea-loop` 块写进 `CLAUDE.md`；没有 `CLAUDE.md` 就写进 `AGENTS.md`；两份都没有，问人建哪份。块已存在就原地更新。
- `docs/` 骨架：`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`index.md`，只建不存在的。
- `.tmp/` 追加进 `$(git rev-parse --git-common-dir)/info/exclude`。
- 做 UI 设计时：`.gitignore` 追加 `docs/design/tmp/`；`.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- `## issue 分类` 一节照模板写进 `AGENTS.md`；没有 `AGENTS.md`，写进有 `## idea-loop` 块的那份。脚本照格式读它：父类、子类各一行，名字放反引号里，后面「：」接说明，子类缩进两格；「保留的 label」一行列出别的要留的 label，名字放反引号里；这一节到下一个 `##` 标题为止。父类说明末尾的「（独立队列，上限 N）」让这个分类的 issue 在调度里单独排队、最多同时开 N 个会话；已有的括注原样保留，新加只在人要求时（`seo-setup` 会给 `seo` 加）。
- 旧状态：`check` 报了旧状态的，照 `idea-loop:spec-status` 的「从旧状态机迁移」迁。
- label，按顺序：
  1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels docs`：建出缺的 `status:*` 和 `type:*`，列出多余的 label 和各自在用的 open issue 数。
  2. 人定了要迁成分类的，对每个用着它的 issue 跑 `issues.mjs type docs <号> <分类>`。
  3. 把多余 label 的清单给人看，人确认后 `issues.mjs labels docs --prune` 删掉，issue 上的也一起去掉。
- GitHub App：在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`。只写路径，私钥文件不打开。

完成条件：这几份文件都在，模板里的小节一个不缺；`git diff` 给人看过；`issues.mjs labels docs` 不再列出多余的 label。

## 交回

- 写了、改了哪些文件，建了、删了哪些 label，哪些 issue 迁了分类。
- 预检缺的必需项，各附修法命令。
- 怎么起调度：在主 checkout 开一个固定的会话，敲 `/idea-loop:issue-dispatch 30m`（间隔照需要改）。
- 留给人的事：安装或登录 `gh`、Codex；在用户级配 Playwright 和 Refero（命令见预检的表）；创建 GitHub App；往 `CODING_STANDARDS.md` 里写规则。`GLOSSARY.md` 由 `idea-loop:grill` 建，`DESIGN.md` 由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
