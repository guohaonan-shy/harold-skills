---
name: wiki-conventions
description: 目标仓库 docs/ 知识库与 worktree 下 .tmp/ 中间产物的约定：目录、frontmatter、slug 与链接、生命周期、知识库改动怎么合进主分支。动 docs/ 或往 .tmp/ 放东西之前用。
---

## 目录

下表路径都从 `docs/` 起算。

| 目录 | 收什么 | 谁写 | `type` | 什么时候消失 |
|---|---|---|---|---|
| `index.md`（每层一个） | 索引；顶层是导航 | 脚本从 frontmatter 生成；`raw/`、`adr/` 的暂由 dreaming 写 | 无 | 不消失 |
| `raw/` | 素材与事实，忠实不编辑（含 `assets/`） | 会话产物 | `raw` | 不消失 |
| `spec/` | 还没了结的规格，每份一个目录，目录与正文同名 | 会话产物 | `spec` | issue 全关后 dreaming 写 ADR、删 spec |
| `spec/` 里每份的 `tickets/` | 工单，单 PR 的临时凭据 | `idea-loop:to-ticket` | 无 | 合了即删 |
| `adr/` | spec 了结后的总结 | dreaming | `adr` | 永久 |
| `design/tmp/` | 设计过程，一个需求一个目录：`imagine/` 发散，`canvas/` 画布与冻结记录（冻结后是唯一的设计真相），`delta/` 对 `prod/` 的差异，`research/` 调研页（不归档）；放弃的需求只丢画布（只是先不做的挪去 `design/pending/`），有价值的结论写回 spec 或 issue | `uiux-*`；`delta/` 归档时写 | 冻结记录 `design` | 合并前归档后清掉 |
| `design/pending/` | 暂缓的设计：人说「这块界面先不做」时，从 `design/tmp/` 原样挪来的整个需求目录（目标已存在就停下问人，不覆盖），spec 里留一句指针和暂缓理由（人的原话）。放在主 checkout（`git worktree list` 的第一行），不放会话的 worktree（用完就清）；只在本地、不提交，设计档案校验跳过它 | `uiux-imagine` / `uiux-refine` 的编排者挪；两者起手时查它，有同一块界面就问人接不接着做 | 无 | spec 了结后 dreaming 提议删 |
| `design/prod/` | 设计档案：线上现在的样子，提交；对象与字段见 `idea-loop:design-archive` 的「图的实体」 | 归档脚本 | `design-*` | 下个需求归档时覆盖或删除 |
| `domain/` | 领域知识：业务机制、规则、数据结论 | 存量，不由单次会话产生 | `domain` | 不消失 |
| `records/` | 运营台账，一类一个子目录（如外联跟进表 `records/outreach/`） | 会话建，人改 | `record` | 不进 spec 的生命周期，dreaming 不删 |
| 仓库根 | 项目级规则，一份文件管一件事：`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`、`GLOSSARY.md`、`DESIGN.md` | 前四份由 `/idea-loop:setup` 建 | — | 不消失 |

文档正文语言跟目标仓库已有的文档一致。

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

slug 是文件名去掉 `.md`；这是 Obsidian vault，`[[slug]]` 按 basename 解析，与目录无关。以后由统一命令行（#339）把下面三条包装成子命令。

- `docs/` 下每个 slug 全局唯一，建文件前 grep 一遍（工单和 `index.md` 只按路径引用，不在此列）。
- 移动不打断链接，删除会：每次删除后查死链，`[[...]]` 指到的 slug 都要有文件（行内代码和代码块里的不算）。
- ADR 文件名是四位编号加名字（`0001-<名字>.md`），编号递增、不复用。

## 生命周期

```
grill → raw/（永久，spec 引用它）
spec → design/tmp/（碰 UI 时）→ 工单 → 合并（工单删，design/tmp 归档进 design/prod）
→ issue 全关后 dreaming：spec 写成 ADR，删 spec
   （删 spec 前先写 ADR，只有 dreaming 写）
```

### 知识库落地

一个需求在 `docs/` 里的改动（spec、raw、冻结的设计、工单、设计档案归档）提交在这个需求的工作分支上，跟代码在同一个分支、同一个 PR 里合进主分支，不单独开 spec PR 或设计 PR。改到一半不进主分支，别的 worktree 不会读到半成品。

没有代码 PR 可跟的，才自己开一个只改 `docs/` 的 PR，检查全过就合并：

- 父 issue 拆完子 issue（spec 与设计定稿）：子 issue 的会话从主分支读父 spec，所以父 issue 的这些改动先合；
- 没有代码的活：验证为不存在、或人决定不做的 issue，dreaming 的执行段，不在 issue 会话里的 retro 决定记录。

### 从平铺布局迁移

`spec.mjs check` 报出旧平铺布局时，先照 [references/migrate-flat-layout.md](references/migrate-flat-layout.md) 一次性迁过去，再跑 `idea-loop:to-spec`、`idea-loop:to-ticket` 或 `idea-loop:implement`。

## 中间产物

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在当前 worktree 根的 `.tmp/<skill>/<对象>/` 下，`<对象>` 如 `<spec-slug>`、PR 号。

- `<worktree 根>` 取 `git rev-parse --show-toplevel`；不在 git 仓库里就是项目根。
- 生命周期跟着 worktree，所以不放系统 `/tmp`：那里重启会清，不同 worktree、不同会话的东西也分不清归谁。跑完即弃、不跨步骤的东西仍可以用系统临时目录；spec 图的源文件定稿前还要改好几轮，算跨步骤。
- 分到 `<对象>` 一层，不然同一个 worktree 里先后跑两份 spec 时，固定文件名会悄无声息地互相覆盖。
- 设计侧的过程产物在 `docs/design/tmp/<spec-slug>/`，不在这里：归档脚本认得那里。

每个子目录收什么、什么时候删，见 [references/tmp-layout.md](references/tmp-layout.md)。

### 本地忽略

第一次用时确认 `.tmp/`、`docs/design/tmp/` 和 `docs/design/pending/` 都在 `$(git rev-parse --git-common-dir)/info/exclude` 里（`git check-ignore` 可查），不在就追加一行。这样只在本地忽略，仓库的 `.gitignore` 不动，也不会被误提交。
