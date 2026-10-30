---
name: spec-status
description: issue 的状态（loop 的队列）和 spec 的状态（文档成熟度）怎么走。翻 issue 或 spec 的状态、把 issue 挂上或摘下 spec、关 issue 时用。
---

两套状态，各管一件事：

- **issue 的状态**说工作排到了哪，写在 GitHub label 上。`idea-loop:issue-dispatch` 的 loop 和 `idea-loop:issue-session` 只看它。
- **spec 的状态**说这份文档成熟到哪一步，写在 spec 的 frontmatter 里，只在 idea-loop 内部用。

改状态只走脚本，label、frontmatter 的 `status` 行和 `docs/spec/index.md` 都由它写：脚本先核前提再写，前提不满足就拒绝并说明原因，照原因处理。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/`。

## issue 的状态

| 状态 | GitHub 上 | 意思 |
|---|---|---|
| 待验证 | open，没有 `status:*` | 新进来，还没人看 |
| 验证中 | `status:验证中` | 在复现、起草 |
| 审核中 | `status:审核中` | spec 里有要人定的，人在 issue 会话里 grill |
| 待设计 | `status:待设计` | spec 是「正式」、碰 UI，等设计 |
| 设计中 | `status:设计中` | 在设计阶段 |
| 待实现 | `status:待实现` | spec 是「正式」、不碰 UI，或设计冻结已经合进主分支 |
| 实现中 | `status:实现中` | 在切工单、实现、等合并 |
| 搁置 | `status:搁置` | 先放着，loop 不碰 |
| 关闭·不存在 | closed，not planned | 验证为不存在；或人决定不做（`drop`） |
| 关闭·完成 | closed，completed | 实现合并了 |

「待」字头的状态只由对账（`issues reconcile`）照主分支上的 spec 挂，所以看到它，主分支上一定已经有下一段要用的东西；「中」字头的由 issue 会话挂。`advance` 是只管一份 spec 的对账：它的 PR 合并、切到最新主分支之后跑，翻完立刻认领下一段，或关掉 issue。`issues set` 拒绝不允许的翻法时会列出能翻成什么。「搁置」用 `resume` 恢复：回到主分支上的 spec 该在的状态，没有 spec 就回「待验证」。

### 根 issue 和子 issue

有子 issue 的是「根」，有父 issue 的是「子 issue」（GitHub 原生 sub-issue），一组按一个会话走。给根号 `issues set` 就整组翻，`issues group` 查一组；候选只出根，不出开了不到 6 小时的；根的状态跟着开着的、没搁置的子 issue 里最靠前的那个，子 issue 全关了就关根，都由脚本自己做。spec 的 `issues:` 只写它对应的那一个子 issue。

```bash
issues labels     <docs> [--prune]             # 建缺的 status:* type:* label；多余的只列出
issues type       <docs> <号> <父类[/子类]>...  # 打分类，换掉原有的 type:*
issues candidates <docs> [<limit>]             # 待验证的候选，最早的在前（JSON）
issues group      <docs> <号>                   # 根号或子 issue 号：根和开着的子 issue（JSON）
issues queue      <docs> <待设计|待实现>        # 等在这个状态的 spec，加上 label 对不上的问题
issues set        <docs> <状态> <号 | slug>...  # 翻状态；根号连子 issue 一起翻
issues reconcile  <docs>                       # 对账：照主分支翻；根跟着子 issue
issues advance    <docs> <slug>                # 一份 spec 合并后推进；末行写下一段
issues resume     <docs> <号 | slug>...         # 搁置 → 该在的地方
issues handoff    <docs> <slug> <号>           # 把 #号 写进 spec frontmatter，不碰 GitHub
issues open       <docs> <slug>                # spec 没覆盖任何 issue：开一个「spec：」issue
issues unhandoff  <docs> <slug> <号>           # 从 spec 移出 #号，回到待验证
issues drop       <docs> <slug> <号>           # 从 spec 移出 #号，关成 not planned
```

spec 覆盖的 issue 记在它 frontmatter 的 `issues: [12, 15]` 里。`handoff` 只写本地文件、`open` 开的 issue 不挂 label：spec 的 PR 没合并时，GitHub 上不该有 label 指向主分支上没有的 spec。

## issue 的分类

除了状态，issue 还带分类 label：父类 `type:<父类>`，可选的子类 `type:<父类>/<子类>`，打子类时父类一起打上。项目有哪些分类、另外保留哪些 label，写在根目录 `AGENTS.md`（或 `CLAUDE.md`）的「issue 分类」一节，`/idea-loop:setup` 建它。分类由 `idea-loop:issue-verify` 验证时打，走 `issues type`；`issues labels` 照这一节建出分类 label，不在状态、分类和保留清单里的 label 只列出来，`--prune` 才删。父类那行注了「（独立队列，上限 N）」的，它的 issue 在调度里单独排队（`issues queues`）。

## 开一个待验证的 issue

流程里顺手发现、这次不做的事（跟这次无关的存量问题、review 里人批了「开 issue」的、对账发现的产品缺陷），开成目标仓库的待验证 issue，loop 会接手：

1. 先查重：`gh issue list --state open --search "<关键词>"`。已有同一个问题的，就用那一条，写「已有 #N」。
2. 没有就 `gh issue create`，不打 `status:*` label。标题写问题本身；正文写给一个没有上下文的人看：是什么、在哪、怎么复现或怎么看到、为什么这次不做。
3. 开不成（`gh` 失败）的，记下没开成和原因，交给人。

## spec 的状态

| 状态 | 意思 | 谁翻 |
|---|---|---|
| 草稿 | 在写 | `idea-loop:to-spec` 新建时 |
| 审核中 | 有要人定的：开头的「> 需要 grill：…」，或「实现决策」下标题以「待定」开头的小节 | `route` |
| 正式 | 定稿了，设计和实现都照它做 | `route`；或审核中定完时 |
| 实现中 | 工单已切 | `idea-loop:to-ticket` 切完时 |
| 完成 | 实现合并了，或覆盖的 issue 全都验证为不存在 | `idea-loop:pr-review` 合并前；`route` |

脚本拒绝不允许的翻法时会说原因。「验证」表的格式脚本要读：每行 `| #12 … | 存在 | … |` 或 `| #12 … | 不存在 | … |`，写法见 `idea-loop:to-spec` 的模板。

```bash
spec-status set     <docs> <slug> <状态>   # 核前提 → 写 status → 刷索引
spec-status route   <docs> <slug>          # 草稿：按内容翻成 完成 / 审核中 / 正式
spec-status index   <docs>                 # 只刷索引
spec-status check   <docs>                 # 列出所有 spec 和问题（旧布局、非法状态）
spec-status migrate <docs>                 # 旧状态机的状态换成新的
```

`check` 报了旧平铺布局，停下提议照 `idea-loop:wiki-conventions` 的「从平铺布局迁移」迁移。「完成」的 spec 由 `/idea-loop:dreaming` 写 ADR、删目录，删完跑 `spec-status index <docs>`。
