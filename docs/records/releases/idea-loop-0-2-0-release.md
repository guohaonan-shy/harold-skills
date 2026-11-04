---
type: record
captured: 2026-11-03
title: idea-loop 0.2.0 的 release 计划：6 个 feature、顺序、谁合并
tags: [release, idea-loop-0-2-0, issue-workflow]
---

# idea-loop 0.2.0

> 2026-11-04 被取代：0.2.0 重新讨论后改成一次重构，拆成 7 个需求，挂在 milestone「idea-loop 0.2.0」上，见 [[2026-11-04-idea-loop-0-2-0-restructure-grill]]；这一页只留作历史。
>
> 2026-11-03 人叫停：「我倾向于将这四个子会话的改动先移除，合并进release分支的pr也revert掉，我觉的有些问题我没有想清楚」。F5 已 revert，F1（#240）、F2（#239）的 PR 已关，F4 没推送；四个分支都保留，重新讨论后再定。

由 harold-skills#220 的 issue 会话起头、拍板、合并；决定的来由见 [[2026-11-03-idea-loop-0-2-0-grill]]（下称「决定记录」）。各 feature 会话开工前读决定记录的「本轮决议」表和这一页。

## 分支怎么走

- release 分支：`release/idea-loop-0.2.0`，2026-11-03 从 main 9a33407 切出。
- 每个 feature 一条分支 `feature/<slug>`，从 release 分支切出；spec、设计、实现在这一条分支、一个 PR 里，PR 的 base 是 release 分支。
- spec 定稿时单独提交一次（`docs(spec): <slug> 定稿`，frontmatter 翻「正式」）；PR 一直是 draft，实现做完、review 过一轮才转 ready。
- feature PR 由 #220 的会话 review 后合进 release，人说合并才合。
- 全部 feature 合进 release 后，#220 的会话在合并提交里把 `idea-loop/.claude-plugin/plugin.json` 升到 0.2.0，再把 release 合进 main。feature PR 不碰版本号。
- release 分支落后 main 时，由 #220 的会话把 main 合进 release，feature 分支再从 release 同步。

## feature

| 顺序 | feature | 覆盖的 issue | 改什么 | 前置 | 状态 |
|---|---|---|---|---|---|
| 1 | F5 知识库独立成仓库 | #228 #222 | 知识库是单独的 git 仓库，按业务分；业务级设置在知识库根；`DEVELOPMENT.md` / `REVIEW.md` / `CODING_STANDARDS.md` 留在代码仓库；代码仓库的 AGENTS.md 留一个指向知识库的指针块；删「docs 在代码仓库里」，setup 带老项目迁移；多仓库需求每个仓库一个 PR | 无 | 已 revert（ae703d6），分支 feature/knowledge-base 保留 |
| 2 | F1 入口与调度 | #220 #217 | 改 issue-intake-priority：模块细到 `idea-loop/<子类>`、seo 不再单独排队、删 Dreaming 的 P2 节、审核中不占名额、汇报列「等你的」；其余照原 spec | F5 合进 release | 待开工 |
| 2 | F2 一个会话一条线 | #232 | 按版本发布的仓库走 release 分支、应用仓库一个会话一个 PR；`DEVELOPMENT.md`「分支」节加「发布方式」；spec / 设计不再单独开 PR；阶段改成讨论中 → 设计中 → 实现中 → 审核中 | F5 合进 release | 待开工 |
| 2 | F4 工作环境 | #227 #222 | 新 skill `idea-loop:workspace`（`references/desktop.md`、`references/cmux.md`），两种执行环境平行、按项目选：Desktop（公司项目用 SSH 会话，claude 在虚拟机上，P0/P1 出卡片）、cmux（先只承接个人项目的 P2，本地跑，夜里每晚 5 个做到 PR + 一轮 review；公司 P2 暂走 Desktop 卡片，U26）；环境层不关心 issue 来源；`~/.idea-loop/projects.json` 记每个项目用哪个环境、在哪跑（决定记录 U25） | F5 合进 release | 待开工 |
| 3 | F3 Linear | #226 #222 | `ISSUE_TRACKER.md` 写 issue 来源；`issues.mjs` 的平台层接 Linear；desktop「Work on issue」经 custom script 调 cmux | F1、F4 合进 release；人在 F3 会话里连上 Linear | 待开工 |
| 4 | F6 Codex 跑 issue 会话 | #237 | Codex 能跑完整个 issue 会话（审核到合并）：skill 互调、子代理、`${CLAUDE_PLUGIN_ROOT}`、hook、Claude 工具名这些耦合改成两边通用或给 Codex 另写一套；cmux 调度可开 Codex 终端 | F4 合进 release | 待开工 |

F1 与 F4 都碰 `issue-dispatch` 与 `issues.mjs`，并行时按上面的分工各改各的层；后合的照 release 分支 rebase。

## 没定、留给 feature 会话的

- 挂载虚拟机的知识库与临时区到 Mac 的方式（F4，人说到时候再说）。
- Linear 的状态、label、project 映射（F3，人连上后出题）。
- cmux 实测：`new-workspace --command`、`cmux ssh --command`、虚拟机经 relay 调 `cmux open <Mac 路径>`（F4）。
