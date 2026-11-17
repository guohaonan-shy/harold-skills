---
name: wiki-conventions
description: 目标仓库 docs/ 知识库与 worktree 下 .tmp/ 中间产物的约定：目录、frontmatter、slug 与链接、知识库改动怎么提交到 home、什么由人拍板。动 docs/ 或往 .tmp/ 放东西之前用。
---

## 知识库落地

知识库在项目目录里（`<项目目录>/docs/`，项目目录在 home 里），不在代码仓库。一个需求在知识库里的改动不跟代码 PR 走：写好就用 `commit` 提交到 home 的 main，代码 PR 里只有代码，issue 分支只给代码用。别的 skill 说「照『知识库落地』」，就是照这一节做。

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/project-map.mjs" commit "<消息>" <文件>...
```

- **只提交列出的文件**：home 是所有会话共用的一个 checkout，别的会话暂存区里的东西不带进来。home 有 `origin` 的，它接着 `pull --rebase` 再推送。
- **推送失败不挡**：输出里有「home 没推上去：<原因>」时，在交给人的汇报里写这一句，流程照走。
- 出错了 `git revert`。

| 产物 | 什么时候提交 |
|---|---|
| spec、raw | 写好就提交 |
| 工单 | 切完提交；代码 PR 合并后，`idea-loop:pr-review` 的合并步骤删这份 spec 的 `tickets/` 并提交 |
| 冻结的设计（画布、冻结记录、交互图） | 冻结时提交 |
| 设计档案归档（`prod/`） | 合并前只写 `delta/`、跑归档校验，review 看的就是 `delta/`；代码 PR 合并成功后才跑归档脚本，结果提交 |
| dreaming 的执行段、「不做」记录、retro 决定记录、SEO 的效果报告 | 做完直接提交，不经 PR |

SEO 的内容改动不在表里：站点内容在代码仓库，仍是代码 PR。

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

写 ADR、删 spec 只在 `/idea-loop:dreaming` 里做：从 `idea-loop:grill` 到合并这条线上没有哪一步写 ADR，活干完了也等它。

## 人机分工

skill 做机械的事：建目录和文件、写 frontmatter、移动、删除、生成索引、连 wiki-link、抓取素材、跑核实。拍板 fork、定策略、决定删什么留什么归人，**按风险分**：会判错的，走**提议 → 人批准 → 机械执行**，三步分开；其余机械可判的，按建议处置直接执行。`/idea-loop:dreaming` 只问两类：`DESIGN.md` 和文档里的冲突（含术语），其余自己执行并提交到 home。

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
│   ├── tmp/<spec-slug>/  一个需求的设计过程：过程产物只在本地，冻结结果提交到 home
│   │   ├── imagine/      发散段 —— 内部结构归 `idea-loop:uiux-imagine`
│   │   ├── canvas/       收敛段：冻结后唯一的设计真相 —— 内部结构归 `idea-loop:uiux-refine`
│   │   ├── delta/        对 prod/ 的差异，合并前写好 —— 结构见 `idea-loop:design-archive`
│   │   └── research/<问题短名>/  `idea-loop:uiux-research` 的调研页；没有 spec 时放 `tmp/research/<问题短名>/`
│   └── prod/             设计档案：线上现在的样子（页面 / 状态 / 组件 / 动效 / 用户路径），提交 —— index.md 由归档脚本生成
├── domain/               领域知识 —— 业务机制、规则、数据结论
└── records/<kind>/       运营台账 —— 会话起头、之后由人持续更新（如外联跟进表 `records/outreach/`）
```

`raw/`、`spec/`、`adr/` 是会话产物；`domain/` 是知识库存量，不由单次会话产生；`records/` 由会话建、由人改（`type: record`），不进 spec 的生命周期，dreaming 也不删。

项目级的规则放在仓库根目录，一份文件管一件事：`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`（`/idea-loop:setup` 建），`GLOSSARY.md`、`DESIGN.md`。

- **spec 文件与目录同名**：`docs/spec/<spec-slug>/<spec-slug>.md`，工单在它目录下的 `tickets/`，编号每份 spec 内从 `01` 起。wiki-link 按文件名解析，都叫 `spec.md` 就指不到。

`design/` 分两层，生命周期相反：`tmp/<spec-slug>/` 跟着需求走（画布冻结后 `commit` 到 home，归档在代码 PR 合并后），`prod/` 是设计档案、活得比 spec 长（只由归档脚本写）。每个子目录归谁、冻结与归档的时点、`research/` 为什么不归档：[references/design-layers.md](references/design-layers.md)。

## 中间产物

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在当前 worktree 根的 `.tmp/` 下，按 skill 与对象分子目录（`grill/`、`to-spec/`、`implement/`、`pr-review/`、`dreaming/`、`retro/`、`review-loop/`）。每个子目录放什么、何时删、为什么不放 `/tmp`、本地忽略怎么配：[references/tmp-artifacts.md](references/tmp-artifacts.md)。

## 从平铺布局迁移

`spec.mjs check` 报出旧平铺布局（`docs/spec/<slug>.md` 平铺，或共用的 `docs/spec/tickets/`）时，先照 [references/migrate-flat-layout.md](references/migrate-flat-layout.md) 一次性迁过去，再往下走。

## frontmatter

每份 md 都带，它是 dreaming 与召回 grep 的锚点。两处豁免，都不带 frontmatter：

- `spec/<spec-slug>/tickets/` 下的工单：临时凭据，按 `idea-loop:to-ticket` 的工单模板写；dreaming 按目录扫它们。
- 各层的 `index.md`：导航，表体从别人的 frontmatter 生成（`design/prod/index.md` 例外，见「index.md」）。

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

`spec` 没有 `status`：它只是文档，工作走到哪看它 `issues:` 里的 issue 的状态（`idea-loop:issues`），spec 了结 = 这些 issue 全关了。先放着的是 issue（回 backlog），dreaming 靠 backlog 区分被遗忘和被故意放着。

`design` 与 `design-*` 的字段、ADR 按小节取代怎么记：[references/frontmatter-notes.md](references/frontmatter-notes.md)。

## slug 与链接

wiki-link 按 basename 解析：`docs/` 下每个 slug 全局唯一（建文件前 grep 一遍），每次删除后跑 link sweep。豁免、sweep 的做法、正文语言：[references/slugs-and-links.md](references/slugs-and-links.md)。

## index.md

每层一个，只放索引，表体从 frontmatter 生成，不手工维护：契约行与各层的生成命令见 [references/index-files.md](references/index-files.md)。

## spec 和工单怎么写

- **写接口、契约、行为、约束，不写具体文件路径和代码片段**：它们烂得最快。散文说不清的决策载体（状态机、schema、类型形状、taxonomy 的类别 id）可以内联，注明出处。
- **描述行为，不描述过程**：写「`SkillConfig` 接受一个可选的 `schedule` 字段」，不写「打开 src/types/skill.ts 在第 42 行加字段」。
