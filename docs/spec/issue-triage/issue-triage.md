---
type: spec
tags: [idea-loop, issue-workflow, issue-triage]
summary: backlog 每周由子代理逐个核过、人批一张表定去向；开 issue 校验正文；优先级决定派发顺序；issue-verify 删掉
related: ["[[2026-11-05-issue-triage-grill]]", "[[2026-11-05-issue-model-regrill]]", "[[issue-model]]", "[[issue-linear]]"]
issues: [243]
---

# issue-triage：backlog 每周分拣，人批一张表；开 issue 校验正文；按优先级派发

> #243 存在：backlog 没有人定期看，「backlog → triage / todo」这一步在 `idea-loop:issues` 里写着「分拣后人定」，却没有分拣；开 issue 的正文格式只是文字约定，没有检查；调度按号码先进先出，详情在「问题陈述」

## 问题陈述

对着 origin/main 801c8d2（idea-loop 0.1.9 + #242 的 issue 模型）和 GitHub 上 harold-skills 的 issue 核过，取数日期 2026-11-06。旧版 spec（分支 `feature/issue-triage`，按九个状态写）被这一份取代；它的决定在 [[2026-11-05-issue-triage-grill]] 里，人当时都同意了，这一份只把它们搬到 #242 定下的七个状态上。

### 1. 有「分拣后人定」这一步，没有分拣

`idea-loop:issues` 的状态表写着 backlog → triage / todo / canceled「分拣后人定；不要人评估的直接 todo」。可是没有任何 skill 或定时任务去做这件事：

- 调度（`issue-dispatch`）只派 todo；triage 会话由人开。backlog 里的 issue 不会被任何东西碰到。
- 2026-11-06 harold-skills 开着 53 个 issue，42 个没有 `status:*`，即 backlog。
- 复现、打分类现在在 `issue-verify` 里，它在 triage 会话开头跑：一个 issue 要先被人挑进 triage 才会被验证，人挑的时候还不知道它是不是真问题、是不是重复、是不是早做掉了。

### 2. 开 issue 的正文格式没有检查

#242 把各处开 issue 收进了 `idea-loop:issues` 的「开一个 issue」（`implement` 的存量问题、`issue-session` 的边界、`pr-review` 的「开 issue」、`retro`、`dreaming` 的缺陷都指向它），正文格式也定了：问题、证据、影响范围、从哪发现必填。但那一节让 agent 直接 `gh issue create`，格式全凭照做。另有两处不走它：

- `seo-issues.mjs` 自己开，正文是「问题 / 证据 / 怎么复现 / 建议的修法 / 验收标准」，缺「影响范围」「从哪发现」两节。
- `to-spec` 在 spec 没覆盖任何 issue 时跑 `issues open`，开一个 todo 的「spec：」issue，正文只有 summary 和 spec 路径，并且不经人就进了 todo。

### 3. 调度按号码先进先出

`issues candidates` 按号码排序后截断（`idea-loop/scripts/issues.mjs` 的 `candidates`）。线上坏了的 issue 和三周前的文案小改，谁号码小谁先派。issue 上没有优先级可读：harold-skills 只有一个 `priority:P0` label，0 个 open issue 在用。

### 4. `issues set done` 关 issue 失败时留下半翻的状态

2026-11-06 关 #242 时，`issues set docs done 242` 先去掉了 `status:in-review`，接着 `gh issue close` 报 `EOF` 失败，issue 停在「开着、没有 label」，即 backlog；再跑 `set done` 被拒（「backlog 不能翻成 done」），只能手动 `gh issue close 242 --reason completed`，同样的参数一次成功。`EOF` 是 gh 的连接被断开时的报错，是偶发的；问题在 `move` 先改 label 再关：后一步失败，前一步已经写进去了。另外 → done 不带评论，issue 上看不出是哪几个 PR 合并后关的。

### 根因

- 「分拣」只存在于状态表的一句话里，没有执行者（问题 1）。
- 正文格式没有落到脚本里，开 issue 不经过脚本（问题 2）。
- 实体有「优先级」字段（`idea-loop:issues` 的实体表），但 GitHub 上没定取值，脚本也不读（问题 3）。
- `move` 的两次写不是先写决定性的那一次（问题 4）。

## 方案

改完之后：

- **每周分拣**：新 skill `idea-loop:issue-triage`。桌面 app 的定时任务每周跑一次 `/idea-loop:issue-triage`，取最早的 15 个 backlog issue，每个交给一个新子代理 `idea-loop:issue-triager`（同时最多 5 个）。子代理依次查重、查「不做」清单、查是否已实现、复现、打分类，在 issue 上贴一条证据评论，交回一句结论和建议去向。分拣会话拼一张表，人逐行批，会话照批的翻状态。
- **建议去向有四种**：todo（问题清楚、不要人评估，带建议优先级）、triage（要人 grill 或设计，带建议优先级）、canceled（重复、在「不做」清单里、已实现、复现不出）、留在 backlog（判不了，评论写「已查清 / 还要你补」两栏）。项目跳过 triage 的，没有第二种。
- **开 issue 校验正文**：新命令 `issues new` 是开 issue 的唯一路子，先校验四个必填节都在、都不空，不过就拒绝。「开一个 issue」一节改成调它；`seo-issues.mjs` 的正文补齐四节。
- **开成什么状态**：默认 backlog。人在当前会话里明说了「做」，开成 todo 并带优先级；明说不做的不开。判断是 P0（线上坏了、安全问题）的，开成 backlog 后当场起一个 `issue-triager` 复现，复现到了翻 todo、打 P0、通知人。
- **优先级**：GitHub 上是 `priority:P0` / `priority:P1` / `priority:P2` 三个 label，一个 issue 最多一个。调度按 P0 → P1 → P2 → 没有优先级派，同一级里最早的先派。
- **`issue-verify` 删掉**：复现、打分类挪进 `issue-triager`；triage 会话直接起草 spec，输入是 issue 正文加分拣贴的证据评论；起草的规则（功能级写「需要 grill」、自检、跟人定）挪进 `issue-session` 的一份 reference。
- **`issues open` 删掉**：spec 没覆盖任何 issue 时，人在场就用 `issues new` 按人说的开成 todo，不在场就停下问人。
- **`move` 先关后改 label**：→ done / canceled 先 `gh issue close`（带评论），成功了才去 label；→ done 的评论总写明合并了哪些 PR。

![一个 issue 从开出到被派成会话](assets/triage-flow.png)

图：issue 从各处开出，进 backlog，每周分拣后由人批去向，todo 按优先级被调度派出。虚线框是人拍板的地方。

同一行为的其他入口，逐个标：

- **纳入**：`idea-loop:issues`（「开一个 issue」改成 `issues new`、状态表的「分拣后人定」指向 `issue-triage`、命令表）；`issue-session`（triage 会话的第 1 步）；`issue-dispatch`（派发顺序一句）；`to-spec`（不再 `issues open`）；`setup`（装每周分拣的定时任务，`labels` 建优先级 label）；`seo-issues.mjs`（正文四节）；`ISSUE_TRACKER.md` 模板与本仓库的 `ISSUE_TRACKER.md`（优先级一节）；`README.md`；`issue-verify` 的引用方（`to-spec` 第 6 步的例子、`to-spec/references/figures.md`、测试）。
- **排除**：
  - `implement`、`pr-review`、`retro`、`dreaming`、`issue-session` 的边界：它们已经指向 `idea-loop:issues` 的「开一个 issue」，那一节改了它们就跟着改，正文不动。
  - `design-modeling` 的 `references/distill.md` 自己 `gh issue create` 开到插件仓库或目标仓库：它起草的是「通用设计原则」和「现状、缺陷」，人同意后才开。改成指向「开一个 issue」只是一句话，归这份 spec 一起改。
  - 人在 GitHub 或 Linear 上直接开的：平台上没法插一步，开出来就是 backlog，每周分拣照样取到它，正文缺节的由 `issue-triager` 在证据评论里补。
  - Linear 项目怎么做这些：在 [[issue-linear]]（#226）里，同一个 PR。

### 后端

`issues.mjs` 加、改这几处：

- `new <docs> <标题> <正文文件> [--state=backlog|todo] [--priority=P0|P1|P2] [--kind=bug|feature|improvement] [--type=<分类>]...`：先校验正文（`bodyErrors`，见「实现决策」），再查重（同标题的开着的 issue 已有就拒绝，报它的号），再开。默认 backlog；`--state=todo` 必须带 `--priority`。输出新 issue 的号。
- `body <docs> <正文文件>`：只校验正文，不开。Linear 项目用它，再用 MCP 开。
- `priority <docs> <P0|P1|P2|none> <号>...`：换掉原有的 `priority:*`。
- `backlog <docs> [<上限>]`：JSON 列出开着的 backlog issue，最早的在前；跳过「最新一条评论是分拣的『还要你补』，之后 issue 没再更新过」的。
- `note <docs> <号> <正文文件>`：贴一条带「🤖 idea-loop：」前缀的评论。
- `candidates`：先按优先级，再按号码。
- `labels`：多建 `priority:P0`、`priority:P1`、`priority:P2`，它们进保留的 label。
- 删掉 `open` 和 `openSpecIssue`、`SPEC_ISSUE`。
- `move`：closed 状态先 close 后 relabel；`setState` 翻 done 时自动带评论「合并的 PR：<仓库>#<号>、…」（人另给了 `--comment` 就接在后面）。`reconcile` 翻 done 已经带这句，不变。

## User Stories

### 场景：每周分拣

1. 作为人，我想要每周一张表，每个 backlog issue 一行，写结论、证据评论的链接和建议去向，以便我一次批完
2. 作为人，我想要每条结论在 issue 上有一条带「🤖 idea-loop：」前缀的证据评论，以便事后知道它为什么被这样处理
3. 作为人，我想要判不了的写成「已查清 / 还要你补」，我没补就不再来问，以便同一件事不每周问一遍
4. 作为人，我想要拒掉的需求记进「不做」清单，以便下次同类 issue 能被认出来
5. 作为人，我想要每次最多 15 个、上线时用「全部」把存量分批跑完，以便一张表批得完
6. 作为人，我想要问题清楚的 issue 直接进 todo、要我想的进 triage，以便 triage 里只剩真要我拍板的

### 场景：开 issue

1. 作为 agent，我想要只有一个命令能开 issue，正文缺节就被拒，以便开出来的 issue 都写清问题、证据、影响范围和从哪发现
2. 作为人，我想要我在会话里明说「做」的直接开成 todo，其余进 backlog，以便放不放行只在分拣时定
3. 作为人，我想要 P0 当场复现、复现到就进 todo 并通知我，以便线上坏了不用等一周

### 场景：调度与关 issue

1. 作为人，我想要调度按 P0 → P1 → P2 派 todo，以便会话位先给最要紧的
2. 作为 triage 会话，我想要拿分拣贴的证据评论直接起草 spec，以便不再复现一遍
3. 作为人，我想要 `set done` 要么关上、要么什么都没改，并在 issue 上写明合并了哪些 PR，以便不再手动收拾半翻的 issue

## 实现决策

人 2026-11-06 交代「剩下的两个 issue 放到一个 pr 里完成」后去休息，下面标「按推荐」的是这一轮没逐条问过人的，依据写在各条里，人看 PR 时可以推翻。

### `issue-triage` 一个 skill，两种调用

- **每周分拣**（不带参数，或带 `全部`）：本 skill 的正文。
- **P0 当场复现**（带 `P0 <号>`）：被「开一个 issue」调，只起一个 `issue-triager`，复现到了 `set todo` + `priority P0` + PushNotification，没复现到留在 backlog、评论写「疑似 P0，没复现到」。

可以被模型调用（依据：grill 的 Q3，人同意了；人在普通对话里说「分拣一下」也该起它）。

### 建议去向四种，人批（按推荐）

旧 spec 只有 todo / 关闭 / 留 backlog 三种，因为九个状态里没有 triage。#242 加了 triage（「要人评估」）并写了「不要人评估的直接 todo」（[[2026-11-05-issue-model-regrill]] 的 U1：「一个是 ready-for-agent（即问题得到了验证且不需要我…），另一个则是 needs-triage」），所以分拣多一种去向：

| 建议 | 什么时候 | 人批了之后 |
|---|---|---|
| todo + P1/P2 | 复现到了，修法只有一种显然的做法，不碰 UI、不加新能力 | `set todo`、`priority` |
| triage + P1/P2 | 复现到了，但要人定方案、要 grill、碰 UI 要设计，或是一个新能力 | `set triage`、`priority`；人自己开 triage 会话 |
| canceled | 重复、在「不做」清单里、已实现、复现不出 | `set canceled --comment=<理由>`；人说「不做」的同时写进「不做」清单 |
| 留在 backlog | 判不了 | 什么都不做 |

项目跳过 triage 的，第二种并进第一种（todo 会话里 grill 与设计）。分拣自己不判 P0：P0 是开 issue 时就判的；分拣里碰到像 P0 的，建议写 P1 并在结论里标「疑似 P0」，人改。

### `idea-loop:issue-triager`

新 agent，sonnet、思考强度 medium，钉在定义里（依据：grill 的 U3）。一次一个 issue，按顺序，命中一项就停：

1. **查重**：开着的 issue 里有同一个问题 → 建议 canceled，写「跟 #N 重复」。
2. **「不做」清单**：`docs/records/out-of-scope/` 里命中 → 建议 canceled，附那一份的路径。
3. **是否已实现**：查代码、已合并的 PR、ADR → 建议 canceled，附出处。
4. **复现**：手段沿用 `issue-verify` 那张表（逻辑写一个会红的测试、界面截图、线上数据查询），输出放 `.tmp/triage/<号>/`。
5. **打分类**：`issues type`，类型 `kind:*` 用 `gh issue edit --add-label`。

做完 `issues note` 贴证据评论：结论、证据、建议去向与理由；正文缺必填节的，评论里补上查到的。判不了的写「已查清 / 还要你补」两栏。交回一行 JSON：号、结论一句、评论链接、建议去向、建议优先级。只读代码、不改代码、不翻状态。

### 汇总与人批

表摆在会话里，每行：号和标题、结论、证据评论链接、建议去向。表好了 PushNotification「N 个 issue 等你批」。人逐行回「是」或改，会话照批的执行；人没回的行不动。

### 每次 15 个，`全部` 分批

不带参数：`issues backlog <docs> 15`。带 `全部`：每 15 个一批，一批一张表，人批完一张才跑下一批。同时最多 5 个 `issue-triager`（依据：grill 的 Q6、U3）。

### 「不做」清单

`docs/records/out-of-scope/<slug>.md`，`type: record`，一个概念一份：是什么、为什么不做（人的原话）、相关 issue 号；同一概念再被提就往同一份里追加号码。放在已有的 `records/` 下，不另开顶层目录（依据：`idea-loop:wiki-conventions` 对 `records/` 的定义是会话起头、人维护的台账；grill 的 Q5 只定了「知识库里、一个概念一份文件」，目录是推荐，可推翻）。

### 每周定时任务由 `setup` 装

照每周 dreaming 的装法：问人装不装，id `triage-<仓库名>`，默认每周一 9 点左右（分钟避开 0 和 30），prompt `/idea-loop:issue-triage`。不在桌面 app 里的，把 prompt 交给人自己建（依据：grill 的 Q3）。

### 正文校验 `bodyErrors`

按 `## <节名>` 切正文，四个必填节（问题、证据、影响范围、从哪发现）缺一个或内容只有空白就报。可选节（背景、已确认原因）和别的节不管：`seo-issues.mjs` 的「怎么复现」「验收标准」照留。证据写「无，待验证」算填了。

### 开成什么状态（按推荐）

| 情况 | 开成 |
|---|---|
| 人在当前会话里明说「做」 | todo，问人 P0 / P1 / P2 |
| 判断是 P0（线上坏了、安全问题：权限、付款、数据越权；拿不准不判） | backlog，然后 `/idea-loop:issue-triage P0 <号>` |
| 其余（agent 发现的、人只批了一句「开」的） | backlog |

人明说不做的不开（旧 spec 是「开成 canceled」；一个开了就关的 issue 只有「不做」清单用得上，而清单直接写文件就行，按推荐简化）。人明说先放着的就是 backlog，不用另写。

### 优先级：label 名与 Linear 对照（按推荐）

| idea-loop | GitHub | Linear priority |
|---|---|---|
| P0 | `priority:P0` | 1 Urgent |
| P1 | `priority:P1` | 2 High |
| P2 | `priority:P2` | 3 Medium |
| 没有 | 没有 label | 0 No priority；4 Low 也按「没有」排 |

沿用仓库已有的 `priority:P0`，补两个（依据：#242 的实体表把优先级定为平台字段、取值留给这一份）。

### `issue-verify` 删掉

依据：grill 的 Q1。复现手段表挪进 `agents/issue-triager.md`；「起草」「自己校验」「跟人定要 grill 的」挪进 `issue-session/references/draft-spec.md`，triage 会话第 1 步调 `to-spec` 后照它做，todo 会话自己起草时也照它。原来「验证为不存在的 spec」那条路不再有：不存在的在分拣里就关了；起草时才发现已被做掉的，`set canceled --comment` 并删掉 spec 草稿。

### `issues backlog` 的「人没改过」

最新一条评论以「🤖 idea-loop：」开头且含「还要你补」，并且 issue 的 `updated_at` 不晚于这条评论的 `created_at` 一分钟以上，就跳过。已知限制：人只改了 label 也算更新过，下周会再查一次；多查一次不丢东西，接受。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `bodyErrors`、`new`（校验、查重、label 组合、todo 必带优先级）、`priority`、`backlog`（排序、上限、跳过规则）、`note`（前缀）、`candidates` 的优先级排序、`move` 的先关后改与失败时不动 label、done 的 PR 评论；`seo-issues.mjs` 正文四节 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了 skill 与 agent 文字，不加 eval（顶层 AGENTS.md §5）；用文档测试钉住入口都指向 `issues new`、`issue-verify` 与 `issues open` 已无引用 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`issues.mjs` 导出的函数加注入的假 `gh`（沿用 `issues.test.mjs`）。抓得到正文校验、label 组合、排序、跳过规则、写的顺序；抓不到 GitHub 真实的搜索与时间戳。文档测试抓「入口指向哪」，抓不到模型照不照做。
- **增量功能测试**：
  - 前置：假 `gh` 里 3 个 todo：#5 P2、#9 P0、#3 没有优先级。步骤：`candidates`。期望：#9、#5、#3。覆盖：调度 1。
  - 前置：正文缺「从哪发现」。步骤：`new`。期望：拒绝，报缺哪一节，没调 `gh issue create`。覆盖：开 issue 1。
  - 前置：`--state=todo` 没带 `--priority`。步骤：`new`。期望：拒绝。覆盖：开 issue 2。
  - 前置：#7 最新评论是分拣的「还要你补」，之后没更新；#8 同样的评论之后人又评论了。步骤：`backlog`。期望：只出 #8。覆盖：每周分拣 3。
  - 前置：假 `gh` 的 `issue close` 抛错。步骤：`set done`。期望：抛错，`issue edit`（去 label）没被调。覆盖：调度与关 issue 3。
  - 前置：#4 的 PR 都已合并。步骤：`set done`。期望：`issue close` 带的评论列出这些 PR。覆盖：调度与关 issue 3。
  - 前置：全仓库 grep。期望：插件里没有 `issue-verify`、`issues open`。覆盖：调度与关 issue 2、开 issue 1。
- **照着谁写**：`issues.test.mjs`（假 `gh`）、`issue-group-skills.test.mjs`（文档测试）、`seo-issues.test.mjs`。

## Out of scope

- 已在用的仓库的存量迁移：`issues migrate` 已在 #242 做了；上线后人手敲 `/idea-loop:issue-triage 全部` 跑存量，写在发版清单里。
- 「本期焦点」：main 上没有（加它的 #240 没合）。

## 关联

- 决定记录：[[2026-11-05-issue-triage-grill]]（Q1–Q6、U2、U3）；状态模型：[[issue-model]]（#242）与 [[2026-11-05-issue-model-regrill]]。
- [[issue-linear]]（#226）：同一个 PR，Linear 项目上分拣、开 issue、派发怎么用 MCP 做。
- `issue-intake-priority`：前一版的入口与优先级 spec（焦点、挂模块根、想法 label），被 0.2.0 的决定取代、从没实现过。这个 PR 删掉它，不写 ADR。
- 相邻：#241、#244、#247 在 0.1.10 发版时退回 backlog（发版清单），不与这份重叠。
