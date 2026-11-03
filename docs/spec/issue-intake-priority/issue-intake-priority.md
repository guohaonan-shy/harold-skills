---
type: spec
status: 实现中
tags: [idea-loop, issue-dispatch, issue-session, scheduling, priority, idea-loop-0-2-0]
summary: 开 issue 时挂模块根、判 P0；调度只出 P0 和本期焦点、审核中不占名额、每天列等你的；seo 不再单独排队；想法有入口；停 cloud 整合；implement 自动切票
related: ["[[2026-11-02-issue-intake-priority-grill]]", "[[2026-11-03-idea-loop-0-2-0-grill]]", "[[idea-loop-0-2-0-release]]", "[[issue-consolidation]]", "[[no-decision-autopilot]]", "[[knowledge-base-repo]]"]
issues: [220, 217]
---

# issue 入口按价值收紧：开 issue 时挂模块、判 P0，调度只出 P0 和本期焦点

> #217 存在：harold-skills 2026-10-31 三次 cloud 整合只合了 2 个 issue，#178 三次都判「不是同一处」；本 spec 停掉 cloud 整合，挂根移到开 issue 时，它要的「按模块聚合」定为按模块根聚合（harold-skills 的模块细到 `idea-loop/<子类>`，见实现决策「按分类定模块的仓库」），翻页 403 和汇报语言两条随整合任务一起消失
> #220 存在：调度按号先进先出、会话自动开非 P0 的存量 issue、新 issue 等 6 小时，对着 origin/main（877341b）的 idea-loop 0.1.9 核过仍是这样；两个仓库的开 / 关数与各段耗时见「问题」1 和 7

这份 spec 是 idea-loop 0.2.0 的 F1（[[idea-loop-0-2-0-release]]），2026-11-03 按 0.2.0 的决定记录（[[2026-11-03-idea-loop-0-2-0-grill]] 末尾「本轮决议」）改过：模块细到 `idea-loop/<子类>`、seo 不再单独排队、删掉 Dreaming 的「P2 与想法」一节、审核中不占名额、调度每天列「等你的」。同一版里另两件事各归各的 feature：P2 交给哪个执行环境自动跑、怎么开会话是 F4（工作环境）；issue 来源是 Linear 的项目怎么判 P0、判了记在哪是 F3（Linear）。这份只管「出哪些 issue、按什么顺序、怎么挂根、怎么判 P0」。

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

### 8. 按插件分模块，在 harold-skills 上过滤不掉东西

2026-11-03 harold-skills 开着 46 个 issue，几乎都打着 `type:idea-loop`（决定记录 A2）。焦点写「idea-loop」就等于没有焦点；要分得开，得细到 idea-loop 下的子类（engineering / design / productivity / seo）。

### 根因

问题 1–4 是同一个：入口没有优先级。开 issue 不判价值、自动开不经人、调度先进先出，所以开多少就排多少。问题 5、6 不涉及根因（缺入口、缺一步衔接）。问题 7 说明提吞吐的地方不在机器那几段：开出的数量（入口）和人的注意力（会话位被等人的会话占着）才是瓶颈，这次两头都收：入口按价值收紧，等人看 PR 的会话不再占名额，等你的会话每天列一次。问题 8 是模块的粒度：模块要细到焦点能分出主次。

## 方案

人最终得到：

- **P0 来了就有卡片**：线上坏了或安全问题（权限、付款、数据越权），开 issue 时就标 P0，调度下一轮就给它出卡片，不等 6 小时，不看焦点。
- **只做本期焦点**：业务的 `ISSUE_TRACKER.md`（知识库根）写一行「本期焦点」，列几个模块名。调度只给这些模块的 issue 出卡片（P1）。换焦点就改这一行，下一轮生效。harold-skills 这类按分类分模块的仓库，模块细到子类，焦点写 `idea-loop/engineering`。
- **其余的留着，不占位**：不在焦点、又不是 P0 的（P2）不出卡片，也不关。人想做哪一个，照旧 `/idea-loop:issue-session <号>` 接上。P2 交给哪个执行环境自动跑归 F4；这里给出 P2 按什么顺序出（`issues candidates --p2`）。
- **seo 不再单独排队**：seo 的 issue 跟别的一起排，照样挂模块根、判 P0、看焦点。
- **开 issue 时就归好模块**：每个 issue 开出来就挂到它所属模块的根下面；人直接在 GitHub 上开的、脚本开的（如 seo-scan），调度对账时补挂、补判 P0。cloud 整合任务停掉，6 小时等待删掉。
- **会话顺手发现的，人批了才开**：P0 照样当场开；不是 P0 的写进汇报，人批了才开。
- **等你看 PR 的会话不占名额**：停在「审核中」section 的会话（PR 开出且 review 过一轮，等人看）不算进上限，调度照样给新的 issue 出卡片。
- **每天一次「等你的」**：调度每天第一轮的汇报列出停着没在跑、等你回话的 issue 会话，按阶段分，带等了多久。
- **想法有自己的入口**：人自己开一个新会话（带 worktree），说「新想法，开聊：<一句想法>」。会话开一个想法 issue（不进调度队列），接着在同一个会话里照 issue-session 走：不复现，直接 grill；有了 spec 就照常进「设计中」或「实现中」。
- **implement 一个命令开工**：没工单就自己调 to-ticket 切完，接着做。

由哪些输入决定：issue 的标题、正文和它是不是 P0；`ISSUE_TRACKER.md` 里的「本期焦点」；根 issue 的标题（即模块名）；`AGENTS.md`「issue 分类」一节里有没有「模块按分类」这一行。

同一行为的各个入口：

- `spec-status`「开一个待验证的 issue」：纳入。所有开 issue 的流程都照它，在这里加挂根、判 P0。
- `issue-dispatch` 对账与出卡片：纳入。补挂根、补判 P0；候选只取 P0 和焦点模块的；数名额时跳过「审核中」；每天列一次等你的；人在调度会话里说要开的 issue 也照上一条开。
- `issues candidates`：纳入。按 P0 与焦点过滤，删 6 小时等待，加 `--p2`。
- `issues queues` 与「（独立队列，上限 N）」：纳入，删掉（seo 不再单独排队）；`issue-session` 里「独立队列用加了分类名的 section」那段、`seo-setup` 给 `seo` 加括注那步一起删。
- `implement` 的「跟这次无关的存量问题自动开 issue」、`decision-rules` 第 2 条、`issue-session`「边界」：纳入，改成非 P0 要人批。
- `pr-review` 的「开 issue」、`retro` 的批了开 issue、Dreaming「缺陷」节：纳入，但它们本来就是人批过的，只是开的时候照新的入口挂根、判 P0。
- `seo-scan` 开的 issue（脚本 `seo-issues.mjs` 开）：纳入开 issue 的入口，但不改 seo-scan：脚本开出来的由调度对账补挂、补判。
- `issue-session` / `issue-verify`：纳入，加想法入口；想法不复现。
- `setup` 的「整合定时任务」与它的 prompt：纳入，删掉。`setup` 写 `ISSUE_TRACKER.md` 时带上「本期焦点」一节。
- `implement` 的前提：纳入，没工单自己切。
- Dreaming：排除。不加「P2 与想法」一节，想法人自己开会话（决定记录 U6 Q18）。
- 开会话、分组、P2 夜里自动跑：排除，归 F4。
- issue 来源是 Linear 的项目怎么判 P0：排除，归 F3。
- `issue-session` 里大小走不同的流程：排除，见实现决策「大小不加机制」。

## User Stories

<!-- 待补图：User Stories 的树（照 idea-loop:evidence 的「User Stories 的树」），按下面四个场景画 -->

### 场景：issue 进来

1. 作为 Harold，我想要线上坏了或安全的问题一开出来就标成 P0，以便它下一轮就有卡片
2. 作为 Harold，我想要每个 issue 开出来就挂在它所属模块的根下，以便同一模块的事在一个会话里做完
3. 作为 Harold，我想要我直接在 GitHub 上开的、脚本开的 issue 也由调度补挂模块、补判 P0，以便我不用记规则
4. 作为 Harold，我想要在调度会话里说一句就开出 issue，以便线上看到的问题当场记下
5. 作为 Harold，我想要会话路上发现的非 P0 问题先写进汇报、我批了才开，以便 issue 不再自己越长越多
6. 作为 Harold，我想要会话路上发现的 P0 照样当场开，以便要紧的不被汇报压住
7. 作为 Harold，我想要新 issue 不再等 6 小时才有卡片，以便 P0 当轮就能开工
8. 作为 Harold，我想要 harold-skills 的 issue 按 `idea-loop/<子类>` 挂根，以便焦点能只选 idea-loop 里的一块

### 场景：调度出卡片

1. 作为 Harold，我想要在 `ISSUE_TRACKER.md` 里写一行「本期焦点」的模块名，以便调度只给我现在要推的模块出卡片
2. 作为 Harold，我想要 P0 不受焦点限制，以便焦点之外的线上事故也有卡片
3. 作为 Harold，我想要不在焦点的 issue 不出卡片也不被关掉，以便换焦点时它们还在
4. 作为 Harold，我想要改了焦点之后下一轮就按新焦点出卡片，以便换方向不用改任何配置
5. 作为 Harold，我想要卡片里的 P0 排在焦点之前，以便空位先给最要紧的
6. 作为 Harold，我想要想法 issue 不进调度队列，以便它们只在我自己开聊时才占会话
7. 作为 Harold，我想要 seo 的 issue 跟别的一起排、一样看焦点，以便不用为它单独留会话位
8. 作为 Harold，我想要等我看 PR 的会话不占名额，以便我没空看的时候新的 issue 照样往前走
9. 作为 Harold，我想要调度每天告诉我一次哪些会话在等我、按阶段分、等了多久，以便我知道先回哪个
10. 作为 Harold，我想要 P2 有一个确定的顺序可取，以便自动处理 P2 的执行环境照着它取

### 场景：想法

1. 作为 Harold，我想要自己开一个新会话说「新想法，开聊」就把想法记成 issue，以便一转头忘了也找得回来
2. 作为 Harold，我想要这个会话接着就 grill 我的想法、不先复现，以便趁热把它想清楚
3. 作为 Harold，我想要想法 grill 出 spec 后照常进「设计中」或「实现中」，以便它跟别的 issue 走同一条路

### 场景：开工

1. 作为 Harold，我想要 `/idea-loop:implement <slug>` 遇到没切票的 spec 就自己切完接着做，以便我只敲一个命令
2. 作为 Harold，我想要整合任务停掉之后，`setup` 不再让新仓库装它，以便新仓库不多一套没用的东西

## 实现决策

### 优先级按价值，不按工单数

P0 = 线上坏了，或安全问题（权限、付款、数据越权）；P1 = 属于「本期焦点」里某个模块；P2 = 其余。依据：人的原话「价值定优先级」（见 [[2026-11-02-issue-intake-priority-grill]] U9）。被否掉的「≤3 张工单 = P2」：Toeflair 已实现的 44 份 spec 里 37 份不超过 3 张工单，包括 `student-table-rls`（1 张，学生数据不登录可读写）和 `stripe-billing-correctness`（3 张），而且工单数要到切票后才知道，出卡片时还不知道。

issue 来源是 Linear 的项目：团队不一定用 Linear 的优先级，P0 怎么判、记在哪留给 F3（决定记录 U26）。这里的定义和 `priority:P0` label 只管 GitHub 来源。

### 只有 P0 是 label，P1 / P2 每轮现算

P0 存成 issue 上的 `priority:P0` label，由 idea-loop 管（跟 `status:*` 一样，`issues labels` 建出它，不算多余 label）。P1 / P2 不存：调度每轮按根的标题是否在焦点里现算，焦点一改，下一轮就变，没有 label 要同步。依据：「换焦点就改这一行」是人要的（U10「写模块名」）；把 P1 存成 label 要在换焦点时逐个改，会漏。

判 P0 的是开 issue 的那一方（会话、调度），按上面的定义判；拿不准就不标，P0 只放确定的。人可以手动加减这个 label。

### 模块就是根 issue，根的标题就是模块名

沿用 spec issue-consolidation 的根与子 issue（GitHub 原生 sub-issue），根的标题写模块名，和焦点里写的同一个词。开 issue 时：

1. 判它属于哪个模块（判法见下一节）。
2. 找这个模块开着、还没开工（没有 `status:*` label）的根，有就挂上去。
3. 没有，就新开一个根（标题写模块名，正文第一行写「模块根，由 idea-loop 开出」），把它挂上去。模块已有的根都开工了，也新开一个：开工的根不再收新的子 issue（沿用 issue-consolidation 的规则），新根是同一模块的下一批。

和 issue-consolidation 不同的一点：只有一个 issue 也开根。依据：焦点是按模块名判的，issue 不在根下，就判不出它属于哪个模块。

拿不准属于哪个模块的，不挂，它就是 P2（不在任何焦点模块里），等人在 GitHub 上归。

### 按分类定模块的仓库：模块细到子类

判模块有两种仓库：

- **按分类定模块**：`AGENTS.md`「issue 分类」一节里有一行以「模块按分类」开头（例：`模块按分类：父类是插件，子类是插件里的一块`）。这类仓库的分类本身就是模块：开 issue 时先照分类一节选好分类、`issues type` 打上，模块名就是分类的路径：有子类写 `<父类>/<子类>`，父类下没有子类写 `<父类>`。例：harold-skills 的 #178（改 AGENTS.md 的发版约定）开出时打 `idea-loop/engineering`，挂到标题为 `idea-loop/engineering` 的根下；焦点写 `本期焦点：idea-loop/engineering`。
- **其余仓库**：按改的是哪个页面、功能模块或文件判（判法沿用整合 prompt 里的「什么算同一组」，原文搬进 `spec-status`）。

依据：人在 0.2.0 的会话里定「细到 `idea-loop/<子类>`」，推翻原来的「模块就是 plugin」（决定记录 U3 Q6.1）；harold-skills 几乎全是 `type:idea-loop`，按插件分过滤不掉东西（问题 8）。没选「按下一版本」：版本号是合并时才补的（PR #213 合并时才把 idea-loop 0.1.8 升到 0.1.9，提交 1e2a2c4），开 issue 时还不知道它随哪个版本发。

为什么写成一行显式的「模块按分类」，不让会话自己看出来：插件里不写哪个仓库是哪种（`no-project-leak` 守着），而「分类是不是模块」从分类名上看不出来：应用仓库的分类可能是 `bug` / `feature`，不是模块。这一行由人写，harold-skills 在本 spec 的实现里加上；`setup` 不问它，人要时自己加。

### 焦点写在 ISSUE_TRACKER.md

业务的 `ISSUE_TRACKER.md`（知识库根，`<docs>` 的上一层；老布局就是仓库根）加一节「本期焦点」，一行模块名，用顿号隔开，例：`本期焦点：Email 报告、付款`。`issues candidates` 读这一行，根的标题与其中一个模块名完全相同就算焦点。没有这一节或这一行是空的：只出 P0，汇报里写「没有本期焦点，只出了 P0」。`setup` 写 `ISSUE_TRACKER.md` 时带上这一节，留空让人填。

依据：焦点由人定（U10）；放在 `ISSUE_TRACKER.md` 而不是调度会话里，是因为调度和 issue 会话都要读它。

### 候选的顺序与过滤

`issues candidates` 只出：带 `priority:P0` 的（根，或没有父 issue 的 issue），再接标题在焦点里的根；各自按号从小到大。子 issue 照旧不出（它随根走），带 `Idea` label 的不出，6 小时等待删掉（`NEW_ISSUE_WAIT_MS` 和它的过滤一起删）。子 issue 带 P0、根不带的：对账时把 P0 提到根上，这一组就当 P0 出卡片。

`issues candidates --p2` 出其余的：同样只取根或没有父 issue 的待验证 issue，不带 P0、不在焦点、不是想法，按号从小到大。调度会话不用它（P2 不出卡片）；它给 F4 的自动执行环境取 P2 用，F1 只定「哪些、什么顺序」。

### seo 不再单独排队

删掉「（独立队列，上限 N）」这套机制：`issues queues` 命令、`candidates --queue`、分类一节的括注解析、`issue-session` 里「独立队列用加了分类名的 section」、`seo-setup` 给 `seo` 加括注那步。所有 issue 一个队列、上限 10、一套 section。seo 的 issue 照样挂模块根、判 P0、看焦点：Toeflair 里它按页面挂到对应模块，人把那个模块放进焦点它才出卡片。

依据：人在 0.2.0 的会话里定「seo 不再单独开设队列」（决定记录 U3 Q9）。独立队列当初是为了 seo-scan 一次提一批时挤不掉别的（spec idea-loop-seo）；有了焦点，不在焦点里的本来就不出卡片，挤不掉。

已经写了括注的项目（Toeflair 的 `seo` 那行）不用改：括注变成普通说明文字，脚本不再读它；人想清掉就自己删。

### 调度对账时补挂、补判

`issue-dispatch` 每一轮在 `issues reconcile` 之后多一步：对没有父 issue、自己也不是根、不带 `Idea` 的待验证 issue，逐个照「开一个待验证的 issue」的挂根、判 P0 两步补上（按分类定模块的仓库，没打分类的先打）。这是模型判断，写成调度 skill 的一步，不进脚本。调度会话不改文件，但改 GitHub 上的 label 和 sub-issue 跟它现在的对账同类，允许。依据：决定记录 U4 Q6.2。

人在调度会话里说「开个 issue：…」，调度照同一个入口开。

### 名额：「审核中」不占

数开着的会话时跳过「审核中」section：上限 10 只算其余阶段 section 里的 issue 会话。这里的「审核中」是 F2 改名后的那一段（阶段改成讨论中 → 设计中 → 实现中 → 审核中，审核中 = PR 开出且 review 过一轮、等人看）。依据：决定记录 U5 Q6.3、「本轮决议」的「调度：名额与汇报」。

已知：F2 合进 release 之前，「审核中」section 里放的还是 grill 中的会话，那段时间它们也不占名额；这只出现在 release 分支上，0.2.0 发布时 F2 已经在里面。

### 汇报：每天列一次「等你的」

调度每天第一轮（本地日期跟上一份带「等你的」的汇报不同）的汇报加一节「等你的」：各阶段 section 里标题匹配「<仓库名>#<号> …」、`list_sessions` 里 `isRunning` 是 false 的会话，按 section 分组，每行写会话标题和等了多久（现在减 `lastActivityAt`，到小时），等得最久的在前。没有就写「无」。推送通知照旧只在出了新卡片或有要人处理的事时发。

依据：决定记录 U5 Q6.3「汇报每天列『等你的』，按阶段、带等了多久」。推翻原 spec 的「调度汇报不加『在等你的会话』」。不进脚本：要的是会话的状态，只有调度会话能列。

### 会话顺手发现的：P0 照开，其余人批

`decision-rules`「自己定的四条」第 2 条改成：存量问题是 P0 的，开 issue；不是 P0 的，写进汇报的「要你决定」，每条一个「开 issue」的选项，人批了才照入口开。`implement` 的「跟这次无关的存量问题自动开 issue」、`issue-session` 的「边界」照这条改。例外不变：让这次改动拿到错的数据、让结论站不住、让 CI 变红的，这次修。依据：问题 3 的 47 个；人在 U3 选「收紧入口」。

已经是人批过才开的入口（`pr-review` 的「开 issue」、`retro`、Dreaming「缺陷」）不改批不批，只照新入口挂根、判 P0。

### 想法：一个 label、一句开场、不复现

- label：idea-loop 管一个 `Idea` label（GitHub 的 label 名不分大小写，Toeflair 已有的保留 label `Idea` 就是它）。带它的 issue 不进候选（`--p2` 也不出）。
- 入口：人在一个带 worktree 的新会话里说「新想法，开聊」加一句想法（`issue-session` 的 description 加这个触发词）。会话：
  1. 照「开一个待验证的 issue」开 issue，打 `Idea`，标题写想法本身，正文照录人的原话；挂模块根、判 P0 照样做（想法基本不是 P0）。
  2. 接着把自己当成这个 issue 的 issue 会话，照「人直接调的你」那条从「审核」开始（`issues set` 认领成验证中、归位、改标题）。
- 验证：`issue-verify` 遇到带 `Idea` 的 issue 不复现，结论写「存在：这是一个想法，不复现」，直接跟人 grill，照常起草 spec。之后跟别的 issue 一样走设计、实现。
- 没在 worktree 里：停下告诉人开一个带 worktree 的会话再说，issue 先开好，号码交给人（想法已经记下，不丢）。

Dreaming 不加「P2 与想法」一节：想法由人自己开会话（决定记录 U6 Q18），P2 由 F4 的执行环境接。

### 大小不加机制

不按工单数分流程。依据：实现阶段本来就不停（spec no-decision-autopilot：切票直接落盘，没有决定题就放行，只在生产操作和合并前停）；`issue-session` 的「实现」一步是 to-ticket 接 implement，中间不停。小的 spec 已经在走快车道。

### implement 没工单就自己切

`implement` 的前提改成：spec 是「实现中」（或「正式」，切票会把它翻成实现中），`tickets/` 下没有工单就用 Skill 工具调 `idea-loop:to-ticket` 切，切完接着派工；工单文件照旧保留（执行方各读自己那一张，靠「被谁挡着」并行）。旧布局照旧先停下迁移。

### 停掉 cloud 整合

`setup` 删「整合定时任务」一节和 `references/consolidation-prompt.md`，交回里不再列它；README 同步；守着这一节的测试 `setup-consolidation-doc.test.mjs` 一起删。已经建好的两个 cloud 定时任务（Toeflair、harold-skills 各一个）不在插件里删：0.2.0 合进 main 后，由人确认再停（routine 是账号上的东西，插件管不到）。#217 记的两个整合任务的毛病（Toeflair 每次翻页撞 403、汇报一次写成英文）随任务停掉一起没了，不再单独修。spec issue-consolidation 里根与子 issue 的规则（一组一份 spec、一个会话、一起翻状态）不变，只是挂根的时机从 cloud 移到了开 issue 时。

## 技术方案总览

### 后端

不涉及。插件只有 skill 文本和 `issues.mjs`。脚本的变化：

- `issues candidates`：读 `ISSUE_TRACKER.md` 的「本期焦点」；只出 `priority:P0` 和焦点里的根；跳过 `Idea`；删 6 小时等待；`--p2` 出其余的；删 `--queue`。
- `issues labels`：建 `priority:P0` 与 `Idea`，两者都不算多余 label。
- `issues reconcile`：子 issue 带 P0、根不带时，给根加 `priority:P0`。
- `issues queues`：删；分类一节不再解析「（独立队列，上限 N）」。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：`issues candidates` 的过滤与排序（含 `--p2`）、焦点行的解析、`labels` 的受管 label、`reconcile` 把 P0 提到根 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：skill 文本的改动按仓库约定 vibe 迭代，不做 baseline；第 2 条规则的改动走 retro 回放（见下） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`issues.mjs` 导出的函数，喂假的 `gh`（`issues.test.mjs` 已有的写法）。能抓到：哪些 issue 出卡片、什么顺序、焦点和 P0 的判定、label 清单；漏掉：模型判模块、判 P0 判得对不对（skill 文本里的判断，靠人在汇报里看），以及「审核中不占名额」「等你的」（调度会话列会话，不过脚本）。
- **增量功能测试**：
  - 前置：假 `gh` 给出 #1（P0，无父）、#2（根，标题「Email 报告」）、#3（根，标题「付款」）、#4（#2 的子 issue）、#5（`Idea`）、#6（无父、带 P0、刚开 1 分钟）、#7（无父、无 label）；焦点行「本期焦点：Email 报告」。步骤：`candidates`。期望：`[1, 6, 2]`；#3 不在焦点、#4 是子 issue、#5 是想法、#7 不在任何模块，都不出。覆盖：调度出卡片 1、2、5、6，issue 进来 7。
  - 同上，步骤：`candidates --p2`。期望：`[3, 7]`。覆盖：调度出卡片 3、10。
  - 前置：没有「本期焦点」一节。期望：只出 P0。覆盖：调度出卡片 1、2。
  - 前置：焦点行写 `本期焦点：idea-loop/engineering`，根 #2 的标题是 `idea-loop/engineering`、根 #3 是 `idea-loop/design`。期望：出 #2、不出 #3。覆盖：issue 进来 8。
  - 前置：分类一节里 `seo` 那行带「（独立队列，上限 5）」，有一个 `type:seo` 的 P0 issue 和一个 `type:seo` 的焦点根。期望：都按主队列出，P0 在前；括注不再生成队列。覆盖：调度出卡片 7。
  - 前置：根 #2 无 P0，它的子 #4 带 P0。步骤：`reconcile`。期望：#2 加上 `priority:P0`。覆盖：调度出卡片 2、5。
  - 前置：仓库里没有 `priority:P0`、`Idea`。步骤：`labels`。期望：两个都建出，不出现在多余 label 里。覆盖：issue 进来 1，想法 1。
  - 规则回放：`decision-rules` 第 2 条与 `implement` 自动开 issue 的改动，照 `evals/retro/` 取一个历史上自动开出非 P0 存量 issue 的决策点，改前「开了」、改后「写进要你决定」。覆盖：issue 进来 5。按仓库约定，回放是大用例时放夜间队列，不在白天跑。
- **prompt / eval 变动**：无 prompt/eval 变动（skill 文本不算 prompt eval；回放用例见上）。
- **照着谁写**：`issues.test.mjs` 里 `candidates of the main queue skip own-queue issues` 那一组（本 spec 把它改写成焦点与 P0 的用例）。

## Out of scope

- 清理 Toeflair 现存的 151 个 issue（挂根、判 P0、关掉不值得做的、清空的整合根）：是目标仓库的活，0.2.0 发布后在 Toeflair 里单独做。harold-skills 的存量同理。
- 停掉已建的两个 cloud 定时任务：账号上的 routine，0.2.0 合进 main 后人确认再停。
- P2 交给哪个执行环境、什么时候自动跑、怎么开会话：F4。
- Linear 来源的项目怎么判 P0、记在哪：F3。
- 阶段改名（讨论中 / 设计中 / 实现中 / 审核中）：F2；这里只按改名后的「审核中」定名额。
- Dreaming 列 P2 与想法：不做（决定记录 U6 Q18）。
- 按大小分流程：不加机制，理由见实现决策「大小不加机制」。
- 给 P2 自动过期关闭：人选了留着（U10）。

## 关联

- 覆盖：#220（根）、#217（子 issue：整合任务按版本 / 模块聚合）。
- 0.2.0：[[idea-loop-0-2-0-release]] 的 F1；决定依据 [[2026-11-03-idea-loop-0-2-0-grill]]。同一版的 F2（阶段改名）、F4（工作环境，碰 `issue-dispatch` 开会话、分组那一层与 `issues.mjs`）跟本 spec 改同几个文件，各改各的层，后合进 release 的照 release 分支 rebase。
- [[knowledge-base-repo]]（F5）：`ISSUE_TRACKER.md`、`AGENTS.md` 的「issue 分类」都在知识库根，脚本照 `<docs>` 的上一层读。
- 相邻的 issue：#178（AGENTS.md 说插件 PR 合并时随哪个版本发）：发哪个版本仍在合并时定；#181 那一组（issue-verify 起草方案的质量）不在这里。
- raw：[[2026-11-02-issue-intake-priority-grill]]、[[2026-11-03-idea-loop-0-2-0-grill]]
- 改的是 [[issue-consolidation]] 定下的挂根时机（cloud 6 小时 → 开 issue 时），根与子 issue 的规则沿用。
- [[no-decision-autopilot]]：实现阶段不停的依据，「大小不加机制」靠它。
- 推翻 [[idea-loop-seo]] 的「调度的独立队列」一节。
