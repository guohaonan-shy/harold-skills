---
name: issues
description: issue 这个实体：状态、谁在什么时候翻、正文格式、blocked by、先放着。翻 issue 的状态、开 issue、标挡路、让 issue 先放着时用。
---

issue 是一件事的唯一记录：它走到哪，只看它的状态。spec 是文档，没有自己的状态；spec 了结 = 它 frontmatter `issues:` 列的 issue 全关了。

状态改只走脚本：下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指知识库的 `docs/`。脚本先核前提再写，拒绝时会说原因和能翻成什么，照原因处理。

平台上各字段怎么表达、读写用什么：GitHub 用脚本，读 [references/github.md](references/github.md)；Linear 用 MCP，读 [references/linear.md](references/linear.md)。两边翻状态的前提都由 `issues check` 核。项目在哪个平台，看 `ISSUE_TRACKER.md` 第一个标题。

## 实体

| 字段 | 意思 |
|---|---|
| 号、标题、正文 | 格式见「正文」 |
| 状态 | 下面七个之一 |
| 类型 | Bug / Feature / Improvement 三选一 |
| 模块 | issue 落在项目的哪一块，项目自己定（`AGENTS.md` 的「issue 分类」） |
| 优先级 | P0 / P1 / P2，最多一个，没有就是没有；GitHub 上是 `priority:P0` / `priority:P1` / `priority:P2` label。P0 = 线上坏了、安全问题（权限、付款、数据越权），拿不准不判 |
| blocked by | 挡着它的 issue |
| 挂着的 PR | 这个 issue 要改的每个仓库各一个，状态各自是 draft / ready / merged |
| 评论 | 停在哪、等什么、为什么关；idea-loop 写的带「🤖 idea-loop：」前缀 |

不用父子关系归组：一个 issue 一个会话、一份 spec。版本用 milestone，模块用分类，「这几个相关」写正文链接。平台上已有的父子关系照常读，不当成组。

## 状态

| 状态 | 意思 |
|---|---|
| backlog | 新进来、没验证（每周由 `idea-loop:issue-triage` 分拣）；或人说先放着 |
| triage | 验证过，要人评估（grill、设计）；做完翻 todo |
| todo | 可以被调度派成会话 |
| in-progress | 会话在做，spec 提交后开 draft PR |
| in-review | PR 全部转 ready，等人看 |
| done | 全部 PR 合并 |
| canceled | 不做；验证为不存在；重复 |

| 从 | 到 | 谁、什么时候 |
|---|---|---|
| （新开） | backlog | agent 或人开的；没有 `status:*` 的开着的 GitHub issue 也算 |
| backlog | triage / todo / canceled | `idea-loop:issue-triage` 分拣后人定；不要人评估的直接 todo |
| triage | todo | 人评估完：spec 里没有「需要 grill」「待定」，碰 UI 的设计已冻结 |
| todo | in-progress | 调度派出的会话认领；spec 提交后开 draft PR |
| in-progress | in-review | PR 全部转 ready，第一轮 Review 汇报交给人 |
| in-progress | triage | todo 会话起草 spec 时冒出要人定的：评论停在哪，人在 triage 里定 |
| in-review | in-progress | 人批了要改、会话回去改 |
| in-review | done | 全部 PR 合并 |
| 任意开着的 | backlog | 人说先放着（见「先放着」） |
| 任意开着的 | canceled | 人决定不做；验证为不存在 |

- 项目没开 triage 的（`ISSUE_TRACKER.md` 的状态表写了「triage：跳过」），不翻 triage：backlog 直接翻 todo，grill 与设计在 todo 会话里做。
- 前提由 `issues set` 核：triage → todo，spec 不能还有「> 需要 grill」或「### 待定」，碰 UI 的要有冻结摘要（没装设计插件时带 `--skip-design`，并在汇报里写明跳过了设计）；→ done，挂着的 PR 全部合并。
- done、canceled 之后不再翻；重开是人的事。
- Linear 上 in-progress、in-review、done 由集成按 PR 推，agent 不手翻，其余照这张表。

## 正文

```
标题：一句现象，用户视角：什么情况下，出了什么事；不写方案

## 背景        可选：读懂问题要先知道的链路或现状
## 问题        必填：看到了什么，带一个具体例子；在哪（页面、接口、文件或 skill）
## 证据        必填：查询、日志、截图的摘要和出处；没有就写「无，待验证」
## 影响范围    必填：多少次、多少用户；查不到写原因
## 从哪发现    必填：哪个会话、哪次扫描、哪个 PR；人开的写「人」
## 已确认原因  可选：验证后补
```

类型、模块、优先级不写进正文，用平台的字段或 label。

## blocked by 与先放着

不设「被挡」的状态：

- **被别的 issue 挡**：用平台的 blocked by。调度跳过还被挡着的 todo，挡路的关了它自然能派。
- **等人给条件**：在 issue 上评论「等你：X」，回 backlog。
- **先放着**：`issues set <docs> backlog <号> --comment=<停在哪个阶段、分支叫什么>`，评论必须带。人重新放进 todo 后，新会话读这条评论接上分支。

## 开一个 issue

流程里顺手发现、这次不做的事（跟这次无关的存量问题、review 里人批了「开 issue」的、对账发现的产品缺陷），开 issue 只走 `issues new`，它先校验正文四个必填节、再查重（同标题开着的 issue 已有就拒绝并报号）：

1. 照「正文」的格式把正文写进一个文件，写给一个没有上下文的人看。
2. `issues new <docs> <标题> <正文文件>`，默认开成 backlog，输出新 issue 的号。人在当前会话里明说了「做」的，加 `--state=todo --priority=<P0|P1|P2>`（问人优先级）；分类用 `--kind=…`、`--type=…`。已有同一个问题的，用那一条，写「已有 #N」。
3. 判断是 P0 的，开成 backlog 后调 `/idea-loop:issue-triage P0 <号>`，当场复现。
4. 正文被拒（缺节或节是空的）就补上再开；开不成（`gh` 失败）的，记下没开成和原因，交给人。

Linear 项目没有 `issues new`：`issues body` 校验正文，再照 [references/linear.md](references/linear.md) 的「开 issue」用 MCP 开。

## 命令

```bash
issues labels     <docs> [--prune]                 # 建缺的 status:*、kind:*、type:* label；多余的只列出，--prune 删
issues type       <docs> <号> <父类[/子类]>...      # 打模块，换掉原有的 type:*
issues show       <docs> <号>                      # JSON：状态、标题、分类、挂着的 PR（仓库、draft / ready / merged）、覆盖它的 spec 与分支
issues check      <docs> <状态> <号> [--from=<现在的状态>]   # 只核翻法的前提、不改；Linear 上必带 --from，先跑它再用 MCP 翻
issues set        <docs> <状态> <号>... [--comment=<文字>] [--skip-design]   # 核过再翻；done、canceled 同时关闭
issues new        <docs> <标题> <正文文件> [--state=backlog|todo] [--priority=P0|P1|P2] [--kind=…] [--type=…]... [--repo=<owner/repo>]   # 校验正文、查重、开；默认 backlog，todo 必带 --priority；--repo 开到别的仓库；输出新号
issues body       <docs> <正文文件>                # 只校验正文，不开；Linear 上先跑它再用 MCP 开
issues priority   <docs> <P0|P1|P2|none> <号>...   # 换掉原有的优先级
issues backlog    <docs> [<上限>]                  # 开着的 backlog issue，最早的在前（JSON）；跳过分拣问过「还要你补」、之后没人动过的
issues note       <docs> <号> <正文文件>           # 贴一条带「🤖 idea-loop：」前缀的评论
issues candidates <docs> [<上限>] [--queue=<分类>]  # 能派的 todo：没有开着的 blocked by，先按优先级 P0 → P1 → P2 → 没有，再按号（JSON）
issues reconcile  <docs>                           # 对账：PR 都合并了的 → done；都 ready 的 → in-review；旧 label 与两个 status:* 作为问题报出
issues queues     <docs> [<号>]                    # 调度的队列、上限、侧边栏 section
issues migrate    <docs> [--apply]                 # 旧状态机的 label 与 spec 状态行换成新的；不带 --apply 只列出，--apply 先建缺的 label
```

PR 正文怎么挂到 issue 上，平台各有写法，见两份 reference。

分类（模块、类型、独立队列）和 spec 的 `issues:`、`spec.mjs` 怎么用，读 [references/category-and-spec.md](references/category-and-spec.md)。
