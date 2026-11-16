---
type: spec
tags: [review, plugin-version, version-tier-0x-patch]
summary: 插件还在 0.x 时，改已有流程的行为升 patch；REVIEW.md 版本三档的 minor / patch 措辞改写
related: ["[[0049-plugin-version-by-change]]"]
issues: [327]
---

# 插件 0.x 期间，改已有流程行为的 PR 升 patch，不升 minor

> #327 存在：按 `REVIEW.md` 现行三档，「改已有流程的行为、老用法照样能用」的插件 PR 必判 minor；三档规则生效以来，idea-loop 被判 minor 的 6 次全部被人改成 patch，详情在「问题陈述」

## 问题陈述

### 1. 每个改插件的 PR 合并前，人都要纠正一次版本档位

本仓库 `REVIEW.md`「额外要求」规定改了插件目录的 PR 按 major / minor / patch 升 `plugin.json` 的 `version`。现行 minor：「新增能力，或改了流程的行为但老用法照样能用，比如加一个 skill，或者某个流程从停下等人改成自己执行。」会话照这条判，把改已有流程行为的 PR 判成 minor，人在合并前改回 patch。

查了什么：2026-11-16 对着 `origin/main`（`5f26e2f`）看 `idea-loop/.claude-plugin/plugin.json` 的提交历史、`docs/adr/` 和 `docs/raw/decisions/`。三档规则（ADR 0049，2026-11-14）生效后，idea-loop 从没有以 minor 合并过：git 里 4 次把版本写成 0.2.0 的提交，最后都改回了 0.1.x；现在是 0.1.21。逐次：

| issue / PR | 改了什么 | 起草时判 | 人定 |
|---|---|---|---|
| #314 / PR #319 | retro 摆候选时给去处推荐 | minor | patch（0.1.16）：「patch，合并吧」 |
| #311 / PR #317 | skill 改动的验收（ADR 0058） | minor | patch（0.1.17）：「版本按照patch 算，然后合并」 |
| #313 / PR #321 | 决策规则加「范围题怎么推荐」（ADR 0055） | minor | patch（0.1.18）：「我选择B，然后版本用patch」 |
| #229 / PR #329 | to-ticket 切票前走一遍调用链（ADR 0060） | minor | patch（0.1.19）：「改成 patch 再合」 |
| 会话开场注入规则（ADR 0057） | 扩展 SessionStart 钩子注入 decision-rules 与 runtime | minor | patch（0.1.20）：「升级为patch」 |
| #291 / PR #338 | 新增 SEO 方向 agent 与运行环境能力、成批把 SEO 流程从停下等人改成自己执行、旧配置要迁移一步 | 题里推荐 patch | patch（0.1.21）：「D1 选 A（patch）」 |

一个具体例子：PR #321 只在 `decision-rules` 里加了一条「范围题怎么推荐」，实现方按现行文字判 minor，把版本从 0.1.14 写成 0.2.0；人回「我选择B，然后版本用patch」，最后以 0.1.18 合并。

证据：分拣评论（2026-11-16，#327 的「🤖 idea-loop：」评论）；候选池 `docs/records/retro-candidates/2026-11-14-version-tier-0x-behavior-patch.md`（4 次出现）；决定记录 `docs/raw/decisions/314.md`、`311.md`、`313.md`、`229.md`、`291.md`（题 2 与候选 2）。

### 根因

`REVIEW.md` 的 minor 按语义化版本写：凡改了行为就是 minor。人的判据不同，#311 的 retro 里原话：「其实绝大部分改动都可以成为patch，只有大范围的重构或者重大使用姿势上的改动我觉的用minor是比较合适的。」规则文字和人的判据不一致，会话照文字判，每次都判错。

修正：issue 写的是「连续三次」，实测是 6 次（含 #229、ADR 0057、#291 三次 issue 开出之后的）。

## 方案

改完之后：会话给插件 PR 定档时，「改一个已有流程的行为、老用法照样能用」的判 patch，合并前人不用再纠正档位。只改 `REVIEW.md`「额外要求」里 minor、patch 两条的措辞；major 一条、「三档取最高」、版本号从 main 往上升、`scripts/plugin-version.test.mjs` 守漏升，都不动。

| | 现行 | 改后 |
|---|---|---|
| minor | 新增能力，或改了流程的行为但老用法照样能用 | 见「实现决策」的待定，两种写法 |
| patch | 不改行为的修正；只改 README 或测试 | 加一句：插件还在 0.x 时，改一个已有流程的行为、老用法照样能用的，也算 patch |

同一行为的其他入口：

- 根目录 `AGENTS.md` 第 23 行（交审核报告时说升到哪一档）：排除，它只指向 `REVIEW.md`，不复述三档。
- `idea-loop:pr-reviewer` 的 Standards 轴、`implementer`：排除，它们读 `REVIEW.md`，改了文字就跟着变。
- ADR 0049 里复述的旧三档：排除，ADR 是当时的决定，由 `/idea-loop:dreaming` 对账时标「被取代的小节」。
- 其他插件（excalidrawer 等）：纳入，三档对所有插件一样，都还在 0.x。

## User Stories

1. 期望行为（对应问题 1）：作为 Harold，我想要会话给「改一个已有流程的行为、老用法照样能用」的插件 PR 判 patch，以便合并前不用再纠正档位。

## 实现决策

- 只改 `REVIEW.md`，不碰任何插件目录，不升版本。依据：分拣评论；`REVIEW.md` 在仓库根，不随插件发。
- patch 新加的那句用候选池里人已批的原文（「插件还在 0.x 时，改一个已有流程的行为、老用法照样能用的，也算 patch，比如 retro 摆候选时多给一句去处推荐」）。依据：#313 的 retro 人批了这条候选并开 issue；6 次人定都落在这句里。
- 「0.x」只写在 patch 一条里，major 一条不加。依据：major 的判据是「不改配置或用法就会坏」，跟是不是 0.x 无关；分拣评论也判可不动。

### 待定：minor 留给什么

依据冲突：候选池里人批过的 minor 新文（2026-11-14）把「新增 agent、hook」和「成批改多个流程」都算 minor；但之后 #291（2026-11-16）新增了 SEO 方向 agent、成批把 SEO 流程改成自己执行，人仍定 patch，那次 retro 还记了一条候选「#327 给 minor 拟的新定义，这次的选择不支持它」。

- **A：用候选池里已批的原文。** minor：「新增能力（加一个 skill、agent 或 hook），或一次改动成批改了多个流程的行为，比如一组 skill 的出口从停下等人改成自己执行。」走一遍：#291 这样的 PR 会判 minor（0.1.20 → 0.2.0），人要再纠正一次；前 5 次判 patch。
- **B：照人在 #311 retro 的原话写，0.x 期间 minor 只留给大改。** minor：「插件还在 0.x 时，只有大范围的重构或者使用方式的重大改动才算，比如整条流程重新划分阶段、人要重新学怎么调用；加 skill、agent、hook 或改流程行为，老用法照样能用的，都算 patch。」走一遍：6 次全判 patch，跟人定的一致；代价是 0.x 期间加新能力也只升第三位，看版本号看不出「这版多了一个 skill」，要读 PR。

推荐 **B**：它是唯一跟 6 次人定全部对得上的写法，#291 是在 A 被批之后人做的最新选择。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：落点是仓库根 `REVIEW.md`，不是插件 skill 的文字，用不了回放用例；档位要判断，做不成检查（issue 原文） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：无。
- **增量功能测试**：前置：改后的 `REVIEW.md`。步骤：拿上表 6 次 PR 的改动描述，逐个对着新三档判档。期望：判出的档跟「人定」一列一致（选 A 时 #291 判 minor，记成已知差异）。覆盖：问题 1。落在 PR 描述的「参考」里，逐行写判档结果。
- **全量测试**照跑（`REVIEW.md`「验证命令」），确认 `plugin-version.test.mjs` 不因这次红（没碰插件）。
- **照着谁写**：ADR 0049 落地时同样只改 `REVIEW.md` 文字，靠 review 核。

## Out of scope

- 让档位能机械判（做成检查）：档位要判断，判不了。
- 改 major 的定义、改「三档取最高」、改漏升测试。
- 把已经合并的版本号回改。

## 关联

- ADR [[0049-plugin-version-by-change]]：三档规则的出处，本 spec 改它的 minor / patch 定义。
- 候选池 `docs/records/retro-candidates/2026-11-14-version-tier-0x-behavior-patch.md`：落地后状态改「已落地」。
- 相邻还没完成的 issue：查了开着的 issue（2026-11-16），没有别的改 `REVIEW.md` 版本三档的；#252、#333（知识库搬出代码仓库）会动 `docs/` 的位置，不碰 `REVIEW.md`，无重叠、无先后。
