---
name: setup
description: 把一个目标仓库接上 idea-loop（项目目录、issue 分类与 label、定时任务），接完按模块问要不要接 SEO。每个仓库跑一次，项目配置变了再跑。
disable-model-invocation: true
---

目标：目标仓库接上 idea-loop，配置落在 home 里的项目目录。在目标仓库的主 checkout 里跑。引导文件和 `docs/` 写进 home 里这个项目的**项目目录**（`<home>/projects/<名字>/`，`idea-loop:wiki-conventions` 的「项目目录」），代码仓库里不留 idea-loop 的文件。已有文件只补缺的小节，人写过的内容原样保留；写完 `commit` 到 home。删 label 立刻生效，人确认过清单才删。下文 `<docs>` 指 `<项目目录>/docs/`。

idea-loop 从项目目录读这几份配置：

| 文件 | 管什么 | 模板 |
|---|---|---|
| `DEVELOPMENT.md` | 基准分支、合并方式、worktree 准备、开发服务器、清理 | [references/development.md](references/development.md) |
| `REVIEW.md` | 验证命令、review 的额外要求 | [references/review.md](references/review.md) |
| `CODING_STANDARDS.md` | 分层、文件划分、命名：代码该怎么写 | [references/coding-standards.md](references/coding-standards.md) |
| `ISSUE_TRACKER.md` | 需求从哪个平台的 issue 进来（第一个标题写 GitHub 或 Linear）：怎么读写 issue、状态含义、团队用不用 triage、分类 label（`type:*`）和要保留的别的 label | GitHub：[references/issue-tracker.md](references/issue-tracker.md)；Linear：[references/issue-tracker-linear.md](references/issue-tracker-linear.md) |
| `PRODUCT.md` | 用户、产品要做成什么、品牌性格、设计原则：访谈和设计做判断的依据 | [references/product.md](references/product.md) |

## 预检

只读，逐项查（行见 [references/preflight-table.md](references/preflight-table.md)），给人一张表：每项写「正常 / 缺失 / 可选未装」，缺失的附修法命令。「项目接上了吗」看项目目录，不看代码仓库根：已接上或全新项目往下走，要迁移的走「迁移」。缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 迁移

预检认出这是 0.1.x 的项目（判定见预检表）：预检表照给，然后停下，把 `where` 的那句话和认出的文件清单交给人；不在代码仓库或项目目录里写任何文件，不往下走。迁移本身的步骤待补进这一节。

## home

`~/home`、当前项目的登记、三处用户级配置，按 [references/home.md](references/home.md) 做；项目目录在这一步建出来，下面的「写」往里写。

完成条件：`~/home` 在，当前项目在它的 `## 项目` 里有一行、`projects/<名字>/AGENTS.md` 在；三处用户级配置都是「已是」，或人拒绝了，或「要人处理」的项已交回。

## 探查

读 [references/survey.md](references/survey.md) 列的东西，给「问人」的每个问题备一个推荐答案并记下出处。

完成条件：「问人」的每个问题都有推荐答案，或写明「探查不到」。

## 问人

照 [references/questions.md](references/questions.md) 的清单，只问这几份文件里还没写的；每个问题给推荐答案和出处，一次最多三个，人一句「照推荐」就算确认。

完成条件：清单上每一项都有人确认过的答案。

## 写

- 引导文件（上表）按模板写进 `<项目目录>`。
- `<docs>` 骨架：`spec/`、`adr/`、`design/`、`raw/`、`domain/`、`index.md`，只建不存在的。
- `.tmp/` 追加进代码仓库的本地排除文件（所有 worktree 共用的 `info/exclude`，不进 `.gitignore`）。
- 做 UI 设计时：`<项目目录>/.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。
- `ISSUE_TRACKER.md` 的「分类 label」一节：把人确认的分类和要保留的 label 写进去，格式命令要读，见模板里它那一节。
- issue 追踪：GitHub 项目按 [references/tracker-write.md](references/tracker-write.md)（旧状态迁移、建 label 与迁分类、GitHub App）；**Linear 项目**（人选了 Linear）按 [references/linear-setup.md](references/linear-setup.md)（连 MCP、选团队、整理成表给人确认再写 `ISSUE_TRACKER.md`），不建 GitHub label。
- 提交：给人看写过的文件和差异，然后 `dyna home commit "chore: 接上 idea-loop（<名字>）" <文件>...`。

完成条件：这几份文件都在 `<项目目录>`、模板里的小节一个不缺、已 `commit` 且差异给人看过，`dyna home where` 对这个项目成功；代码仓库里没有新增的 idea-loop 文件；GitHub 项目的 `dyna issues labels <docs>` 不再列出多余的 label；Linear 项目的 `ISSUE_TRACKER.md` 经人确认写好。

## 规则回放 runner

改规则的 PR 要跑回放用例时装 runner，步骤读 [references/replay-runner.md](references/replay-runner.md)。

完成条件：`~/.idea-loop/bin/retro-replay.mjs` 在；旧的 `idea-loop-retro-replay` 计划任务和旧的队列目录都没了；允许规则已打印给人。

## 每周对账

`idea-loop:dreaming` 由『定时任务』每周自己跑一次。一台设备只有一个，在 home 那一步之后建，任务 id `dreaming-home`，目录是 home。步骤在 [references/weekly-dreaming.md](references/weekly-dreaming.md)。

完成条件：这台设备有一个开着的 `dreaming-home` 定时任务（已有就是已有），或人拒绝了，或记下了没建的原因。

## 每周分拣

`idea-loop:issue-triage` 由『定时任务』每周自己跑一次，查完最早的 15 个 backlog issue、按建议去向翻好状态。在本仓库的主 checkout 里建，任务 id `triage-<仓库名>`。步骤在 [references/weekly-triage.md](references/weekly-triage.md)。

完成条件：本仓库有一个开着的 `triage-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。

## 调度

`idea-loop:issue-dispatch` 整台设备一个（`dispatch-home`），每 30 分钟一轮、按时段交出各项目的 issue；这台设备有没有 `dispatch-home`，按 [references/dispatch.md](references/dispatch.md) 查和建。

完成条件：报了已有的 `dispatch-home`，或建好了，或人拒绝了，或记下了没建的原因；允许规则打印了。

## 模块

项目接完后，按模块问人要不要接，每个模块一道题，选项「接」「以后再说」。现在只有一个模块：

- **SEO**：把站点接进 seo 分类（`SEO.md`、OpenSEO 项目上下文、issue 分类、AI 可见性跟踪、每天扫描）。答「接」：步骤读 [references/seo/steps.md](references/seo/steps.md)。

完成条件：每个模块都有人的答案；答「接」的，该模块每一步的完成条件都满足，或记下了没做的原因。

## 交回

- 写了、改了项目目录里的哪些文件，`commit` 的提交号和有没有推上去；建了、删了哪些 label，哪些 issue 迁了分类。
- 预检缺的必需项（各附修法命令）；要迁移的项目，认出的文件清单。
- home：建没建、登记的项目名、三处配置各是已改 / 已是 / 人拒绝 / 要人处理，备份在哪。
- 规则回放：runner 装在哪、旧计划任务和队列目录删没删、**要人自己加的允许规则**（原样一行）。没加这条规则，无人值守的回放会被拦下。
- 每周对账（设备级的 `dreaming-home`）、每周分拣（`triage-<仓库名>`）、调度（设备级的 `dispatch-home`）：各自建没建（taskId 与时间）或已有；没建的原因（运行环境没有『定时任务』/ 人拒绝），prompt 原样给人；调度另附要人自己加的允许规则（原样一行，不加的后果）。
- SEO 模块：接了还是「以后再说」；接了的，按 [references/seo/steps.md](references/seo/steps.md) 的「交回」并进来。
- 留给人的事：装或登录 `gh`、Codex；装浏览器、登录 Mobbin（做法见预检表）；创建 GitHub App；往 `CODING_STANDARDS.md` 里写规则。`GLOSSARY.md` 由 `idea-loop:grill` 建，`DESIGN.md` 由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
