---
type: spec
issues: [450]
tags: [issue-workflow, dyna, worktree, tests, session-cleanup]
summary: issue 会话自己建 worktree、收尾时连分支和进程一起收；测试和 eval 的临时目录由 dyna 分配和回收
related: ["[[dyna-app-layer-cleanup]]", "[[runtime-ops-in-docs]]", "[[dyna-missing-commands]]"]
---

# 会话建的资源由会话自己收，测试的临时目录由 dyna 收

> #450 存在：2026-11-25 本机 `~/projects/Tofelair-worktrees/` 下 56 个 worktree 共 65 GiB，44 个的 issue 已关、会话已归档；release/idea-loop-0.2.0（f12f7edc）上一次全量 `node --test` 在空 `TMPDIR` 里留下 404 个目录、551 MB。详情在「问题陈述」

方向是 Harold 2026-11-25 定的（#450 正文「人定的方向」）：调度只开会话；会话自己建 worktree、自己起服务；会话收尾时回收自己建的全部资源再归档；测试和 eval 由 dyna 分配、回收资源。分层照 #490（Harold 2026-11-24）：worktree、分支、进程、临时目录是项目层，进 dyna；会话怎么进 worktree、怎么归档是应用层，写在运行环境说明里。

## 问题陈述

### 1. issue 会话的 worktree、分支、进程归档后都还在

**现状**：调度照 `~/home/runtime/claude-desktop.md`「怎么交出 issue」第 1 步用 `git worktree add` 建 worktree，再在里面开会话；会话收尾照同一份说明的「会话收尾」只调 `archive_session`，说明写「worktree 随归档清掉」。桌面端归档只清它自己建的 worktree（`archive_session` 工具说明：cleans up its worktree；`clean_up_worktrees`：the worktrees this app made），调度用 git 建的不在其内，进程也只停 Claude 会话本身。

**例子**：Tofelair#1125，调度 11-25 03:12 建 `~/projects/Tofelair-worktrees/1125-ai-tool-directories`、开会话；PR #1164 #1166 合并、会话 06:28 归档后，worktree、分支和里面约 6 个 Codex 相关进程都还在。本该是：会话收尾后这三样都没了。

2026-11-25 晚再查，这个目录已被人手动清到 10 个、11 GiB（清单见本次会话末尾问 Harold 的那道题）。

### 2. 测试和 eval 的临时目录、编出的 dyna 没人删

**现状**：测试用 `mkdtempSync(join(tmpdir(), …))` 建目录，release 上 29 个用临时目录的测试文件里 25 个不删；`idea-loop/scripts/dyna-test-bin.mjs` 每个测试文件现编一份约 18 MB 的 `dyna` 进 `dyna-test-bin-*`，不删。eval（retro 回放）在 `finally` 里删，被信号打断时不删。

**例子**：本机 11-20、11-24 两次清理后，11-25 又积回 `dyna-test-bin-*` 863 个 15.2 GiB，约一天 20 GiB。`dyna test run`（`dyna/internal/testcmd`）只起 `node --test`，不管临时目录。

### 根因

- worktree：建（调度）和收（issue 会话）不是同一方，收尾说明以为归档会顺带清。
- 临时目录：没有一个「这次运行」的边界替测试兜着；每个文件各建各的。

## 方案

```
调度 ──claude -p（在项目 clone 里）──▶ issue 会话
issue 会话 开场 ──dyna worktree add──▶ worktree（新：会话自己建）
           ──『会话管理』进自己的 worktree──▶ 之后都在 worktree 里
           收尾 ──dyna worktree remove──▶ 停进程（新）→ 删 worktree（连 .tmp/）→ 删分支
                ──『会话管理』会话收尾──▶ 归档
测试/eval ──dyna test exec -- <命令>（新）──▶ 本次运行的临时目录 + 编好的 dyna；结束（含中断）就删
```

改完：会话归档时，它的 worktree、分支、在 worktree 里起的进程都已经没了；跑一次全量测试，系统临时目录里不多留任何东西。

### dyna（项目层）

1. **`dyna worktree remove` 先停进程**：删 worktree 之前，找出当前目录在这个 worktree 里的进程（macOS 用 `lsof`，Linux 读 `/proc/*/cwd`），跳过调用者自己的祖先进程（会话本身、它的 shell），先 TERM、等 3 秒、还在的 KILL，每个停掉的打印一行 pid 和命令。删完跑一次 `git worktree prune`（嵌在里面的 worktree，如上线自查的 `.tmp/live-check/*`，登记一起清掉）。其余行为不变（没提交的改动照旧拒绝）。
2. **`dyna worktree add` 并发重试**：几个会话同时在同一个 clone 里建 worktree，git 报锁（`.lock` 已存在）时等 1 秒重试，最多 5 次。
3. **新命令 `dyna test exec -- <命令…>`**：在 `$TMPDIR/dyna-runs/<运行号>/` 建本次运行的目录，写一个 pid 文件；子进程的 `TMPDIR` 指到它的 `tmp/`；当前目录往上找到带 `dyna/go.mod` 的仓库就先把 dyna 编进这个目录，经 `DYNA_TEST_BIN` 传给子进程（不用 `IDEA_LOOP_DYNA_BIN`：插件启动器认它，测试启动器的用例会被它带偏）；子进程在自己的进程组里跑，结束、失败、收到 INT/TERM/HUP 时停掉整组、删目录，退出码照子进程的。开始时顺带删 `dyna-runs/` 下 pid 已不在的旧目录（被 KILL、崩溃留下的）。`dyna test run` 改为经同一套跑。
4. **`dyna-test-bin.mjs`**：有 `DYNA_TEST_BIN` 就直接用它，不编；没有（直接跑 `node --test`）照旧现编，进程退出时删掉自己编的那份。
5. dyna 版本 0.0.15 → 0.0.16，存登记表。插件 `dyna-version` 下限不动：skill 里用到的 `worktree add/remove` 是已有命令，`test exec` 只写进本仓库的 `REVIEW.md`。

### 插件（skill 与能力模板）

1. **issue-session「开场」第 1 步**：会话开在项目 clone 里（不是 worktree）时，自己建：`dyna worktree add <号>-<slug> --repo <clone> --base <主分支>`；triage 会话加 `--detach`；todo 会话 issue 已有分支的加 `--branch <它>`。然后照『会话管理』的「进自己的 worktree」进去。已经在一个只给自己用的 worktree 里（人在桌面端开的会话）就用它。
2. **issue-session「收尾」**：retro 之后、归档之前加一步：工作区干净、要留的提交已推上去，在 clone 里跑 `dyna worktree remove <自己的 worktree>`，看它停掉了哪些进程，再照『会话管理』的「会话收尾」归档。夜间模式不走收尾，不变。
3. **issue-dispatch**：交出 issue 不再建 worktree；会话开在 issue 所在项目的 clone 里。「只读」那句里的「和建 worktree」删掉。
4. **能力模板 `runtime/capabilities.md`「会话管理」**：「开一个 issue 会话」的传入从 worktree 改成项目 clone；加一项「进自己的 worktree」（传入：worktree 路径；拿回：之后的命令都在那里跑；做不到时：退路）；「会话收尾」写明资源已由会话先收掉，这一项只结束会话。

### 运行环境说明（应用层，本机 `~/home/runtime/claude-desktop.md`，提交到 home）

- 「怎么交出 issue」删第 1 步，第 2 步在 `<clone>` 里开会话。
- 加「进自己的 worktree」：`EnterWorktree`，`path` 填 worktree 路径（从开会话的 clone 首次进入时，路径要在那个仓库的 `git worktree list` 里）。
- 「会话收尾」删「worktree 随归档清掉」，改成：归档只停会话本身、只清桌面端自己建的 worktree，所以先照 issue-session 收资源。

### 本仓库

- `REVIEW.md` 的「单个测试文件」「全量测试」改成 `dyna test exec -- node --test …`。
- retro 回放（`idea-loop/evals/retro/retro-replay.mjs`）不套 `dyna test exec`：skill 里调它的是固定路径 `node ~/.idea-loop/bin/retro-replay.mjs`，人已为这条加了允许规则，套一层要人重加规则。改成它自己在收到 INT/TERM/HUP 时删掉自己建的临时目录（正常结束时 `finally` 已经删）。

同一行为的其他入口：分拣、SEO 扫描、dreaming、implement 执行方、上线自查已经各自用 `dyna worktree add/remove` 收自己的，不动；`remove` 停进程对它们同样生效。人手动开的桌面端会话（worktree 由桌面端建）收尾时同样先 `remove`，桌面端归档再清时已经没东西可清。

## User Stories

只修问题，不画树：

1. 期望行为（问题 1）：issue 会话归档后，`git worktree list` 里没有它的 worktree，本地没有它的分支，没有当前目录在那个路径下的进程。
2. 期望行为（问题 2）：`dyna test exec -- node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` 跑完（含中途 Ctrl-C），`$TMPDIR` 里不多出任何条目；一次全量只编一份 dyna。

## 实现决策

- **进程按当前目录认，不登记**：会话起的服务、测试、Codex 进程，当前目录都在 worktree 里；按目录认不用会话自己记账，崩溃后也认得出。依据：Harold 定的「会话里建的资源都在会话关闭、归档时回收」；#486 让 Codex 审查改成一次性进程，是从源头少起，这里只在收尾时兜，两者不重叠。人自己在那个 worktree 里开的终端也会被停，`remove` 打印出来，接受。
- **中断、崩溃留下的 worktree 不做自动兜底**：问题 1 的 44 个都是正常收尾路径漏的，没有找到会话崩溃后留下 worktree 的实例；记成已知限制，残留可用 `dyna worktree list` 看、`remove` 删。测试的临时目录有真实的中断路径（Ctrl-C、超时 KILL），所以 `test exec` 开始时补删。
- **能力模板多一项，别的机器的说明怎么办**：`dyna runtime check` 要求说明里有模板的每一项（`dyna/internal/runtime/check.go`，缺项退出 1）。本机 `~/home/runtime/claude-desktop.md` 已补；插件 0.2.0 还没装到别的机器，那里的说明（如公司虚拟机的 magi）装上后由 setup 照新模板生成，自然带这一项，不另补。
- **命令名 `dyna test exec`**：放在已有的 `test` 模块下，跟 `test run` 并列；不是术语表里的词。
- **分支删不删**：`remove` 默认删本地分支（已有行为）；issue-session 只在提交都推上去之后调它，远端分支和 PR 不受影响。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `worktree remove` 停进程、跳过祖先；`add` 锁重试；`test exec` 的目录、环境变量、信号、补删 |
| API 契约 | — | 不涉及 |
| DB | — | 不涉及 |
| LLM 输出质量 | — | skill 改动写「见杠杆诊断各处的验证」 |
| 视觉正确性 | — | 不涉及 |
| 端到端用户路径 | — | 不涉及 |

- **seam**：dyna 命令的进出（Go 测试里直接调命令，看输出、文件系统、进程表）；skill 文字用已有的文档测试（`*-doc.test.mjs`）。
- **增量功能测试**：
  - 前置：临时仓库建一个 worktree，在里面起一个 `sleep` 进程。步骤：`dyna worktree remove`。期望：sleep 进程没了，输出有它的 pid；调用者自己没被停。覆盖：期望行为 1。
  - 前置：空 `TMPDIR`。步骤：`dyna test exec -- sh -c 'mkdir $TMPDIR/x; test -x $DYNA_TEST_BIN'`，再跑一个会被 TERM 的子命令。期望：两次之后 `TMPDIR` 为空；第一条退出 0。覆盖：期望行为 2。
  - 本机实测：在空 `TMPDIR` 下用新 dyna 跑一次全量，数留下的条目。
- **照着谁写**：`dyna/internal/worktree/worktree_test.go`（临时仓库）、`dyna/internal/proctree/proctree_test.go`（进程组）、`dyna/internal/testcmd/testcmd_test.go`。

### 杠杆诊断

- issue-session「开场」「收尾」：会话开在 clone 里时建并进 worktree；收尾先 `remove`。验证：检查，`issue-group-skills.test.mjs` 一类的文档测试钉住「收尾」里 `dyna worktree remove` 在「会话收尾」之前，先在改前的文字上见红。
- issue-dispatch：不再建 worktree。验证：检查，同上，钉住 SKILL 里不再出现「建 worktree」。
- 能力模板「会话管理」加一项：验证：检查，`dyna runtime check` 对本机桌面端说明全过。

## Out of scope

- 系统临时目录、`/private/tmp/claude-501/` 的存量清理：本机存量由人看清单后决定。
- Codex 进程不退的源头：#486。
- 会话崩溃后的 worktree 自动兜底（见「实现决策」）。

## 关联

- #486（codex 进程不退，triage 中）：它从源头不再起常驻进程；本 spec 只在收尾时停 worktree 里的进程，不重叠，谁先合都行。
- #490 / `dyna-app-layer-cleanup`：分层依据；运行环境说明在 home。
- #247（迁移到 home）：本仓库 docs/ 还没搬，本 spec 照旧提交在分支上。
- 相邻在做的 #451、#452、#478：不碰 worktree 和测试启动，无重叠；都可能改 dyna 版本，后合的再升一档。
