# 按版本发布的仓库

目标仓库 `DEVELOPMENT.md` 的「分支」节写着「发布方式：按版本发布」时，一组 issue 是一个版本，这个会话是**版本会话**。下文 `<单元>`、存版本号的文件取同一节的「版本号」；`<主分支>` 是「基准分支」。

## 开分支、分 feature

1. 讨论阶段照常调 `idea-loop:issue-verify` 复现、跟人 grill，但要定的是这一版有哪些 feature（每个 feature 覆盖哪几个子 issue）和版本号：版本号由人定，推荐按改动大小走 semver（不兼容的改动升次版本号以上）。
2. 定了就从最新的 `<主分支>` 切出 `release/<单元>-<版本>`（只有一个单元的写 `release/<版本>`）并推送；会话分支就改成它。计划写进知识库 `docs/records/releases/<单元>-<版本>-release.md`：分支规则、feature 表（顺序、覆盖的 issue、改什么、前置、状态）、没定的事，提交在知识库同名分支上。
3. 每个 feature 一份 spec（调 `idea-loop:issue-verify` 时说明只管这个 feature 的几个子 issue）、一条 `feature/<slug>` 分支（从 release 切出），走一遍应用仓库那条线（讨论 → 定稿 → 设计 → 实现 → review 第一轮 → 审核中），只是代码 PR 的 base 是 release 分支。feature 可以在别的会话里做（怎么开会话归 `idea-loop:workspace`），也可以在这个会话里一个一个做；feature 会话做到审核中就停，等版本会话。

## 合并

1. 人说合并某个 feature：照 `idea-loop:pr-review` 合它的代码 PR（合进 release）。它的知识库 PR 先不合，它的 issue 留在审核中：改动还没到 `<主分支>`。计划里那一行的状态改成已合进 release。
2. release 落后 `<主分支>` 时，把 `<主分支>` 合进 release 并推送；还开着的 feature 分支再从 release 同步。
3. 全部 feature 合进 release：开 release → `<主分支>` 的 PR，正文列这一版的 feature 与 PR。人说合并时，在合并提交里把「版本号」那一行的每个文件改成新版本（`git merge --no-ff --no-commit`，改版本号，`git commit`，推送；或照 `DEVELOPMENT.md` 的合并方式在 PR 上合，版本号提交是这条 PR 的最后一个提交）。feature PR 不碰版本号。
4. 然后把各 feature 的知识库 PR 依次照 `idea-loop:pr-review` 的「知识库 PR」合进知识库主分支，对每份 spec 跑 `issues advance <docs> <slug>` 关 issue；根在子 issue 全部关掉时随着关闭。再去 SKILL.md 的「收尾」。
