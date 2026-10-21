---
name: spec-status
description: issue 的状态（loop 的队列）和 spec 的状态（文档成熟度）怎么走。翻 issue 或 spec 的状态、把 issue 挂上或摘下 spec、关 issue 时用。
---

两套状态，各管一件事：

- **issue 的状态**说工作排到了哪，写在 GitHub label 上。`idea-loop:issue-dispatch` 的 loop 只看它。
- **spec 的状态**说这份文档成熟到哪一步，写在 spec 的 frontmatter 里，只在 idea-loop 内部用。

改状态只走脚本，label、frontmatter 的 `status` 行和 `docs/spec/index.md` 都由它写：脚本先核前提再写，前提不满足就拒绝并说明原因，照原因处理。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/`。

## issue 的状态

| 状态 | GitHub 上 | 意思 | 谁、什么时候翻 |
|---|---|---|---|
| 待验证 | open，没有 `status:*` | 新进来，还没人看 | 人开 issue |
| 验证中 | `status:验证中` | 验证会话在复现、起草 | loop 开验证会话时 |
| 审核中 | `status:审核中` | spec 里有要人定的，人在验证会话里 grill | 验证会话 |
| 待设计 | `status:待设计` | spec 是「正式」、碰 UI，等设计 | 对账 |
| 设计中 | `status:设计中` | 设计会话在做 | loop 开设计会话时 |
| 待实现 | `status:待实现` | spec 是「正式」、不碰 UI，或设计冻结已经合进主分支 | 对账 |
| 实现中 | `status:实现中` | 实现会话在切工单、实现、等合并 | loop 开实现会话时 |
| 搁置 | `status:搁置` | 先放着，loop 不碰 | 人 |
| 关闭·不存在 | closed，not planned | 验证为不存在；或人决定不做 | 对账；人决定的走 `drop` |
| 关闭·完成 | closed，completed | 实现合并了 | 对账 |

**「待」开头的状态只由对账挂。** 对账（`issues reconcile`）读主分支上的 spec：「正式」的 spec，它的 issue 按碰不碰 UI、有没有冻结摘要翻成「待设计」或「待实现」；冻结摘要进了主分支，「设计中」翻成「待实现」；「验证」表里标了不存在的关掉；「完成」的 spec 关掉其余的。所以 loop 看到一个「待」字头的 label，主分支上一定已经有下一段要用的东西。「中」字头的状态由开会话的一方挂。

`issues set` 只放行这些翻法，其余的拒绝：

| 从 | 能翻成 |
|---|---|
| 待验证 | 验证中 · 搁置 |
| 验证中 | 审核中 · 待验证（退回）· 搁置 |
| 审核中 | 待验证（退回）· 搁置 |
| 待设计 | 设计中 · 搁置 |
| 设计中 | 待设计（会话放弃）· 搁置 |
| 待实现 | 实现中 · 搁置 |
| 实现中 | 待实现（会话放弃）· 搁置 |

「搁置」用 `issues resume` 恢复：按主分支上的 spec 算出它该回哪个状态，没有 spec 就回「待验证」。

```bash
issues labels     <docs>                       # 建出缺的 status:* label
issues candidates <docs> [<limit>]             # 待验证的 issue，最早的在前（JSON）；不含 spec issue 和主分支上已有 spec 列着的
issues queue      <docs> <待设计|待实现>        # 等在这个状态的 spec，最早的 issue 在前（JSON），加上 label 和主分支对不上的问题
issues set        <docs> <状态> <号 | slug>...  # 按上表翻；给 slug 就是它列的所有 issue
issues reconcile  <docs>                       # 对账：主分支已经决定了的翻法
issues resume     <docs> <号 | slug>...         # 搁置 → 主分支说它该在的地方
issues handoff    <docs> <slug> <号>           # 把 #号 写进 spec frontmatter，不碰 GitHub
issues open       <docs> <slug>                # spec 没覆盖任何 issue：开一个标题以「spec：」开头的 spec issue，号码写进 frontmatter
issues unhandoff  <docs> <slug> <号>           # 从 spec 里移出 #号，回到待验证
issues drop       <docs> <slug> <号>           # 从 spec 里移出 #号，关成 not planned（人决定不做）
```

spec 覆盖了哪几个 issue，记在它 frontmatter 的 `issues: [12, 15]` 里。`handoff` 只写本地文件、`open` 开的 issue 不挂 label：spec 的 PR 没合并时，GitHub 上不该有 label 指向主分支上没有的 spec。

## 开一个待验证的 issue

流程里顺手发现、这次不做的事（跟这次无关的存量问题、review 里人批了「开 issue」的、对账发现的产品缺陷），开成目标仓库的待验证 issue，loop 会接手：

1. 先查重：`gh issue list --state open --search "<关键词>"`。已有同一个问题的，就用那一条，写「已有 #N」。
2. 没有就 `gh issue create`，不打 `status:*` label。标题写问题本身；正文写给一个没有上下文的人看：是什么、在哪、怎么复现或怎么看到、为什么这次不做。
3. 开不成（`gh` 失败）的，记下没开成和原因，交给人。

## spec 的状态

| 状态 | 意思 | 谁、什么时候翻 | 脚本核的前提 |
|---|---|---|---|
| 草稿 | 在写 | `idea-loop:to-spec` 新建时（写在 frontmatter 里） | — |
| 审核中 | 有要人定的：开头的「> 需要 grill：…」，或「实现决策」下标题以「待定」开头的小节 | `route` | — |
| 正式 | 定稿了，设计和实现都照它做 | `route`；或审核中定完时 | 没有「需要 grill」，没有「待定」；覆盖的 issue 不能全都不存在 |
| 实现中 | 工单已切 | `idea-loop:to-ticket` 切完时 | `tickets/` 下至少一张工单；碰 UI 的要有冻结摘要 |
| 完成 | 实现合并了，或覆盖的 issue 全都验证为不存在 | `idea-loop:pr-review` 合并前；`route` | 不经实现直接完成的：「验证」表里覆盖的 issue 全是「不存在」 |

脚本只放行：草稿 → 审核中 / 正式 / 完成；审核中 → 正式 / 完成；正式 → 实现中 / 审核中（重新要人定）；实现中 → 完成。

「验证」表的格式脚本要读：每行 `| #12 … | 存在 | … |` 或 `| #12 … | 不存在 | … |`，写法见 `idea-loop:to-spec` 的模板。

```bash
spec-status set     <docs> <slug> <状态>   # 核前提 → 写 status → 刷索引
spec-status route   <docs> <slug>          # 草稿：按内容翻成 完成 / 审核中 / 正式
spec-status index   <docs>                 # 只刷索引
spec-status check   <docs>                 # 列出所有 spec，和旧平铺布局、非法状态这类问题
spec-status migrate <docs>                 # 旧状态机的状态换成新的
```

`check` 报了旧平铺布局，停下提议照 `idea-loop:wiki-conventions` 的「从平铺布局迁移」迁移；报了旧状态，跑 `migrate`。

「完成」的 spec 由 `/idea-loop:dreaming` 写 ADR、删目录，删完跑 `spec-status index <docs>`。

## 从旧状态机迁移

旧的 spec 状态是 `审核中 / 待设计 / 设计中 / 待实现 / 在飞 / 已拍板未排期 / 搁置`，label 跟着 spec 走。迁移：

1. `spec-status migrate <docs>`：在飞 → 实现中，其余 → 正式。原来是「搁置」「已拍板未排期」的，它会提示给覆盖的 issue 挂 `status:搁置`。
2. 删掉旧 label 里新状态机没有的几个（`status:在飞`、`status:已拍板未排期`、`status:草稿`），`issues labels <docs>` 建出新的，再跑 `issues reconcile <docs>`；它不敢动的会列成问题，照着手动翻。
