---
type: spec
status: 审核中
tags: [idea-loop, issue-dispatch, issue-session, scheduling, priority]
summary: 开 issue 时挂模块根、判 P0；调度只给 P0 和本期焦点出卡片；想法有入口；停 cloud 整合；implement 自动切票
related: ["[[2026-11-02-issue-intake-priority-grill]]", "[[issue-consolidation]]", "[[no-decision-autopilot]]", "[[retro-candidate-pool]]"]
issues: [217]
---

# issue 入口按价值收紧：开 issue 时挂模块、判 P0，调度只给 P0 和本期焦点出卡片

> 需要 grill：人要重新讨论 issue 的调度（2026-11-03，原话「我想对issue的调度进行重新的讨论」），实现决策里调度相关的几节待重定

> #217 存在：harold-skills 2026-10-31 三次 cloud 整合只合了 2 个 issue，#178 三次都判「不是同一处」；本 spec 停掉 cloud 整合，挂根移到开 issue 时，它要的「按版本 / 按模块聚合」定为按 plugin 聚合（见实现决策「按版本发布的仓库，模块就是 plugin」），翻页 403 和汇报语言两条随整合任务一起消失
> #220 存在：调度按号先进先出、会话自动开非 P0 的存量 issue、新 issue 等 6 小时，对着 origin/main（877341b）的 idea-loop 0.1.9 核过仍是这样；两个仓库的开 / 关数与各段耗时见「问题」1 和 7

## 问题

2026-11-02 对着两份材料核过：Toeflair 仓库（guohaonan-shy/TOFEL-demo）的 GitHub issue 与 origin/main 的 git 历史；本仓库 origin/main（877341b）上 idea-loop 0.1.9 的 skill 与脚本。

### 1. issue 开得比做得快，队列只会越排越长

Toeflair 开着 151 个 issue，其中待验证 122 个（107 个没打分类）。按周开 / 关：

| 那一周 | 开 | 关 |
|---|---|---|
| 10-12 | 78 | 15 |
| 10-19 | 57 | 17 |
| 10-26 | 95 | 47 |

关的速度翻了三倍，开的速度更快。本仓库（harold-skills）同样：10-19 那周开 28 / 关 12，10-26 那周开 62 / 关 47；开着 36 个，其中待验证 33 个。做完的从开到关中位数 4.5 天；按这个速度，现存的 122 个要排几个月。

### 2. 调度不判值不值得现在做，按号先进先出

调度每轮「取最早的待验证 issue」出卡片（`issue-dispatch` 的「每一轮」第 5 步），脚本 `issues candidates` 只按「没 label、没被 spec 列着、不是 spec issue、属于这个队列」过滤，按号排序截断。一个线上安全问题和一个三周前的文案小改，谁号小谁先出卡片，人的会话位被先到的占满。

### 3. 会话自己就是 issue 的最大来源

Toeflair 待验证的 122 个按来源：

| 来源 | 个数 |
|---|---|
| issue 会话路上顺手发现的 | 47 |
| 其他（人直接开的等） | 39 |
| 人在 review 或验收时提的 | 15 |
| cloud 整合开出的根 | 12 |
| retro | 5 |
| 想法 | 3 |
| SEO 扫描 | 1 |

顺手发现的这 47 个，是规则让会话自动开的：`implement` 对「跟这次无关的存量问题」逐条自动开 issue（依据 `decision-rules`「自己定的四条」第 2 条：存量问题开 issue），`issue-session` 的「边界」也让路上发现的别的问题照 `spec-status`「开一个待验证的 issue」开出去。开之前没有人看过值不值得做。

### 4. 合并要等 cloud 整合，新 issue 先等 6 小时

把同一模块的 issue 归到一个根下，靠一个每 6 小时跑一次的 cloud 定时任务（spec issue-consolidation）。为了让它先归组，`issues candidates` 跳过开了不到 6 小时的 issue（`issues.mjs` 的 `NEW_ISSUE_WAIT_MS`）。线上坏了的新 issue 也照样要等，最长 6 小时才有卡片。整合任务另需装 Claude GitHub App、清连接器，规则写在一份 cloud 会话才读得到的 prompt 里（`setup` 的「整合定时任务」）。

### 5. 突然想到的想法没有入口

想法开成 issue 后跟缺陷一起排队：调度给它出卡片，`issue-verify` 先「复现」它，可想法没有东西可复现。人想要的是：一想到就自己开一个会话，先记下来免得忘，接着在这个会话里 grill。现在没有这条路：`issue-session` 只认已有的 issue 号。

### 6. 手动敲 implement 时，没工单就停下

`implement` 的前提是 `tickets/` 下已有工单，没有就停下，告诉人先跑 `to-ticket`（`implement` 的「什么时候」一节）。`to-ticket` 本身切完就落盘、不等人看，人也不看切法；手动开工时却要连敲两次命令。

### 7. 一个 issue 的时间几乎都花在排队和等人上，机器干活的几段已经很快

2026-11-02 从两个仓库全部 issue 的 label 时间线算（每次翻 `status:*` 的时刻），取中位数：

| 段 | 谁在做 | Toeflair | harold-skills |
|---|---|---|---|
| 开出 → 被认领（验证中） | 排队等卡片、等人点 | 124 小时（n=85） | 37 小时（n=39） |
| 验证中 → 出审核 | 机器复现、起草；要定的跟人 grill | 0.8 小时（n=46） | 2.9 小时（n=27） |
| 其中停在审核中 | 等人 grill | 0.4 小时（38 / 61 个进过） | 1.7 小时（21 / 33 个进过） |
| 设计中 | 人和设计师 | 44 小时（n=5，最长 268 小时） | 没有走过设计的 |
| 实现中 → 关闭 | 机器实现、review、人点合并 | 5.3 小时（n=44） | 7.3 小时（n=26） |
| 实现 PR 开出 → 合并 | 等人说合并 | 2.2 小时（n=24） | 1.1 小时（n=19） |
| 开出 → 关闭（全程） | | 91 小时（n=63） | 70 小时（n=44） |

Toeflair 还在待验证的 111 个，中位已等 144 小时，46 个超过 7 天。排队那一段占了全程的大头；验证、审核、实现加起来不到 10 小时。人一旦开始看，审核中的中位只停 0.4–1.7 小时。

排队长不是因为机器慢，是会话位被等人的会话占着。2026-11-02 Toeflair 主队列开着 8 个 issue 会话（上限 10）：

| 会话所在 section | 个数 | 最后一次动静 |
|---|---|---|
| 审核中 | 5（#713 #721 #731 #732 #738） | 10-31 06:42 至 11-01 06:36，label 停在审核中 29–53 小时 |
| 设计中 | 2（#407 #719） | 10-31，#407 设计中已 268 小时 |
| 实现中 | 1（#730） | 11-02 |

8 个里 7 个一天以上没动，等的都是人。另有 5 个 issue 的 label 是「中」或「待实现」却没有会话（#465 #466 实现中 284 小时、#429 设计中 246 小时、#471 #420 待实现 66–284 小时）：调度每轮已把它们写进汇报的「没有会话的 issue」，一直没人接。

数据与脚本在 `.tmp/to-spec/issue-intake-priority/repro/`（不提交）。

### 根因

问题 1–4 是同一个：入口没有优先级。开 issue 不判价值、自动开不经人、调度先进先出，所以开多少就排多少。问题 5、6 不涉及根因（缺入口、缺一步衔接）。问题 7 说明提吞吐的地方不在机器那几段：开出的数量（入口）和人的注意力（会话位被等人的会话占着）才是瓶颈，这次只收紧入口；等人的会话占位暂不处理（见实现决策「调度汇报不加『在等你的会话』」）。

## 方案

人最终得到：

- **P0 来了就有卡片**：线上坏了或安全问题（权限、付款、数据越权），开 issue 时就标 P0，调度下一轮就给它出卡片，不等 6 小时，不看焦点。
- **只做本期焦点**：目标仓库的 `ISSUE_TRACKER.md` 写一行「本期焦点」，列几个模块名。调度只给这些模块的 issue 出卡片（P1）。换焦点就改这一行，下一轮生效。
- **其余的留着，不占位**：不在焦点、又不是 P0 的（P2）不出卡片，也不关。每周一 Dreaming 的提议表把这周新进的 P2 和想法列成一节；人可以在 Dreaming 会话里顺手聊几句，给它们定 P0 或改模块，也可以不管。人想做哪一个，照旧 `/idea-loop:issue-session <号>` 接上。
- **开 issue 时就归好模块**：每个 issue 开出来就挂到它所属模块的根下面；人直接在 GitHub 上开的，调度对账时补挂、补判 P0。cloud 整合任务停掉，6 小时等待删掉。
- **会话顺手发现的，人批了才开**：P0 照样当场开；不是 P0 的写进汇报，人批了才开。
- **想法有自己的入口**：人自己开一个新会话（带 worktree），说「新想法，开聊：<一句想法>」。会话开一个想法 issue（不进调度队列），接着在同一个会话里照 issue-session 走：不复现，直接 grill；有了 spec 就照常进「设计中」或「实现中」。
- **implement 一个命令开工**：没工单就自己调 to-ticket 切完，接着做。

由哪些输入决定：issue 的标题、正文和它是不是 P0；`ISSUE_TRACKER.md` 里的「本期焦点」；根 issue 的标题（即模块名）。

同一行为的各个入口：

- `spec-status`「开一个待验证的 issue」：纳入。所有开 issue 的流程都照它，在这里加挂根、判 P0。
- `issue-dispatch` 对账与出卡片：纳入。补挂根、补判 P0；候选只取 P0 和焦点模块的；人在调度会话里说要开的 issue 也照上一条开。
- `issues candidates`：纳入。按 P0 与焦点过滤，删 6 小时等待。
- `implement` 的「跟这次无关的存量问题自动开 issue」、`decision-rules` 第 2 条、`issue-session`「边界」：纳入，改成非 P0 要人批。
- `pr-review` 的「开 issue」、`retro` 的批了开 issue、Dreaming「缺陷」节：纳入，但它们本来就是人批过的，只是开的时候照新的入口挂根、判 P0。
- `issue-session` / `issue-verify`：纳入，加想法入口；想法不复现。
- `setup` 的「整合定时任务」与它的 prompt：纳入，删掉。
- `implement` 的前提：纳入，没工单自己切。
- `seo-scan` 开的 issue：纳入开 issue 的入口（挂根、判 P0），但不受焦点限制：seo 是独立队列，有自己的上限，焦点只管主队列（理由见实现决策）。
- `issue-session` 里大小走不同的流程：排除，见实现决策「大小不加机制」。

## User Stories

<!-- 待补图：User Stories 的树（照 idea-loop:evidence 的「User Stories 的树」），按下面四个场景画 -->

### 场景：issue 进来

1. 作为 Harold，我想要线上坏了或安全的问题一开出来就标成 P0，以便它下一轮就有卡片
2. 作为 Harold，我想要每个 issue 开出来就挂在它所属模块的根下，以便同一模块的事在一个会话里做完
3. 作为 Harold，我想要我直接在 GitHub 上开的 issue 也由调度补挂模块、补判 P0，以便我不用记规则
4. 作为 Harold，我想要在调度会话里说一句就开出 issue，以便线上看到的问题当场记下
5. 作为 Harold，我想要会话路上发现的非 P0 问题先写进汇报、我批了才开，以便 issue 不再自己越长越多
6. 作为 Harold，我想要会话路上发现的 P0 照样当场开，以便要紧的不被汇报压住
7. 作为 Harold，我想要新 issue 不再等 6 小时才有卡片，以便 P0 当轮就能开工
8. 作为 Harold，我想要 harold-skills 这类多插件仓库的 issue 按插件挂根，以便焦点写一个插件名就够

### 场景：调度出卡片

1. 作为 Harold，我想要在 `ISSUE_TRACKER.md` 里写一行「本期焦点」的模块名，以便调度只给我现在要推的模块出卡片
2. 作为 Harold，我想要 P0 不受焦点限制，以便焦点之外的线上事故也有卡片
3. 作为 Harold，我想要不在焦点的 issue 不出卡片也不被关掉，以便换焦点时它们还在
4. 作为 Harold，我想要改了焦点之后下一轮就按新焦点出卡片，以便换方向不用改任何配置
5. 作为 Harold，我想要卡片里的 P0 排在焦点之前，以便空位先给最要紧的
6. 作为 Harold，我想要想法 issue 不进调度队列，以便它们只在我自己开聊时才占会话

### 场景：想法

1. 作为 Harold，我想要自己开一个新会话说「新想法，开聊」就把想法记成 issue，以便一转头忘了也找得回来
2. 作为 Harold，我想要这个会话接着就 grill 我的想法、不先复现，以便趁热把它想清楚
3. 作为 Harold，我想要想法 grill 出 spec 后照常进「设计中」或「实现中」，以便它跟别的 issue 走同一条路
4. 作为 Harold，我想要每周一 Dreaming 列出这周进来、还没开聊的想法和 P2，以便它们不被忘掉
5. 作为 Harold，我想要在 Dreaming 会话里顺手给这些 issue 定 P0 或改模块，而这一步可以跳过，以便有空才管

### 场景：开工

1. 作为 Harold，我想要 `/idea-loop:implement <slug>` 遇到没切票的 spec 就自己切完接着做，以便我只敲一个命令
2. 作为 Harold，我想要整合任务停掉之后，`setup` 不再让新仓库装它，以便新仓库不多一套没用的东西

## 实现决策

### 优先级按价值，不按工单数

P0 = 线上坏了，或安全问题（权限、付款、数据越权）；P1 = 属于「本期焦点」里某个模块；P2 = 其余。依据：人的原话「价值定优先级」（见 raw transcript U9）。被否掉的「≤3 张工单 = P2」：Toeflair 已实现的 44 份 spec 里 37 份不超过 3 张工单，包括 `student-table-rls`（1 张，学生数据不登录可读写）和 `stripe-billing-correctness`（3 张），而且工单数要到切票后才知道，出卡片时还不知道。

### 只有 P0 是 label，P1 / P2 每轮现算

P0 存成 issue 上的 `priority:P0` label，由 idea-loop 管（跟 `status:*` 一样，`issues labels` 建出它，不算多余 label）。P1 / P2 不存：调度每轮按根的标题是否在焦点里现算，焦点一改，下一轮就变，没有 label 要同步。依据：「换焦点就改这一行」是人要的（U10「写模块名」）；把 P1 存成 label 要在换焦点时逐个改，会漏。

判 P0 的是开 issue 的那一方（会话、调度），按上面的定义判；拿不准就不标，P0 只放确定的。人可以手动加减这个 label。

### 模块就是根 issue，根的标题就是模块名

沿用 spec issue-consolidation 的根与子 issue（GitHub 原生 sub-issue），根的标题写模块名，和焦点里写的同一个词。开 issue 时：

1. 判它属于哪个模块：改的是哪个页面、功能模块，或哪个文件（判法沿用整合 prompt 里的「什么算同一组」，原文搬进 `spec-status`）。
2. 找这个模块开着、还没开工（没有 `status:*` label）的根，有就挂上去。
3. 没有，就新开一个根（标题写模块名，正文第一行写「模块根，由 idea-loop 开出」），把它挂上去。模块已有的根都开工了，也新开一个：开工的根不再收新的子 issue（沿用 issue-consolidation 的规则），新根是同一模块的下一批。

和 issue-consolidation 不同的一点：只有一个 issue 也开根。依据：焦点是按模块名判的，issue 不在根下，就判不出它属于哪个模块。

拿不准属于哪个模块的，不挂，它就是 P2（不在任何焦点模块里），等人在 Dreaming 或 GitHub 上归。

### 焦点写在 ISSUE_TRACKER.md

目标仓库 `ISSUE_TRACKER.md` 加一节「本期焦点」，一行模块名，用顿号隔开，例：`本期焦点：Email 报告、付款`。`issues candidates` 读这一行，根的标题与其中一个模块名完全相同就算焦点。没有这一节或这一行是空的：只出 P0 的卡片，汇报里写「没有本期焦点，只出了 P0」。`setup` 写 `ISSUE_TRACKER.md` 时带上这一节，留空让人填。

依据：焦点由人定（U10）；放在 `ISSUE_TRACKER.md` 而不是调度会话里，是因为调度、Dreaming、issue 会话都要读它。

### 候选的顺序与过滤

`issues candidates` 只出：带 `priority:P0` 的（根，或没有父 issue 的 issue），再接标题在焦点里的根；各自按号从小到大。子 issue 照旧不出（它随根走），带想法 label 的不出，6 小时等待删掉（`NEW_ISSUE_WAIT_MS` 和它的过滤一起删）。子 issue 带 P0、根不带的：对账时把 P0 提到根上，这一组就当 P0 出卡片。

独立队列（如 seo，「issue 分类」里注了「独立队列，上限 N」的）不看焦点，照旧按号出，只是 P0 排前面。依据：独立队列本来就有自己的上限，是人为它单独留的会话位；焦点管的是主队列里人的注意力。

### 调度对账时补挂、补判

`issue-dispatch` 每一轮在 `issues reconcile` 之后多一步：对没有父 issue、自己也不是根、不带想法 label 的待验证 issue，逐个照「开一个待验证的 issue」的挂根、判 P0 两步补上。这是模型判断，写成调度 skill 的一步，不进脚本。调度会话不改文件，但改 GitHub 上的 label 和 sub-issue 跟它现在的对账同类，允许。

人在调度会话里说「开个 issue：…」，调度照同一个入口开。

### 会话顺手发现的：P0 照开，其余人批

`decision-rules`「自己定的四条」第 2 条改成：存量问题是 P0 的，开 issue；不是 P0 的，写进汇报的「要你决定」，每条一个「开 issue」的选项，人批了才照入口开。`implement` 的「跟这次无关的存量问题自动开 issue」、`issue-session` 的「边界」照这条改。例外不变：让这次改动拿到错的数据、让结论站不住、让 CI 变红的，这次修。依据：问题 3 的 47 个；人在 U3 选「收紧入口」。

已经是人批过才开的入口（`pr-review` 的「开 issue」、`retro`、Dreaming「缺陷」）不改批不批，只照新入口挂根、判 P0。

### 想法：一个 label、一句开场、不复现

- label：idea-loop 管一个 `Idea` label（GitHub 的 label 名不分大小写，Toeflair 已有的保留 label `Idea` 就是它）。带它的 issue 不进候选。
- 入口：人在一个带 worktree 的新会话里说「新想法，开聊」加一句想法（`issue-session` 的 description 加这个触发词）。会话：
  1. 照「开一个待验证的 issue」开 issue，打 `Idea`，标题写想法本身，正文照录人的原话；挂模块根、判 P0 照样做（想法基本不是 P0）。
  2. 接着把自己当成这个 issue 的 issue 会话，照「人直接调的你」那条从「审核」开始（`issues set` 认领成验证中、归位到「审核中」section、改标题）。
- 验证：`issue-verify` 遇到带 `Idea` 的 issue 不复现，结论写「存在：这是一个想法，不复现」，直接跟人 grill，照常起草 spec、合进主分支。之后跟别的 issue 一样走设计、实现。
- 没在 worktree 里：停下告诉人开一个带 worktree 的会话再说，issue 先开好，号码交给人（想法已经记下，不丢）。

### Dreaming 加「P2 与想法」一节

提议表新加一节，列这周新开、还开着、不是 P0、不在焦点里的 issue，以及还没开聊的想法：每行号、标题、所属模块（没挂根写「未归模块」）。每行的处理选项：定为 P0 / 改挂到某个模块 / 不动（默认）。人可以在 Dreaming 会话里聊，聊完照选项改；不选就是不动。依据：U10「当然这些都是可选的」。不列上周以前的：存量清理另做（见 Out of scope）。

### 大小不加机制

不按工单数分流程。依据：实现阶段本来就不停（spec no-decision-autopilot：切票直接落盘，没有决定题就放行，只在生产操作和合并前停）；`issue-session` 的「实现」一步是 to-ticket 接 implement，中间不停。小的 spec 已经在走快车道。

### implement 没工单就自己切

`implement` 的前提改成：spec 是「实现中」（或「正式」，切票会把它翻成实现中），`tickets/` 下没有工单就用 Skill 工具调 `idea-loop:to-ticket` 切，切完接着派工；工单文件照旧保留（执行方各读自己那一张，靠「被谁挡着」并行）。旧布局照旧先停下迁移。

### 按版本发布的仓库，模块就是 plugin

harold-skills 这类一个仓库里放多个独立发版插件的，根标题写插件名，跟 `type:` 父类同一个词（`idea-loop`、`excalidrawer`…），焦点也写插件名，例：`本期焦点：idea-loop`。例：#178（改 AGENTS.md 的发版约定）开出时挂到「idea-loop」根下。依据：人在 #220 的会话里定「按plugin」（2026-11-03）。没选「按下一版本」：版本号是合并时才补的（PR #213 合并时才把 idea-loop 0.1.8 升到 0.1.9，提交 1e2a2c4），开 issue 时还不知道它随哪个版本发；发哪个版本照旧在合并时定。一组可能很大，靠「开工的根不再收新子 issue」切批。

插件里不写哪个仓库是哪种：「issue 分类」一节的父类本来就是按插件分的仓库，模块取父类名；其余仓库按页面、功能模块或文件判。这条判法写进 `spec-status`「开一个待验证的 issue」的挂根一步。

### 调度汇报不加「在等你的会话」

问题 7 里会话位被等人的会话占着，这次不处理：调度汇报照旧只写「开着的会话 / 上限」，等人超过 24 小时的会话照旧占位。依据：人在 #220 的会话里定「调度汇报暂时不需要」（2026-11-03）。

### 停掉 cloud 整合

`setup` 删「整合定时任务」一节和 `references/consolidation-prompt.md`，汇报里不再列它；README 同步。已经建好的两个 cloud 定时任务（Toeflair、harold-skills 各一个）不在插件里删：实现合并后，由人确认再停（routine 是账号上的东西，插件管不到）。#217 记的两个整合任务的毛病（Toeflair 每次翻页撞 403、汇报一次写成英文）随任务停掉一起没了，不再单独修。spec issue-consolidation 里根与子 issue 的规则（一组一份 spec、一个会话、一起翻状态）不变，只是挂根的时机从 cloud 移到了开 issue 时。

## 技术方案总览

### 后端

不涉及。插件只有 skill 文本和 `issues.mjs`。脚本的变化：

- `issues candidates`：读 `ISSUE_TRACKER.md` 的「本期焦点」；只出 `priority:P0` 和焦点里的根；跳过 `Idea`；删 6 小时等待。
- `issues labels`：建 `priority:P0` 与 `Idea`，两者都不算多余 label。
- `issues reconcile`：子 issue 带 P0、根不带时，给根加 `priority:P0`。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：`issues candidates` 的过滤与排序、焦点行的解析、`labels` 的受管 label、`reconcile` 把 P0 提到根 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：skill 文本的改动按仓库约定 vibe 迭代，不做 baseline；第 2 条规则的改动走 retro 回放（见下） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`issues.mjs` 导出的函数，喂假的 `gh`（`issues.test.mjs` 已有的写法）。能抓到：哪些 issue 出卡片、什么顺序、焦点和 P0 的判定、label 清单；漏掉：模型判模块、判 P0 判得对不对（skill 文本里的判断，靠人在汇报里看）。
- **增量功能测试**：
  - 前置：假 `gh` 给出 #1（P0，无父）、#2（根，标题「Email 报告」）、#3（根，标题「付款」）、#4（#2 的子 issue）、#5（`Idea`）、#6（无父、带 P0、刚开 1 分钟）；焦点行「本期焦点：Email 报告」。步骤：`candidates`。期望：`[1, 6, 2]`；#3 不在焦点、#4 是子 issue、#5 是想法，都不出。覆盖：调度出卡片 1、2、5、6，issue 进来 7。
  - 前置：没有「本期焦点」一节。期望：只出 P0。覆盖：调度出卡片 1、2。
  - 前置：独立队列 seo 里有一个非 P0 的根和一个 P0 的 issue。期望：两个都出，P0 在前。覆盖：调度出卡片 2。
  - 前置：根 #2 无 P0，它的子 #4 带 P0。步骤：`reconcile`。期望：#2 加上 `priority:P0`。覆盖：调度出卡片 2、5。
  - 前置：仓库里没有 `priority:P0`、`Idea`。步骤：`labels`。期望：两个都建出，不出现在多余 label 里。覆盖：issue 进来 1，想法 1。
  - 规则回放：`decision-rules` 第 2 条与 `implement` 自动开 issue 的改动，照 `evals/retro/` 取一个历史上自动开出非 P0 存量 issue 的决策点，改前「开了」、改后「写进要你决定」。覆盖：issue 进来 5。
- **prompt / eval 变动**：无 prompt/eval 变动（skill 文本不算 prompt eval；回放用例见上）。
- **照着谁写**：`issues.test.mjs` 里 `candidates of the main queue skip own-queue issues` 那一组。

## Out of scope

- 清理 Toeflair 现存的 151 个 issue（挂根、判 P0、关掉不值得做的、清空的整合根）：是目标仓库的活，插件改完后在 Toeflair 里单独做。
- 停掉已建的两个 cloud 定时任务：账号上的 routine，实现合并后人确认再停。
- 按大小分流程：不加机制，理由见实现决策「大小不加机制」。
- 给 P2 自动过期关闭：人选了留着、在 Dreaming 里看（U10）。
- 焦点管独立队列：理由见实现决策「候选的顺序与过滤」。

## 关联

- 覆盖：#220（根）、#217（子 issue：整合任务按版本 / 模块聚合）。
- 相邻的 issue：#178（AGENTS.md 说插件 PR 合并时随哪个版本发）跟「按版本发布的仓库，模块就是 plugin」相关：发哪个版本仍在合并时定；#181 那一组（issue-verify 起草方案的质量）不在这里。

- raw：[[2026-11-02-issue-intake-priority-grill]]
- 改的是 [[issue-consolidation]] 定下的挂根时机（cloud 6 小时 → 开 issue 时），根与子 issue 的规则沿用。
- [[no-decision-autopilot]]：实现阶段不停的依据，「大小不加机制」靠它。
- [[retro-candidate-pool]]：Dreaming 提议表的已有一节，新节照它的形状写。
- 相邻还没完成的 spec：查过「实现中」的 design-archive-sections、design-md-write-entry、design-research-agent、dreaming-design-reconcile、pr-review-report-followups、ui-state-archive、uiux-imagine-agent。只有 pr-review-report-followups 碰 `decision-rules` 与汇报，与本 spec 改第 2 条有重叠：本 spec 只改第 2 条的处置，不碰它改的「交给人的题先做功课」；两边谁先合，后合的照主分支 rebase。dreaming-design-reconcile 碰 Dreaming 提议表，本 spec 只加一节，不改它的节。
