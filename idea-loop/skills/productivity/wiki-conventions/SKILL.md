---
name: wiki-conventions
description: 目标仓库 docs/ 知识库与 worktree 下 .tmp/ 中间产物的约定：目录、frontmatter、slug 与链接、知识库改动怎么合进主分支、什么由人拍板。动 docs/ 或往 .tmp/ 放东西之前用。
---

## 知识库落地

一个需求在 `docs/` 里的改动（spec、raw、冻结的设计、工单、设计档案归档）提交在这个需求的工作分支上，跟代码在同一个分支、同一个 PR 里合进主分支，不单独开 spec PR 或设计 PR。改到一半不进主分支，别的 worktree 不会读到半成品。

没有代码 PR 可跟的，才自己开一个只改 `docs/` 的 PR，检查全过就合并：

- 父 issue 拆完子 issue（spec 与设计定稿）：子 issue 的会话从主分支读父 spec，所以父 issue 的这些改动先合；
- 没有代码的活：验证为不存在、或人决定不做的 issue，dreaming 的执行段，不在 issue 会话里的 retro 决定记录。

## 文件在不在，就是状态

`docs/` 没有草稿 / 冻结 / 归档三态目录，一份文档了结到哪，看它还在不在：

```
spec 目录存在               = 还没了结（走到哪一步看它 frontmatter `issues:` 里的 issue：全关了才算了结）
spec 目录消失 + ADR 存在     = 已了结（做了 → why/how/result；决定不做 → why-not）
spec 目录消失 + 无 ADR       = 不值得记
spec 存在 + 活已合并 + 无 ADR = 等下一次 dreaming 对账（正常状态）
ticket 存在                 = 有人正在做这一刀
ticket 消失                 = 那一刀合了
```

**删 spec 之前先写 ADR，无例外。** spec 存活期间，决策只住在 spec 里，先删就丢了决策。

写 ADR、删 spec 只在 `/idea-loop:dreaming` 里做：它每个判定都靠当次跑出来的证据；从 `idea-loop:grill` 到合并这条线上没有哪一步写 ADR。

## 人机分工

skill 做机械的事：建目录和文件、写 frontmatter、移动、删除、生成索引、连 wiki-link、抓取素材、跑核实。拍板 fork、定策略、决定删什么留什么归人，**按风险分**：会判错的，走**提议 → 人批准 → 机械执行**，三步分开；其余机械可判的，按建议处置直接执行。`/idea-loop:dreaming` 只问两类：`DESIGN.md` 和文档里的冲突（含术语），其余自己执行并合并。

## 目录

```
docs/
├── index.md              顶层导航
├── raw/<topic>/          素材与事实 —— 忠实，不编辑（含 assets/）
├── spec/                 还没了结的规格
│   └── <spec-slug>/      一份 spec 一个目录
│       ├── <spec-slug>.md        spec 本身
│       └── tickets/NN-<slug>.md  这份 spec 的工单，单 PR 临时凭据 —— 合了即删
├── adr/NNNN-<slug>.md    spec 了结后的总结 —— 永久
├── design/
│   ├── tmp/<spec-slug>/  一个需求的设计过程（imagine/ canvas/ delta/ research/），生命周期见 references/design-layout.md
│   └── prod/             设计档案：线上现在的样子，提交 —— 结构见 `idea-loop:design-archive`
├── domain/               领域知识 —— 业务机制、规则、数据结论
└── records/<kind>/       运营台账（如外联跟进表 `records/outreach/`）
```

`raw/`、`spec/`、`adr/` 是会话产物；`domain/` 是知识库存量，不由单次会话产生；`records/` 由会话建、由人改，文件用 `type: record`，不进 spec 的生命周期，也不在 dreaming 里删。

项目级的规则放在仓库根目录，一份文件管一件事：`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`（`/idea-loop:setup` 建），`GLOSSARY.md`、`DESIGN.md`。

- **spec 文件与目录同名**：`docs/spec/<spec-slug>/<spec-slug>.md`。wiki-link 按文件名解析，都叫 `spec.md` 的话 `[[<spec-slug>]]` 就指不到。

## 中间产物

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在当前 worktree 根的 `.tmp/<skill>/<对象>/` 下，`<对象>` 如 `<spec-slug>`、PR 号。每个子目录收什么、什么时候删，见 [references/tmp-layout.md](references/tmp-layout.md)。

- `<worktree 根>` 取 `git rev-parse --show-toplevel`；不在 git 仓库里就是项目根。
- 生命周期跟着 worktree，所以不放系统 `/tmp`：那里重启会清，不同 worktree、不同会话的东西也分不清归谁。跑完即弃、不跨步骤的东西仍可以用系统临时目录；spec 图的源文件定稿前还要改好几轮，算跨步骤。
- 分到 `<对象>` 一层，不然同一个 worktree 里先后跑两份 spec 时，固定文件名会悄无声息地互相覆盖。
- 设计侧的过程产物在 `docs/design/tmp/<spec-slug>/`，不在这里：归档脚本认得那里。

### 本地忽略

第一次用时确认 `.tmp/` 和 `docs/design/tmp/` 都在 `$(git rev-parse --git-common-dir)/info/exclude` 里（`git check-ignore` 可查），不在就追加一行。这样只在本地忽略，仓库的 `.gitignore` 不动，也不会被误提交。

## 从平铺布局迁移

`spec.mjs check` 报出旧平铺布局（`docs/spec/<slug>.md` 平铺，或共用的 `docs/spec/tickets/`）时，先照 [references/migrate-flat-layout.md](references/migrate-flat-layout.md) 一次性迁过去，再跑 `idea-loop:to-spec`、`idea-loop:to-ticket` 或 `idea-loop:implement`。

## frontmatter

每份 md 都带，它是 dreaming 与召回 grep 的锚点。两处豁免，都不带 frontmatter：

- `spec/<spec-slug>/tickets/` 下的工单：临时凭据，按 `idea-loop:to-ticket` 的工单模板写；dreaming 按目录扫它们。
- 各层的 `index.md`：导航，表体从别人的 frontmatter 生成（`design/prod/index.md` 例外，见 [references/index-md.md](references/index-md.md)）。

```yaml
---
type: raw | spec | adr | design | design-page | design-state | design-component | design-motion | design-journey | domain | reference | record
status: <见下表>                 # spec / raw / design / design-* / reference / domain 省略
issues: [<号>]                   # 只有 spec 有：它覆盖的 issue
tags: [<topic>, <feature-slug>]
summary: <一句话，≤60 字>
related: ["[[other-slug]]"]
---
```

`status` 是闭集：

| type | 合法 status |
|---|---|
| `adr` | `生效` · `已被取代（→ ADR-NNNN）` |
| `raw` | 无（改用 `source_type` + `captured`） |

`spec` 没有 `status`：状态看它 `issues:` 里的 issue（`idea-loop:issues`）。先放着的是 issue（回 backlog），dreaming 靠 backlog 区分被遗忘和被故意放着。

`design`（需求的冻结记录，随 `tmp/` 清掉）与五种 `design-*`（设计档案的对象）都不带 `status`；`design-*` 的字段见 `idea-loop:design-archive` 的「图的实体」。

ADR 的某一节被推翻时怎么标，见 [references/adr.md](references/adr.md)。

## slug 与链接

这是 Obsidian vault，wiki-link 按 basename 解析，与目录无关：

- **`docs/` 下每个 slug 全局唯一**，建文件前 grep 一遍。两类豁免，它们只按路径引用、从不做链接目标：
  - 工单文件：每份 spec 内从 `01` 编号，两份 spec 各有一张 `01-schema.md` 是正常的。引一张工单写它的路径。
  - `index.md`：每层都有一个。引某一层写路径，`[[index]]` 永远不写。
- spec 的 slug 与它 raw 素材的 slug 不同，不然 `[[x]]` 有歧义。
- 移动不打断 basename 链接，删除会。**每次删除后跑 link sweep**：grep `\[\[` 提取全部 slug，逐个确认文件存在。行内代码和代码块（含缩进的）里的 `[[...]]` 是格式示例，不算链接、不查；正文和 frontmatter（`"[[...]]"`）里的照旧查。
- 文档正文语言：跟目标仓库已有的文档一致。

## index.md

每层一个，只放索引，召回靠 frontmatter 的 `tags` + `summary` 加自带搜索。表体从 frontmatter 生成，不手工维护。格式与两处特例（`docs/spec/index.md`、`docs/design/prod/index.md`）见 [references/index-md.md](references/index-md.md)。

## spec 和工单怎么写

- **写接口、契约、行为、约束，不写具体文件路径和代码片段**：它们烂得最快。散文说不清的决策载体（状态机、schema、类型形状、taxonomy 的类别 id）可以内联，注明出处。
- **描述行为，不描述过程**：写「`SkillConfig` 接受一个可选的 `schedule` 字段」，不写「打开 src/types/skill.ts 在第 42 行加字段」。
