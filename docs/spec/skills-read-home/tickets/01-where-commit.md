# 01 — 认项目脚本会答「项目目录在哪」和「把这几份文件提交进 home」

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

0.2.0 起，idea-loop 生成的引导文件和 `docs/` 住在设备的 home（默认 `~/home`，环境变量 `IDEA_LOOP_HOME` 覆盖）里的 `projects/<名字>/`，叫**项目目录**；代码仓库只留自己的东西。#252 已经有一个认项目的脚本：SessionStart hook 调它，按当前目录的 git `origin` 在 home 的项目清单（`~/home/AGENTS.md` 的「## 项目」一节）里认出项目、注入项目地图。这张工单扩展这一个脚本（不另起新脚本），加两个命令，并让 hook 多注入一行。

**`where`**：输入是当前目录，或 `--project <名字>`。输出一份 JSON：项目名、项目目录、`docs`（项目目录下的 `docs/`）、代码仓库的 `owner/repo`（从项目清单登记的远端取）、本地 clone 路径（项目清单登记的路径）、`inHome`。判法：

- 项目清单里有这个项目，且项目目录下的 `docs/` 存在 → 给出项目目录，退出码 0。
- 否则不给项目目录，退出码非 0，标准错误输出一句话：
  - 当前代码仓库根目录有 idea-loop 的引导文件（`DEVELOPMENT.md` `REVIEW.md` `CODING_STANDARDS.md` `PRODUCT.md` `ISSUE_TRACKER.md` `GLOSSARY.md` `DESIGN.md` `SEO.md` 任一）或 `docs/` 的：「这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移」；
  - 别的情况：「这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`」。
- 当前目录就是 home 本身、又没给 `--project`：退出码非 0，说要带 `--project <名字>`。
- 一个代码仓库的 worktree 跟它的主 checkout 认成同一个项目（它们共用 `origin`）。

**`commit`**：`commit <消息> <文件>...`，把列出的文件提交到 home 的 main：

1. 只 add 列出的文件；
2. 只提交它们（提交时把路径限定到这几个文件），暂存区里别的会话加进去的文件不受影响、仍留在暂存区；
3. 碰到 home 的 `index.lock`（另一个会话正在提交）就等一秒、重试一次；
4. home 有 `origin` 的，接着 `pull --rebase` 再推送；推送失败退出码仍是 0，输出一行「home 没推上去：<原因>」。没有 `origin` 的不推，退出码 0。
5. 列出的文件不在 home 里的，拒绝（退出码非 0），什么都不提交。

**hook**：SessionStart 注入项目地图时多注入一行 `项目目录：<路径>`；`where` 判「还没搬」的，hook 改为注入那句迁移提示。hook 无论如何不能让会话起不来（出错就什么都不输出、退出码 0，跟现在一样）。

照着写：这个脚本现在的写法（导出纯函数加命令行入口），测试在临时目录里建假 home、带远端的假代码仓库和它的 worktree，`IDEA_LOOP_HOME` 指过去。

> 人的决定（2026-11-17）：「选B，其实满打满算就只有harold-skills和toefl-demo哈哈哈」——「还没搬」的判法收窄为：代码仓库根有 8 份引导文件之一，或 `docs/` 里有 `spec/` 或 `adr/` 子目录；光有一个普通 `docs/` 不算（按「没接上」处理）。开会话的提示和 setup 的预检共用这一个判法。

## 验收标准

- [x] 假 home 登记了 `example-app`（远端 `acme/example-app`），`projects/example-app/docs/` 存在：在它的 worktree 里跑 `where`，项目目录是假 home 里那个，`owner/repo` 是 `acme/example-app`
- [x] 在假 home 里跑 `where --project example-app`，拿到的项目目录跟上一条相同；不带 `--project` 时退出码非 0
- [x] 删掉 `projects/example-app/docs/`、代码仓库根放一份 `DEVELOPMENT.md`：`where` 退出码非 0，输出「这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移」
- [x] 项目清单里没有的仓库：`where` 退出码非 0，输出「这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`」
- [x] 两个文件已写进假 home、另一个文件已被别人 add 进暂存区，只把其中一个交给 `commit`：提交里只有它；另两个仍未提交，被 add 的那个仍在暂存区
- [x] 假 home 没有 `origin`：`commit` 退出码 0；有 `origin` 但推送失败：退出码 0，输出「home 没推上去：…」
- [x] `index.lock` 存在、一秒内被移走：`commit` 重试后成功
- [x] hook 在已搬的项目里注入的内容含 `项目目录：<路径>` 一行；在还没搬的项目里注入迁移提示；home 不存在时什么都不输出、退出码 0
- [x] 认项目脚本现有的测试全绿
- [x] 人的决定（2026-11-17）：只有普通 `docs/`（里面没有 `spec/`、`adr/`）、没有引导文件的仓库，`where` 报「没接上」、hook 不注入迁移提示、setup 的预检把它当全新项目；有 `docs/spec/` 或 `docs/adr/` 的仍报「还没搬」

## 选中的存量回归

- 认项目脚本自己的测试：这张工单直接改它的输出（多一行），注入地图那几条最容易被带坏。
- `home-config` 的测试：它跟认项目脚本共用项目清单的解析。
