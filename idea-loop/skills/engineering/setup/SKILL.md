---
name: setup
description: 把一个目标仓库配置成 idea-loop 能用的样子：根目录的项目规则文件、issue 分类、docs/ 骨架、GitHub label；顺带装夜间规则回放的 runner 和计划任务、每周 dreaming 和每周分拣的定时任务。每个仓库跑一次，项目配置变了再跑。
disable-model-invocation: true
---

在目标仓库的主 checkout 根目录跑。已有文件只补缺的小节，人写过的内容原样保留；改动留在工作区，人说提交才提交。GitHub 上删 label 是例外：它立刻生效，人确认过清单才删。

idea-loop 从这几处读项目配置：

| 文件 | 管什么 | 模板 |
|---|---|---|
| `DEVELOPMENT.md` | 基准分支、合并方式、worktree 准备、开发服务器、清理 | [references/development.md](references/development.md) |
| `REVIEW.md` | 验证命令、review 的额外要求 | [references/review.md](references/review.md) |
| `CODING_STANDARDS.md` | 分层、文件划分、命名：代码该怎么写 | [references/coding-standards.md](references/coding-standards.md) |
| `ISSUE_TRACKER.md` | 需求从哪个平台的 issue 进来（第一个标题写 GitHub 或 Linear）：怎么读写 issue、状态是什么意思、团队用不用 triage | GitHub：[references/issue-tracker.md](references/issue-tracker.md)；Linear：[references/issue-tracker-linear.md](references/issue-tracker-linear.md) |
| `AGENTS.md` 里的 `## issue 分类` 一节 | issue 的分类 label（`type:*`）和要保留的别的 label | [references/issue-types.md](references/issue-types.md) |
| `PRODUCT.md` | 用户、产品要做成什么、品牌性格、设计原则：访谈和设计做判断的依据 | [references/product.md](references/product.md) |
| `CLAUDE.md` 或 `AGENTS.md` 里的 `## idea-loop` 块 | 指向上面几份，常驻 | [references/agents-block.md](references/agents-block.md) |

## 预检

只读，逐项查，给人一张表：每项写「正常 / 缺失 / 可选未装」，缺失的附修法命令。

表的行（项、怎么查、必需与否）见 [references/preflight-table.md](references/preflight-table.md)。

缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 探查

给「问人」的每个问题备一个推荐答案，并记下出处。要读的东西（项目规则文件、CI、锁文件、合并历史、`docs/` 目录树、label 与 open issue、`spec.mjs check`、`PRODUCT.md` 等）列在 [references/survey.md](references/survey.md)。

完成条件：「问人」的每个问题都有推荐答案，或写明「探查不到」。

## 问人

只问这几份文件里还没写的。每个问题给推荐答案和出处，一次最多三个，人一句「照推荐」就算确认。问题清单（基准分支与合并方式、worktree 准备、开发服务器、验证命令、已有的规范文档、产品、知识库、UI 设计、issue 在哪个平台、GitHub App、issue 分类、别的 label）在 [references/questions.md](references/questions.md)。

完成条件：清单上每一项都有人确认过的答案。

## 写

- 这几份文件按模板写进仓库根目录。文件已存在就只补模板里它缺的小节。
- `## idea-loop` 块写进 `CLAUDE.md`；没有 `CLAUDE.md` 就写进 `AGENTS.md`；两份都没有，问人建哪份。块已存在就原地更新。
- `docs/` 骨架：人选了「仓库里的 `docs/`」才建，`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`index.md`，只建不存在的。选了仓库外的，`## idea-loop` 块里加一行「知识库：`<位置>`（仓库外，人维护）」；选了不要的，什么都不写。
- `.tmp/` 追加进 `$(git rev-parse --git-common-dir)/info/exclude`。
- 做 UI 设计时：`.gitignore` 追加 `docs/design/tmp/`；`.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- `## issue 分类` 一节照模板写进 `AGENTS.md`（没有就写进有 `## idea-loop` 块的那份）；格式脚本要读，见 [references/issue-category-format.md](references/issue-category-format.md)。
- **Linear 项目**（人选了 Linear）：连 MCP、选团队、读状态与 label 组、整理成表给人确认再写 `ISSUE_TRACKER.md`，并跳过下面的 `issues labels` 与 `migrate`。步骤见 [references/linear-setup.md](references/linear-setup.md)。
- triage：把人对「团队用不用 triage」的回答写进 `ISSUE_TRACKER.md` 状态表后面那一行（`triage：用` 或 `triage：跳过`），模板里的「用 / 跳过」占位不算选了。
- 仓库：把人对「会改到哪几个仓库」的回答填进 `ISSUE_TRACKER.md` 的「仓库」表，模板里的占位行（尖括号那行）删掉。
- 旧状态（GitHub 项目）：`spec.mjs check` 报了还带 `status` 行的 spec，或仓库里还有旧中文 `status:*` label 的，先跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" migrate docs` 只列出会怎么改，给人看，人确认后加 `--apply`。
- label（GitHub 项目），按顺序：
  1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels docs`：建出缺的 `status:*`、`kind:*`、`type:*` 和 `priority:*`（`priority:P0`、`priority:P1`、`priority:P2`），列出多余的 label 和各自在用的 open issue 数。
  2. 人定了要迁成分类的，对每个用着它的 issue 跑 `issues.mjs type docs <号> <分类>`。
  3. 把多余 label 的清单给人看，人确认后 `issues.mjs labels docs --prune` 删掉，issue 上的也一起去掉。
- GitHub App：在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`。只写路径，私钥文件不打开。

完成条件：这几份文件都在，模板里的小节一个不缺；`git diff` 给人看过；GitHub 项目的 `issues.mjs labels docs` 不再列出多余的 label；Linear 项目的 `ISSUE_TRACKER.md` 经人确认写好、状态表里每个状态名都是团队里真有的。

## 夜间规则回放

改规则的 PR 里有大的回放用例时，要装夜间回放的 runner 和计划任务，步骤读 [references/nightly-replay.md](references/nightly-replay.md)。

完成条件：`~/.idea-loop/bin/retro-replay.mjs` 在；夜间回放的计划任务已建（『定时任务』里能列出）；允许规则已打印给人。

## 每周对账

`idea-loop:dreaming` 可以由『定时任务』每周自己跑一次（人在对话里要对账时模型也会起它）。必须在本仓库的主 checkout 里做，任务 id 叫 `dreaming-<仓库名>`。步骤（没有能力时的退路、问人的选项、任务的参数、要告诉人的话）在 [references/weekly-dreaming.md](references/weekly-dreaming.md)。

完成条件：本仓库有一个开着的 `dreaming-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。

## 每周分拣

`idea-loop:issue-triage` 可以由『定时任务』每周自己跑一次，把最早的 15 个 backlog issue 查完、摆一张表等人批。必须在本仓库的主 checkout 里做，任务 id 叫 `triage-<仓库名>`。步骤在 [references/weekly-triage.md](references/weekly-triage.md)。

完成条件：本仓库有一个开着的 `triage-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。

## 调度

`idea-loop:issue-dispatch` 一轮一轮交出 todo 和 triage 的 issue，怎么起因运行环境而异；按 [references/dispatch.md](references/dispatch.md) 做。

完成条件：调度的起法告诉了人，或建好了调度任务，或人拒绝了。

## 交回

- 写了、改了哪些文件，建了、删了哪些 label，哪些 issue 迁了分类。
- 预检缺的必需项，各附修法命令。
- 知识库选了仓库外或不要的：说清 spec、设计、dreaming 这些流程只读写仓库里的 `docs/`，在这个仓库里用不了。
- 夜间回放：runner 装在哪、计划任务建没建（taskId 与时间）、**要人自己加的允许规则**（原样一行）。没加这条规则，夜里的任务会被拦下，队列里的回放不会跑。
- 每周对账：dreaming 的定时任务建没建（taskId 与时间），没建的原因（运行环境没有『定时任务』/ 人拒绝）；没建时 prompt 原样给人。
- 每周分拣：`triage-<仓库名>` 定时任务建没建（taskId 与时间），没建的原因（运行环境没有『定时任务』/ 人拒绝）；没建时 prompt 原样给人。
- 调度：怎么起、建没建（按 `references/dispatch.md`）。
- 留给人的事：安装或登录 `gh`、Codex；装浏览器和 Refero（预检的表指到各运行环境的做法）；创建 GitHub App；往 `CODING_STANDARDS.md` 里写规则。`GLOSSARY.md` 由 `idea-loop:grill` 建，`DESIGN.md` 由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
