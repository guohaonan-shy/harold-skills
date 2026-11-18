# 逐个对账项目

`dreaming-home` 开在 home（`~/home`，`IDEA_LOOP_HOME` 可覆盖）里，记忆一段做完之后，按项目清单（`AGENTS.md` 的 `## 项目`，一行一个项目，顺序就是行的顺序）对每个项目做一遍。下文三个词：

- **项目目录**：`<home>/projects/<名字>/`，`docs/` 和引导文件在里面，知识库的改动 `commit` 到 home。
- **代码 worktree**：这次对账读的代码，放在 `<home>/.worktrees/<名字>-<YYYY-MM-DD>/`。
- **中间物目录**：`<home>/.tmp/dreaming/<YYYY-MM-DD>/<名字>/`。提议表、拆出的小表、各 agent 的结果文件放这里；home 的 `.gitignore` 忽略 `.tmp/` 和 `.worktrees/`。别的 reference 里写的 `.tmp/dreaming/<日期>/`，指的就是这个目录；起子代理时给它的绝对路径。

## 1. 取项目

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-map.mjs" where --project <名字>
```

退出码非 0：它输出的那句话就是原因（还没搬、没接上、清单里没有），跳过这个项目。成功就取 `projectDir`（项目目录）和 `cloneDir`（本地 clone）。然后：

1. 读 `<项目目录>/DEVELOPMENT.md` 的「分支」节，拿基准分支。没有这份文件或这一节，跳过。
2. `git -C <cloneDir> fetch origin`。`cloneDir` 不存在或 fetch 失败，跳过。
3. `git -C <cloneDir> worktree add --detach <代码 worktree> origin/<基准分支>`。同名的 worktree 还在（上次中途停了没删）：先 `git -C <cloneDir> worktree remove --force` 它再建。不在本地 clone 的分支上建，所以不碰人在那个 clone 里的工作。
4. 这个项目做完（或中途停下）就 `git -C <cloneDir> worktree remove --force <代码 worktree>`。

## 2. 对账

照 SKILL.md 的「流程」做，改动的地方只有这几处：

- **知识库在项目目录，代码在代码 worktree**：`<docs>` 是 `<项目目录>/docs/`，引导文件在项目目录；读代码、跑开发服务、`DEVELOPMENT.md` 的「worktree 准备」都在代码 worktree 里。「所有核实对 `origin/<基准分支>`」说的是代码；知识库读 home 已提交的内容（`git -C <home> ls-tree`、`git -C <home> show HEAD:projects/<名字>/…`），别的会话正在写、还没提交的不算。
- **起 agent**：prompt 里把项目目录、代码 worktree、中间物目录三个绝对路径都给它。
- **提交**：改动用 `commit` 直接提交到 home（`idea-loop:wiki-conventions` 的「知识库落地」），只列这次改到的文件，目录也可以；删掉的文件直接删，`commit` 会把删除一起提交。消息写「dreaming：<日期> <名字> 知识库对账」。
- **`gh`、`issues.mjs`**：开 issue、查 PR 都对着项目自己的代码仓库（`where` 输出的 `repo`），不是 home。

## 3. 重写项目地图

`projects/<名字>/AGENTS.md` 整份重写，**不超过 2000 字**（`wc -m` 数，要带 `LC_ALL=en_US.UTF-8`；超了就删最不常用的层，不删「什么问题去哪查」）。

- **模板**：用 Skill 工具调 `idea-loop:wiki-conventions`，读它的「home 里的两份地图」里的项目地图模板。setup 起草第一版用的是同一份，这里不抄第二份：几层、每层放什么、什么问题去哪查，外加指向 `projects/<名字>/memory/MEMORY.md` 的那一行，都以它为准。
- **输入**：`<项目目录>/docs/index.md`、项目目录的目录树、引导文件（`DEVELOPMENT.md`、`REVIEW.md` 等）。层只写项目目录里实际有的；路径写成 `~/home/projects/<名字>/…`。「是什么」取项目清单那一行里的说法，代码仓库路径取清单里的本地路径。
- 写完 `commit` 到 home，只列这一个文件，消息「dreaming：<日期> 重写 <名字> 项目地图」。内容没变就没有提交，这是正常的。

## 4. 重写设备地图

全部项目跑完才做。输入是 home 顶层的目录（`ls <home>`）和项目清单；模板是同一处「home 里的两份地图」里的设备地图模板。

- 只重写 `~/home/AGENTS.md` 的「## 设备地图」一节：从这一行起到下一个 `## ` 之前。别的节（尤其是 `## 项目` 和人写的跨项目规矩）一个字节不动；写完看一眼 `git -C <home> diff -- AGENTS.md`，改动都落在设备地图那一节里才提交。
- 不超过 2000 字，数法同上。
- `commit` 到 home，只列 `AGENTS.md`，消息「dreaming：<日期> 重写设备地图」。

## 跑不了的项目、整次成功

- **跑不了**：本地 clone 不存在、fetch 失败、`DEVELOPMENT.md` 没有「分支」节、`where` 报「还没搬」或「没接上」。跳过它，汇报里一行：项目名和原因；后面的项目照常做。设备地图照样重写。
- **没对完**：被跳过的项目，或它的自动那份没提交成（检查没过、`commit` 失败）。问人的行人没回，不算没对完；某一波没跑成的批，照 [incremental-scope.md](incremental-scope.md) 的「没跑成的批」处理，也不算。
- **整次成功**：每个项目都对完。有任何一个项目没对完，这次就不算成功：汇报第一句写「这次不算成功」，接着写哪个项目没对完、为什么。下一次那个项目的基准点就是更早的一次成功执行，所以它从更早的提交算起（基准点取法见 [incremental-scope.md](incremental-scope.md)）。

## 人手敲

会话开在某个项目的代码 worktree 里时（开场注入了「项目目录：<路径>」），只对这一个项目做第 1–3 步，不动设备地图；项目目录取自那一行，不用 `where --project`。第 1 步照旧另切代码 worktree（不在人正在用的那个 worktree 里改东西）。手敲不推进基准，见 [incremental-scope.md](incremental-scope.md)。

## 已知限制

开在 home 时，项目自己的 hook、`.mcp.json`、`.claude/skills` 都不加载，对账只能用 idea-loop 自己的工具。项目对账需要项目私有的工具时，这个项目那一项做不成，按「没对完」处理。
