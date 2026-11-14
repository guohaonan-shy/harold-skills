---
type: spec
tags: [retro, retro-candidates, links]
summary: 候选池「出现」行引别的仓库的决定记录时写仓库加路径，不用 [[ ]]；修掉池里 5 条断链
related: []
issues: [199]
---

# retro 候选池：别的仓库的决定记录不用 `[[ ]]` 引

> #199 存在：`docs/records/retro-candidates/` 里有 5 条「决定记录：[[N]]」指向别的仓库的决定记录，本仓库没有这些文件，点不开，详情在「问题陈述」

## 问题陈述

### 池里 5 条「决定记录」链接指不到文件

在本仓库的 Obsidian 里点 `docs/records/retro-candidates/2026-10-31-handing-to-human-name-references.md` 第 19 行的「决定记录：[[577]]」，打不开：577 是 Tofelair 仓库会话的决定记录，本仓库 `docs/raw/decisions/` 下没有 `577.md`。本该是：读的人能看出它在哪个仓库、去哪找。

2026-11-14 对着 origin/main `816d6f2` 逐个 `ls docs/raw/decisions/<号>.md`，5 处都不存在：

| 文件 | 行 | 断链 | 那一行的会话 |
|---|---|---|---|
| 2026-10-31-handing-to-human-name-references.md | 19 | [[577]] | Tofelair#577 |
| 同上 | 20 | [[731]] | guohaonan-shy/Tofelair#731 |
| 2026-10-31-sync-base-before-push.md | 19 | [[712]] | guohaonan-shy/Tofelair#712 |
| 2026-11-11-merge-check-conflicts-first.md | 21 | [[522]] | guohaonan-shy/Tofelair#522 |
| 2026-11-12-reviewer-no-handback-rerun.md | 21 | [[643]] | guohaonan-shy/Tofelair#643 |

池里同样来自 Tofelair 的另一些行没断：`2026-10-26-seo-outreach-*.md` 四份写的是「决定记录：Tofelair `docs/raw/decisions/538.md` 候选 N」，`retro-candidate-9x.md` 写的是「决定记录：Tofelair#518 的 retro，不在本仓库」。

复现材料：分拣评论（issue #199 上「🤖 idea-loop：」那条，2026-11-13，对 origin/main `a7c8129`，结论同上）。

### 根因

`idea-loop:retro` 的 `references/candidate-pool.md`「一份文件的形状」里，「出现」一行的模板固定写 `决定记录：[[<决定记录的文件名>]]`，没说决定记录在别的仓库时怎么写。在别的仓库跑的 retro 往本仓库的池里写候选时照模板填，就断链；5 处都是这样来的。

## 方案

改完后：retro 往池里写「出现」时，决定记录在池所在的仓库里，照旧写 `[[<文件名>]]`；在别的仓库里，写 `` <仓库> `docs/raw/decisions/<文件名>.md` ``，不用 `[[ ]]`。池里现有 5 条断链改成后一种写法，本仓库 `docs/` 里 retro 候选不再有指不到的 `[[...]]`。

两处改动：

1. `candidate-pool.md` 模板下的规则列表加一条：决定记录不在池所在的仓库时，写 `` <仓库> `docs/raw/decisions/<文件名>.md` ``（可带「候选 N」），不用 `[[ ]]`：`[[ ]]` 只能指到同一个 `docs/` 里的文件。用 `<仓库>` 占位，不写真实项目名（防泄漏测试守着）。
2. 池里 5 处改成同样写法，`<仓库>` 照那一行行首的仓库名写（`Tofelair` / `guohaonan-shy/Tofelair`），「候选 N」原样保留。

对的杠杆（`idea-loop:writing-for-agents`）：读这份 reference 的是 retro 第 5、6 步写池的会话；它照模板填空，模板缺分支就会照默认填错。补的是一条显式分支，放在模板紧下面的规则列表里，跟「出现每次一行」等规则同处，不新增章节。

同一行为的其他入口：

- `dreaming` 读池、`retro-pool-count.mjs` 计数：排除，不改。计数按行首 `- <仓库>#<号>` 数，不读「决定记录」那段；dreaming 的提议表只转引。
- `candidate-pool.md`「读与写 harold-skills 的池」一节：不另改，它说新建的「按上面的形状写」，跟着第 1 处改动走。

## User Stories

1. 期望行为：retro 写「出现」时，决定记录在别的仓库的，写成仓库加路径，不写 `[[ ]]`；本仓库池里的 retro 候选没有指不到文件的 `[[...]]`。

## 实现决策

- 写法选「仓库 + 路径」，不选 URL：池里已有 4 处这样写（538 那几份），读的人认得；URL 要带分支和组织名，写池的会话不一定拿得到。依据：分拣评论建议、现存实例。
- `[[<号>]]` 后跟着的「候选 N」原样保留在路径后面，如 `` guohaonan-shy/Tofelair `docs/raw/decisions/731.md` 候选 7 ``。
- 「Tofelair#518 的 retro，不在本仓库」那几行不改：没有链接，不断。
- 插件版本：`idea-loop` 0.1.14 → 0.1.15（patch：修说明里缺的分支，不改行为与用法，`REVIEW.md`「额外要求」）。README 不涉及：没改 skill、agent、hook、脚本或产物位置。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改了 `candidate-pool.md` 一条规则；不加 eval、不留回放用例：它是模板补分支，验收靠下面的文字核对 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`docs/records/retro-candidates/` 下全部 `[[...]]` 的目标在 `docs/` 里存在；`candidate-pool.md` 的规则列表。
- **增量功能测试**：
  - 前置：分支上的 `docs/`。步骤：取 `docs/records/retro-candidates/` 里全部 `[[x]]`，逐个找 `docs/` 下有无 `x.md`。期望：全部存在。覆盖：期望行为 1。
  - 前置：分支上的 `candidate-pool.md`。步骤：读模板下的规则列表。期望：有一条写明别的仓库的决定记录写成 `` <仓库> `docs/raw/decisions/<文件名>.md` ``、不用 `[[ ]]`。覆盖：期望行为 1。
  - `node --test idea-loop/scripts/*.test.mjs` 与 `scripts/*.test.mjs` 全过（含防泄漏、升版本、池计数）。
- **照着谁写**：`retro-pool-count.mjs` 的现有测试；断链核对照分拣时的做法（逐个 `ls`）。

## Out of scope

- 给 link sweep 加一个常驻检查：#121 已管 sweep 的规则，这次只修模板和数据。
- 改写本仓库池里已有、写法正确的跨仓库行。

## 关联

- 来历：#121（link sweep 跳过代码里的格式示例）验证时发现。
- 相关 spec：无。相邻未完成的 issue：开着的 issue 里搜「retro-candidates」「candidate-pool」（2026-11-14），只有 #314（retro 摆候选时给去处推荐）也会改 `candidate-pool.md`，改的是「摆给人时怎么回」一节，跟本次的「出现」模板不在一处，无重叠，谁先合都行；开着的 PR 里没有碰这两处的。
