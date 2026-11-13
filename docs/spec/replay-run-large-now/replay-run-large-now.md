---
type: spec
tags: [idea-loop, retro]
summary: 规则回放 runner 加 --run-large：人说现在就跑时，大用例当场跑，结果照夜间格式写进 review loop 文件
related: ["[[0028-retro]]"]
issues: [174]
---

# 规则回放：人说「现在就跑」时，大用例有正式的当场跑法

> #174 存在：`retro-replay.mjs --case <大用例>` 只打印「要进夜间队列」、退出码 3，当场跑大用例只能借测试用的 `--queue --now` 假装凌晨，详情在「问题陈述」

## 问题陈述

### 人说「现在就跑」，规则只给「等今晚」

规则回放的大用例（会起插件 agent、开浏览器、调付费服务的）由 `idea-loop:implement` 在 PR 开出后放进夜间队列，每晚 00:00–07:00 由计划任务跑。人在会话里说「现在就跑吧」时，runner 没有一条正式的路：

- `--case <名字>` 碰到标成大的用例，打印「要进夜间队列：…这里不跑。」，退出码 3（`idea-loop/evals/retro/retro-replay.mjs` 的 `replay()`，对着 origin/main `cacdec5`，2026-11-13 查）。
- 能当场跑大用例的只有 `--queue`，它先看本机时钟，不在 00:00–07:00 就什么都不起。

真实例子：PR #162（implementer 那次改动）里人说「现在就跑吧」，编排者先 `--enqueue`，再用本来给测试用的 `--queue --now 2026-10-30T01:00:00` 假装是凌晨，让队列立刻跑掉。跑通了，但这条路没写在任何规则里，别的会话照规则读只会告诉人「等今晚」。

出处：issue 正文与分拣评论（2026-11-13，对着 `a7c8129`）；决定记录 `docs/raw/decisions/149.md` 候选 2（人批）。

### 根因

runner 把「大用例」和「只在夜里跑」绑死在一起：`--case` 对大用例直接拒绝，`--queue` 又只认时钟，中间没有「人明说要现在跑」这个入口。

## 方案

改完后：人说「现在就跑」，issue 会话先告诉人要跑几个用例、大约多久、花多少，然后在后台跑

`node ~/.idea-loop/bin/retro-replay.mjs --cases <用例,用例> --run-large --pr <PR 号> --worktree <集成 worktree>`

runner 当场跑这些用例（大的也跑，起 agent、开浏览器都不中止），超时默认 45 分钟，结果照夜间的格式追加进这个 PR 的 review loop 文件（`<worktree>/.tmp/review-loop/<PR>.md` 里一条 `规则回放` 条目），这些用例若已在夜间队列里，从队列里拿掉，夜里不再重跑。会话等它退出，再照 `replay-result.md` 处理结果，跟夜里发回来的一样。

runner 里的变化：

1. **新参数 `--run-large`**，配 `--case <名字>` 或 `--cases a,b`，必带 `--pr`；review loop 文件写在 `--worktree`（没给就是 `--repo`，再没给是当前仓库根目录）下。
2. **跑法**：每个用例走夜间那一套（改前、改后各一次 `claude -p`，加一次判定，不因起 agent 中止），只是不看时钟、不读队列文件；全部跑完写一条 `规则回放` 条目，跟夜间条目同格式，`review-loop.mjs check` 一样能读。
3. **超时**：没给 `--timeout-min` 时默认 45 分钟（小用例和夜间仍是 20）。
4. **队列去重**：队列目录里有同一 worktree、同一 PR 的条目，把这次跑了的用例从中删掉；删空了就删文件。
5. **退出码**：全过 0，有不过的 1，参数不对 2（没 `--pr`、没用例），其余照每个用例的结果（同 `--case`）。
6. **不带 `--run-large` 的大用例**：照旧退出码 3，提示里加一句「人说现在就跑：加 `--run-large --pr <N>`」。

会话一侧：`idea-loop:issue-session` 的「规则回放的结果」加一句：大用例默认进夜间队列，人说「现在就跑」照 `references/replay-result.md` 的「当场跑」；那一节写跑前要告诉人的（几个用例、每个最长约 3×45 分钟、runner 打印的花费估计，起 agent 的会高于上限）、用后台方式跑（前台 Bash 10 分钟会截断）、`~/.idea-loop/bin/` 的 runner 不认这个参数时先重装 runner。

同一行为的其他入口：

- `idea-loop:implement`「没活了就停下」里放进夜间队列那一步：不改。它在人没说话时照常 `--enqueue`；人说现在就跑发生在之后的 issue 会话里，由队列去重保证不重跑。排除。
- implementer 的小用例当场跑（`--case`）：不变，仍中止起了 agent 的小用例、改标成大。排除。
- 夜间计划任务的 prompt（`retro-install.mjs` 打印的）：不变。排除。

## User Stories

1. 期望行为：人在 issue 会话里说「现在就跑」，会话先说清要跑几个用例、大约多久、花多少，再用 `--run-large` 当场跑完大用例，结果出现在 PR 的 review loop 文件里，会话照它处理；不用等夜里，也不用借 `--now` 假装凌晨。

## 实现决策

- 参数名用 issue 正文与 retro 批过的新文给的 `--run-large`，依据是人批过的原文（`docs/raw/decisions/149.md` 候选 2）。
- 必带 `--pr`：结果要「照夜间的格式写进 review loop 文件」（批过的新文），那个文件按 PR 号定位，没有 PR 号写不进去。
- 同时接受 `--cases a,b`：夜间条目是一个 PR 的全部用例一条，一次跑完写一条才跟夜间同格式；`--case` 单个也接受。
- 不发会话间消息、不发 macOS 通知：调 runner 的就是等结果的那个 issue 会话，输出它自己读。
- 队列去重按「同一 worktree + 同一 PR」认条目，不要求 `--slug`：队列文件里记着 worktree 和 PR 号，不用让人多给一个参数。
- 跑法复用夜间那一套（同一个执行函数，不中止），不另写一份。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | runner 端到端测试（假 `claude`）：大用例 `--run-large` 当场跑、写条目、队列去重、缺 `--pr` 拒绝、不带参数的大用例提示里有 `--run-large` |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | issue-session 加的一句与 replay-result.md 的「当场跑」：文档测试断言它们点名 `--run-large`、跑前告诉人多久与花多少、后台跑；不留回放用例（规则可机械判定） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：runner 的命令行（假 `claude` 替身，读 stdout、退出码、review loop 文件、队列目录）；能抓到参数行为与写出的条目，抓不到真会话里的耗时与花费。文档测试读两份文档原文，能抓到那句被删，抓不到会话是否照做。
- **增量功能测试**：
  - 前置：一个 worktree，用例标成大，改后插件能修好。步骤：白天跑 `--case <它> --run-large --pr 12 --worktree <wt>`。期望：三次 `claude -p`，退出码 0，review loop 文件里一条已处理的 `规则回放` 条目。覆盖：期望行为 1。
  - 前置：同上，先 `--enqueue` 了这个用例。步骤：同上。期望：跑完后队列文件没了。覆盖：期望行为 1。
  - 前置：同上。步骤：不带 `--pr`。期望：退出码 2，不起会话。
  - 前置：同上。步骤：只 `--case <它>`。期望：退出码 3，输出提到 `--run-large`。
- **照着谁写**：`idea-loop/scripts/retro-queue-run.test.mjs`（端到端），`idea-loop/scripts/issue-session-implement-doc.test.mjs`（文档测试）。

## Out of scope

- 让 runner 自己估时长：每个会话耗时差别大，跑前由会话按「最长 3×45 分钟」告诉人。
- 已知限制：`~/.idea-loop/bin/` 里的 runner 是装时的拷贝，插件升级后要重跑 `retro-install.mjs` 才认 `--run-large`；replay-result.md 里写了不认时先重装。

## 关联

- 决定记录：`docs/raw/decisions/149.md` 候选 2。
- 相关 ADR：`0028-retro`（回放按大小分跑）。
- 相邻未完成的 issue：#173（夜间回放结果送回会话、通知兜底）同改 `retro-replay.mjs`，它碰 `--queue` 的结果回送，这里加 `--run-large` 入口，内容不重叠，合并时可能有文本冲突，谁先都行。
