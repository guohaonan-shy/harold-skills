---
type: spec
tags: [idea-loop, retro]
summary: 取消夜间回放队列，大用例在修改侧当场跑；回放输入不露题、Codex 当评委、核实改后用上了改动的 skill
related: ["[[2026-11-13-replay-verify-redesign]]", "[[0028-retro]]"]
issues: [174]
---

# 规则回放：取消夜间队列，在修改侧当场跑，并让结果更可信

> #174 存在：`retro-replay.mjs --case <大用例>` 只打印「要进夜间队列」、退出码 3，当场跑大用例只能借测试用的 `--queue --now` 假装凌晨，详情在「问题陈述」

范围在 PR #308 第 1 轮 review 之后改过（2026-11-13，讨论记录 [[2026-11-13-replay-verify-redesign]]）：最初只加一条「人说现在就跑」的入口；人随后定了取消夜间队列（#173 并入本 issue，#173 已关），并参考 poteto（Lauren Tan）的 eval playbook 把回放的输入、评委和核对一起改了。最初那条入口（`--run-large`）已落地在本分支，下面的方案在它之上做。

## 问题陈述

### 1. 大用例只能等夜里跑

规则回放的大用例（会起插件 agent、开浏览器、调付费服务的）由 `idea-loop:implement` 在 PR 开出后放进夜间队列，每晚 00:00–07:00 由计划任务跑；结果靠计划任务的会话转发回 issue 会话。人说「现在就跑吧」时没有正式的路，PR #162 里会话借测试用的 `--queue --now 2026-10-30T01:00:00` 假装凌晨跑掉；#173 记的是另一面：10-29 那晚计划任务被唤醒后没有回应，结果没送回会话，也没有通知兜底。出处：#174 正文与分拣评论（对着 `a7c8129`，2026-11-13）、#173 正文与关闭评论。

人的方向（U1）：「夜间队列我觉的可以取消，skill修改的验证我倾向于直接在修改侧启动子代理来进行验证」。

### 2. 回放的输入告诉了 agent 它在被测

每次回放给 agent 的输入是用例里人的原话，末尾再加一句「（这是一次无人值守的回放，人不在场……做到「X」就停下……）」（`idea-loop/evals/retro/replay.mjs` 的 `buildWorkerPrompt`，对着 `314a633` 查）；工作目录也叫 `…/idea-loop-retro/<用例>/<时间>/before/project`。agent 知道自己在被测、停在哪，行为可能跟真实会话不同。真实例子：#157 的回放用例跑了两次改前、改后都答「是」，旧版 agent 看出了规则里的矛盾自己绕开了，用例因此删掉（spec `implement-resume-landed` 的「回放为什么不留」）。

### 3. 评委和被评的是同一家模型

判定会话也是 `claude -p`，跟两遍被测的会话同一个模型家族。poteto 的 eval playbook 要求评委换一个模型家族、只看脱敏标签（https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/eval.md）。

### 4. 不核对改后那一遍到底用没用上改动

判定只看产物答题，不看 agent 读没读改过的那份 skill。skill 不一定被触发：LangChain 的测试里，prompt 里提示了要用 skill，触发率也只到 70%（https://blog.langchain.com/evaluating-skills）。改后那一遍要是根本没加载改过的 skill，「改前否、改后是」也说明不了规则生效。

### 根因

回放当初按「付费会话占人的额度，所以放夜里」设计（ADR 0028），结果只能异步送回；判定只设计了「两份产物答一道题」，没有防被测者知情、评委同源、改动没被触发这三种失真。

## 方案

改完后：改规则的 PR 里，执行方照旧当场跑小用例；PR 开出后，编排者（issue 会话）告诉人要跑几个大用例、每个最长约 3×45 分钟、大约花多少（每个约 1.05–3.50 美元，起 agent 的更高），不等人点头，在后台用 runner 当场跑，等它退出，读结果。夜间队列、计划任务、结果转发全部去掉。每次回放：

1. 改前、改后两遍 `claude -p` 的输入只有人当时的原话，工作目录用项目自己的名字，看不出在被测；
2. 评委是 Codex（不同模型家族），仍答那道从人原话写出的是/否题，必须引产物原文；两份产物以随机顺序标成 A、B；
3. runner 机械核对改后那一遍的会话记录：读过这次改动的 skill / agent 定义 / 参考文件之一才算测到了改动，否则判「用例没测到改动」，不算过；
4. 跑的那一方（小用例是执行方，大用例是编排者）自己读两份产物，跟评委的答案对照：一致照常往下走，不一致把用例、评委答案与出处、自己的读法摆给人。

过的条件不变：改前「否」、改后「是」；改前就「是」仍是「用例没抓住问题」。

同一行为的其他入口：

- 执行方的小用例当场跑（`--case`）：纳入第 2、3、4 条；起了 agent 的小用例仍中止、改标成大，交给编排者。
- `--settle`（人推翻判定后重算）：不变。
- 计划任务、`--queue`、`--enqueue`、`--notify`、队列目录、「回放结果」行：删除。已装过的机器由 setup 删掉计划任务 `idea-loop-retro-replay` 和队列目录。
- `idea-loop:issue-session` 收夜里结果的那一段：删除，处理结果的说明移到 `idea-loop:implement`（跑大用例的就是它的编排者）。

## User Stories

1. 期望行为（问题 1）：大用例在 PR 开出后当场跑完，人在会话里先听到几个用例、多久、多少钱，结果写进 PR 的 review loop 文件，编排者照它处理；不再有夜间队列和计划任务。
2. 期望行为（问题 2）：回放里的 agent 收到的输入只有人当时的原话，工作目录路径里没有回放、before / after 这类字样。
3. 期望行为（问题 3）：判定由 Codex 做，结果里写明评委是谁。
4. 期望行为（问题 4）：改后那一遍没读过任何一份改动了的 skill / agent / 参考文件时，结果是「用例没测到改动」，不算过。
5. 期望行为（问题 2–4 的收口）：跑回放的一方读过两份产物，跟评委答案对照，不一致时停下摆给人。

## 实现决策

- **大用例谁跑、什么时候跑**：编排者在 `idea-loop:implement`「没活了就停下」那一步跑（原来 `--enqueue` 的位置），用已落地的 `--run-large --pr <N> --worktree <集成 worktree>`，后台跑、等退出；PR 在结果处理完之前留在 draft。依据：人的原话 U1、U2「报完直接跑」。
- **跑前报什么**：用例个数、每个最长约 3×45 分钟、每个约 1.05–3.50 美元（起 agent 的更高）乘以个数，数字写进说明，不等 runner 打印；不等人点头。依据：PR #308 第 1 轮 S1 推荐 A，人选「报完直接跑」。
- **「在修改侧起子代理」的落法**：仍是 runner 起 `claude -p --plugin-dir <改前 / 改后插件>`。同一会话里用 Agent 工具起的子代理只加载装好的那版插件，跑不了改前那一遍。
- **输入不露题**：worker 的输入只有用例的 `prompt`；`stop_at` 留在用例里，只给评委看（告诉它看产物里交给人的那一刻）。停靠两样兜底：`claude -p` 里 agent 把东西交给人就结束这一轮；超时（小用例 20 分钟、`--run-large` 45 分钟）。用例 `prompt` 里不许出现回放、eval、judge、rubric、benchmark、评测、评委、判定（用例格式校验拒绝，`--list` 报出）。工作目录改成 `<临时目录>/<随机串>/<项目仓库名>`，改前、改后各一个随机串。依据：人选题 1 A；poteto playbook 的「Non-negotiables」。
- **评委**：用 Codex companion（`idea-loop/scripts/codex-companion.mjs` 找到的那个）的 `task` 跑判定，题、规则、输出 JSON 格式不变；A/B 顺序每次随机，结果里记下哪个是改后。找不到 Codex：runner 开跑前打印一句「没找到 Codex，评委用 Claude」，照旧用 `claude -p` 判，结果里记 `judge: claude`。依据：人的决议「评委改用 Codex」；找不到时退回而不是停，因为回放是验收不是门禁，退回在结果里看得见。
- **核对用上了改动**：改动集 = 基准分支到改后插件之间，插件目录里 `skills/`、`agents/` 下改过的文件。改后那一遍的事件流（主会话和子代理）里出现以下任一项算用上：读了改动集里的文件；用 Skill 工具调了改动集里某个 SKILL.md 所在的 skill；用 Agent 工具起了改动集里某个 agent 定义对应的 agent。改动集为空（只改了脚本）时这一项记「不适用」。没用上的结果是新的 `not-exercised`（用例没测到改动），退出码 1，review loop 条目里跟其他没过的一样给三个处理。
- **读产物对照评委**：写进 runner 处理结果的说明（`idea-loop:implement` 的参考 `replay-result.md`，从 issue-session 移来）和 `idea-loop:implementer` 的小用例那段。不新增脚本：读产物是判断。
- **删除夜间部分**：runner 的 `--queue` / `--enqueue` / `--notify` / `--now` / `--queue-dir` / `--session` / `--slug` 与对应函数，`queue.mjs` 里只留 review loop 条目的写法（条目文字里不再出现「夜间」）；`retro-install.mjs` 只装 runner、打印允许规则，不再打印计划任务的 prompt；setup 的「夜间规则回放」改名「规则回放 runner」，步骤改成：装 runner、已有计划任务 `idea-loop-retro-replay` 就用『定时任务』删掉、`~/.idea-loop/replay-queue/` 在就删掉、打印允许规则。
- **ADR**：ADR 0028（回放按大小分跑、大的进夜间队列）被这次取代的部分不在本 PR 改，由 `/idea-loop:dreaming` 对账时补「取代与演变」。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | runner 端到端（假 `claude`、假 Codex）：删掉队列后的参数行为；worker 输入只有原话、工作目录不含露题词；用例 prompt 含露题词被拒；评委走 Codex、找不到退回 Claude 并记下；改后没用上改动判 `not-exercised`、用上了照常判；条目文字不含「夜间」。`retro-install` 不再打印计划任务 prompt |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 文档测试：implement 的「没活了就停下」跑大用例、报三样、不等点头；replay-result.md 读产物对照评委；implementer 的小用例同样对照；setup 删计划任务与队列目录；全仓库除 ADR、raw、决定记录外不再出现 `--enqueue`、`replay-queue`、`idea-loop-retro-replay` 的使用说明。不加新回放用例：这些规则都能机械判定 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：runner 的命令行，`RETRO_CLAUDE_BIN` 与新增的评委替身环境变量换成假的；能抓到参数、输入、判定、核对与写出的条目，抓不到真会话的耗时、花费和 Codex 真实判得准不准。文档测试读文档原文，抓不到会话是否照做。
- **增量功能测试**：
  - 前置：一个 worktree，改后插件改了某 skill 的 SKILL.md，用例标成大。步骤：`--case <它> --run-large --pr 12 --worktree <wt>`，假 `claude` 改后那一遍调了这个 skill。期望：过，条目写评委是 Codex。覆盖：期望行为 1、3。
  - 同上，但假 `claude` 改后那一遍没调这个 skill、也没读它。期望：`not-exercised`，退出码 1。覆盖：期望行为 4。
  - 前置：用例 prompt 含「回放」。步骤：`--list`、`--case`。期望：格式问题，退出码 2，不起会话。覆盖：期望行为 2。
  - 前置：任意小用例。步骤：`--case`。期望：假 `claude` 收到的 `-p` 正好是用例 prompt，cwd 不含 retro / before / after。覆盖：期望行为 2。
  - 前置：Codex 替身不存在。期望：开跑前打印退回提示，结果 `judge: claude`。覆盖：期望行为 3。
- **照着谁写**：`idea-loop/scripts/retro-queue-run.test.mjs`、`retro-replay.test.mjs`（端到端，改名或并入后保留）；`issue-session-replay-now-doc.test.mjs`、`setup-single-source.test.mjs`（文档测试）。

## Out of scope

- poteto playbook 里的多候选并行、多条标准打分：我们的题是一道从人原话写出的是/否题，比打分窄，不跟。
- 改 ADR 0028 / 0025 / 0040 里提到夜间队列的句子：归 `/idea-loop:dreaming`。
- 已知限制：白天跑回放占人的 Claude 额度（推翻了此前「付费回放放夜里」的决定，人在 U1、U2 定的）；`~/.idea-loop/bin/` 的 runner 要重跑 setup 才换成新版。

## 关联

- 讨论记录：[[2026-11-13-replay-verify-redesign]]；决定记录 `docs/raw/decisions/149.md` 候选 1（#173）、候选 2（#174）。
- 相关 ADR：`0028-retro`。
- 相邻 issue：#173 已并入本 issue 并关闭；#303（测试按阶段分层）可能改执行方跑哪些测试，与回放无重叠，谁先都行。
