---
name: setup
description: 把一个代码仓库配进一个业务的 idea-loop：问清业务与知识库，业务级设置和 spec、设计档案写进知识库，仓库级开发设置留在代码仓库，AGENTS.md 里放指向知识库的指针；老项目（docs/ 还在代码仓库里）带它迁到知识库；GitHub label；顺带装夜间规则回放的 runner 和计划任务、每周 dreaming 的定时任务、issue 整合的 cloud 定时任务。每个仓库跑一次，配置变了再跑。
disable-model-invocation: true
---

在目标代码仓库的主 checkout 根目录跑。已有文件只补缺的小节，人写过的内容原样保留。代码仓库的改动留在工作区，人说提交才提交；知识库的改动先给人看 `git diff`，人说提交才提交并推到知识库主分支。GitHub 上建仓库、删 label 立刻生效，先把命令或清单给人看，人说做才做。

一个业务一个知识库（自己的 git 仓库，几个代码仓库共用）。配置分在这几处：

| 文件 | 在哪 | 管什么 | 模板 |
|---|---|---|---|
| `DEVELOPMENT.md` | 代码仓库根目录 | 分支、合并方式、worktree 准备、开发服务器 | [development.md](references/development.md) |
| `REVIEW.md` | 代码仓库根目录 | 验证命令、review 的额外要求 | [review.md](references/review.md) |
| `CODING_STANDARDS.md` | 代码仓库根目录 | 代码该怎么写 | [coding-standards.md](references/coding-standards.md) |
| `## idea-loop` 块（`AGENTS.md`，没有就 `CLAUDE.md`） | 代码仓库 | 指针：业务名、知识库的 GitHub 名 | [agents-block.md](references/agents-block.md) |
| `ISSUE_TRACKER.md` | 知识库根 | issue 怎么读写、`status:*` 的意思 | [issue-tracker.md](references/issue-tracker.md) |
| `## issue 分类`（`AGENTS.md`） | 知识库根 | 分类 label（`type:*`）、要保留的别的 label | [issue-types.md](references/issue-types.md) |
| `PRODUCT.md` | 知识库根 | 用户、产品目标、品牌性格 | [product.md](references/product.md) |
| `idea-loop.json`、`~/.idea-loop/projects.json` | 知识库根、本机 | 业务名、issue 仓库；本机路径、会话在哪跑 | [knowledge-base.md](references/knowledge-base.md) |

## 预检

只读，逐项查，给人一张表：每项「正常 / 缺失 / 可选未装」，缺失的附修法命令。

表的行见 [references/preflight-table.md](references/preflight-table.md)。其中两行决定走哪条路：本机映射有没有这个仓库、代码仓库里还有没有 `docs/` 或根目录的业务级设置（有 = 老布局，走「迁移」）。

缺了必需项照样往下走，交回时列出来。

完成条件：表里每一项都有结论。

## 探查

给「问人」的每个问题备一个推荐答案，并记下出处。要读的东西列在 [references/survey.md](references/survey.md)。

完成条件：「问人」的每个问题都有推荐答案，或写明「探查不到」。

## 问人

只问还没写的。每个问题给推荐和出处，一次最多三个，人说「照推荐」就算确认。先问业务与知识库四题，再问仓库级的；往已有业务加仓库时，业务选已有的，知识库那几题不再问。问题清单在 [references/questions.md](references/questions.md)。

完成条件：清单上每一项都有人确认过的答案。

## 写

新业务、加仓库、重跑更新走这里；老布局先走「迁移」，再回来写 label。

- **知识库**（没有就先建仓库、clone，`gh repo create` 先把命令给人看）：`idea-loop.json`、`PRODUCT.md`、`ISSUE_TRACKER.md`、`docs/` 骨架等怎么写见 [references/knowledge-base.md](references/knowledge-base.md)。`## issue 分类` 一节照模板写进知识库根的 `AGENTS.md`，格式脚本要读，见 [references/issue-category-format.md](references/issue-category-format.md)。
- **代码仓库**：`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md` 按模板写进仓库根目录。`## idea-loop` 指针块写进 `AGENTS.md`；没有 `AGENTS.md` 就写进 `CLAUDE.md`；两份都没有，问人建哪份；块已存在就原地更新。`.tmp/` 追加进 `$(git rev-parse --git-common-dir)/info/exclude`。业务级设置不写在这里。
- **本机映射**：`~/.idea-loop/projects.json` 合并写入这个业务的知识库、`home`、这个仓库的本机路径，不覆盖别的业务；都写好后在主 checkout 里跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" root`，输出知识库才算对。
- label（`<知识库>` 即上面 `root` 的输出；`issues.mjs` 从 `idea-loop.json` 取 issue 仓库）：`node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" labels <知识库>/docs` 建出缺的 `status:*`、`type:*`，列出多余的 label 和各自在用的 open issue 数；人定了迁成分类的，对每个 issue 跑 `issues.mjs type <知识库>/docs <号> <分类>`；多余 label 的清单给人看，确认后 `issues.mjs labels <知识库>/docs --prune` 删掉，issue 上的一起去掉。

完成条件：两边的文件都在，模板小节不缺，`git diff` 都给人看过；`issues.mjs labels <知识库>/docs` 不再列出多余的 label。

## 迁移

预检发现老布局（代码仓库里还有 `docs/`，或根目录有 `PRODUCT.md`、`ISSUE_TRACKER.md` 这类业务级设置）时，读 [references/migrate-to-knowledge-base.md](references/migrate-to-knowledge-base.md)：`docs/` 带历史搬进知识库，代码仓库开一个 PR 删旧文件、换指针块，交给人合并，setup 不合并。

完成条件：迁移参考里的三项核对都过，代码仓库的 PR 链接交给了人。

## 夜间规则回放

改规则的 PR 里有大的回放用例时，要装夜间回放的 runner 和计划任务，步骤读 [references/nightly-replay.md](references/nightly-replay.md)。

完成条件：`~/.idea-loop/bin/retro-replay.mjs` 在；计划任务在 `list_scheduled_tasks` 里；允许规则已打印给人。

## 每周对账

`/idea-loop:dreaming` 可以由桌面 app 的定时任务每周自己跑一次（只由人或这个任务触发）。必须在这个业务的 `home`（`knowledge-base.mjs business` 里的 `home`，会话在哪跑）里做，任务 id 叫 `dreaming-<仓库名>`，仓库名取 `home` 主 checkout 的目录名。步骤（没有工具时的退路、问人的选项、`create_scheduled_task` 的参数、要告诉人的话）在 [references/weekly-dreaming.md](references/weekly-dreaming.md)。

完成条件：这个业务有一个开着的 `dreaming-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。

## 整合定时任务

一个跑在 Claude cloud 上的定时任务（claude.ai/code/routines），每 6 小时把开着的、改同一个文件或同一个页面 / 模块的待验证 issue 挂到一个根 issue 下。规则全在 prompt 里：[references/consolidation-prompt.md](references/consolidation-prompt.md)，原样写进任务，`<仓库>` 换成 issue 所在的 GitHub 仓库 `owner/name`，即知识库 `idea-loop.json` 的 `issues`（「问人」里确认过的那个）。

1. 打印 `https://github.com/apps/claude/installations/new`，说明**只装在 issue 所在的这个仓库上**，这一步只能人在 GitHub 上点，等人说装好。
2. 用 `RemoteTrigger` 建 cloud 定时任务：cron `7 */6 * * *`（按 UTC 读，偏开整点），仓库填 `https://github.com/<owner/name>`（同上一步取的），prompt 是上面那份。
3. 建完清掉任务上挂的全部连接器：新任务默认继承账号在 claude.ai 上连的所有连接器，这个任务一个都不用。
4. 「Run now」跑一次冒烟，告诉人去侧边栏 Scheduled 组看那次运行的会话、核对合并结果。
5. 没有 `RemoteTrigger` 或人拒绝：prompt 和设置原样给人，记「未做」及原因。

完成条件：任务建好且连接器清空、冒烟跑过，或记下了「未做」的原因。

## 交回

- 写了、改了知识库和代码仓库里的哪些文件，`projects.json` 写了什么（业务、知识库、`home`、仓库路径），建了、删了哪些 label，哪些 issue 迁了分类。
- 迁移的：代码仓库那个删旧文件、换指针块的 PR 链接，三项核对的结果。
- 预检缺的必需项，各附修法命令。
- 夜间回放：runner 装在哪、计划任务建没建（taskId 与时间）、**要人自己加的允许规则**（原样一行）。没加这条规则，夜里的任务会被拦下，队列里的回放不会跑。
- 每周对账：dreaming 的定时任务建没建（taskId 与时间），没建的原因（不在桌面 app / 人拒绝）；没建时 prompt 原样给人。
- 整合任务：建没建（任务 id、cron）、连接器清没清、冒烟跑没跑；没建时 prompt 与设置原样给人。
- 怎么起调度：在 `home` 的主 checkout 里开一个固定的会话，敲 `/idea-loop:issue-dispatch 30m`。
- 留给人的事：装或登录 `gh`、Codex；在用户级配 Playwright 和 Refero（命令见预检表）；创建 GitHub App；往 `CODING_STANDARDS.md` 写规则。`GLOSSARY.md` 由 `idea-loop:grill` 建（在知识库根），`DESIGN.md` 由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
