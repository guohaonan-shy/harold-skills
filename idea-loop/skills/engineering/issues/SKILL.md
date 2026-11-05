---
name: issues
description: issue 这个实体：状态、父 issue 与子 issue、blocked by、分类、milestone，以及在 GitHub、Linear 上各怎么表达。翻 issue 状态、拆子 issue、标挡路、打分类、开 issue 时用。
---

issue 是一件事的唯一记录：它走到哪，只看它的状态。spec 是文档，没有自己的状态；spec 了结 = 它 frontmatter `issues:` 列的 issue 全关了。

状态、父子、blocked by、分类都只走脚本改：下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指知识库的 `docs/`。脚本先核前提再写，拒绝时会说原因和能翻成什么，照原因处理。

## 实体

| 字段 | 意思 |
|---|---|
| 号、标题、正文 | 正文写给没有上下文的人：现象、在哪、从哪发现、证据 |
| 状态 | 下面九个之一 |
| 分类 | 父类、可选的子类，项目自己定（见「分类」） |
| 父 issue / 子 issue | 子 issue 是从父 issue 拆出、能单独交一个 PR 的一块；只有两层 |
| blocked by | 挡着它的 issue；挡路的都关了它才往下走 |
| milestone | 版本：这一版要发的 issue |
| 评论 | 停在哪、等什么、为什么关；idea-loop 写的带「🤖 idea-loop：」前缀 |

平台上各字段怎么表达、脚本调哪个接口：GitHub 读 [references/github.md](references/github.md)；Linear 读 [references/linear.md](references/linear.md)（只有对照，脚本还不接）。

不用父子关系表达的：版本用 milestone，模块用分类，「这几个相关」写正文链接。

## 状态

| 状态 | 意思 | 怎么进来 |
|---|---|---|
| backlog | 新进来、还没验证；或人说先放着 | 新开的（没有 `status:*` 的也算）；会话停下时带评论退回 |
| todo | 验证过、等调度派成会话 | 人在分拣时放行；`split` 开出的子 issue；挡路的关了 |
| spec | 写 spec、grill | 会话认领一个没有父 issue 的 issue |
| design | 设计 | spec 定稿、碰 UI |
| implement | 实现；父 issue 在这里等子 issue | spec 定稿不碰 UI，或设计冻结；子 issue 被认领；父 issue 拆完 |
| review | PR 等人看 | PR 转 ready、第一轮 Review 汇报交给人 |
| blocked | 被别的 issue 或等人给的条件挡着；不占会话 | `block`；或带评论翻进来 |
| done | 做完，关闭为 completed | PR 合并；父 issue 的子 issue 全关 |
| canceled | 不做，关闭为 not planned | 人决定不做；验证为不存在 |

翻法与前提由 `issues set` 核，见 `issues.mjs` 的 `NEXT` 与 `transitionError`。要记住的几条：

- 离开 spec 时，spec 里不能还有「> 需要 grill」或「### 待定」；进 design 要 spec 碰 UI；碰 UI 却没有冻结摘要就进 implement，要带 `--skip-design`（没装 design 插件时），并在汇报里写明跳过了设计。子 issue 按父 issue 的 spec 核。
- 翻 backlog、blocked 必须带 `--comment`：停在哪个阶段、分支叫什么，或等什么。下一个会话从 todo 接上时，读这条评论直接认领到那个阶段。
- done、canceled 之后不再翻；重开是人的事。

## 父 issue、子 issue 与工单

- **不拆**：一个 PR 装得下的，一个会话从 spec 做到 PR。
- **拆**：spec 定稿（碰 UI 的设计冻结）之后，一个 PR 装不下，父会话照 spec 的「子 issue」一节逐块 `issues split`。子 issue 开在 todo，带父 issue 的分类、优先级、milestone；块之间的先后用 `issues block`。父 issue 翻 implement，父会话收尾归档。
- **子 issue** 的会话从 implement 开始，照父 spec 做，走 implement → review → done；子 PR 各自 review、各自合，不等别的子 PR。
- **工单**是一个 PR 里的切片，写在 spec 目录的 `tickets/` 下（子 issue 的在 `tickets/<子号>/`），不上 issue 平台。
- 子 issue 全关了，父 issue 由调度的 `issues reconcile` 关成 done。

## 分类

除了状态，issue 还带分类 label：父类 `type:<父类>`，可选的子类 `type:<父类>/<子类>`，打子类时父类一起打上。项目有哪些分类、另外保留哪些 label，写在业务的 `AGENTS.md`（或 `CLAUDE.md`）的「issue 分类」一节，`/idea-loop:setup` 建它。`issues type` 打分类，会替换原有的 `type:*`。父类那行注了「（独立队列，上限 N）」的，它的 issue 在调度里单独排队（`issues queues`）。

## 开一个 issue

流程里顺手发现、这次不做的事，开成 backlog issue：

1. 先查重：`gh issue list --state open --search "<关键词>"`。已有同一个问题的，就用那一条，写「已有 #N」。
2. 没有就 `gh issue create`，不打 `status:*`（没有就是 backlog）。标题写问题本身；正文写现象、在哪、从哪发现、证据，和为什么这次不做。
3. 开不成（`gh` 失败）的，记下没开成和原因，交给人。

## 命令

```bash
issues labels     <docs> [--prune]                   # 建缺的九个 status:* 和 type:*；多余的只列出
issues type       <docs> <号> <父类[/子类]>...        # 打分类，换掉原有的 type:*
issues show       <docs> <号>                        # JSON：种类（parent / sub-issue / single）、状态、子 issue、挡路的、milestone、spec
issues set        <docs> <状态> <号>... [--comment=<文字>] [--skip-design]   # 核过的翻法；done / canceled 同时关闭
issues split      <docs> <父号> <标题> <正文文件>      # 开一个 todo 的子 issue，打印新号
issues block      <docs> <号> <挡路的号>...            # 记 blocked by，翻 blocked
issues candidates <docs> [<上限>] [--queue=<分类>]    # 能派的 todo：没有开着的挡路 issue，最早的在前（JSON）
issues reconcile  <docs>                             # 挡路的全关 → todo；子 issue 全关的父 → done
issues queues     <docs> [<号>]                       # 调度的队列、上限、侧边栏 section
```

spec 的 `issues:` 写这份 spec 属于的 issue（父 issue 写父号；子 issue 不写，从父子关系找到）。读 spec 内容、刷 `docs/spec/index.md`、查旧布局与遗留的 `status` 行，用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs" index|check <docs>`。
