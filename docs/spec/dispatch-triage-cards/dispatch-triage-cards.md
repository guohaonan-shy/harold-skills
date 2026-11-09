---
type: spec
tags: [idea-loop, issue-workflow, issue-dispatch]
summary: 调度也给 triage 的 issue 出卡片（单独上限 3），人点了才开会话；删掉独立队列，所有 issue 一个队列
related: ["[[issue-triage]]", "[[runtime]]"]
issues: [266]
---

# 调度给 triage 的 issue 出会话卡片；所有 issue 一个队列

> #266 存在：调度只给 todo 出卡片，triage 的 issue 只在汇报里记一行，没有卡片可点，人不记得手开就一直停在 triage，详情在「问题陈述」

## 问题陈述

对着 origin/main 93c2125（idea-loop 0.1.11）核过，2026-11-09。

### 1. 批进 triage 的 issue 没有入口

分拣（`issue-triage`）批表时有一种去向是「triage + P1 或 P2」，那一行的做法写着「人自己开 triage 会话」（`idea-loop/skills/engineering/issue-triage/SKILL.md` 第 31 行）。调度这边：

- `issue-dispatch` SKILL.md 第 11 行：「`triage` 的 issue 在等人评估，由人自己开会话，不归你派」。
- 每一轮第 4 步（第 31 行）把没有会话的 triage issue 写进汇报一行字；第 5 步（第 32 行）只从 `issues candidates` 取 todo 出卡片，`candidates` 在脚本里只筛 `state === 'todo'`。
- `issue-session` 的会话表里，triage 会话「谁开的」是「人」，todo 会话是「调度」。

所以 issue 进了 triage 之后，侧边栏里什么都不出现。人要推进，得自己记得号码，新开一个带 worktree 的会话，敲 `/idea-loop:issue-session <号>`。没开，issue 就一直停在 triage，翻不到 todo，调度也就永远派不到它。

例子（issue 原文记录的一次真实分拣）：一张 15 行的分拣表，5 个批进了 triage；批完之后这 5 个没有一张卡片，只能人逐个手开。分拣是每周一次，triage 里只进不出。

还有一条路也进 triage：todo 会话起草 spec 时冒出要人定的，会把 issue 翻回 triage 并收尾（`issue-session` 的「todo 会话」一节）。这样的 issue 同样没人接。

### 2. 独立队列（人在本会话里提出，没有单独的 issue）

分类可以在 AGENTS.md 的「issue 分类」里注「（独立队列，上限 N）」，那个分类的 issue 单独排队、单独计上限、待在加了分类名的 section 里（`issues.mjs` 的 `queues` / `queueOf`，`issue-dispatch` 第 5 步「每个队列分开算」）。目前只有 `seo-setup` 会写这个注（`seo`，上限 5）。2026-11-09 侧边栏里有 `seo 审核中`、`seo 设计中`、`seo 实现中`、`seo triage`、`seo in-progress`、`seo in-review` 六个 section，跟主队列的一套并排。人在本会话里的原话：「seo我倾向于不整单独队列，所有issue 统一一个队列」，并选了「删掉独立队列机制」，在这个 PR 里一起做。

### 根因

- 问题 1：调度把「triage 由人评估」理解成「triage 的会话由人开」。人要的只是讨论的时机由人定；卡片本身要人点才开会话（桌面端 `start_session` 出的是卡片），已经满足这一点，不需要连入口一起拿掉。
- 问题 2：不是缺陷，是方向调整：人不要按分类分队列。

## 方案

改完之后：

- 所有 issue 一个队列，三个 section（triage、in-progress、in-review），不再有加分类名的 section。
- 调度每一轮除了给 todo 出卡片，也给没有会话的 triage issue 出卡片。卡片长得一样、点开走的也是同一个 `issue-session`，它按 issue 的状态（triage）走 triage 会话：起草 spec、跟人 grill、设计，做完翻 todo。人什么时候点，讨论就什么时候开始。

![调度一轮里 triage 卡片从哪来](assets/sequence-dispatch-triage-cards.png)

一轮的顺序：

1. 对账，照旧；`issues queues <docs>` 给出两个上限和三个 section 名。
2. 数开着的会话：三个 section 照旧都数，但分两份记：in-progress、in-review 的算进上限 10，triage 的算进 triage 上限 3。
3. 没有会话的 issue：只报 in-progress、in-review 的；triage 的不再报，它们会拿到卡片。
4. 交出 todo，照旧。
5. **新**：交出 triage。候选是 `issues candidates <docs> --state=triage` 取全部、跳过有同号会话或还没点卡片的之后的前 <空位> 个（review 第 2 轮改：先跳过再截断，否则开着的会话占掉名额）：顺序跟 todo 一样（指派给本人的在前，按优先级，同一级里在 triage 停得久的在前；指派给别人的不派）。空位 = triage 上限 3 − triage section 里开着的会话 − 还没点的 triage 卡片（见「实现决策」）。
6. 一轮最多 3 张卡片不变，todo 先交，剩下的给 triage。

同一行为的其他入口：

- **分拣**（`issue-triage` 批表的 triage 那一行）：纳入，把「人自己开 triage 会话」改成「调度会给它出卡片」。
- **todo 会话翻回 triage**：纳入，不用改流程：翻回之后它就是一个没有会话的 triage issue，下一轮拿到卡片；它的分支和评论照旧由 triage 会话接上（`issue-session` 开场的「接分支」）。
- **人手动 `/idea-loop:issue-session <号>`**：纳入，照旧可用；开了会话就不会再出卡片（数会话时数到了它）。
- **跳过 triage 的项目**（`ISSUE_TRACKER.md` 写了「triage：跳过」）：排除，没有 triage 的 issue，第 5 步取不到候选。
- **Linear 项目**：纳入，候选照 `idea-loop:issues` 的 Linear 做法按 Triage 状态取，顺序同 todo。
- **magi 运行环境**：纳入，直接开会话，见「实现决策」的「magi 里 triage 也直接开」。

## User Stories

只修问题、不加能力：

1. 期望行为（对应问题 1）：issue 批进 triage（或从 todo 会话翻回 triage）之后，下一轮调度在侧边栏给它出一张会话卡片；人点了才开 triage 会话，不点就一直在，一周过期后下一轮重出。
2. 期望行为（对应问题 2）：seo（或任何分类）的 issue 跟别的 issue 在同一个队列里按同一个顺序派，会话待在 triage / in-progress / in-review 三个 section 里；AGENTS.md 里留着旧的上限注也不再单独排队。

## 实现决策

- **卡片的 prompt 不分状态**：todo 和 triage 用同一句 prompt（「用 Skill 工具调 idea-loop:issue-session，参数 <号>，按它从开场做起」）。依据：`issue-session` 开场已经按状态分路，triage 走 triage 会话，不需要卡片告诉它。卡片的 `background` 改成「你派的是 todo 或 triage 的 issue：todo 会话认领后从 spec 做到 PR 合并，triage 会话陪人评估，做完翻 todo」。
- **还没点的卡片**：从「调度出过、issue 还是 todo 的」改成「调度出过、issue 还是出卡片时那个状态（todo 或 triage）、也没有同号会话的」，汇报里按状态记。依据：triage 卡片和 todo 卡片一样会过期、一样会被点开，记法同一套。
- **一轮最多 3 张，todo 先**：依据：每轮上限是为了不一次刷出一屏卡片，triage 不改变这个理由；todo 已经评估完、可以直接做，先派它。
- **`issues candidates` 加 `--state=triage`**：默认仍是 todo；triage 时「停留时间」读 `status:triage` 最后一次加上的时间，读法同 todo。依据：顺序规则跟 todo 是同一条（`issue-dispatch` 第 5 步），只换状态。
- **`issue-session` 会话表**：triage 会话「谁开的」改成「人或调度卡片」。开场的认领、归位照旧（triage 会话归到 triage section）。
- **改的文档**：`issue-dispatch` SKILL.md（第 11 行的边界、第 4、5 步、汇报）、`runtime` 两份 reference 的「会话管理」与「调度」、`issue-session` 会话表、`issue-triage` 批表那一行、README 的三行（issue-dispatch、issue-session、issue-triage）和状态一节里「only `todo` is dispatched」；删独立队列另见下面「删掉独立队列」。

### triage 单独一个上限 3

triage 另有一个上限 3，数 triage section 里的 issue 会话和还没点的 triage 卡片；原来的上限 10 只数 in-progress、in-review 两个 section。依据：人 2026-11-09 在本会话里选了「单独上限 3」。

走一遍：开着 8 个会话（其中 2 个在 triage）、3 个 todo、5 个 triage → todo 空位 10 − 6 = 4，出 3 张 todo 卡片；triage 空位 3 − 2 = 1，但一轮 3 张已用完，下一轮出 1 张 triage。triage 最多同时 3 个：triage 会话要人在场 grill，人一次接不住太多；也不跟 todo 抢位，不会被饿死。

### magi 里 triage 也直接开

magi 没有卡片：调度直接 `magi sessions start` 开会话（`runtime` 的 `references/magi.md`「调度」），triage 也一样开，受 triage 上限 3 卡住。会话开场起草 spec、自校验，碰到「需要 grill」「待定」就推送一句话停下等人（`issue-session` 的 `references/draft-spec.md`「跟人定要 grill 的」）。依据：人 2026-11-09 在本会话里选了「也直接开」；讨论时机仍是人的，只是草稿先写好了。

magi 没有 section，数 triage 会话时按会话 slug 里的号读 issue 的状态（`issues show`），是 triage 的算进 triage 上限，其余算进上限 10。

走一遍：周一分拣批 5 个进 triage，下一轮开 3 个，各自写好 spec 草稿停住；人周三打开其中一个，从 grill 开始；那个会话翻 todo、收尾后空出一位，下一轮再开第 4 个。

### 删掉独立队列

依据：人 2026-11-09 在本会话里的原话（见问题陈述 2）。

- **`issues queues <docs>`**：不再带 `<号>`，返回一个对象 `{ cap: 10, triageCap: 3, sections: ["triage", "in-progress", "in-review"] }`，不再是数组。命令留着，是因为调度和 runtime 要从一处读上限和 section 名。
- **`issues candidates`**：去掉 `--queue`；`queueOf` 删掉。
- **AGENTS.md 里已有的「（独立队列，上限 N）」注**：脚本照旧把它从分类说明里剥掉（label 的说明文字不变），但不再据此分队列；`issues labels` 不报它。依据：已经装了的项目（跑过 `seo-setup` 的）不用改文件也不坏。
- **`seo-setup`**：写 `seo` 分类时不再加这个注，删掉解释它的那一段；seo 的 README 里「建 issue 分类与独立队列」改成「建 issue 分类」。
- **其余提到独立队列的文档**：`issue-dispatch`（「每个队列分开算」、`--queue=<name>`、汇报「每个队列一行」）、`runtime` 两份 reference（section 名前加分类名、按队列数、magi 里按 `issues queues <号>` 分队列）、`issues` SKILL.md 的命令表与「分类（模块、类型、独立队列）」、它的 `references/category-and-spec.md`、`references/linear.md` 的「独立队列按 labels 分」、`setup` 的 `references/issue-category-format.md`、README 的 issue-dispatch 一行。
- **已经待在 `seo …` section 里的会话**：升级后调度不再数这些 section。不改脚本去兼容；PR 描述里写一步给人：把这些 section 里还开着的会话挪进同名的主 section（`seo in-progress` → `in-progress`），再删掉空了的 `seo …` section。依据：只在人自己的侧边栏里发生、一次性的，挪错只多出一张卡片。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | `issues candidates --state=triage` 的筛选和顺序；`issues queues` 返回一个对象、带 `triageCap`；带「（独立队列，上限 N）」注的分类不再分队列、注仍从 label 说明里剥掉 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：改的是调度 skill 的步骤，不是 prompt 产出的结构；没有对应的回放用例（retro 回放只验收 retro 批出的规则改动） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`issues.mjs` 导出的 `candidates(gh, limit, { state })`、`queues()` 和 `parseTypes`，用 `issues.test.mjs` 现有的 `fakeGh` 喂 issue 列表。抓得到筛选、顺序、上限；抓不到调度 skill 照不照做。
- **文档守护**：照 `issue-session-implement-doc.test.mjs` 的写法加一个 doc 测试，断言 `issue-dispatch` SKILL.md 不再写「由人自己开会话」、第 5 步之后有交出 triage 的一步，`issue-triage` 的 triage 那一行不再写「人自己开 triage 会话」；`idea-loop/skills/` 和 README 里不再出现「独立队列」。抓得到文字被改回去；抓不到调度实际跑出几张卡片。
- **增量功能测试**：
  - 前置：harold-skills 里有一个开着的 `status:triage` issue，没有同号会话。
  - 步骤：调度会话跑一轮 `/idea-loop:issue-dispatch`。
  - 期望：汇报里写出这一轮给它出了一张 triage 卡片；侧边栏出现标题「harold-skills#<号> …」的卡片；点开后会话归到 triage section，issue 状态仍是 triage。
  - 覆盖：期望行为 1。
- **照着谁写**：`issues.test.mjs` 里 `candidates` 的几个测试（第 509–605 行一带）。

## Out of scope

- 改 triage 会话本身的流程（起草、grill、设计、翻 todo）。
- triage 的 issue 自动翻 todo：仍要人评估完、spec 没有「需要 grill」「待定」。

## 关联

- [[issue-triage]]：定了分拣和「triage + P1/P2」这条去向；本 spec 给这条去向补上入口。
- [[runtime]]：调度的三处做法在 runtime 的 reference 里，本 spec 改其中的「怎么交出 issue」「怎么数开着的会话」和「分组」。
- 相邻还没完成的 spec 与 issue：无。2026-11-09 查过 `status:triage` / `todo` / `in-progress` / `in-review` 四个状态，开着的只有 #266 本身；名字带 dispatch 的远端分支只有 `impl/retro-batch-dispatch`，已合进 main。
