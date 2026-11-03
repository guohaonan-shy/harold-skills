# 开发

idea-loop 的 agent 照这份文件选分支、准备 worktree、起服务。小节标题保持原样：idea-loop 按标题找。

## 分支

- 基准分支：`<main>`
- 合并方式：`<squash | merge | rebase>`
- 发布方式：`<应用 | 按版本发布>`
- 版本号：`<单元>`：`<存版本号的文件>`（只有「按版本发布」写；每个独立发版的单元一行，只有一个单元的写一行文件路径）

发布方式决定一个 issue 会话怎么开分支、PR 合到哪（`idea-loop:issue-session`、`idea-loop:pr-review`）：

- **应用**：一个会话一条线，分支 `issue/<根号>` 从基准分支开出，代码 PR 合进基准分支。
- **按版本发布**：一个会话对应一个版本、一条 `release/<单元>-<版本>` 分支（只有一个单元的写 `release/<版本>`）；版本里每个 feature 一份 spec、一条从 release 开出的 `feature/<slug>`、一个 base 是 release 的 PR；全部 feature 合进 release 后，会话把 release 合进基准分支，版本号只在这次合并里改「版本号」那一行写的文件。

## worktree 准备

新 worktree 在开工前跑：

```
<命令，端口写成 <端口>>
```

<没有这条命令就写「无」，agent 照下面的默认做法逐项补齐，跳过不适用的项。>

| 要补的 | 默认做法 |
|---|---|
| 被 git 忽略的配置（`.env` 之类） | Claude 建 worktree 时按仓库根的 `.worktreeinclude` 复制。它跳过所有软链，缺了的从主 checkout（`git worktree list` 第一行）手动补 |
| 依赖目录（如 `node_modules`） | 按锁文件装（如 `npm ci`）。macOS 上源和目标在同一个 APFS 卷时，可以用 `cp -cR` 从主 checkout 克隆，软链保留，比重装快。依赖目录不走 `.worktreeinclude`：它会丢掉 `.bin` 这类软链 |
| 端口 | 用分配给你的端口，照「开发服务器」的命令起服务；前端要指向后端的，改它读的那个配置 |

依赖跟着代码基准走：每次代码基准变了（开工时 reset、提交前合入集成分支的最新提交），对比依赖目录里记录的锁文件和当前锁文件（npm 是 `node_modules/.package-lock.json` 对 `package-lock.json`），不一致就增量装一次。锁文件冲突只解决清单文件（`package.json`）的冲突，再用包管理器重新生成锁文件。

## 开发服务器

```
<启动命令，端口写成 <端口>>
```

起好了的判断：<一个能打开的 URL，或启动输出里的一行>

## 清理

<停服务、删临时数据的命令；没有就写「无」，agent 按端口停掉自己起的服务。>
