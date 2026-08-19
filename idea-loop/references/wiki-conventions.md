# idea-loop 契约

五个 skill（`grill` / `to-spec` / `to-ticket` / `implement` / `dreaming`）共享的规则。每个 skill 每会话读一次，动 `docs/` 之前读。

> **改这份文件本身需要 Harold 签字**——它是共享契约。应用它是 skill 的日常工作，不需要。
>
> 真相源：[[docs-wiki-v2]]（`docs/spec/`）。这五个 skill 取代了 v1 的五个：
> `distill-source`（并入 grill + to-spec）、`draft-prd` / `freeze-prd` / `archive-prd`
> （状态机取消，归档并入 dreaming）、`prd-to-plan`（拆成 to-ticket + 后续的 implement）。

---

## 1 文件在不在，就是状态

没有 drafts/freeze/archive 三态目录，没有状态机。

```
spec 存在              = 在飞
spec 消失 + ADR 存在   = 已了结（做了 → why/how/result；决定不做 → why-not）
spec 消失 + 无 ADR     = 不值得记
ticket 存在            = 有人正在做这一刀
ticket 消失            = 那一刀合了
```

> **不变量：删 spec 之前必须先写 ADR。**
> 决策在 spec 存活期间只住在 spec 里，先删就是丢决策。无例外。

## 2 目录

```
docs/
├── index.md              顶层导航
├── raw/<topic>/          素材与事实 —— 忠实，不编辑（含 assets/）
├── spec/                 在飞的规格 —— 做完即删
│   └── tickets/          单 PR 临时凭据 —— 合了即删
├── adr/NNNN-<slug>.md    spec 归档总结 —— 永久
├── domain/               领域知识 —— 题型机制 / 能力体系 / 真实数据结论
├── reference/            常驻约定与手册
├── records/              周期快照 —— weekly / okara / pulse-log
├── testing/              test-cases 库
└── quality-backlog.md    线上问题登记册
```

前三层是**会话产物**，后三层是**知识库存量**（不由单次会话产生）。这条分界是它们必须分开的原因。

## 3 frontmatter

每份 md 都带。这是 dreaming 与召回 grep 的锚点。

```yaml
---
type: raw | spec | adr | domain | reference | record
status: <见下表>                 # raw / reference / domain 省略
tags: [<topic>, <feature-slug>]
summary: <一句话，≤60 字>
related: ["[[other-slug]]"]
---
```

`status` 是**闭集**，不是自由散文（旧文档用散文写状态，正是机器判不出状态的根因）：

| type | 合法 status |
|---|---|
| `spec` | `在飞` · `等设计冻结` · `已拍板未排期` · `parked` |
| `adr` | `生效` · `已被取代（→ ADR-NNNN）` |
| `raw` | 无（改用 `source_type` + `captured`） |

`parked` 是显式状态。dreaming 靠它区分"被遗忘"与"被故意搁置"。

**ADR 的取代默认是 section 级，不是整份**——一份 ADR 常含多条决策（引用粒度本就是 `ADR-NNNN §n`），新决策通常只推翻其中一节。frontmatter 的 `status` 只在**全部**小节都作废时才翻成 `已被取代`；部分取代记在那一节标题后（`⚠️ 已被取代 → ADR-<new> §<n>`），文件本身仍是 `生效`。

## 4 slug 与链接

- 这是 Obsidian vault，**wiki-link 按 basename 解析，与目录无关** → **`docs/` 下每个 slug 必须全局唯一**。建文件前 grep 一遍。
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

表体**从 frontmatter 生成**，不手工维护——手工维护必然漂移（v1 实证：一份文档晋级后旧索引条目还留着，同时出现在两个索引里）。

## 6 人机分工

- ✅ skill 做：建目录/文件、写 frontmatter、移动/删除、生成索引、连 wiki-link、抓取素材、跑核实。
- 🚫 skill 不自作主张：拍板 fork、定策略、决定删什么留什么。**提议 → 人批准 → 机械执行**，三步分离。

## 7 写文档的两条硬规则

- **spec 和 ticket 里禁止写具体文件路径和代码片段**——它们烂得最快。写接口、契约、行为、约束。
  例外：用散文说不清的决策载体（状态机、schema、类型形状、taxonomy 的类别 id）可内联，并注明出处。
- **描述行为，不描述过程**。"`SkillConfig` 接受一个可选的 `schedule` 字段" ✅；"打开 src/types/skill.ts 在第 42 行加字段" ❌。
