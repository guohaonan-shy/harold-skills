---
name: setup
description: 把一个目标仓库接上 idea-loop：在 home 里建它的项目目录（项目规则文件、issue 分类、docs/ 骨架）、建 GitHub label；顺带装规则回放的 runner、每周 dreaming 和每周分拣的定时任务。每个仓库跑一次，项目配置变了再跑。
disable-model-invocation: true
---

在目标仓库的主 checkout 里跑。引导文件和 `docs/` 写进 home 里这个项目的**项目目录**（`<home>/projects/<名字>/`，`idea-loop:wiki-conventions` 的「项目目录」），代码仓库里不留 idea-loop 的文件。已有文件只补缺的小节，人写过的内容原样保留；写完用 `commit` 提交到 home。GitHub 上删 label 立刻生效，人确认过清单才删。下文 `<docs>` 指 `<项目目录>/docs/`。

idea-loop 从项目目录读这几份配置：

| 文件 | 管什么 | 模板 |
|---|---|---|
| `DEVELOPMENT.md` | 基准分支、合并方式、worktree 准备、开发服务器、清理 | [references/development.md](references/development.md) |
| `REVIEW.md` | 验证命令、review 的额外要求 | [references/review.md](references/review.md) |
| `CODING_STANDARDS.md` | 分层、文件划分、命名：代码该怎么写 | [references/coding-standards.md](references/coding-standards.md) |
| `ISSUE_TRACKER.md` | 需求从哪个平台的 issue 进来（第一个标题写 GitHub 或 Linear）：怎么读写 issue、状态是什么意思、团队用不用 triage、issue 的分类 label（`type:*`）和要保留的别的 label | GitHub：[references/issue-tracker.md](references/issue-tracker.md)；Linear：[references/issue-tracker-linear.md](references/issue-tracker-linear.md) |
| `PRODUCT.md` | 用户、产品要做成什么、品牌性格、设计原则：访谈和设计做判断的依据 | [references/product.md](references/product.md) |

## 预检

只读，逐项查，给人一张表：每项写「正常 / 缺失 / 可选未装」，缺失的附修法命令。

表的行见 [references/preflight-table.md](references/preflight-table.md)。「项目接上了吗」看项目目录，不看代码仓库根：已接上或全新项目往下走，要迁移的走「迁移」。

缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 迁移

「项目接上了吗」认出这是 0.1.x 的项目（代码仓库根里已经有 idea-loop 的引导文件，或 `docs/` 里有 `spec/` 或 `adr/`，项目目录还没有 `docs/`）：预检表照给，然后停下，把 `where` 的那句话和认出的文件清单交给人；不在代码仓库或项目目录里写任何文件，不往下走。迁移本身的步骤待补进这一节。

## home

`~/home`、当前项目的登记、三处用户级配置，按 [references/home.md](references/home.md) 做；项目目录在这一步建出来，下面的「写」往里写。

完成条件：`~/home` 在，当前项目在它的 `## 项目` 里有一行、`projects/<名字>/AGENTS.md` 在；三处用户级配置都是「已是」，或人拒绝了，或「要人处理」的项已交回。

## 探查

给「问人」的每个问题备一个推荐答案，并记下出处。要读的东西列在 [references/survey.md](references/survey.md)。

完成条件：「问人」的每个问题都有推荐答案，或写明「探查不到」。

## 问人

只问这几份文件里还没写的。每个问题给推荐答案和出处，一次最多三个，人一句「照推荐」就算确认。问题清单在 [references/questions.md](references/questions.md)。

完成条件：清单上每一项都有人确认过的答案。

## 写

- 引导文件（上表）按模板写进 `<项目目录>`。
- `<docs>` 骨架：`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`index.md`，只建不存在的。
- `.tmp/` 追加进代码仓库的 `$(git rev-parse --git-common-dir)/info/exclude`。
- 做 UI 设计时：`<项目目录>/.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- `ISSUE_TRACKER.md` 的「分类 label」一节：把人定的分类和要保留的 label 写进去，格式脚本要读，见模板里它那一节。
- **Linear 项目**（人选了 Linear）：连 MCP、选团队、整理成表给人确认再写 `ISSUE_TRACKER.md`，并跳过下面的 `issues labels` 与 `migrate`。步骤见 [references/linear-setup.md](references/linear-setup.md)。
- triage：把人对「团队用不用 triage」的回答写进 `ISSUE_TRACKER.md` 状态表后面那一行（`triage：用` 或 `triage：跳过`），模板里的「用 / 跳过」占位不算选了。
- 旧状态（GitHub 项目）：`spec.mjs check` 报了还带 `status` 行的 spec，或仓库里还有旧中文 `status:*` label 的，先跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" migrate <docs>` 只列出会怎么改，给人看，人确认后加 `--apply`。
- label（GitHub 项目），按顺序：
  1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels <docs>`：建出缺的 `status:*`、`kind:*`、`type:*` 和 `priority:*`（`priority:P0`、`priority:P1`、`priority:P2`），列出多余的 label 和各自在用的 open issue 数。
  2. 人定了要迁成分类的，对每个用着它的 issue 跑 `issues.mjs type <docs> <号> <分类>`。
  3. 把多余 label 的清单给人看，人确认后 `issues.mjs labels <docs> --prune` 删掉，issue 上的也一起去掉。
- GitHub App：在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`。只写路径，私钥文件不打开。
- 提交：给人看写过的文件（`git -C <home> status`、`diff`），然后 `node "${CLAUDE_PLUGIN_ROOT}/scripts/project-map.mjs" commit "chore: 接上 idea-loop（<名字>）" <文件>...`。

完成条件：这几份文件都在 `<项目目录>`，模板里的小节一个不缺，`project-map.mjs where` 对这个项目成功；代码仓库里没有新增的 idea-loop 文件；这些文件已 `commit`，差异给人看过；GitHub 项目的 `issues.mjs labels <docs>` 不再列出多余的 label；Linear 项目的 `ISSUE_TRACKER.md` 经人确认写好。

## 规则回放 runner

改规则的 PR 要跑回放用例时，装 runner，步骤读 [references/replay-runner.md](references/replay-runner.md)。

完成条件：`~/.idea-loop/bin/retro-replay.mjs` 在；旧的 `idea-loop-retro-replay` 计划任务和旧的队列目录都没了；允许规则已打印给人。

## 每周对账

`idea-loop:dreaming` 可以由『定时任务』每周自己跑一次。一台设备只有一个，在 home 那一步之后建，任务 id 叫 `dreaming-home`，目录是 home。步骤在 [references/weekly-dreaming.md](references/weekly-dreaming.md)。

完成条件：这台设备有一个开着的 `dreaming-home` 定时任务（已有就是已有），或人拒绝了，或记下了没建的原因。

## 每周分拣

`idea-loop:issue-triage` 可以由『定时任务』每周自己跑一次，把最早的 15 个 backlog issue 查完，按建议去向翻好状态。必须在本仓库的主 checkout 里做，任务 id 叫 `triage-<仓库名>`。步骤在 [references/weekly-triage.md](references/weekly-triage.md)。

完成条件：本仓库有一个开着的 `triage-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。

## 调度

`idea-loop:issue-dispatch` 每小时一轮、按时段交出 issue；按 [references/dispatch.md](references/dispatch.md) 建它的定时任务。

完成条件：建好了调度任务，或人拒绝了，或记下了没建的原因；允许规则打印了。

## 交回

- 写了、改了项目目录里的哪些文件，`commit` 的提交号和有没有推上去；建了、删了哪些 label，哪些 issue 迁了分类。
- 要迁移的项目：认出的文件清单。
- 预检缺的必需项，各附修法命令。
- home：建没建、登记的项目名、三处配置各是已改 / 已是 / 人拒绝 / 要人处理，备份在哪。
- 规则回放：runner 装在哪、旧计划任务和队列目录删没删、**要人自己加的允许规则**（原样一行）。没加这条规则，无人值守的回放会被拦下。
- 每周对账：设备级的 `dreaming-home` 定时任务建没建、还是已有（taskId 与时间），没建的原因（运行环境没有『定时任务』/ 人拒绝）；没建时 prompt 原样给人。
- 每周分拣：`triage-<仓库名>` 定时任务建没建（taskId 与时间），没建的原因（运行环境没有『定时任务』/ 人拒绝）；没建时 prompt 原样给人。
- 调度：`dispatch-<仓库名>` 建没建，没建的原因；要人自己加的允许规则（原样一行，不加的后果）。
- 留给人的事：安装或登录 `gh`、Codex；装浏览器和 Refero（预检的表指到各运行环境的做法）；创建 GitHub App；往 `CODING_STANDARDS.md` 里写规则。`GLOSSARY.md` 由 `idea-loop:grill` 建，`DESIGN.md` 由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
