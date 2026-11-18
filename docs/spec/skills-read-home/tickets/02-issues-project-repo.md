# 02 — issue 脚本对着项目自己的代码仓库操作，没搬的项目停下

**Blocked by**：01 — 认项目脚本会答「项目目录在哪」
**设计冻结**：不涉及 UI

## 要建什么

issue 脚本（`issues.mjs`）的每个命令都收一个 `<docs>`。现在它在 `<docs>` 目录里跑 `gh` 和 `git`，所以 `gh` 操作的是 `<docs>` 所在的那个 git 仓库。知识库搬进 home 以后，这个仓库就成了 home：home 没有远端时报「no git remotes found」；home 有远端时不报错，读回、改掉的是 home 那个远端仓库里同号的 issue。

改成：

- `<docs>` 是 home 里某个项目目录下的 `docs/`（用 01 的认项目逻辑按项目名认出项目）。项目根仍取 `<docs>` 的上一级——搬家后它就是项目目录，`ISSUE_TRACKER.md` 在里面。
- 所有 `gh` 调用都对着项目清单里这个项目的 `owner/repo`：`gh api` 路径里的 `{owner}/{repo}` 换成它，`issue` / `label` / `pr` 子命令带 `-R <owner/repo>`（已经显式带了仓库的不再加），「当前仓库是哪个」直接用它，不再问 `gh repo view`。
- 找 issue 分支的 `git` 在项目清单登记的本地 clone 里跑。
- 找 PR 的仓库：只有项目自己的那一个（`ISSUE_TRACKER.md` 不再有「仓库」一节；一个 issue 只改一个仓库）。现有的读「仓库」一节的逻辑删掉；Linear 项目找 PR 也只在这一个仓库里找。
- issue 分类：从项目目录 `ISSUE_TRACKER.md` 的「分类 label」一节读（格式跟现在代码仓库 `AGENTS.md`「issue 分类」一节相同）；不再读代码仓库的 `AGENTS.md` / `CLAUDE.md`。
- `<docs>` 不在 home 的项目目录里（没搬的项目、随便一个目录）：所有命令停下，报 01 的那句话（「这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移」或「没接上」），不读代码仓库、不调 `gh`。

现有测试几乎都在临时目录里直接建 `docs/`：改成在临时目录里建假 home（`IDEA_LOOP_HOME` 指过去）、登记一个项目，测试意图不变。测试里的 `gh` 继续用注入的 stub。

## 验收标准

- [x] 假 home 登记了 `example-app`（远端 `acme/example-app`）、项目目录有 `docs/`：`show <那个 docs> 7` 时 stub 收到的每次 `gh` 调用都对着 `acme/example-app`（`api` 路径里没有残留 `{owner}/{repo}`，其余子命令带 `-R acme/example-app` 或已有 `--repo acme/example-app`）
- [x] `set` / `type` / `new` / `labels` 同样对着 `acme/example-app`
- [x] issue 分支从项目清单登记的本地 clone 里找到
- [x] 分类从 `ISSUE_TRACKER.md`「分类 label」一节读到；代码仓库 `AGENTS.md` 里的「issue 分类」不再被读
- [x] 删掉项目目录的 `docs/`、代码仓库根放 `DEVELOPMENT.md`，对代码仓库里的 `docs/` 跑 `show`：退出码非 0，输出迁移那句话，stub 一次都没被调
- [x] 「仓库」一节的解析和多仓库找 PR 的分支已删，相关测试改成单仓库
- [x] 现有 issue 脚本测试意图全保留并全绿
- [x] review 第 2 轮 S2（2026-11-18）：SEO 效果报告读改动清单的脚本（seo-live-record）对着项目清单里这个项目的仓库查 issue，跟 issue 脚本、SEO 开 issue 的脚本一样；docs 不在 home 时同样停下。单测用假 home 和 gh stub 钉住

## 选中的存量回归

- issue 脚本自己的测试：这张工单整个改它的仓库来源，翻状态、找 PR、Linear 那几组都可能被带坏。
- 读 issue 脚本输出的文档测试（issues skill、Linear 文档的测试）：「仓库」一节的说法要跟着变。
