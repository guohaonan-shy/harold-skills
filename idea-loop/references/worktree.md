# 执行方的 worktree：起点、准备、回收

`implement` 并行派工时，每张工单的 implementer 在一个自己的 worktree 里做。这份文件只写三件事：从哪开始、开工前准备什么、做完谁收拾。准备和清理优先用**目标仓库自己声明的命令**；仓库没声明，就用下面的默认做法。

## 1 起点

- implementer 由编排者用 `isolation: "worktree"` 起，worktree 由 Claude 建。Claude 建的 worktree 默认从**仓库默认分支**切出，不是集成分支，所以 implementer **开工第一步**是 `git reset --hard <编排者给的 SHA>`（派工那一刻集成分支的最新提交），再核对 `git rev-parse HEAD` 等于它。
- 不靠改 `worktree.baseRef` 解决：那个设置作用于这个仓库所有新建的 worktree，人新开的会话也会跟着变。

## 2 准备

先读目标仓库的 `CLAUDE.md` / `AGENTS.md`，找 worktree 准备命令（形如「新 worktree 先跑 `<命令>`」）。

- **有**：在 reset 之后跑它，把编排者分配的端口按它要求的参数传进去。
- **没有**：照下面的默认做法逐项补齐，跳过不适用的项。

| 要补的 | 默认做法 |
|---|---|
| 被 git 忽略的配置（`.env` 之类） | Claude 建 worktree 时会按仓库根的 `.worktreeinclude` 复制。它**跳过所有软链**，缺了的从主 checkout（`git worktree list` 第一行）手动补 |
| 依赖目录（如 `node_modules`） | 按锁文件装（如 `npm ci`）。macOS 上源和目标在同一个 APFS 卷时，可以用 `cp -cR` 从主 checkout 克隆，软链保留，比重装快。不要用 `.worktreeinclude` 复制依赖目录：`.bin` 这类软链会整个丢失 |
| 端口 | 用编排者分配的端口起服务；前端要指向后端的，改它读的那个配置 |

**依赖要跟着代码基准走。** 每次代码基准变了（开工时 reset 到 SHA、交回前合入集成分支的最新提交），都对比一次依赖目录里记录的锁文件和当前锁文件（npm：`node_modules/.package-lock.json` 对 `package-lock.json`），不一致就增量装一次（`npm install`）。这一步放在跑全量套件之前。克隆的来源是主 checkout，通常停在旧的 main 上，别的工单落地时也可能带进了新依赖。

- 两张工单都加了依赖、锁文件冲突：只解决清单文件（`package.json`）的冲突，再用包管理器重新生成锁文件，**不手工合并锁文件**。
- 加依赖只改这个 worktree 自己那份依赖目录，主 checkout 和别的 worktree 不用跟着动。

## 3 回收

归编排者，只在工单落地（fast-forward 进集成分支）之后做。仓库声明了清理命令就用它，没有就：

1. 停掉这个 worktree 端口上的服务（`lsof -tiTCP:<端口> -sTCP:LISTEN` 找进程）。
2. 它还持有浏览器锁就释放（`scripts/browser-lock.mjs release <锁目录> --force`）。
3. 把它 `.tmp/implement/<spec-slug>/evidence/` 下的素材拷进集成分支 worktree 的同名目录。
4. `git worktree remove --force <路径>`（Claude 加的锁先 `git worktree unlock`），再 `git branch -D <它的分支>`。

**卡住或失败的工单不回收**：worktree 和分支留着，半成品在它的分支上，等人做完决定由下一个 implementer 接着用。素材照样先拷出来，停下汇报要用。
