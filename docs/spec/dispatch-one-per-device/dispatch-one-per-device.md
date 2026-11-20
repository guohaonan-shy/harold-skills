---
type: spec
tags: [issue-workflow, dispatch-one-per-device]
summary: 一台设备一个调度定时任务 dispatch-home，按项目清单逐个项目派 issue
related: ["[[dispatch-day-night-modes]]", "[[skills-read-home]]", "[[home-bootstrap]]", "[[idea-loop-cli]]"]
issues: [386]
---

# 一台设备一个调度：dispatch-home 按项目清单逐个项目派

> #386 存在：本机有两个每小时的调度定时任务 `dispatch-harold-skills`、`dispatch-tofelair`，各建在自己的主 checkout 里；新加一个项目就要在它的主 checkout 里再敲一次 `/idea-loop:issue-dispatch`；详情在「问题陈述」

## 问题陈述

### 1. 有几个项目就要建几个调度定时任务

2026-11-20 用 `list_scheduled_tasks` 查本机：

| 任务 id | 建在哪 | cron | 上次运行 |
|---|---|---|---|
| `dispatch-harold-skills` | harold-skills 主 checkout | `7 * * * *` | 2026-11-20 14:08 |
| `dispatch-tofelair` | Toeflair 主 checkout | `7 * * * *` | 2026-11-20 14:11 |

两个任务做同一件事、跑同一个 skill，只是工作目录不同。人的预期是一台设备一个调度管所有项目（#379 会话，2026-11-19 原话）：「我记得我的预期是所有项目，但是我觉得短期内分开也可以，因为0.2.0 home repo有了之后项目信息就在一块了，那时候一个调度我觉得就可以解决了。」

要再接一个项目（例如 excalidrawer 搬进 home 之后），就得去它的主 checkout 里再敲一次 `/idea-loop:issue-dispatch`，再多一个每小时的任务。

### 2. 夜里名额被先跑的项目占满（#400 合入后消失）

issue 原文的第二个现象：分组跨项目共用，空位 = 上限 − 开着的会话数，两个任务共用夜里 3 个名额，先跑的那个占满，另一个项目当晚开不出。

main 上开着的 PR #400（#398）把上限改成「每轮最多新开几个，开着的会话总数不设上限」，算空位那一步整个删掉。它合进 main、再同步进 0.2.0 后，这个现象不再出现（PR #400 描述末尾也这样写）。本 spec 按 #400 合入后的口径写，不再单独修这一条；只剩一个调度之后「每轮最多新开几个」怎么跨项目算，见「实现决策」。

### 3. 认同号会话时不看仓库名

`claude-desktop.md`「怎么数开着的会话」写的是「三个分组里所有匹配的会话号都记下，派的时候跳过」，匹配的是「任何仓库名#<号>」。一个调度按项目逐个派时，Toeflair 开着 `Tofelair#280` 的会话，会让 harold-skills 的 #280 被当成「已有会话」跳过。2026-11-20 查：harold-skills 开着的 issue 号最大 431，Toeflair 的 issue 号覆盖了这个范围，号码重叠是常态。现在两个任务也有同样的问题，只是一个调度之后它每一轮都会碰到，所以一起改。

### 根因

- 问题 1：调度的前提是「工作目录是主 checkout」，`<docs>`、`<仓库名>` 都从当前目录取（`issue-dispatch/SKILL.md`「前提与边界」）；任务 id 是 `dispatch-<仓库名>`（`claude-desktop.md`、`magi.md`「调度」）。调度只认识它脚下那一个项目，因为 0.2.0 之前没有一处列出这台设备上的全部项目。#252 建了项目清单（`~/home/AGENTS.md` 的「## 项目」），#333 的 `dyna home where --project <名字>` 能从名字拿到项目目录、`owner/repo`、本地 clone，这个前提可以去掉了。
- 问题 3：数会话的规则是为「分组跨项目共用、总数跨项目算」写的（#379），同号跳过沿用了同一个「任何仓库名」的匹配。

## 方案

改完后：一台设备只有一个调度定时任务 `dispatch-home`，开在 `~/home`。每小时一轮，按项目清单的顺序对每个项目做一遍现在的「每一轮」（对账、看时段、数同号会话、派），派出的会话照旧开在各项目自己的 worktree 里。人在任何目录敲一次 `/idea-loop:issue-dispatch` 就起好；项目搬进 home、登记进项目清单，下一轮就被调度，不用再敲。

决定一轮派什么的输入：

- 项目清单（哪些项目、按什么顺序）；
- 每个项目目录里 `ISSUE_TRACKER.md` 的「调度」表（时段、每轮最多新开几个），跟现在一样，按项目各自读；
- 侧边栏三个分组里标题是「<这个项目的仓库名>#<号> …」的会话（只用来跳过同号）。

![一轮调度的时序](assets/sequence-dispatch-one-per-device.png)

图里六方：定时任务 `dispatch-home`、调度会话（开在 `~/home`）、`dyna`、项目的本地 clone、侧边栏分组、issue 会话。红色是本 spec 新增或改动的消息，虚线是返回。灰条之下对项目清单里每个项目做一遍。

### 调度会话一轮做什么

1. `git -C ~/home pull --ff-only`（home 有远端时），`dyna home projects` 列出项目清单里每个项目的名字、项目目录、`owner/repo`、本地 clone、在不在 home。
2. 按清单顺序，对每个项目：
   1. **跑不了的跳过**：不在 home（`where` 报「还没搬」）、本地 clone 不存在、clone 不在默认分支上、`git -C <clone> pull --ff-only` 失败，记一行进汇报，接着下一个项目，不挡后面的。照 #333「dreaming-home 对账各项目」的「跑不了的项目」。
   2. **对账、时段**：照现在第 1、2 步，`<docs>` 是这个项目的 `<项目目录>/docs/`，`git` 用 `git -C <clone>`。
   3. **数同号会话**：只记标题是「<这个项目的仓库名>#<号> …」的会话号（问题 3）。
   4. **派**：照 #400 之后的第 5 步，取前 <这个项目这一时段的 limit> 个（跨项目怎么算见「待定」）。建 worktree、交出、归位、发任务的做法不变，`<主 checkout>` 换成这个项目的本地 clone。
   5. **早上汇总**：照现在第 6 步，记录文件仍是 `~/.idea-loop/dispatch/<仓库名>.json`。
3. **汇报和推送合成一份**：汇报每个项目一节；推送只发一句，合计各项目（交出几个、几个等审、几个卡住、几个项目跳过）。

### 起调度

人敲 `/idea-loop:issue-dispatch`（在哪个目录都行）：

1. 用「定时任务」在 `~/home` 建（已有就更新）`dispatch-home`：标题 `issue 调度`，`7 * * * *`，prompt `/idea-loop:issue-dispatch`。
2. 列出已有的 `dispatch-<仓库名>` 任务，逐个停用（只停用不删，照 #247 停用 `dreaming-<仓库名>` 的做法），汇报里列出停了哪几个。不停的话，旧任务和 `dispatch-home` 同一小时各跑一轮，同号跳过只看已经在分组里的会话，两边会给同一个 issue 各开一个。
3. 立刻做第一轮。

### 同一行为的其他入口

| 入口 | 处理 |
|---|---|
| 桌面端定时任务（`claude-desktop.md`「调度」三处） | 纳入：任务 id、建在哪、`<主 checkout>` 换成各项目 clone |
| magi（`magi.md`「调度」三处） | 纳入：同样改成一个 `dispatch-home`，`magi cron` 的工作目录是 `~/home`；`magi sessions start --cwd` 照旧是 issue 的 worktree |
| 人在调度会话里说话的那一轮 | 纳入：走同一条路，对全部项目做一遍 |
| 已有的 `dispatch-<仓库名>` 任务 | 纳入：起调度时停用（上面第 2 步） |
| 每个项目各一个的 `triage-<仓库名>`（backlog 分拣）、`seo-scan-<仓库名>` 定时任务 | 排除：#386 只说调度；它们也是一个项目一个，要不要并成设备级另开 issue（见「Out of scope」） |
| 没搬进 home 的项目 | 排除：#333 定了只认 home，`where` 报错的项目跳过并写进汇报 |

## User Stories

只改结构、不加能力，每个问题一行期望行为：

1. 问题 1：一台设备只有一个 `dispatch-home` 定时任务；项目清单里每个已搬进 home 的项目都在同一轮里被派；新登记一个项目，下一轮就被派，不用再敲命令。
2. 问题 2：随 #400 消失，不在本 spec 里另做。
3. 问题 3：派一个项目时，只有标题是「<这个项目的仓库名>#<号> …」的会话让同号 issue 跳过；别的项目同号的会话不影响它。

## 实现决策

### 已定

- **任务 id `dispatch-home`，开在 `~/home`**：照 #332 定的 `dreaming-home`（「我倾向于设备纬度只有一个dreaming任务」），设备级任务开在 home、id 带 `-home`。定时任务的会话用建它的会话的目录（`claude-desktop.md`「定时任务」），所以建在 `~/home` 里。
- **列项目扩展 `dyna home`，加 `projects` 命令**：输出项目清单每一行加上 `where --project` 的结果（JSON 数组）。依据：「先扩展已在用的工具」；#333 已有 `where`，`dreaming-home` 逐个对账项目也要同样的列表。不新增脚本。
- **项目顺序就是项目清单的顺序，逐个项目串行**：照 #333「dreaming-home 按项目清单的顺序」。一个项目出错（跑不了）跳过，不挡后面。
- **时段表仍按项目各自的 `ISSUE_TRACKER.md`**：现成的、`dyna issues queues` 已经读它；harold-skills 白天每轮 6、Toeflair 用默认 3，两个项目本来就不一样（`ISSUE_TRACKER.md`「调度」一节，2026-11-20 集成分支）。不搬到 home。
- **不想被调度的项目**：在它的 `ISSUE_TRACKER.md` 写一张只有表头的「调度」表（「表里没覆盖的时间不派」，已是现行规则）。2026-11-20 项目清单里只有 harold-skills，#247 搬完会加 Toeflair，两个都在用调度，没有要排除的真实项目；所以默认全部调度，不另加开关。人可以推翻。
- **同号只认本项目仓库名**：问题 3；正确性修复，没有分歧。
- **停用旧任务放在起调度里，不放 #247**：#247 搬家停用 `dreaming-<仓库名>`，但调度是人敲命令才起的，不随搬家；在起 `dispatch-home` 的同一步停用旧的，两个调度就不会并存。告诉 #247 会话不用管 `dispatch-<仓库名>`。
- **记录文件、早上汇总的口径按项目不变**：`~/.idea-loop/dispatch/<仓库名>.json` 已经按仓库分；上一轮时刻改读 `dispatch-home` 的上次成功运行。
- **前提「工作目录是主 checkout、只读」改写**：调度会话在 `~/home` 只读（不提交）；对每个项目的 clone 只做 `git -C <clone> pull --ff-only` 和建 worktree，跟现在对主 checkout 做的一样，不切分支、不改文件。

### 待定：一轮最多新开几个，跨项目怎么算

依据为什么没有：#400 人的原话「每轮调度的会话是3个，但是总共的活跃会话没有上限」是在 Toeflair 的调度会话里、对一个项目说的；只剩一个调度之后，「每轮 3 个」是每个项目 3 个，还是整台设备 3 个，没有人说过。

真实例子：今晚 22:07 那一轮，2026-11-20 查到 todo：harold-skills 6 个、Toeflair 26 个，两边夜里的表都是每轮 3。

- **A（推荐）每个项目各按自己的表**：这一轮 harold-skills 开 3、Toeflair 开 3，一共 6；第 3 轮 harold-skills 没有 todo 了，之后每轮只开 Toeflair 的 3 个。夜里 22:00–08:00 十轮最多开 32 个会话（harold-skills 6 个全开、Toeflair 26 个全开）。不加配置，项目的表说多少就是多少。
- **B 整台设备一个总数**：在 home 加一处设备级的「每轮最多 N 个」（比如 3），按项目清单轮流取：这一轮 harold-skills 2 个、Toeflair 1 个，下一轮反过来。夜里十轮最多 30 个，Toeflair 有 2 个第二晚才开。多一份设备级配置，项目表里的数字变成「这个项目每轮最多分到几个」。

推荐 A：跟 #400 的口径（每轮新开数按项目表、总数不设上限）一致，不加新配置；担心夜里额度的话，额度保护本来就在 #379 的 Out of scope。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 涉及：`dyna home projects` 的输出（清单解析、每行带 `where` 结果、没搬的项目标出来） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 涉及：`dyna home projects --json` 的字段，在 `dyna registry` 登记 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval | 不涉及：skill 文字改动按仓库约定不做 quantitative eval，靠文档测试和一次真实运行 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及浏览器；端到端是一次真实运行，见下 |

- **seam**：
  - `dyna home projects` 的 JSON 输出：抓得到清单解析、项目在不在 home；漏掉调度会话照不照做。
  - 文档测试（`dispatch-by-period-doc.test.mjs` 一类）：断言调度、`claude-desktop.md`、`magi.md` 里不再有 `dispatch-<仓库名>`、「工作目录是主 checkout」，有 `dispatch-home`、`dyna home projects`、同号只认本项目仓库名；抓得到文字改没改干净，漏掉模型照不照做。
- **增量功能测试**：
  1. 前置：临时 home，项目清单两行，一个有 `docs/`、一个没有。步骤：`dyna home projects --json`。期望：两行都在，第二行标「没搬」并带原因。覆盖：问题 1。
  2. 前置：本机 home 已登记 harold-skills 和 Toeflair，旧的两个 `dispatch-*` 任务开着。步骤：在任意目录敲 `/idea-loop:issue-dispatch`。期望：`list_scheduled_tasks` 里有 `dispatch-home`（工作目录 `~/home`），两个旧任务 `enabled: false`；第一轮汇报两节，每节写这个项目的时段和交出的 issue。覆盖：问题 1。
  3. 前置：Toeflair 有一个号为 N 的会话在 triage 分组，harold-skills 的 #N 是 triage 候选。步骤：白天跑一轮。期望：harold-skills 的 #N 被交出。覆盖：问题 3。
- **照着谁写**：`dyna/internal/home/home_test.go`、`registry_test.go`（`where` 的测试与登记）；`idea-loop/scripts/dispatch-by-period-doc.test.mjs`（调度文字的绊线）。

## Out of scope

- **额度保护**：同 #379，夜里不看剩余额度。
- **`triage-<仓库名>`、`seo-scan-<仓库名>` 并成设备级**：同样一个项目一个，但不是调度；要做另开 issue。
- **公司虚拟机**：magi 一侧照「同一行为的其他入口」改文字；真机验证由人在虚拟机上做，本 spec 只在本机验证。

## 关联

- 相关 spec：[[dispatch-day-night-modes]]（#379，现行调度；本 spec 改它的「怎么一轮一轮跑」和前提）、[[skills-read-home]]（#333，`where`、项目目录、dreaming-home 逐个项目的写法）、[[home-bootstrap]]（#252，项目清单）、[[idea-loop-cli]]（#339，`dyna` 命令与登记表）。
- 相邻还没完成的，查过（2026-11-20）：
  - PR #400（#398，main，open）：上限改成每轮新开数。**本 spec 依赖它**：实现从 #400 同步进 `release/idea-loop-0.2.0` 之后的提交做；#400 若被否，「待定」那道题照旧成立，只是改回按空位算。
  - #340（skill 合并与重写，todo）：06 号工单重写 `issue-dispatch`、`issue-session`，运行环境的调度三处改成 `dyna` 命令。**#340 先做**，本 spec 在它重写后的文字上改，避免两边同时改同一份文件。
  - #247（迁到 home，todo）：不用停用 `dispatch-<仓库名>`，由起调度那一步做；已在共享笔记告诉它。
  - #332（dreaming-home）：同为设备级任务，`dyna home projects` 它也能用，没有重叠。
