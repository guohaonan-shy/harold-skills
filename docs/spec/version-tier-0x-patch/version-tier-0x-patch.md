---
type: spec
tags: [review, plugin-version, version-tier-0x-patch]
summary: 插件还在 0.x 时，改已有流程的行为升 patch；REVIEW.md 版本三档的 minor / patch 措辞改写
related: ["[[0049-plugin-version-by-change]]"]
issues: [327]
---

# 插件 0.x 期间，改已有流程行为的 PR 升 patch，不升 minor

> #327 存在：按 `REVIEW.md` 现行三档，「改已有流程的行为、老用法照样能用」的插件 PR 必判 minor；三档规则生效以来，idea-loop 被判 minor 的 8 次全部被人改成 patch，详情在「问题陈述」

## 问题陈述

### 1. 每个改插件的 PR 合并前，人都要纠正一次版本档位

本仓库 `REVIEW.md`「额外要求」规定改了插件目录的 PR 按 major / minor / patch 升 `plugin.json` 的 `version`。现行 minor：「新增能力，或改了流程的行为但老用法照样能用，比如加一个 skill，或者某个流程从停下等人改成自己执行。」会话照这条判，把改已有流程行为的 PR 判成 minor，人在合并前改回 patch。

查了什么：2026-11-19 对着 `origin/main`（`38622d38`）看 `idea-loop/.claude-plugin/plugin.json` 的提交历史、`docs/adr/` 和 `docs/raw/decisions/`。三档规则（ADR 0049，2026-11-14）生效后，idea-loop 从没有以 minor 合并过：git 里每一次把版本写成 0.2.0 的提交（最早 `4feddbc9`，最近 `2effaa11`），最后都改回了 0.1.x；现在是 0.1.31。逐次：

| issue / PR | 改了什么 | 起草时判 | 人定 |
|---|---|---|---|
| #314 / PR #319 | retro 摆候选时给去处推荐 | minor | patch（0.1.16）：「patch，合并吧」 |
| #311 / PR #317 | skill 改动的验收（ADR 0058） | minor | patch（0.1.17）：「版本按照patch 算，然后合并」 |
| #313 / PR #321 | 决策规则加「范围题怎么推荐」（ADR 0055） | minor | patch（0.1.18）：「我选择B，然后版本用patch」 |
| #229 / PR #329 | to-ticket 切票前走一遍调用链（ADR 0060） | minor | patch（0.1.19）：「改成 patch 再合」 |
| 会话开场注入规则（ADR 0057） | 扩展 SessionStart 钩子注入 decision-rules 与 runtime | minor | patch（0.1.20）：「升级为patch」 |
| #291 / PR #338 | 新增 SEO 方向 agent 与运行环境能力、成批把 SEO 流程从停下等人改成自己执行、旧配置要迁移一步 | 题里推荐 patch | patch（0.1.21）：「D1 选 A（patch）」 |
| #297 / PR #352 | issue 正文的「背景」从可选改必填，多拒一类正文 | minor | patch（0.1.22）：「合并，但使用一个patch版本」 |
| #379 / PR #382 | 调度与 issue 会话的夜间模式，改了一大块流程行为 | minor | patch（0.1.29）：「这个版本不是patch吗？为什么出现0.2.0?」「改回 0.1.29」 |

一个具体例子：PR #321 只在 `decision-rules` 里加了一条「范围题怎么推荐」，实现方按现行文字判 minor，把版本从 0.1.14 写成 0.2.0；人回「我选择B，然后版本用patch」，最后以 0.1.18 合并。

证据：分拣评论（2026-11-16，#327 的「🤖 idea-loop：」评论）；候选池 `docs/records/retro-candidates/2026-11-14-version-tier-0x-behavior-patch.md`（4 次出现）；决定记录 `docs/raw/decisions/314.md`、`311.md`、`313.md`、`229.md`、`291.md`（题 2 与候选 2）、`326.md`（题 2）、`297.md`（题 1）、`379.md`（题 9）。

### 根因

`REVIEW.md` 的 minor 按语义化版本写：凡改了行为就是 minor。人的判据不同，#311 的 retro 里原话：「其实绝大部分改动都可以成为patch，只有大范围的重构或者重大使用姿势上的改动我觉的用minor是比较合适的。」规则文字和人的判据不一致，会话照文字判，每次都判错。

修正：issue 写的是「连续三次」，实测是 8 次（含 #229、ADR 0057、#291、#297、#379 五次 issue 开出之后的）。

## 方案

改完之后：会话给插件 PR 定档时，「改一个已有流程的行为、老用法照样能用」的判 patch，合并前人不用再纠正档位。只改 `REVIEW.md`「额外要求」里 minor、patch 两条的措辞；major 一条、「三档取最高」、版本号从 main 往上升、`scripts/plugin-version.test.mjs` 守漏升，都不动。

| | 现行 | 改后 |
|---|---|---|
| minor | 新增能力，或改了流程的行为但老用法照样能用 | 插件还在 0.x 时，只有大范围的重构或者使用方式的重大改动才算 |
| patch | 不改行为的修正；只改 README 或测试 | 加一句：插件还在 0.x 时，加 skill、agent、hook 或改已有流程的行为，老用法照样能用的，也算 patch |

同一行为的其他入口：

- 根目录 `AGENTS.md` 第 23 行（交审核报告时说升到哪一档）：排除，它只指向 `REVIEW.md`，不复述三档。
- `idea-loop:pr-reviewer` 的 Standards 轴、`implementer`：排除，它们读 `REVIEW.md`，改了文字就跟着变。
- ADR 0049 里复述的旧三档：排除，ADR 是当时的决定，由 `/idea-loop:dreaming` 对账时标「被取代的小节」。
- 其他插件（excalidrawer 等）：纳入，三档对所有插件一样，都还在 0.x。

## User Stories

1. 期望行为（对应问题 1）：作为 Harold，我想要会话给「改一个已有流程的行为、老用法照样能用」的插件 PR 判 patch，以便合并前不用再纠正档位。

## 实现决策

- 只改 `REVIEW.md`，不碰任何插件目录，不升版本。依据：分拣评论；`REVIEW.md` 在仓库根，不随插件发。
- 0.x 期间 minor 只留给大改（2026-11-19 人在本会话选 B）。新文：
  - minor：「新增能力，或改了流程的行为但老用法照样能用；插件还在 0.x 时，只有大范围的重构或者使用方式的重大改动才算，比如整条流程重新划分阶段、人要重新学怎么调用。」
  - patch：「不改行为的修正，比如修错字、修 bug、修说明里前后不一致的地方，以及只改 README 或测试；插件还在 0.x 时，加 skill、agent、hook 或改已有流程的行为，老用法照样能用的，也算 patch，比如 retro 摆候选时多给一句去处推荐。」

  依据：人在 #311 retro 的原话「其实绝大部分改动都可以成为patch，只有大范围的重构或者重大使用姿势上的改动我觉的用minor是比较合适的。」；上表 8 次人定全落在新文的 patch 里。候选池 11-14 批过的 minor 新文（加 skill、agent、hook 或成批改多个流程算 minor）被这次的选择取代：#291、#379 都是那一类，人都定了 patch。代价接受：0.x 期间加新能力也只升第三位，看版本号看不出多了一个 skill，要读 PR。
- 「0.x」只写在 minor、patch 两条里，major 一条不加。依据：major 的判据是「不改配置或用法就会坏」，跟是不是 0.x 无关；分拣评论也判可不动。

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
- **增量功能测试**：前置：改后的 `REVIEW.md`。步骤：拿上表 8 次 PR 的改动描述，逐个对着新三档判档。期望：8 行判出的档都跟「人定」一列一致（全是 patch）。覆盖：问题 1。落在 PR 描述的「参考」里，逐行写判档结果。
- **全量测试**照跑（`REVIEW.md`「验证命令」），确认 `plugin-version.test.mjs` 不因这次红（没碰插件）。
- **照着谁写**：ADR 0049 落地时同样只改 `REVIEW.md` 文字，靠 review 核。

## Out of scope

- 让档位能机械判（做成检查）：档位要判断，判不了。
- 改 major 的定义、改「三档取最高」、改漏升测试。
- 把已经合并的版本号回改。

## 关联

- ADR [[0049-plugin-version-by-change]]：三档规则的出处，本 spec 改它的 minor / patch 定义。
- 候选池 `docs/records/retro-candidates/2026-11-14-version-tier-0x-behavior-patch.md`：落地后状态改「已落地」，并注明 minor 用的是本 spec 的新文、不是候选里的版本。
- 相邻还没完成的 issue：查了开着的 issue（2026-11-16，2026-11-19 复核），没有别的改 `REVIEW.md` 版本三档的；#252、#333（知识库搬出代码仓库）会动 `docs/` 的位置，不碰 `REVIEW.md`；#376（REVIEW.md 写「提交前跑全量」跟「全量交给 CI」对不上）改的是 `REVIEW.md`「验证命令」一节，本 spec 只改「额外要求」，不重叠、无先后。
