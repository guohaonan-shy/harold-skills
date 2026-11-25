---
name: setup
description: 把一个目标仓库接上 idea-loop（项目目录、issue 分类与 label、定时任务），接完按模块问要不要接设计、SEO、评测。每个仓库跑一次，项目配置变了再跑。
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

`~/home`、项目登记、四项用户级配置读 `references/home.md`，项目目录在这一步建出来；默认运行环境、新环境的说明读 `references/runtime-env.md`。

完成条件：`~/home` 在；项目在 `## 项目` 有一行、`projects/<名字>/AGENTS.md` 在；四项各是「已是」、人拒绝或「要人处理」已交回；运行环境选过或人拒绝。

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
- `ISSUE_TRACKER.md` 的「分类 label」一节：把人确认的分类和要保留的 label 写进去，格式命令要读，见模板里它那一节。
- issue 追踪：GitHub 项目按 [references/tracker-write.md](references/tracker-write.md)（旧状态迁移、建 label 与迁分类、GitHub App）；**Linear 项目**（人选了 Linear）按 [references/linear-setup.md](references/linear-setup.md)（连 MCP、选团队、整理成表给人确认再写 `ISSUE_TRACKER.md`），不建 GitHub label。
- 提交：给人看写过的文件和差异，然后 `dyna home commit "chore: 接上 idea-loop（<名字>）" <文件>...`。

完成条件：这几份文件都在 `<项目目录>`、模板里的小节一个不缺、已 `commit` 且差异给人看过，`dyna home where` 对这个项目成功；代码仓库里没有新增的 idea-loop 文件；GitHub 项目的 `dyna issues labels <docs>` 不再列出多余的 label；Linear 项目的 `ISSUE_TRACKER.md` 经人确认写好。

## 定时任务

在 home 那一步之后逐行做，每行照它的步骤文件：

| 任务 | 建在哪 | 步骤 |
|---|---|---|
| 规则回放 runner（不是定时任务，同样一台设备一份） | 设备 | [references/replay-runner.md](references/replay-runner.md) |
| 每周对账 `dreaming-home`（`idea-loop:dreaming`） | 设备，目录是 home | [references/weekly-dreaming.md](references/weekly-dreaming.md) |
| 每周分拣 `triage-<仓库名>`（`idea-loop:issue-triage`） | 本仓库的主 checkout | [references/weekly-triage.md](references/weekly-triage.md) |
| 调度 `dispatch-home`（`idea-loop:issue-dispatch`，每 30 分钟一轮） | 设备 | [references/dispatch.md](references/dispatch.md) |

完成条件：每一行都已有、建好、人拒绝，或记下了没建的原因；runner 那行另要旧的 `idea-loop-retro-replay` 计划任务和旧队列目录都没了；要人自己加的允许规则都打印了。

## 模块

项目接完后，按模块问人要不要接，按下表的顺序一段一道题，选项「接」「以后再说」，带推荐和出处。出不出题看那个 skill 在不在本会话的 skill 清单里，不跑命令：不在就不出题，交回写一行「装了 <插件> 再跑 setup 接这段」。已接过的照样出题、推荐「接」，步骤只补缺的。

| 段 | 出题看 | 推荐「接」的依据（探查） | 答「接」照 |
|---|---|---|---|
| **设计** | `idea-loop:uiux-imagine` | 代码仓库有前端界面（页面、组件目录） | [references/design.md](references/design.md) |
| **SEO** | `idea-loop:seo-scan` | 有对外的营销站或博客 | [references/seo/steps.md](references/seo/steps.md) |
| **评测** | `ai-eval:eval-setup` | 代码里有调模型的依赖（如 `@anthropic-ai/sdk`、`openai`） | [references/eval.md](references/eval.md) |

完成条件：每个出了题的段都有人的答案；答「接」的，那段每一步的完成条件都满足，或记下了没做的原因。

## 交回

按节报，每节要报的细项见 [references/handback.md](references/handback.md)：写了什么、`commit` 与推送；预检缺的必需项（附修法）；home；定时任务（含要人自己加的允许规则，原样一行）；模块（各段接了还是「以后再说」，没装的段那一行，评测段写出的 `EVAL.md` 要人在代码仓库里提交）；留给人的事。
