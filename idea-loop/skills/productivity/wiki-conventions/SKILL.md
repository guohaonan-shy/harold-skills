---
name: wiki-conventions
description: 项目目录、docs/ 知识库、术语表、worktree 下 .tmp/ 中间产物的约定。动 docs/、往 .tmp/ 放东西、碰术语表（新增、改名、订正术语，给领域概念起名）之前用。
---

这份 skill 定下知识库和中间产物放哪、叫什么、何时提交、何时删；读完，手上的产物能落到对的位置。

## 目录

`docs/` 和项目级规则都在项目目录里（见下面「项目目录」）。下表路径都从 `docs/` 起算。

| 目录 | 收什么 | 谁写 | `type` | 什么时候消失 |
|---|---|---|---|---|
| `index.md`（每层一个） | 索引；顶层是导航 | 命令从 frontmatter 生成；`raw/`、`adr/` 的暂由 dreaming 写 | 无 | 不消失 |
| `raw/` | 素材与事实，忠实不编辑（含 `assets/`） | 会话产物 | `raw` | 不消失 |
| `spec/` | 还没了结的规格，每份一个目录，目录与正文同名 | 会话产物 | `spec` | issue 全关后 dreaming 写 ADR、删 spec |
| `spec/` 里每份的 `tickets/` | 工单，单 PR 的临时凭据 | `idea-loop:to-ticket` | 无 | 代码 PR 合并后删 |
| `adr/` | spec 了结后的总结 | dreaming | `adr` | 永久 |
| `design/tmp/` | 设计过程，一个需求一个目录：`imagine/` 发散，`canvas/` 画布与冻结记录（冻结后是唯一的设计真相），`delta/` 对 `prod/` 的差异，`research/` 调研页（不归档）；放弃的需求只丢画布（只是先不做的挪去 `design/pending/`），有价值的结论写回 spec 或 issue | `uiux-*`；`delta/` 合并前写 | 冻结记录 `design` | 代码 PR 合并后归档时清掉 |
| `design/pending/` | 暂缓的设计：人说「这块界面先不做」时，从 `design/tmp/` 原样挪来的整个需求目录（目标已存在就停下问人，不覆盖），spec 里留一句指针和暂缓理由（人说的那句）。只在本地、从不提交（`commit` 不列它），设计档案校验跳过它 | `uiux-imagine` / `uiux-refine` 的编排者挪 | 无 | spec 了结后 dreaming 提议删 |
| `design/prod/` | 设计档案：线上现在的样子，提交；对象与字段见 `idea-loop:design-archive` 的「图的实体」 | 归档命令 | `design-*` | 下个需求归档时覆盖或删除 |
| `domain/` | 领域知识：业务机制、规则、数据结论 | 存量，不由单次会话产生 | `domain` | 不消失 |
| `records/` | 运营台账，一类一个子目录 | 会话建，人改 | `record` | 不进 spec 的生命周期，dreaming 不删 |
| 项目目录本身 | 项目级规则，一份文件管一件事（清单见「项目目录」） | 前四份由 `/idea-loop:setup` 建 | — | 不消失 |

文档正文语言跟 `docs/` 里已有的文档一致。

### 项目目录

**项目目录**是这个项目在 home 里的目录 `<home>/projects/<名字>/`。`docs/`（别的 skill 里的 `<docs>`）和项目级规则 `DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`、`ISSUE_TRACKER.md`、`GLOSSARY.md`、`DESIGN.md`、`SEO.md` 都在它下面；代码仓库只留代码和自己的 `AGENTS.md` / `CLAUDE.md`。读写这些文件、给命令的 `<docs>`，用项目目录里的路径；读源码、跑测试、起服务、开分支和 PR 仍在代码 worktree 里。设备地图、项目地图的模板（setup、dreaming 共用）见 [references/home-maps.md](references/home-maps.md)。怎么拿到，看你是谁：

- **主会话开在代码 worktree 里**：会话开场注入的「项目目录：<路径>」那一行；没有，在这个 worktree 里跑 `dyna home where`（不带 `--project`）。
- **主会话开在 home 里**：`dyna home where --project <名字>`，取输出的 `projectDir`。
- **子代理**：调用方在 prompt 里给的路径，不自己去找；prompt 里没有，就停下，交回写明缺项目目录。
- **拿不到**（`where` 退出码非 0，或开场注入的是迁移提示）：照它输出的那句话停下告诉人（如先跑 `/idea-loop:setup` 迁移），不去读代码仓库里的同名文件。

### frontmatter

除了工单和 `index.md`，每份 md 都带，是 dreaming 与召回的锚点：

```yaml
---
type: raw | spec | adr | design | design-page | design-state | design-component | design-motion | design-journey | domain | reference | record
issues: [<号>]                   # 只有 spec 有：它覆盖的 issue
tags: [<topic>, <feature-slug>]
summary: <一句话，≤60 字>
related: ["[[other-slug]]"]
---
```

### slug 与链接

slug 是文件名去掉 `.md`；这是 Obsidian vault，`[[slug]]` 按 basename 解析，与目录无关。下面三条由命令守着。

- `docs/` 下每个 slug 全局唯一（工单和 `index.md` 只按路径引用，不在此列）；`dyna home commit` 遇到重名就拒绝。
- 移动不打断链接，删除会：`[[...]]` 指到的 slug 都要有文件（行内代码和代码块里的不算）；`dyna home commit` 遇到死链就拒绝。
- ADR 文件名（四位编号加名字，编号递增、不复用）用 `dyna home adr new <名字>` 取。

### 术语表

碰 `GLOSSARY.md`（新增、改名、订正术语，给产出里的领域概念起名）时读 [references/glossary.md](references/glossary.md)。

## 生命周期

```
grill → raw/（永久，spec 引用它）
spec → design/tmp/（碰 UI 时）→ 工单 → 代码 PR 合并（工单删，design/tmp 归档进 design/prod）
→ issue 全关后 dreaming：先把 spec 写成 ADR，再删 spec
```

### 知识库落地

一个需求在知识库里的改动不跟代码 PR 走：写好就用 `commit` 提交到 home 的 main，代码 PR 里只有代码。完成条件：列出的文件已在 home 的 main 上。

```
dyna home commit "<消息>" <文件>...
```

- **只提交列出的文件**：home 是所有会话共用的一个 checkout，别的会话暂存区里的东西不带进来。home 有 `origin` 的，接着 rebase 到最新再推送。
- **推送失败不挡**：输出里有「home 没推上去：<原因>」时，在交给人的汇报里写这一句，流程照走。
- 出错了回退那次提交。

| 产物 | 什么时候提交 |
|---|---|
| spec、raw | 写好就提交 |
| 工单 | 切完提交；代码 PR 合并后，`idea-loop:pr-review` 的合并步骤删这份 spec 的 `tickets/` 并提交 |
| 冻结的设计（画布、冻结记录、交互图） | 冻结时提交 |
| 设计档案归档（`prod/`） | 合并前只写 `delta/` 并跑归档校验（review 看它）；代码 PR 合并成功后才跑归档命令，结果提交 |
| dreaming 的执行段、「不做」记录、retro 决定记录、SEO 的效果报告 | 做完直接提交，不经 PR |

SEO 的内容改动是代码 PR，不在表里。

### 从平铺布局迁移

`dyna spec check` 报出旧平铺布局时，先照 [references/migrate-flat-layout.md](references/migrate-flat-layout.md) 一次性迁过去，再跑 `idea-loop:to-spec`、`idea-loop:to-ticket` 或 `idea-loop:implement`。

## 中间产物

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在当前 worktree 根的 `.tmp/<skill>/<对象>/` 下，`<对象>` 如 `<spec-slug>`、PR 号。

- 不在 git 仓库里，`<worktree 根>` 就是项目根。
- 生命周期跟着 worktree，不放系统 `/tmp`：那里重启会清，也分不清东西归哪个 worktree、哪个会话。跑完即弃、不跨步骤的才用系统临时目录；spec 图的源文件要改好几轮，算跨步骤。
- 按 `<对象>` 分一层：两份 spec 先后在同一个 worktree 里跑，固定文件名会互相覆盖。
- 设计侧的过程产物在 `<项目目录>/docs/design/tmp/<spec-slug>/`，不在这里：归档命令认得那里。

每个子目录收什么、什么时候删，见 [references/tmp-layout.md](references/tmp-layout.md)。

### 本地忽略

第一次用时确认 `.tmp/` 在本仓库的本地忽略文件（`info/exclude`）里，没有就追加一行：只在本地忽略，`.gitignore` 不动。`docs/design/tmp/` 不加进去：冻结的画布要 `commit` 进 home，被忽略的路径加不进提交。过程产物和 `docs/design/pending/` 不会被带进提交：`commit` 只提交列出的文件。
