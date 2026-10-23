---
name: wiki-conventions
description: 目标仓库 docs/ 知识库与 worktree 下 .tmp/ 中间产物的约定：目录、frontmatter、slug 与链接、什么由人拍板。动 docs/ 或往 .tmp/ 放东西之前用。
---

## 文件在不在，就是状态

`docs/` 没有草稿 / 冻结 / 归档三态目录，一份文档了结到哪，看它还在不在：

```
spec 目录存在               = 还没了结（走到哪一步看 frontmatter 的 status）
spec 目录消失 + ADR 存在     = 已了结（做了 → why/how/result；决定不做 → why-not）
spec 目录消失 + 无 ADR       = 不值得记
spec 存在 + 活已合并 + 无 ADR = 等下一次 dreaming 对账（正常状态）
ticket 存在                 = 有人正在做这一刀
ticket 消失                 = 那一刀合了
```

**删 spec 之前先写 ADR，无例外。** spec 存活期间，决策只住在 spec 里，先删就丢了决策。

写 ADR、删 spec 只在 `/idea-loop:dreaming` 里做：它每个判定都靠当次跑出来的证据。从 `idea-loop:grill` 到合并的这条线上没有哪一步写 ADR，活干完了也等 dreaming。

## 人机分工

skill 做机械的事：建目录和文件、写 frontmatter、移动、删除、生成索引、连 wiki-link、抓取素材、跑核实。拍板 fork、定策略、决定删什么留什么归人：**提议 → 人批准 → 机械执行**，三步分开。

## 目录

```
docs/
├── index.md              顶层导航
├── raw/<topic>/          素材与事实 —— 忠实，不编辑（含 assets/）
├── spec/                 还没了结的规格 —— 了结后整个目录删
│   └── <spec-slug>/      一份 spec 一个目录
│       ├── <spec-slug>.md        spec 本身
│       └── tickets/NN-<slug>.md  这份 spec 的工单，单 PR 临时凭据 —— 合了即删
├── adr/NNNN-<slug>.md    spec 了结后的总结 —— 永久
├── design/
│   ├── tmp/<spec-slug>/  一个需求的设计过程：过程产物只在本地，冻结结果经设计 PR 提交
│   │   ├── imagine/      发散段：变种板、方向说明、交接画布 —— 内部结构归 `idea-loop:uiux-imagine`
│   │   ├── canvas/       收敛段：画布各版本、冻结记录、交互图；冻结后唯一的设计真相 —— 内部结构归 `idea-loop:uiux-refine`
│   │   ├── delta/        对 prod/ 的差异：合并前归档时从最终画布加实现写出（没有设计稿的改动由实现者记最小差异）—— 结构见 `idea-loop:design-archive`
│   │   └── research/<问题短名>/  `idea-loop:uiux-research` 的调研页与参考截图；没有 spec 时放 `tmp/research/<问题短名>/`
│   └── prod/             设计档案：线上现在的样子（页面 / 状态 / 组件 / 动效 / 用户路径），提交 —— index.md 由归档脚本生成
├── domain/               领域知识 —— 业务机制、规则、数据结论
└── records/<kind>/       运营台账 —— 会话起头、之后由人持续更新（如外联跟进表 `records/outreach/`）
```

`raw/`、`spec/`、`adr/` 是会话产物；`domain/` 是知识库存量，不由单次会话产生；`records/` 由会话建、由人改，文件用 `type: record`，不进 spec 的生命周期，也不在 dreaming 里删。

项目级的规则放在仓库根目录，一份文件管一件事：`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`（`/idea-loop:setup` 建），`GLOSSARY.md`、`DESIGN.md`。

- **spec 文件与目录同名**：`docs/spec/<spec-slug>/<spec-slug>.md`。wiki-link 按文件名解析，都叫 `spec.md` 的话 `[[<spec-slug>]]` 就指不到。
- **工单住在自己 spec 的目录里**，编号在每份 spec 内从 `01` 起。找一份 spec 的工单，看它目录下的 `tickets/`。

`design/` 分两层，生命周期相反：

- **`design/tmp/<spec-slug>/`** 跟着需求走：`/idea-loop:uiux-imagine` 写 `imagine/`，`/idea-loop:uiux-refine` 写 `canvas/`，`delta/` 在合并前归档时写，`idea-loop:uiux-research` 写 `research/`（imagine 与 refine 共用这一处，imagine 收工清 `imagine/` 时它还在）。
  - 过程产物只在本地（见下面「本地忽略」），放弃的需求只丢画布，有价值的结论写回 spec 或 issue。
  - 冻结时，签字的画布、冻结记录和交互图经设计 PR 提交进主分支（`git add -f`），实现从主分支开 worktree 就拿得到。冻结之后设计变了，由 designer 改画布、冻结记录记一行，随实现分支提交。它们留到实现 PR 合并前的归档：`delta/` 此时才写出，归档脚本把要长期留下的并进 `prod/`，清掉整个 `tmp/<spec-slug>/`，这些删除跟着实现 PR 进主分支。
  - **`research/` 不算设计产物**：从不归档；只做过调研的需求不起 UI 审查，合并也不走归档。用进设计的调研结论已经以文字写在方向说明或冻结记录里，随设计归档。
- **`design/prod/`** 是设计档案，提交，活得比 spec 长。写 `prod/` 只走归档脚本（人批过之后），agent 只写 `tmp/<spec-slug>/delta/`。一个档案对象只在下一个需求归档时被覆盖或删除，所以 spec 删了，`prod/` 里的东西照旧留着。结构见 `idea-loop:design-archive`。

按 `design/<spec-slug>/` 命名的旧目录是旧布局的冻结记录，`design-archive-check.mjs` 对每个只打一条提示（建议删），不读。

## 中间产物

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在当前 worktree 根的 `.tmp/` 下，按 skill 与对象分子目录：

```
<worktree 根>/.tmp/
├── grill/<YYYY-MM-DD>-<topic>/   复现过程的截图、网络日志、trace —— grill 收工时删
├── to-spec/<spec-slug>/          spec 图的 excalidrawer 源文件（sugar JSON、.excalidraw）—— 只有 PNG 进 docs/，spec 定稿后可删
├── implement/<spec-slug>/        pending.md（等人决定的工单）、evidence/（人验素材）、notes/（explorer 的共享笔记）、browser.lock（浏览器锁）—— PR 合并后删
├── pr-review/<PR 号>/            每轮的 Codex 输出、机械检查输出、汇报、evidence/（review 配图）—— PR 合并后删
├── dreaming/<YYYY-MM-DD>/        这一次运行的提议表 proposal.md 与中间物 —— 执行段完成后删
├── retro/<YYYY-MM-DD>-<主题>/    压缩过的会话记录 digest.md —— retro 收工时删
└── review-loop/<PR 号>.md        这个 PR 的 review loop（`idea-loop:pr` 的「review loop」）—— 合并时归档进 PR 后删
```

- `<worktree 根>` 取 `git rev-parse --show-toplevel`；不在 git 仓库里就是项目根。
- 生命周期跟着 worktree，所以不放系统 `/tmp`：那里重启会清，不同 worktree、不同会话的东西也分不清归谁。一次性的、跑完即弃、不跨步骤的东西仍然可以用系统临时目录；spec 图的源文件定稿前还要改好几轮，算跨步骤。
- 按 `<spec-slug>` / `<topic>` 分子目录：同一个 worktree 里先后跑两份 spec，固定文件名放在共享的顶层会悄无声息地互相覆盖。
- 设计侧的过程产物（工作区、方向说明、交接画布、评分、评委截图）在 `docs/design/tmp/<spec-slug>/`，不在这里：归档脚本认得那里。
- `evidence/` 下是交付证据，过程中以本地文件发给人看，用到时才上传到 PR 的素材分支，不进代码分支和 `docs/`（`idea-loop:evidence`）。

**本地忽略**：第一次用时确认 `.tmp/` 和 `docs/design/tmp/` 都在 `$(git rev-parse --git-common-dir)/info/exclude` 里（`git check-ignore` 可查），不在就追加一行。这样只在本地忽略，仓库的 `.gitignore` 不动，也不会被误提交。

## 从平铺布局迁移

`spec-status.mjs check` 报出旧平铺布局（`docs/spec/<slug>.md` 平铺，或共用的 `docs/spec/tickets/`）时，先照 [references/migrate-flat-layout.md](references/migrate-flat-layout.md) 一次性迁过去，再跑 `idea-loop:to-spec`、`idea-loop:to-ticket` 或 `idea-loop:implement`。

## frontmatter

每份 md 都带，它是 dreaming 与召回 grep 的锚点。两处豁免，都不带 frontmatter：

- `spec/<spec-slug>/tickets/` 下的工单：临时凭据，按 `idea-loop:to-ticket` 的工单模板写；dreaming 按目录扫它们。
- 各层的 `index.md`：导航，表体从别人的 frontmatter 生成（`design/prod/index.md` 例外，见「index.md」）。

```yaml
---
type: raw | spec | adr | design | design-page | design-state | design-component | design-motion | design-journey | domain | reference | record
status: <见下表>                 # raw / design / design-* / reference / domain 省略
tags: [<topic>, <feature-slug>]
summary: <一句话，≤60 字>
related: ["[[other-slug]]"]
---
```

`status` 是闭集：

| type | 合法 status |
|---|---|
| `spec` | `草稿` · `审核中` · `正式` · `实现中` · `完成`；谁写、前提是什么见 `idea-loop:spec-status`，只走 `spec-status.mjs` 改，不手改这一行 |
| `adr` | `生效` · `已被取代（→ ADR-NNNN）` |
| `raw` | 无（改用 `source_type` + `captured`） |

spec 没有「搁置」：先放着的是它覆盖的 issue，挂 `status:搁置`，dreaming 靠这个 label 区分被遗忘和被故意搁置。工作排到了哪（待设计、待实现……）也记在 issue 的 label 上。

`design` 是需求的冻结记录（`design/tmp/<spec-slug>/canvas/<spec-slug>-design.md`），随 `tmp/` 清掉。`design-page` / `design-state` / `design-component` / `design-motion` / `design-journey` 是设计档案的五种对象，每份文件一个对象，住在 `design/prod/`（与 `tmp/<spec-slug>/delta/` 同构），都不带 `status`，结构字段见 `idea-loop:design-archive` 的「frontmatter」。

**ADR 按小节取代**：一份 ADR 常含多条决策（引用写 `ADR-NNNN §n`），新决策通常只推翻其中一节。部分取代记在那一节标题后（`⚠️ 已被取代 → ADR-<new> §<n>`），文件仍是 `生效`；全部小节都作废时，frontmatter 才翻成 `已被取代（→ ADR-<new>）`。写新 ADR 前先搜 `docs/adr/` 有没有同话题的旧决策。

## slug 与链接

这是 Obsidian vault，wiki-link 按 basename 解析，与目录无关：

- **`docs/` 下每个 slug 全局唯一**，建文件前 grep 一遍。两类豁免，它们只按路径引用、从不做链接目标：
  - 工单文件：每份 spec 内从 `01` 编号，两份 spec 各有一张 `01-schema.md` 是正常的。引一张工单写它的路径。
  - `index.md`：每层都有一个。引某一层写路径，`[[index]]` 永远不写。
- spec 的 slug 与它 raw 素材的 slug 不同，不然 `[[x]]` 有歧义。
- 移动不打断 basename 链接，删除会。**每次删除后跑 link sweep**：grep `\[\[` 提取全部 slug，逐个确认文件存在。
- 文档正文语言：跟目标仓库已有的文档一致。

## index.md

每层一个，只放索引，召回靠 frontmatter 的 `tags` + `summary` 加自带搜索。表体从 frontmatter 生成，不手工维护。

```markdown
# <层名>
> 契约：<这一层收什么、不收什么，一句话>

| 文件 | status | summary |
|---|---|---|
| [[slug]] | 生效 | <取自 frontmatter.summary> |
```

- `docs/spec/index.md` 由 `spec-status.mjs index <docs>` 生成，只有「文件」「summary」两列：spec 的状态在各段 PR 里变，几个 PR 同时开着会在状态列上冲突。要看状态看各 spec 的 frontmatter，看全貌跑 `spec-status.mjs check`。
- 设计档案的索引是 `docs/design/prod/index.md`，由归档脚本生成，没有 `docs/design/index.md`。它的契约行：「设计档案里现有的页面、组件、动效、用户路径各一张清单，`usedBy` 由脚本反向生成；frontmatter 里定主视口 / 主题 / 语言 / 动效模式（`motion`，项目定一次）。不收 `tmp/` 里进行中的需求。」它是唯一带 frontmatter 的 `index.md`，主视口 / 主题 / 语言 / 动效模式要被脚本读。

## spec 和工单怎么写

- **写接口、契约、行为、约束，不写具体文件路径和代码片段**：它们烂得最快。散文说不清的决策载体（状态机、schema、类型形状、taxonomy 的类别 id）可以内联，注明出处。
- **描述行为，不描述过程**：写「`SkillConfig` 接受一个可选的 `schedule` 字段」，不写「打开 src/types/skill.ts 在第 42 行加字段」。
