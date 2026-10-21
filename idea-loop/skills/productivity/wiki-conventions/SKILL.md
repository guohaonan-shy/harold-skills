---
name: wiki-conventions
description: 目标仓库 docs/ 知识库的共享契约：目录、spec 与工单的位置和状态、命名。动 docs/ 之前用。
---

# idea-loop 契约

五个 skill（`grill` / `to-spec` / `to-ticket` / `implement` / `dreaming`）共享的规则。每个 skill 每会话读一次，动 `docs/` 之前读。

> **改这份文件本身需要 Harold 签字**——它是共享契约。应用它是 skill 的日常工作，不需要。
>
> **2026-08-20 签字**：§1 的「做完但还没对账」状态、§3 对 ticket 的豁免、§4 对 `index.md` 的豁免。
> 前两条来自一次实跑（把 spec 落进一个已有常驻规格的仓库）暴露的洞，第三条是 §4 与 §5 本身相冲。
>
> **2026-10-14 签字**（harold-skills#42）：§2 每份 spec 一个目录、工单住进自己 spec 的目录；§3 spec 状态机加
> `草稿` / `审核中`，`等设计冻结` 改名 `设计中`，状态与 backlog 移交标记的规则搬进 `idea-loop:spec-status`、只走脚本改；§4 对工单文件名的豁免。起因是几份 spec
> 同时在飞时工单混在一个目录里、编号互撞，以及起草 routine 要从 backlog 自动起草 spec。
>
> **2026-09-28 签字**：§2 新增 `design/<spec-slug>/` 层、§3 新增 `type: design`。冻结的设计从
> raw 桶搬出来，作为实现之后的视觉真值维护在项目里，不跟 spec 一起删。
>
> **2026-10-19 签字**（ui-state-archive）：§2 把 `design/<spec-slug>/` 换成 `design/tmp/` 与 `design/prod/` 两层，
> §2.1 去掉 imagine / refine 的 `.tmp/` 目录；§3 的 type 闭集加入五种设计档案对象；§5 补 `prod/index.md` 的契约（脚本生成）。
> 起因是冻结的设计按 spec 命名、存了画布却没有"这个页面有哪些状态"的图，改成按页面记现状、按需求暂存过程。
>
> 真相源：[[docs-wiki-v2]]（`docs/spec/`）。这五个 skill 取代了 v1 的五个：
> `distill-source`（并入 grill + to-spec）、`draft-prd` / `freeze-prd` / `archive-prd`
> （状态机取消，归档并入 dreaming）、`prd-to-plan`（拆成 to-ticket + 后续的 implement）。

---

## 1 文件在不在，就是状态

没有 drafts/freeze/archive 三态目录，没有状态机。

```
spec 目录存在          = 还没了结（走到哪一步看 frontmatter 的 status，§3）
spec 目录消失 + ADR 存在   = 已了结（做了 → why/how/result；决定不做 → why-not）
spec 目录消失 + 无 ADR     = 不值得记
ticket 存在            = 有人正在做这一刀
ticket 消失            = 那一刀合了
```

> **不变量：删 spec 之前必须先写 ADR。**
> 决策在 spec 存活期间只住在 spec 里，先删就是丢决策。无例外。

**「做完但还没对账」是 spec 的一个正常状态，不是漏洞。** 上面那张表读起来像是活一干完 spec 就该消失，
但写 ADR 与删 spec 都归 `dreaming`，而它是**周期性的维护扫描**，不是单份 spec 的收尾——前向环
（`grill` → `to-spec` → `to-ticket` → `implement` → `pr-*`）里没有任何一步写 ADR。所以：

```
spec 存在 + 活已合并 + 无 ADR   = 等下一次 maintain 扫描（正常）
```

**不要因为活干完了就提前手写 ADR。** `dreaming` 的纪律 5 要求每个判定都靠当次跑出来的证据，手写就是凭记忆。

## 2 目录

```
docs/
├── index.md              顶层导航
├── raw/<topic>/          素材与事实 —— 忠实，不编辑（含 assets/）
├── spec/                 还没了结的规格 —— 做完整个目录删
│   └── <spec-slug>/      一份 spec 一个目录
│       ├── <spec-slug>.md        spec 本身
│       └── tickets/NN-<slug>.md  这份 spec 的工单，单 PR 临时凭据 —— 合了即删
├── adr/NNNN-<slug>.md    spec 归档总结 —— 永久
├── design/
│   ├── tmp/<spec-slug>/  一个需求的设计过程，只在本地、不进 git
│   │   ├── imagine/      发散段：变种板、方向说明、交接画布 —— 内部结构归 `uiux-imagine`
│   │   ├── canvas/       收敛段：画布各版本、冻结记录、交互图 —— 内部结构归 `uiux-refine`
│   │   ├── delta/        冻结结果对 prod/ 的差异 —— 结构见 `idea-loop:design-archive`
│   │   └── research/<问题短名>/  `uiux-research` 的调研页与参考截图；没有 spec 时放 `tmp/research/<问题短名>/`
│   └── prod/             设计档案：线上现在的样子（页面 / 状态 / 组件 / 动效 / 用户路径），提交 —— index.md 由归档脚本生成
└── domain/               领域知识 —— 业务机制、规则、数据结论
```

`raw/` / `spec/` / `adr/` 是**会话产物**，`domain/` 是**知识库存量**（不由单次会话产生）。这条分界是它们必须分开的原因。

项目级的规则不放 `docs/`，放在仓库根目录、一份文件管一件事：`DEVELOPMENT.md`、`REVIEW.md`、`CODING_STANDARDS.md`、`PRODUCT.md`（`setup` 建），`GLOSSARY.md`、`DESIGN.md`。

**spec 文件与目录同名**（`docs/spec/<spec-slug>/<spec-slug>.md`），不叫 `spec.md`：wiki-link 按文件名解析（§4），所有 spec 都叫 `spec.md` 的话，`[[<spec-slug>]]` 一处也指不到。

**工单住在自己 spec 的目录里**，编号在每份 spec 内从 `01` 起。几份 spec 同时在飞时，工单不会混在一起、编号也不会互撞。要找一份 spec 的工单，就看它目录下的 `tickets/`；不靠文件名猜它属于谁。

`design/` 分两层，生命周期相反：

- **`design/tmp/<spec-slug>/`** 是一个需求的设计过程，跟着需求走：`uiux-imagine` 写 `imagine/`，`uiux-refine` 写 `canvas/` 和 `delta/`，`uiux-research` 写 `research/`（imagine 与 refine 用同一处）。调研不放进 `imagine/`，所以 imagine 收工清 `imagine/` 时它还在；合并前的拦截（`merge-gate-hook.mjs`）、pr-review 每轮的 UI 审查判断、合并前的归档判断、ui-reviewer 的跳过条件，都不把 `research/` 算作设计产物——调研目录从不归档，只做过调研的需求不起 UI 审查、合并不走归档；调研结论用进了设计的，已经以文字记在方向说明或冻结记录里，随设计一起归档。**只在本地**——目标项目要把 `docs/design/tmp/` 排除出 git（第一次用时确认，不在就追加到 `$(git rev-parse --git-common-dir)/info/exclude`，同 §2.1），所以放弃的需求只是丢画布，有价值的结论写回 spec 或 issue。需求的冻结记录和画布留在 `canvas/` 里直到归档，归档时清掉整个 `tmp/<spec-slug>/`。
- **`design/prod/`** 是设计档案，记线上现在的样子，提交、活得比 spec 长——spec 删掉、ADR 写好之后它还在。**写 `prod/` 只有归档脚本一条路**（人批过之后）：agent 只写 `tmp/<spec-slug>/delta/`。所以 **`dreaming` 不因为 spec 没了就提议删 `prod/` 里的东西**；一个对象被取代的唯一方式是下一个需求归档时覆盖或删除它。结构见 `idea-loop:design-archive`。

按 `design/<spec-slug>/` 命名的旧目录是旧布局的冻结记录，`design-archive-check.mjs` 对每个只打一条提示（建议删），不读。

### 2.1 中间产物：worktree 根下的 `.tmp/`

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在**当前 worktree 根**的 `.tmp/` 下，按 skill 与对象分目录：

```
<worktree 根>/.tmp/
├── grill/<YYYY-MM-DD>-<topic>/   复现过程的截图、网络日志、trace —— grill 收工时删
├── to-spec/<spec-slug>/          spec 图的 excalidrawer 源文件（sugar JSON、.excalidraw）—— 只有 PNG 进 docs/，spec 定稿后可删
├── implement/<spec-slug>/        pending.md（等人决定的工单）、evidence/（人验素材）、notes/（explorer 的共享笔记）、browser.lock（MCP 浏览器锁）—— PR 合并后删
├── pr-review/<PR 号>/            每轮的 Codex 输出、机械检查输出、汇报、evidence/（review 配图）—— PR 合并后删
├── dreaming/<YYYY-MM-DD>/        这一次运行的提议表 proposal.md 与中间物（重拍与初扫的产物不在这里，在 docs/design/tmp/ 下）—— 执行段完成后删
└── review-loop/<PR 号>.md        这个 PR 的 review loop：每次停下、每轮 review 的汇报，人的原话批示，做了什么 —— 合并时归档进 PR 后删（`pr` skill 的「review loop」）
```

**设计侧的过程产物不放这里**：`uiux-imagine` 与 `uiux-refine` 的工作区、方向说明、交接画布、ledger、评分 JSON、评委截图都在 `docs/design/tmp/<spec-slug>/`（§2），同样只在本地、不进 git，但归档脚本认得它。

`evidence/` 下的素材是**交付证据**：过程中以本地文件发给人看，PR 描述用到或合并归档时才上传到 PR 的素材分支，从不进代码分支和 `docs/`（`idea-loop:evidence`）。

- `<worktree 根>` 取 `git rev-parse --show-toplevel`；不在 git 仓库里就是项目根。
- 第一次用时确认 `.tmp/` 在 `$(git rev-parse --git-common-dir)/info/exclude` 里，不在就追加一行——本地忽略，不改仓库的 `.gitignore`，也不会被误提交。
- **不放系统 `/tmp`**：生命周期要跟着 worktree。系统 `/tmp` 重启会被清（方向说明丢了 refine 就开不了工），而且不同 worktree、不同会话的东西攒在一起分不清是谁的；放在 worktree 里，该删的时候 skill 删，没来得及删的随 worktree 一起删掉。
- 按 `<spec-slug>` / `<topic>` 分子目录不是洁癖：两份 spec 在同一个 worktree 里先后跑，固定文件名放在共享的顶层会互相覆盖，而且覆盖得悄无声息。
- 一次性的、跑完即弃、不跨步骤的东西仍然可以用系统临时目录。spec 图的 excalidrawer 源文件不算：定稿前可能还要改好几轮，放 `.tmp/to-spec/<spec-slug>/`。

### 2.2 从平铺布局迁移

旧布局是 `docs/spec/<slug>.md` 平铺、所有 spec 的工单共用 `docs/spec/tickets/`。在一个旧布局的仓库里第一次跑 `to-spec` / `to-ticket` / `implement` 之前，先一次性迁过去（一个 `docs(spec): 每份 spec 一个目录` 提交）：

1. 每份 `docs/spec/<slug>.md` → `git mv` 到 `docs/spec/<slug>/<slug>.md`。wiki-link 按文件名解析，移动不打断它们；**相对路径的图片引用会断**（spec 深了一层），每条前面补一个 `../`，改完逐条确认文件存在。
2. `docs/spec/tickets/` 下的每张工单，按它的 PR、它引用的 spec 或它的标题判断属于哪份 spec，`git mv` 到那份 spec 的 `tickets/`。判断不了的列给人，不猜。归属清楚后旧的 `tickets/` 目录应该是空的，删掉它。
3. 旧状态值改名：`等设计冻结` → `设计中`。`在飞` 不动——已经在做的 spec 不回退成 `审核中`。
4. 跑 `spec-status.mjs check` 确认没有遗留问题，再跑 `spec-status.mjs index` 刷新 `docs/spec/index.md`（`idea-loop:spec-status` 的「状态机」）。

正在做的 PR 不受影响：集成分支上已有的 commit 里，`Ticket:` trailer 只写工单名，不写路径。

## 3 frontmatter

每份 md 都带。这是 dreaming 与召回 grep 的锚点。

**两处豁免**：`spec/<spec-slug>/tickets/` 下的 ticket 按 `to-ticket` §5 的模板走，**不带 frontmatter**——它是临时凭据，
`dreaming` 扫它是按**目录**扫（「漏网的 ticket 也归这里扫」），不靠 frontmatter 锚定。各层的 `index.md`
同样不带——它是导航，表体从别人的 frontmatter 生成。

```yaml
---
type: raw | spec | adr | design | design-page | design-state | design-component | design-motion | design-journey | domain | reference | record
status: <见下表>                 # raw / design / design-* / reference / domain 省略
tags: [<topic>, <feature-slug>]
summary: <一句话，≤60 字>
related: ["[[other-slug]]"]
---
```

`status` 是**闭集**，不是自由散文（旧文档用散文写状态，正是机器判不出状态的根因）：

| type | 合法 status |
|---|---|
| `spec` | `草稿` · `审核中` · `待设计` · `设计中` · `待实现` · `在飞` · `已拍板未排期` · `搁置` |
| `adr` | `生效` · `已被取代（→ ADR-NNNN）` |
| `raw` | 无（改用 `source_type` + `captured`） |

`搁置` 是显式状态。dreaming 靠它区分"被遗忘"与"被故意搁置"。

`design` 是需求的冻结记录（`design/tmp/<spec-slug>/canvas/<spec-slug>-design.md`），随 `tmp/` 清掉；`design-page` / `design-state` / `design-component` / `design-motion` / `design-journey` 是设计档案的五种对象，每份文件一个对象，住在 `design/prod/`（与 `design/tmp/<spec-slug>/delta/` 同构），都不带 `status`，各自的结构字段见 `idea-loop:design-archive` 的「frontmatter」。

spec 的状态按 `草稿 → 审核中 →（待设计 → 设计中 →）待实现 → 在飞` 往前走。每一步谁写、前提是什么、怎么写，都在 `idea-loop:spec-status`：**改状态只走 `scripts/spec-status.mjs`**，不手改这一行。

**ADR 的取代默认是 section 级，不是整份**——一份 ADR 常含多条决策（引用粒度本就是 `ADR-NNNN §n`），新决策通常只推翻其中一节。frontmatter 的 `status` 只在**全部**小节都作废时才翻成 `已被取代`；部分取代记在那一节标题后（`⚠️ 已被取代 → ADR-<new> §<n>`），文件本身仍是 `生效`。

## 4 slug 与链接

- 这是 Obsidian vault，**wiki-link 按 basename 解析，与目录无关** → **`docs/` 下每个 slug 必须全局唯一**。建文件前 grep 一遍。
  - **豁免工单文件。** 工单在每份 spec 内从 `01` 编号，两份 spec 各有一张 `01-schema.md` 是正常的。它们跟 `index.md` 一样**从不做链接目标**——要引一张工单就写它的路径，不写 `[[01-schema]]`。
  - **豁免 `index.md`。** §5 要求「每层一个 `index.md`」，那与本条直接相冲。不咬人的原因是索引**从不做链接目标**——
    没有任何文件写 `[[index]]`，所以歧义不会发生。**代价是这条豁免必须靠纪律维持**：谁都不要写 `[[index]]`，
    要引某一层就写路径。
- spec 的 slug 必须**不同于**它 raw 素材的 slug，否则 `[[x]]` 有歧义。
- 移动不打断 basename 链接；**删除会**。所以每次删除后必须跑 link sweep：grep `\[\[` 提取全部 slug，逐个确认文件存在。
- 文档正文语言：中文。

## 5 index.md

每层一个，**只放索引，不放过程信息**。召回靠 frontmatter 的 `tags` + `summary` 加自带 search，不靠往索引里堆描述。

```markdown
# <层名>
> 契约：<这一层收什么、不收什么，一句话>

| 文件 | status | summary |
|---|---|---|
| [[slug]] | 在飞 | <取自 frontmatter.summary> |
```

表体**从 frontmatter 生成**，不手工维护（`docs/spec/index.md` 由 `scripts/spec-status.mjs index` 生成）——手工维护必然漂移（v1 实证：一份文档晋级后旧索引条目还留着，同时出现在两个索引里）。

**设计档案的索引是 `docs/design/prod/index.md`**，由归档脚本生成，不手写，也没有 `docs/design/index.md`：

> 契约：设计档案里现有的页面、组件、动效、用户路径各一张清单，`usedBy` 由脚本反向生成；frontmatter 里定主视口 / 主题 / 语言（项目定一次）。不收 `tmp/` 里进行中的需求。

它是唯一带 frontmatter 的 `index.md`（主视口 / 主题 / 语言要被脚本读），其余各层的 `index.md` 仍不带。

## 6 人机分工

- ✅ skill 做：建目录/文件、写 frontmatter、移动/删除、生成索引、连 wiki-link、抓取素材、跑核实。
- 🚫 skill 不自作主张：拍板 fork、定策略、决定删什么留什么。**提议 → 人批准 → 机械执行**，三步分离。

## 7 写文档的两条硬规则

- **spec 和 ticket 里禁止写具体文件路径和代码片段**——它们烂得最快。写接口、契约、行为、约束。
  例外：用散文说不清的决策载体（状态机、schema、类型形状、taxonomy 的类别 id）可内联，并注明出处。
- **描述行为，不描述过程**。"`SkillConfig` 接受一个可选的 `schedule` 字段" ✅；"打开 src/types/skill.ts 在第 42 行加字段" ❌。
