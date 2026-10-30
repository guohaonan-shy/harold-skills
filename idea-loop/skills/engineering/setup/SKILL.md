---
name: setup
description: 把一个目标仓库配置成 idea-loop 能用的样子：根目录的项目规则文件、issue 分类、docs/ 骨架、GitHub label；顺带装夜间规则回放的 runner 和计划任务、每周 dreaming 的定时任务、issue 整合的 cloud 定时任务。每个仓库跑一次，项目配置变了再跑。
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

表的行（项、怎么查、必需与否）见 [references/preflight-table.md](references/preflight-table.md)。

缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 探查

给「问人」的每个问题备一个推荐答案，并记下出处。要读的东西（项目规则文件、CI、锁文件、合并历史、`docs/` 目录树、label 与 open issue、`spec-status.mjs check`、`PRODUCT.md` 等）列在 [references/survey.md](references/survey.md)。

完成条件：「问人」的每个问题都有推荐答案，或写明「探查不到」。

## 问人

只问这几份文件里还没写的。每个问题给推荐答案和出处，一次最多三个，人一句「照推荐」就算确认。问题清单（基准分支与合并方式、worktree 准备、开发服务器、验证命令、已有的规范文档、产品、UI 设计、GitHub App、issue 分类、别的 label）在 [references/questions.md](references/questions.md)。

完成条件：清单上每一项都有人确认过的答案。

## 写

- 这几份文件按模板写进仓库根目录。文件已存在就只补模板里它缺的小节。
- `## idea-loop` 块写进 `CLAUDE.md`；没有 `CLAUDE.md` 就写进 `AGENTS.md`；两份都没有，问人建哪份。块已存在就原地更新。
- `docs/` 骨架：`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`index.md`，只建不存在的。
- `.tmp/` 追加进 `$(git rev-parse --git-common-dir)/info/exclude`。
- 做 UI 设计时：`.gitignore` 追加 `docs/design/tmp/`；`.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- `## issue 分类` 一节照模板写进 `AGENTS.md`（没有就写进有 `## idea-loop` 块的那份）；格式脚本要读，见 [references/issue-category-format.md](references/issue-category-format.md)。
- 旧状态：`check` 报了旧状态的，跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" migrate docs`。
- label，按顺序：
  1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels docs`：建出缺的 `status:*` 和 `type:*`，列出多余的 label 和各自在用的 open issue 数。
  2. 人定了要迁成分类的，对每个用着它的 issue 跑 `issues.mjs type docs <号> <分类>`。
  3. 把多余 label 的清单给人看，人确认后 `issues.mjs labels docs --prune` 删掉，issue 上的也一起去掉。
- GitHub App：在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`。只写路径，私钥文件不打开。

完成条件：这几份文件都在，模板里的小节一个不缺；`git diff` 给人看过；`issues.mjs labels docs` 不再列出多余的 label。

## 夜间规则回放

改规则的 PR 里有大的回放用例时，要装夜间回放的 runner 和计划任务，步骤读 [references/nightly-replay.md](references/nightly-replay.md)。

完成条件：`~/.idea-loop/bin/retro-replay.mjs` 在；计划任务在 `list_scheduled_tasks` 里；允许规则已打印给人。

## 每周对账

`/idea-loop:dreaming` 可以由桌面 app 的定时任务每周自己跑一次（只由人或这个任务触发）。必须在本仓库的主 checkout 里做，任务 id 叫 `dreaming-<仓库名>`。步骤（没有工具时的退路、问人的选项、`create_scheduled_task` 的参数、要告诉人的话）在 [references/weekly-dreaming.md](references/weekly-dreaming.md)。

完成条件：本仓库有一个开着的 `dreaming-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。

## 整合定时任务

一个跑在 Claude cloud 上的定时任务（claude.ai/code/routines；每次运行是一个会话，列在桌面 app 侧边栏的 Scheduled 组），每 6 小时把开着的、改同一个文件或同一个页面 / 模块的待验证 issue 挂到一个根 issue 下。规则全在任务的 prompt 里：[references/consolidation-prompt.md](references/consolidation-prompt.md)，建任务时原样写进去，`<仓库>` 换成目标仓库。

1. 打印 `https://github.com/apps/claude/installations/new`，说明**只装在要整合的这个仓库上**，这一步只能人在 GitHub 上点，等人说装好。
2. 用 `RemoteTrigger` 建 cloud 定时任务：cron `7 */6 * * *`（按 UTC 读，偏开整点），仓库是目标仓库，prompt 是上面那份。
3. 建完清掉任务上挂的全部连接器：新建的任务默认挂上账号在 claude.ai 上连的所有连接器，这个任务一个都不用。
4. 「Run now」跑一次冒烟，告诉人去侧边栏 Scheduled 组看那次运行的会话、核对合并结果。
5. 没有 `RemoteTrigger`，或人拒绝：把 prompt 和以上设置原样给人，这一步记「未做」及原因。

完成条件：任务建好且连接器清空、冒烟跑过，或记下了「未做」的原因。

## 交回

- 写了、改了哪些文件，建了、删了哪些 label，哪些 issue 迁了分类。
- 预检缺的必需项，各附修法命令。
- 夜间回放：runner 装在哪、计划任务建没建（taskId 与时间）、**要人自己加的允许规则**（原样一行）。没加这条规则，夜里的任务会被拦下，队列里的回放不会跑。
- 每周对账：dreaming 的定时任务建没建（taskId 与时间），没建的原因（不在桌面 app / 人拒绝）；没建时 prompt 原样给人。
- 整合任务：建没建（任务 id、cron）、连接器清没清、冒烟跑没跑；没建时 prompt 与设置原样给人。
- 怎么起调度：在主 checkout 开一个固定的会话，敲 `/idea-loop:issue-dispatch 30m`（间隔照需要改）。
- 留给人的事：安装或登录 `gh`、Codex；在用户级配 Playwright 和 Refero（命令见预检的表）；创建 GitHub App；往 `CODING_STANDARDS.md` 里写规则。`GLOSSARY.md` 由 `idea-loop:grill` 建，`DESIGN.md` 由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
