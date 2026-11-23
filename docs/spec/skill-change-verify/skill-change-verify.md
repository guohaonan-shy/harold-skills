---
type: spec
tags: [idea-loop-0-2-0, skill-writing, eval, retro-replay, dyna]
summary: 改 skill 的每处改动在 spec 里写定怎么验，新能力也能写用例跑，落地时 dyna 核用例在、结果在
issues: [456]
related: ["[[2026-11-23-skill-change-verify-triage]]", "[[456]]", "[[341]]", "[[skill-structure-checks]]", "[[in-scope-legacy-fix]]"]
---

# 改了 skill 要验证它真的变了

> #456 存在：spec 里改 skill 的验证常写「不涉及」，新加的能力没有用例可写；对着 `release/idea-loop-0.2.0` 的 `66b4d463`（2026-11-23）查，详情在「问题陈述」。

## 问题陈述

### 1. 跑不跑验证靠各自判，多数 spec 写「不涉及」

`release/idea-loop-0.2.0` 的 `66b4d463` 上有 11 份 spec，「测试决策」表里「LLM 输出质量」那一行：

| 写法 | 份数 | 例子 |
|---|---|---|
| 改了 skill，但不涉及 / 不加 eval，多数直接引仓库约定 | 8 | `home-bootstrap`：「setup 的 SKILL.md 和参考改了，按 `AGENTS.md` §5 不……」；`device-memory`：「dreaming 的 SKILL.md、新参考文件……改了，按 `AGENTS.md` §5 不做 quantitative eval」 |
| 写了回放或逐处验证 | 2 | `in-scope-legacy-fix`（加一个回放用例）、`skill-structure-checks`（「杠杆诊断」每处一行「验证」） |
| 真的没改 prompt | 1 | `runtime-local-override` |

issue 原文对着更早的 `e30dcd8a`（2026-11-20，31 份）数出 15 份「不涉及」，比例一致。

它们引的依据是仓库 `AGENTS.md` §5 开头那句「跳过 quantitative eval，不做 baseline run 对比，vibe-based iteration 即可」，回放只是列在后面的「例外」。工单层面已经有一道关：to-ticket 给改 skill 的工单固定加一格「选了一种证明并做完」，执行方读 implement 的 `rule-tickets.md` 选检查或回放；可这一格是执行方自己勾的，落地时 `dyna spec skill-edit` 只核「调过 writing-for-agents」和每个文件一行杠杆，不核证明做没做。spec 阶段写了「不涉及」，工单也就跟着写「不涉及：只改措辞」。

### 2. 新加的能力没有用例可写

现在唯一的手段是 retro 回放（`idea-loop/evals/retro/`）：一个用例记下历史上出错的那一刻，改前、改后的插件各跑一遍，评委（Codex）答一道是/否题。用例的格式（`cases.mjs`）要求 `quote`，即人当时的原话，题从原话写出。

新加的能力没有出过错的历史，就没有原话，用例写不出来。真实例子：`skill-structure-checks` 给 retro 加「先判能不能做成检查」这一步，它的验证只能写「判不了：没有一次历史 retro 把可机械判定的纠正写成文字的决策点可回放」，最后靠文档测试钉住这句话在不在，没人跑过 retro 看它是不是真的先做这一判。

### 根因

- 问题 1：仓库方针（`AGENTS.md` §5）默认不验，验是例外；验证方式不在 spec 里逐处定，人在 triage 时看不到哪处改动没人验；落地核对不看证明。
- 问题 2：回放用例只认「历史原话」这一个来源，预期目标写在 spec 里的新能力进不来。

## 方案

改完，每份改 skill 的 spec 里每处改动都写一行「验证：」，人在 triage 审 spec 时就看到每处怎么验、哪处判不了；新能力能从 spec 的预期写出用例，跟回放用同一个 runner 跑；工单落地时 `dyna spec skill-edit` 核到验证做了才放行。

1. **spec 里逐处写验证**（to-spec）：改给 agent 读的文档时，第 3 步的杠杆诊断每处改动一条，末尾一行「验证：」，五选一：
   - **检查**：写检查名，并先在历史错误上见红；
   - **回放**：写用例名，用例出自历史上出错的那一刻（现有写法）；
   - **目标用例**：写用例名，用例出自这份 spec 的 User Story / 期望行为（新）；
   - **不改行为**：只改措辞、说法，写一句为什么行为不变；
   - **判不了**：写卡在哪。
   「测试决策」表「LLM 输出质量」一行对 skill 改动写「见杠杆诊断各处的验证」，不再写「不涉及」。依据：`skill-structure-checks` 已经这样写（现存实例），Harold 2026-11-20 给的方向（见下）。
2. **新的用例来源**（`evals/retro/`）：用例多一种来源，`goal_from` 指向 spec 里那条 User Story 或期望行为，取代 `quote`；评委的题从那条写出。跑法同回放：改前、改后的插件各跑一遍，改前「否」、改后「是」才过；改前就「是」记成「不过：改前就做得到」，由人判断换用例还是这段规则本来不用加（Harold 2026-11-23 定）。
3. **工单与落地**（to-ticket、implement 的 `rule-tickets.md`、`dyna spec skill-edit`）：工单那一格照抄 spec 里这处的「验证」，不再由执行方现选；交回 `verified` 每处一行「验证 | <文件> | <方式> | <用例名 / 检查名 / 原因> | <结果>」；`skill-edit` 核：每个改到的 skill 类文件有这一行，方式是回放或目标用例的，提交里有这个用例目录、结果是「过」或「大用例待跑」。
4. **仓库方针**（`AGENTS.md` §5）：改成「改 skill 的每处改动都要写明怎么验」，回放和目标用例不再是「例外」，是 skill 改动的验收手段；`uiux-research` 那条基线例外原样留着。

Harold 2026-11-20 的原话：「skills的eval 分为两部分，一个是以skill的输出结果进行评测，让codex判断是否实现了我们预期的目标；另外一个就是某些改动对于对应的case，在有无这一段是否有区别。」第一部分是目标用例，第二部分是改前、改后对比；现有 runner 的评委已经是 Codex。

同一行为的其他入口：

- retro 候选的「验证」（retro SKILL 第 3 节，三选一：回放 / 检查 / 判不了）：纳入，加「目标用例」不需要，retro 的候选都出自人的原话，走回放；只把「判不了」的写法跟这里对齐。
- `ai-eval` 插件的 eval-run / eval-replay：排除，它评的是目标项目的 AI 流水线，不是 skill 文字。

## User Stories

只修问题，不画树。

1. 期望行为（问题 1）：改 skill 的 spec 里，每处改动都有一行「验证：」，五种之一；人在 triage 就看得到哪几处「判不了」；落地时缺验证、缺用例、没结果的交回被 `dyna spec skill-edit` 退回。
2. 期望行为（问题 2）：新加的能力能从 spec 的一条 User Story 写出用例，用同一个 runner、同一个评委跑出过或不过。

## 实现决策

- **「验证：」放在杠杆诊断每处改动里，不单列一节。** 依据：现存实例 `skill-structure-checks` 就这样写（每处一条、末尾「验证：检查 / 判不了 / 不改行为」）。spec 的结构由 #451 重做、「改 skill 必须有杠杆诊断」的机械检查也归 #451；本 issue 只定这一行的内容和下游怎么用，不依赖 #451 先落地，#451 改结构时把这一行带上。
- **目标用例跟回放用例同一个格式、同一个目录、同一个 runner**，区别只有来源字段：`quote`（历史原话）或 `goal_from`（spec 里那条 story），二选一必填。依据：CLAUDE.md「先扩展已在用的工具，不为一件事新增组件」。`commit` 取写用例时基准分支上能让这个输入成立的提交；prompt 照旧不准出现「回放、eval、评测」这类词。
- **「判不了」只在 spec 里出现**，人在 triage 审 spec 时看到它、接受或要求换一种；工单照抄，执行方不自己改成「判不了」。
- **大小、跑的时机、费用沿用现在的回放规则**（`rule-tickets.md`）：小的执行方当场跑，大的 PR 开出后编排者当场跑；一个用例两次运行加一次评判，1 到 3.5 美元。
- `dyna` 改了 `spec skill-edit`，命令行升一个小版本；插件 `plugin.json` 已在 0.2.0，随集成分支发，不另升。

### 目标用例跑两边，判法同回放（Harold 2026-11-23 定）

目标用例也是改前、改后的插件各跑一遍，改前「否」、改后「是」才过；改前就「是」记成「不过：改前就做得到」，人判断是换用例，还是这段规则本来就不用加。这样它能抓住加了跟没加一样的规则，即 2026-11-20 原话的第二部分「在有无这一段是否有区别」；runner 的判法不改，只改用例校验和评委提示里「题从哪来」那一句。花费同回放。没选的「只跑改后」省一半钱，但看不出空操作。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 用例校验：`quote` / `goal_from` 二选一（`retro-case.test.mjs` 先红）；`dyna spec skill-edit` 核「验证」行、用例目录、结果（`ledger_test.go`、`cmd_test.go` 先红，拿一份只写「不涉及：只改措辞」却改了规则的真实交回当历史错误） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及：没有接口 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及：没有数据库 |
| LLM 输出质量（prompt 改动） | eval | 见下「杠杆诊断」各处的「验证」 |
| 视觉正确性 | UI 实现环 | 不涉及：不碰 UI |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及：没有页面 |

### 杠杆诊断

- **to-spec 第 3 步与模板「测试决策」**（调用方：triage 会话、todo 会话起草 spec 时，每次都读）。步骤：杠杆诊断每处末尾一行「验证：」，五选一，各自写什么；测试表 skill 改动一行写「见各处验证」。完成条件改锐利：「每处改动都有验证行，判不了的写卡在哪」。验证：目标用例，`goal_from` 本 spec 期望行为 1，题「起草出的 spec 里每处 skill 改动都有一行验证、没有写『不涉及』吗？」。
- **to-ticket「改 skill 类文件的工单」第三格**（调用方：切票时每次读）。步骤：照抄 spec 这处的验证，不现选。验证：检查，文档测试钉住第三格写「照抄 spec 的验证」。
- **implement 的 `rule-tickets.md` 与执行方定义的那一行指针**（读者：做改规则工单的执行方）。参考：加目标用例怎么写（`goal_from`、题从 story 写出）；交回的验证行格式。验证：检查，`dyna spec skill-edit` 在缺验证行的交回上见红。
- **retro 第 3 节「验证」**（调用方：issue-session 收尾、人说 retro）。只对齐「判不了」写法。验证：不改行为。
- **仓库 `AGENTS.md` §5**（读者：在本仓库改 plugin 的 agent）。方针改说法。验证：不改行为，规矩的说法，行为由上面几处和检查管。

- **seam**：用例校验（`cases.mjs` 的 `validateCase`）、`dyna spec skill-edit` 的入口（提交 + 交回文件 → 原因列表），runner 本身不新增 seam。
- **增量功能测试**：前置：一个改了 `skills/` 下 `.md` 的提交，交回里只有杠杆行、没有验证行；步骤：`dyna spec skill-edit <提交> <交回>`；期望：退出 2，原因写「<文件> 没有验证行」。覆盖期望行为 1。
- **照着谁写**：`ledger_test.go` 现有的杠杆行测试；`retro-case.test.mjs` 现有的必填字段测试。

## Out of scope

- spec 的整体结构、「改 skill 必须有杠杆诊断」的机械检查：#451。
- skill 文件的字数线、行内命令：#341 已合并。
- 给已有 skill 补目标用例：只对以后的改动要求，存量不补。

## 关联

- 拆出自 #341（`skill-structure-checks`，已合并进集成分支），那份 spec 的「Out of scope」把这件事指到本 issue。
- #451（spec 写太细，triage）：有交界，「验证：」这一行住在它要重做的杠杆诊断里；本 spec 不依赖它先落地，它重做结构时带上这一行。
- #452（PR 结构）：无重叠。
- 父 issue #331（idea-loop 0.2.0），PR 合进 `release/idea-loop-0.2.0`。
