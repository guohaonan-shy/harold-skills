---
type: spec
tags: [idea-loop, issue-workflow, issue-model, parent-child-integration]
summary: 父 issue 声明集成分支，子 issue 的会话和 PR 自动走那条分支，子全部合完由父会话开进 main 的 PR
issues: [334]
related: ["[[0022-issue-model]]", "[[0021-issue-consolidation]]"]
---

# 父 issue 带子 issue：集成分支由 idea-loop 认，不再靠人手动

> 需要 grill：「实现决策」里还有三条待定（父 issue 什么时候开进 main 的 PR、那个 PR 审多深、多仓库要不要也走子 issue）。

> #334 存在：0.2.0 的子 issue #295 此刻是 todo、没被挡，在调度候选里排第 11，调度会从 `origin/main` 给它开工、PR 开到 main，详情在「问题陈述」

## 问题陈述

### 子 issue 被调度当成普通 todo，从 main 开工

几个 issue 要先合进一条集成分支、最后一起进 main 时（版本发布、跨几个 issue 的大改），idea-loop 不知道这件事。

真实例子（2026-11-19 对着 origin/main `38622d38` 查）：idea-loop 0.2.0 的父 issue #331 正文写着「集成分支：`release/idea-loop-0.2.0`」，子 issue 要把 PR 开到这条分支。其中 #295（runtime 本机覆盖）现在是 `status:todo`、没有挡着它的 issue，`issues candidates docs 20` 把它排在第 11 个。调度下一轮派到它时：

- worktree 从 `origin/main` 切（`idea-loop:runtime` 两份 reference 的「怎么交出 issue」都写死 `origin/<基准分支>`，基准分支只读 `DEVELOPMENT.md`）；
- PR 用 `--base main` 开（`idea-loop:pr` 的「开 draft PR」第 2 步，同样只读 `DEVELOPMENT.md`）。

本该是：worktree 从 `origin/release/idea-loop-0.2.0` 切，PR 开到这条分支。

现在避开它只能靠人：0.2.0 的子 issue 会话都由人手动开，第一句话点明基准分支（#331 正文原话「这几个子 issue 的会话由人手动开，开的时候说明基准分支」）。#339 的会话评论里写着「基准分支 release/idea-loop-0.2.0」，就是这样手动点出来的。

### 最后进 main 的那个 PR 没有归属

子 issue 全部合进集成分支之后，还要有人把集成分支合进 main：先把 main 合进来解冲突（`release/idea-loop-0.2.0` 上已有一次 `75665ec2 Merge origin/main into release/idea-loop-0.2.0`），统一升版本（0.2.0 定了子 PR 不升、由父会话在进 main 的 PR 里升一次，见 `home-bootstrap` spec 的「版本号」），再开 PR。idea-loop 没有哪个会话管这一步。

集成分支已经用过三次，三次都靠人手动：`release/idea-loop-0.1.8`（#176 合进 main）、`release/idea-loop-0.1.10`（#260）、`release/idea-loop-0.2.0`（进行中，#331 下 8 个子 issue，3 个已关）。

### 根因

- `idea-loop:issues` 写死「不用父子关系归组……平台上已有的父子关系照常读，不当成组」（ADR-0022），`issues.mjs` 文件头写「There is no parent / child logic」：`show` 不输出父 issue，`candidates` 不看父子。
- 基准分支只有一个来源：`DEVELOPMENT.md` 的「分支」节。`issue-session`「接分支」、`pr`「开 draft PR」、两份 runtime reference 的调度建 worktree 都从这里读。
- Linear 参考（`issues/references/linear.md`）写「不读不写：……父子关系」。

## 方案

改完之后：人（或 triage 会话）在父 issue 正文里写一行「集成分支：`<分支名>`」、把子 issue 挂到它下面，之后不用再在任何会话里点明基准分支。子 issue 的会话从集成分支开工、PR 开到集成分支；子 issue 全部关掉后，父 issue 的会话把集成分支合进 main。

决定一个 issue 走哪条基准分支的输入只有两样：平台上它的父 issue 是谁，父 issue 正文有没有「集成分支」那一行。两样都有，基准分支就是那条集成分支；缺一样，照旧是 `DEVELOPMENT.md` 的主分支。

<!-- 待补图：父 issue / 子 issue / 调度 / 集成分支 的时序图（excalidrawer sequence），三条待定定完后画 -->

一组集成的生命周期：

1. **父 issue 的 triage 会话**：写整体 spec（`issues: [<父号>]`），拆子 issue（`issues new --parent=<父号>`，平台上挂成子 issue），从 `origin/<主分支>` 切出集成分支并 push，正文写「集成分支：`<名>`」。翻 todo。
2. **子 issue**：照常走 triage / todo。`issues show` 多给 `parent`（父号）和 `base`（这个 issue 的基准分支）。调度建 worktree、`issue-session` 接分支、`pr` 开 PR 都用 `base`。子 PR 合进集成分支，子 issue 照常 done（PR 正文写 `Refs`，不靠合并关 issue；0.2.0 的 #252、#332、#333 就是这样关的）。
3. **父 issue**：子 issue 还有开着的，`candidates` 不给它（跟被 blocked by 挡着一样）。全部关掉后才能派——派出之后做什么，见待定一。

同一行为的其他入口：

- 调度建 worktree（`runtime` 的 claude-desktop、magi 两份 reference）：纳入。
- `issue-session` 接分支、todo 会话起草 spec：纳入。
- `pr` 开 draft PR、`pr-review` 给 reviewer 的基准分支、`implement` 拍「之前」的基准分支 worktree：纳入，统一读 `base`。
- `dreaming`、`seo-scan` 效果报告、`pr-review` 的上线自查 revert：排除。它们不属于某个 issue，对的就是主分支。
- 人在会话第一句话里点明基准分支：保留为兜底，不再是必需。

### 后端

`issues.mjs`：

- `show` 输出加 `parent`（没有就 `null`）和 `base`（父 issue 有集成分支行就是那条，否则主分支）。
- `candidates`：父 issue 有集成分支行、且还有开着的子 issue 的，不给。
- `new` 加 `--parent=<号>`：开完挂成那个 issue 的子 issue。
- 文件头那句「There is no parent / child logic」改掉。

Linear 上没有脚本：`linear.md` 写怎么用 MCP 读父 issue（`get_issue` 的 parent）、开子 issue（`save_issue` 带 parent），以及子 issue 的会话怎么照同样规则算出 `base`。

## User Stories

### 场景：开一组集成

1. 作为人，我想要在父 issue 正文写一行集成分支、把子 issue 挂上去，以便后面的会话不用我每次点明基准分支
2. 作为父 issue 的 triage 会话，我想要拆子 issue 时一并挂成子 issue、切出并推送集成分支，以便子 issue 一进 todo 就能被正确派出

### 场景：做子 issue

1. 作为调度，我想要给子 issue 建 worktree 时从集成分支切，以便它的改动建立在集成分支已有的改动上
2. 作为子 issue 的会话，我想要 PR 自动开到集成分支，以便它不会误合进 main
3. 作为人，我想要只是挂着父子关系、父 issue 没写集成分支行的 issue 照旧走主分支，以便为了整理而挂的父子关系不改变任何行为

### 场景：收尾一组集成

1. 作为调度，我想要子 issue 没全关时不派父 issue，以便父会话不会在集成分支还没齐时开工
2. 作为人，我想要子 issue 全关后有一个会话负责把集成分支合进 main（合 main、升版本、开 PR），以便最后一步不再靠我记得

## 实现决策

- **集成分支记在父 issue 正文的一行**：`集成分支：\`<分支名>\``，放在「背景」节里。依据：现存实例 #331 正文就是这样写的；子 issue 的会话不 checkout 父 issue 的分支也读得到，GitHub、Linear 一样。
- **「是不是一组」只看集成分支行，不看父子关系本身**：只挂了父子、没写这一行的，照 ADR-0022 原样「照常读，不当成组」。这条守住 ADR-0021 的教训：当时整合任务挂出的根下 27 个子 issue 多数并非真从根拆出（ADR-0022 §1），父子关系被当成「相关」在用；现在必须有人明写一条集成分支，才改变行为。
- **ADR-0022 的「不用父子关系归组」这一句被改**：改成「父 issue 正文声明了集成分支的，子 issue 以它为基准分支；其余父子关系照常读，不当成组」。其余决定（一个 issue 一个会话、一份 spec，版本用 milestone）不变：父、子各自一个会话、一份 spec。依据：人在 0.2.0 home repo grill 的决定 Q22–Q24（决定记录在 `release/idea-loop-0.2.0` 的 `docs/raw/issue-workflow/2026-11-15-home-repo-grill.md`）。ADR 的订正由 `/idea-loop:dreaming` 做，这里不改 ADR 文件。
- **子 issue 各有自己的 spec，父 issue 的 spec 写整体**：依据：0.2.0 的现存实例，子 issue #252、#332、#339 各自一份 spec（`home-bootstrap`、`device-memory`、`idea-loop-cli`）。
- **集成分支由父 issue 的 triage 会话切**：从 `origin/<主分支>` 切出并 push，跟拆子 issue 同一步。依据：0.2.0 实例，集成分支在 grill 会话里从 main `e259f3f` 切出（决定记录 A8）。
- **子 PR 不升插件版本，进 main 的那个 PR 升一次**：本仓库的规则，写进本仓库 `REVIEW.md`「额外要求」，插件里不写（插件不带项目信息）。依据：人的决定，见 `home-bootstrap` spec「版本号」（2026-11-17，推翻了「第一个子 PR 就升」）。
- **Project、milestone 不读**：只作看板。依据：Q22 决议原文。
- **集成分支名不规定格式**：`release/<…>` 只是本仓库习惯，idea-loop 原样读那一行。

### 待定：父 issue 什么时候开进 main 的 PR、它的会话活多久

选项之间人能感到的差别是：子 issue 做的过程中，你在哪里看整体进度、在哪里说跨子 issue 的话。

- **A. 子全关后才开（推荐）**：父 issue 拆完翻 todo，`candidates` 一直不给它；最后一个子 issue 关掉后，调度派出父 issue 的 todo 会话：把 main 合进集成分支、升版本、开集成分支 → main 的 PR，人说合并。走一遍 0.2.0：#247、#295、#339 等还开着时，侧边栏里没有 #331 的会话；它们全关的下一轮，#331 出现在 in-progress 分组。跨子 issue 的决定（比如「子 PR 不升版本」）你直接写在父 issue 评论里，子会话开场读父 issue。理由：跟 #334 正文里的决定原话一致（「子 issue 全部合完，父 issue 的会话开集成分支 → main 的 PR」），也不需要一个挂几天的会话。
- **B. 拆完就开 draft PR，父会话一直在**：父 issue 拆完直接 in-progress，开集成分支 → main 的 draft PR，会话留在 in-progress 分组里等子 issue。走一遍 0.2.0：#331 一直有个 draft PR，打开就能看到已合进集成分支的全部改动；你在 #331 的会话里说的话由它转给子会话（0.2.0 实际就有过「父会话转达」，见 `home-bootstrap` spec）。代价：一个会话挂好几天，调度数 in-progress 时超过 2 小时没动的不数，所以不占名额，但侧边栏里一直有它。

### 待定：集成分支进 main 的 PR 审多深

每个子 PR 合进集成分支前都已经过一轮两轴 review。差别在最后这个 PR 你拿到什么。

- **A. 只跑检查、不再 review（推荐）**：父会话跑 `REVIEW.md` 的检查，PR 描述列出每个子 issue 和它的 PR、合 main 时解的冲突、升到的版本；你看描述后说合并。走一遍 0.2.0：PR 描述是 8 行子 issue 加一段冲突说明，几分钟能看完。理由：子 PR 已审过；新出现的只有合 main 的冲突和版本号，描述里点名即可。
- **B. 照常跑一轮两轴 review**：pr-reviewer 拿父 issue 的整体 spec 对整个 diff。走一遍 0.2.0：diff 是几个子 PR 的总和，一轮 review 很长，大部分是重复审过的内容；好处是能抓到子 issue 之间拼起来才出的问题。

### 待定：一个 issue 改多个仓库，要不要也改成子 issue

现在（ADR-0022）一个 issue 改几个仓库是一个会话、每个仓库各开一个 PR（`ISSUE_TRACKER.md`「仓库」一节）。人在 Q29 定过「每个仓库一个子 issue、一个会话、一个 PR，父 issue 的会话管联调」，但同一份决议的「已知限制」写着「同时改多个代码仓库没有真实例子」。

- **A. 这次不改多仓库，只做集成分支（推荐）**：现有的一会话多 PR 保留；人想按仓库拆，照样可以手动拆成子 issue（父 issue 不写集成分支行，各子 PR 进各自仓库的主分支）。走一遍：本仓库 `ISSUE_TRACKER.md` 的「仓库」表现在只有一行，这条路径在两个项目里都还没走到过。理由：没有真实例子，按 decision-rules 不靠推断设计；等第一次真改多仓库时再开 issue。
- **B. 一起做**：去掉一会话多 PR，多仓库一律拆子 issue；父会话负责联调。牵出的要定的事：各仓库要不要各有集成分支、联调在哪个 worktree 里跑，这份 spec 里都还没有答案。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `issues.mjs`：从父 issue 正文解析集成分支行、算 `base`、`candidates` 跳过有开着子 issue 的父 issue、`new --parent` |
| API 契约（路由、schema、序列化） | TDD API 测试 | `issues show` 的 JSON 多出 `parent`、`base` 两个字段 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改 `issues`、`issue-session`、`pr`、`issue-dispatch`、两份 runtime reference 的文字；用仓库已有的 `*-doc.test.mjs` 断言关键句（读 `base`、不再写死 `DEVELOPMENT.md`），不加 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`issues.mjs` 的命令行（喂假 `gh` 的输出，读 JSON），已有，`issues.test.mjs` 就在这一层；skill 文字用 doc test。能抓到：基准分支算错、父 issue 被提前派出、普通父子关系被误当成组。漏掉：会话真的照 `base` 切 worktree、开 PR，只能靠上线后第一组集成验收。
- **增量功能测试**：
  - 前置：父 issue 正文有「集成分支：`release/x`」，子 issue 挂在它下面，状态 todo。步骤：`issues show <子号>`。期望：`base` 是 `release/x`、`parent` 是父号。覆盖：做子 issue 1、2。
  - 前置：父 issue 没有集成分支行。步骤：同上。期望：`base` 是主分支。覆盖：做子 issue 3。
  - 前置：父 issue 有集成分支行、todo，一个子 issue 还开着。步骤：`issues candidates`。期望：没有父 issue；子 issue 关掉后再跑，有。覆盖：收尾一组集成 1。
  - 前置：`issues new … --parent=<号>`。期望：平台上新 issue 挂在那个号下。覆盖：开一组集成 2。
- **照着谁写**：`issues.test.mjs` 现有的 `candidates` 与 `migrate`（`subIssues` 读子 issue 的写法）用例；doc test 照 `dispatch-by-period-doc.test.mjs`。

## Out of scope

- 订正 ADR-0022（交给 `/idea-loop:dreaming`）。
- 集成分支长期落后 main 时中途同步：父会话只在开进 main 的 PR 前合一次 main。
- 嵌套（子 issue 下再有带集成分支的子 issue）。

## 关联

- 决定出处：`release/idea-loop-0.2.0` 上的 `docs/raw/issue-workflow/2026-11-15-home-repo-grill.md`（Q22–Q24、Q29），还没进 main。
- ADR-0022（issue 模型，这次改它的一句）、ADR-0021（整合任务，已被取代，教训见「实现决策」）。
- 相邻：#331（0.2.0 父 issue）是这份 spec 的第一个用户；本 spec 走 main，不改 0.2.0 正在做的事，合进 main 后 0.2.0 还开着的子 issue（#247、#295、#339、#340、#341、#356、#386）开始受益。#331 正文里那句「由人手动开」届时要删，由 #331 的会话做。
- #386（一个调度管所有项目）也改 `issue-dispatch`，在 0.2.0 集成分支上；两边都碰调度建 worktree 那段，后合的那个 rebase。
