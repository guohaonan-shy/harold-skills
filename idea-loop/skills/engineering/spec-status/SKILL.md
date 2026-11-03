---
name: spec-status
description: issue 的状态（loop 的队列）和 spec 的状态（文档成熟度）怎么走。翻 issue 或 spec 的状态、把 issue 挂上或摘下 spec、关 issue 时用。
---

两套状态，各管一件事：

- **issue 的状态**说工作排到了哪，写在 GitHub label 上。`idea-loop:issue-dispatch` 的 loop 和 `idea-loop:issue-session` 只看它。
- **spec 的状态**说这份文档成熟到哪一步，写在 spec 的 frontmatter 里，只在 idea-loop 内部用。

改状态只走脚本，label、frontmatter 的 `status` 行和 `docs/spec/index.md` 都由它写：脚本先核前提再写，前提不满足就拒绝并说明原因，照原因处理。下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指知识库的 `docs/`（`idea-loop:wiki-conventions` 的「知识库」）：`check`、`index`、`issues` 的读取类命令用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/knowledge-base.mjs" root` 的输出加 `/docs`，写 status 的命令（`set`、`route`、`migrate`、`issues set` 等）用 `root --write` 的输出加 `/docs`。

## issue 的状态

一个 issue 会话从开场到合并只在一条分支上（代码仓库的会话分支，和知识库里同名的分支），中途不把 spec、设计合进主分支；label 说的是这条线走到了哪一段。

| 状态 | GitHub 上 | 意思 | 谁翻 |
|---|---|---|---|
| 待验证 | open，没有 `status:*` | 新进来，还没有会话 | |
| 讨论中 | `status:讨论中` | 会话在复现、起草 spec、跟人 grill | 会话开场认领（`issues set`） |
| 设计中 | `status:设计中` | spec 定稿了、碰 UI，在设计 | `advance` |
| 实现中 | `status:实现中` | 在切工单、实现、跑 review 第一轮 | `advance` |
| 审核中 | `status:审核中` | PR 已开出、review 跑过一轮、转了 ready，等人读 | 交审核报告时（`issues set`） |
| 搁置 | `status:搁置` | 先放着，loop 不碰 | `issues set` |
| 关闭·不存在 | closed，not planned | 验证为不存在；或人决定不做（`drop`） | `advance`、`drop` |
| 关闭·完成 | closed，completed | 这条线的 PR 全部合并了 | `advance` |

`advance` 读传给它的那份 `<docs>`，会话里就是会话分支上的知识库，不用等合进主分支：定稿后按碰不碰 UI 进设计中或实现中，冻结提交后进实现中，审核中的不动，合并后 spec「完成」或「不存在」的关掉。`reconcile` 是调度每轮的兜底：只按知识库主分支上的 spec 关掉该关的，不挂任何状态。`issues set` 拒绝不允许的翻法时会列出能翻成什么。「搁置」用 `resume` 恢复：知识库主分支上的 spec 说关就关，没有就回「待验证」。

### 根 issue 和子 issue

有子 issue 的是「根」，有父 issue 的是「子 issue」（GitHub 原生 sub-issue），一组按一个会话走。给根号 `issues set` 就整组翻，`issues group` 查一组；候选只出根，不出开了不到 6 小时的。应用仓库里一个根下的全部子 issue 由**一份** spec 覆盖：spec 的 `issues:` 写全部子 issue，不写根；`advance` / `reconcile` 翻这份 spec 的子 issue 时，根跟着翻到同一个状态。按版本发布的仓库里一组是一个版本，子 issue 分在几个 feature 的 spec 里，根留在版本会话认领时的讨论中、不跟着翻（`DEVELOPMENT.md` 的「发布方式」）。子 issue 全部关闭时，根随着关闭（completed），评论写明随哪份 spec。只有一份 spec、根下却有开着的子 issue 不在里面，或子 issue 的状态不一致时，`reconcile` 不动根、把它作为问题报出来（出现了说明分组和 spec 对不上）；`advance` 只看一份 spec，遇到这种根不动也不报。

```bash
issues labels     <docs> [--prune]             # 建缺的 status:* type:* label；多余的只列出
issues type       <docs> <号> <父类[/子类]>...  # 打分类，换掉原有的 type:*
issues candidates <docs> [<limit>]             # 待验证的候选，最早的在前（JSON）
issues group      <docs> <号>                   # 根号或子 issue 号：根和开着的子 issue（JSON）
issues set        <docs> <状态> <号 | slug>...  # 翻状态；根号连子 issue 一起翻
issues reconcile  <docs>                       # 兜底：照知识库主分支关掉该关的；根跟着子 issue
issues advance    <docs> <slug>                # 照这份 docs 里的 spec 推进或关闭；末行写下一段
issues migrate    <docs> [--apply]             # 老 label 换成四段：先列清单，--apply 才改
issues resume     <docs> <号 | slug>...         # 搁置 → 该在的地方
issues handoff    <docs> <slug> <号>           # 把 #号 写进 spec frontmatter，不碰 GitHub
issues open       <docs> <slug>                # spec 没覆盖任何 issue：开一个「spec：」issue
issues unhandoff  <docs> <slug> <号>           # 从 spec 移出 #号，回到待验证
issues drop       <docs> <slug> <号>           # 从 spec 移出 #号，关成 not planned
```

spec 覆盖的 issue 记在它 frontmatter 的 `issues: [12, 15]` 里。`handoff` 只写本地文件；`open` 开的 spec issue 当场挂「讨论中」：写这份 spec 的对话就是它的会话。

升级到四段之前配过的项目，老 label 由 `issues migrate <docs>` 换成四段：先列清单给人看，人说做再加 `--apply`；迁过再跑什么也不做。`/idea-loop:setup` 带着做。

## issue 的分类

除了状态，issue 还带分类 label：父类 `type:<父类>`，可选的子类 `type:<父类>/<子类>`，打子类时父类一起打上。项目有哪些分类、另外保留哪些 label，写在知识库根的 `AGENTS.md`（`<docs>` 的上一层）的「issue 分类」一节，`/idea-loop:setup` 建它。分类由 `idea-loop:issue-verify` 验证时打，走 `issues type`；`issues labels` 照这一节建出分类 label，不在状态、分类和保留清单里的 label 只列出来，`--prune` 才删。父类那行注了「（独立队列，上限 N）」的，它的 issue 在调度里单独排队（`issues queues`）。

## 开一个待验证的 issue

流程里顺手发现、这次不做的事（跟这次无关的存量问题、review 里人批了「开 issue」的、对账发现的产品缺陷），开成待验证 issue（开在 `<知识库>/idea-loop.json` 的 `issues` 指的 GitHub 仓库上），loop 会接手：

1. 先查重：`gh issue list --state open --search "<关键词>"`。已有同一个问题的，就用那一条，写「已有 #N」。
2. 没有就 `gh issue create`，不打 `status:*` label。标题写问题本身；正文写给一个没有上下文的人看：是什么、在哪、怎么复现或怎么看到、为什么这次不做。
3. 开不成（`gh` 失败）的，记下没开成和原因，交给人。

## spec 的状态

| 状态 | 意思 | 谁翻 |
|---|---|---|
| 草稿 | 在写 | `idea-loop:to-spec` 新建时 |
| 审核中 | 有要人定的：开头的「> 需要 grill：…」，或「实现决策」下标题以「待定」开头的小节（跟 issue 的「审核中」同名不同义：这里说文档还有待定） | `route` |
| 正式 | 定稿了，设计和实现都照它做；翻它的那次提交就是定稿提交（`idea-loop:to-spec`） | `route`；或审核中定完时 |
| 实现中 | 工单已切 | `idea-loop:to-ticket` 切完时 |
| 完成 | 实现合并了，或覆盖的 issue 全都验证为不存在 | `idea-loop:pr-review` 合并前；`route` |

脚本拒绝不允许的翻法时会说原因。spec 标题下的结论格式脚本要读：每个 issue 一行 `> #12 存在：…` 或 `> #12 不存在：…`，写法见 `idea-loop:to-spec` 的模板；旧 spec 的「验证」表（每行 `| #12 … | 存在 | … |`）仍然认得。

```bash
spec-status set     <docs> <slug> <状态>   # 核前提 → 写 status → 刷索引
spec-status route   <docs> <slug>          # 草稿：按内容翻成 完成 / 审核中 / 正式
spec-status index   <docs>                 # 只刷索引
spec-status check   <docs>                 # 列出所有 spec 和问题（旧布局、非法状态）
spec-status migrate <docs>                 # 旧状态机的状态换成新的
```

`check` 报了旧平铺布局，停下提议照 `idea-loop:wiki-conventions` 的「从平铺布局迁移」迁移。「完成」的 spec 由 `/idea-loop:dreaming` 写 ADR、删目录，删完跑 `spec-status index <docs>`。
