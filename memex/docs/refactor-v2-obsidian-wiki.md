# memex 设计稿 — 多源个人记忆 wiki（anti-olden v2 重构）

> **memex** = Vannevar Bush 1945 的 "memory extender"：一台存下你所有记录/通信、用关联轨迹（associative trails = `[[link]]`/provenance）串起来的个人设备。第二大脑的鼻祖概念。
> 参考记忆框架：OpenHuman obsidian-wiki（透明 markdown vault / connector 层 / `[[wikilink]]` / provenance）。
> 状态：**已落地**（2026-05-20）。所有核心决策已对齐（见 §1），§8 清单已逐文件改写完成。本文档保留为设计依据 / 决策记录。
> 落地补充：ingest 拉完**自动接 recap**（用户答 "自动连跑"）；config.json 首次 bootstrap **只注册当次要用的 connector**（用户答 "只注册当前要用的"）；reply-coach 保留 **8 个回复策略**（"3" 指 3 个候选强度，不是策略数）。
>
> **v2.1 修订（2026-05-20，实测后）**：基于六六6 群实测,两处改动 —— ①**身份落实**:建 person 前必经 connector `## identity` 解析得稳定 ID（ingest 在 sources frontmatter 写 sender roster；recap/comm-memory 对非成员走 contact 解析）,禁止凭显示名/代号建档（memory-index.md R0）。②**砍掉独立 `events/` 类型**:Karpathy（event=article,无类型）与 OpenHuman（event=daily digest + hotness 涌现的 topic 树）都不设独立 event 类型 → memex 同步:一次性事件用行内 `#event`,够热（跨实体反复，lint"新连接"命中）升 `topics/`,时序流落 `log.md` 升级成的**按日 digest**。下文 §1/§3/§6/§7/§8 中凡 `events/` 一级 note 的表述均以本修订为准。

---

## 1. 已对齐的核心决策

| 决策 | 选择 |
|---|---|
| **plugin 身份** | 从"飞书沟通参谋 anti-olden" → **多源个人记忆 wiki `memex`**：通过可插拔 connector（lark/wechat/slack…）拉对话，沉淀成"人和事"的记忆；anti-olden 退化为众多消费者 skill 之一（`reply-coach`） |
| **plugin 名** | `memex` |
| observation 结构 | obsidian 原生：`#tag`（type）+ Dataview `(key:: val)`（kv/seen）+ `[[wikilink]]` + `^anchor`（provenance） |
| 实体范围 | persons / groups / user-profile **+ events / topics 一级 note** |
| sources/ 性质 | **忠实渲染 lossless transcript**（不摘要） |
| skill 划分 | **动词导向**：`ingest`(fetch+render) / `recap`(distill, kind-aware 合一) / `comm-memory`(口述 CRUD + **lint 健康检查**) / `reply-coach`(消费)；connector 是 reference 模块不是 skill |
| 落地节奏 | **先设计多源抽象，只实现 lark**；wechat/slack 留文档 stub |
| connector 绑定 | skill 持**通用逻辑**；`references/connectors/<name>.md` 是运行时加载的**驱动**（固定契约 `## identity/fetch/render/send`）；`~/.memex/config.json` 是用户的**connector 注册表**（哪些启用 + `self` 身份缓存）。connector 名只出现在 skill 的 allowed-tools 权限模式里（plumbing，非逻辑） |
| reply-coach 取数 | **混合**：默认读已渲染 `sources/`，要回复的消息不在范围内则按 config 走该 connector `## fetch` 实时补拉 |
| 导航/审计文件 | 采纳 Karpathy 的 `memory/index.md`（LLM 维护的内容目录，导航用，路由仍靠 frontmatter glob）+ `memory/log.md`（append-only 活动日志 `## [date] <verb> | <源>`） |
| lint | 并入 `comm-memory` 的"健康检查"模式（不新增 skill）：孤儿 note / 缺失交叉引用 / 矛盾 / 过时 / 数据空洞，且可 impute（补全）+ 提议新 events/topics |

---

## 2. 三层架构 + connector 抽象

```
         ┌─ lark ──┐
连接器层  ├─ wechat ─┤  fetch → raw/<connector>/   render → sources/<connector>/*.md
（可插拔）└─ slack ──┘                                       │（统一渲染格式 = 集成缝）
                                                             ▼
核心层    memory/  ←  persons / groups / events / topics 的 obsidian wiki（connector 无关）
                                                             │
                                                             ▼
消费者层   reply-coach(=anti-olden) · 〔future: weekly-digest · person-brief …〕
```

**集成缝 = `sources/` 的统一 markdown 格式。** connector 各自知道怎么 fetch + render，但都吐出同一种 `sources/*.md`；下游 distill → wiki → 所有消费者 **完全 connector 无关**。加新平台 = 写一份 connector 模块，核心和消费者一行不动。

---

## 3. 数据布局

```
~/.memex/                                    （从 ~/.anti-olden/ 迁移）
├── config.json                              # connector 注册表：default_connector + connectors{lark:{enabled, self{name,id}, added_at}}
├── raw/                                      # 机器事实，按 connector 分桶；不进 git，每人独立
│   ├── lark/chats/<chat_id>/{_meta.json, <YYYY-MM>.ndjson, threads/}
│   ├── lark/transcripts/<minute_token>/{_meta.json, transcript.txt}
│   ├── lark/attachments/<file_key>.<ext>
│   └── wechat/… slack/…                      # 〔stub〕
│
├── sources/                                  # raw 的忠实 markdown 渲染（统一格式）
│   ├── lark/chats/<group-pinyin>/<YYYY-MM>.md
│   └── lark/meetings/<minute_token>.md
│
└── memory/                                   # connector 无关的 wiki
    ├── index.md                              # LLM 维护的内容目录（导航/概览，按类别列 persons/groups/events/topics 各一行摘要）
    ├── log.md                                # append-only 活动日志：## [YYYY-MM-DD] <verb> | <源描述>
    ├── user-profile.md
    ├── persons/<pinyin>.md                   # frontmatter 带跨 connector identities map
    ├── groups/<pinyin>.md                    # frontmatter 带 connector + chat_id（群是平台独立的）
    └── topics/<slug>.md                      # 话题/项目线/重大事件 hub（v2.1：无独立 events/，事件落行内#event/topics/log digest）
```

---

## 4. Connector 契约

每个 connector 在 `references/connectors/<name>.md` 里定义三件事，符合统一契约：

| 职责 | 说明 | lark（实现） | wechat/slack（stub） |
|---|---|---|---|
| **fetch** | 拉 raw → `raw/<connector>/`，含增量/checkpoint 协议 | `lark-cli` cookbook（现成） | TODO |
| **identity** | sender → 规范人物 + 本 connector 的 id 字段名 | `contact +search-user` → `lark: ou_xxx` | `wechat: wxid_` / `slack: U…` |
| **render** | raw schema → `sources/` 通用格式（遵 §5） | ndjson → md | TODO |

`references/connectors/lark.md` 由现有 `lark-cli-cookbook.md` 蒸馏而来；wechat/slack 先写"待实现"占位。

### 跨 connector 身份统一（multi-source 的核心价值）

张三在飞书 = 张三在微信。person note frontmatter 把 v1 单个 `lark_user_id` 升级成 **identities map**：

```yaml
identities:
  lark: ou_xxx
  wechat: wxid_yyy
```

- **persons 跨平台合并**：一个人一份档案，多平台 ID 都挂上。
- **groups 平台独立**：飞书群 ≠ 微信群，各自 `connector + chat_id`。
- **同一件事跨平台**：靠 `topics/` / `events/` note 把不同平台的群/人 `[[link]]` 到一起。

运行时路由：按 sender 的 `<connector>:<id>` glob `persons/*.md` 匹配 frontmatter `identities.<connector>`。

---

## 5. sources/ 渲染规格（lossless，统一格式）

### 5.1 群消息 `sources/<connector>/chats/<group-pinyin>/<YYYY-MM>.md`

```markdown
---
type: source-render
kind: chat
connector: lark
chat_id: oc_xxx
chat_name: 跨部门周会
month: 2026-05
rendered_from: raw/lark/chats/oc_xxx/2026-05.ndjson
rendered_at: 2026-05-20
---

# 跨部门周会 · 2026-05

> 忠实渲染自 raw，无损。每条消息带 `^<message_id>` 锚点供 memory 回溯。

**05-08 14:32 张三**
进度又延期了，这次是不是你们那边的问题？ ^omabc

**05-08 14:35 我**
延期是因为上游接口 5-06 才给，有记录。 ^omdef
↳ 回复 [[#^omabc]]

**05-08 14:36 张三**
[图片](../../../../raw/lark/attachments/img_v3_xxx.jpg) ^omghi
```

- block anchor 用 Obsidian `^id`，id = message_id 清洗成合法 anchor（规格固定一种清洗规则）
- reply 用 `↳ 回复 [[#^parent]]`；附件渲染成指向 `raw/` 的相对链接；媒体类型忠实标注不丢
- **幂等增量**：基于 raw ndjson 重渲染，message_id 稳定 → anchor 不变

### 5.2 会议逐字稿 `sources/<connector>/meetings/<minute_token>.md`

- 说话人 display name **归一为 `[[persons/<pinyin>]]`**（先解析 identity，解析不到保留原名 + 标记待确认）
- 填充词/打断/重复**保留**（"线下尾巴"分析靠这些）；每段发言带 `^t<序号>` 锚点
- frontmatter `participants: ["[[persons/zhang-san]]", …]`

---

## 6. memory wiki 规格

### 6.1 marker → obsidian 原生

| v1 bracket DSL | v2 obsidian 原生 |
|---|---|
| `[profile]`/`[event]`/`[behavior]`/`[strategy]` | `#profile` `#event` `#behavior` `#strategy` tag |
| `\| seen:N` `\| pattern:§N` `\| outcome:✓` `\| scenario` `\| when` `\| date` `\| source` `\| severity` `\| revised` | Dataview inline field `(seen:: N)` `(pattern:: §N)` `(outcome:: ✓)` … |
| （新）实体关联 | `[[persons/x]]` `[[groups/x]]` `[[events/x]]` `[[topics/x]]` |
| （新）provenance | `→ [[lark/chats/<群>/<月>#^anchor]]` |

4 类 type 闭合不变（profile/event/behavior/strategy），语义边界同 v1。tag 严管、inline field 自由、wikilink/anchor 按需。

### 6.2 一条 observation

```markdown
## 沟通模式
- 公开施压、把延期甩锅到我头上 #behavior (pattern:: §7) (seen:: 4) (last:: 2026-05-08, 2026-04-22) → [[lark/chats/跨部门周会/2026-05#^omabc]]
- "就事论事+当场摆数据"挡回奏效 #strategy (outcome:: ✓) (scenario:: 公开施压) (when:: 2026-05-08) → [[lark/meetings/xxx#^t0042]]
```

### 6.3 reply-coach 检索改动（逻辑不变，只换 token）

| v1 | v2 |
|---|---|
| `grep '^- \[behavior' persons/x.md` | `grep '#behavior' persons/x.md` |
| 解析 `\| seen:N`，按 seen 排序 | 解析 `(seen:: N)`，按 seen 排序 |

reinforcement / salience / dedup（W1–W5）逻辑全部不变。

---

## 7. topics 提升规则（防 note 爆炸）—— v2.1：无独立 events 类型

沿用 "未命中不自动建档"：升 `topics/` **必须用户 W4 ABCD 确认才建**，绝不静默创建。**对人保守、对事相对大方**（topics 是连接组织、低 PII）。

memex **不设独立 events 类型**（Karpathy/OpenHuman 都不设）。事件三个落点：

| 落点 | 何时 | 形式 |
|---|---|---|
| 行内 `#event` | 琐碎、单实体一次性事件 | 记在所属 person/group 的观察行,`(date:: …)` |
| 升 `topics/<slug>.md` | 跨多人跨时间反复（hotness / lint"新连接"命中），**或**单次重大事件被 ≥2 实体牵涉 | hub：参与人 `[[link]]`、关键决策、时间线（重大事件 slug 可带日期 `2026-05-08-yusuan-pingshen`） |
| `log.md` 按日 digest | "哪天发生啥"的时序流 | 按日期归档,语义化条目 + `[[link]]` |

---

## 8. skill 形态 + 受影响文件

### 8.1 skill（动词导向）

| skill | 职责 | pipeline 位置 |
|---|---|---|
| `ingest` | fetch raw + render sources（读 config 选 connector，驱动 `connectors/<name>.md`）。首次跑 bootstrap `config.json` | fetch → raw → render → sources/ |
| `recap` | distill sources → memory wiki 候选 → W1–W5 写入。**合一 kind-aware**（chat 侧重跨群频率/模式重复；meeting 侧重"线下尾巴"）。**triage 准入**：先筛信号、丢噪音，不逐条转写；大窗口用**两遍 distill**（快扫标记 → 深抽）。每次同步 `index.md` + append `log.md` | sources/ → memory |
| `comm-memory` | 口述驱动 memory CRUD，可建 events/topics；**含 lint 健康检查模式**（孤儿/缺失交叉引用/矛盾/过时/数据空洞 + impute + 提议新 note） | → memory |
| `reply-coach` | 消费者：读 wiki + sources/ context、grep `#tag`、给 3 候选 + 分支预判。**混合取数**（默认 sources/，缺则 connector fetch）。末尾 **offer 回填**所用策略 + 后续 outcome（复利） | memory ⇄ 用户 |

### 8.2 受影响文件（审定后逐个改）

| 文件 | 改动 |
|---|---|
| 目录 `anti-olden/` → `memex/` + `marketplace.json` + `plugin.json` | 重命名、version reset |
| 用户数据 `~/.anti-olden/` → `~/.memex/` | 迁移说明 |
| `references/memory-index.md` | 大改：3 层、原生 marker、events/topics、wikilink+anchor、检索换 `grep '#tag'` |
| `references/render-spec.md` | **新建**：§5 渲染格式 |
| `references/connectors/lark.md` | **新建**：由 `lark-cli-cookbook.md` 蒸馏（fetch+identity+render 契约） |
| `references/connectors/{wechat,slack}.md` | **新建 stub** |
| `references/templates/` | person 改 identities map、group 改 connector 字段、**新增 event/topic 模板** |
| `references/diff-format.md` | W4 示例换新语法 |
| `skills/ingest/SKILL.md` | **新建**（吸收 chat-recap/meeting-recap 的 fetch + 新 render 步） |
| `skills/recap/SKILL.md` | **新建/重构**（distill，kind-aware） |
| `skills/comm-memory/SKILL.md` | 改原生语法、可建 events/topics |
| `skills/reply-coach/SKILL.md` | 由 anti-olden 改名；检索换 `grep '#tag'`、混合取数、末尾 offer 回填 |
| `references/connectors/README.md` | **新建**：connector 契约（interface 四节）+ config.json 注册表说明 |
| `~/.memex/config.json` | 由 ingest 首次 bootstrap（运行时数据，非 plugin 文件） |
| `memory/index.md` + `memory/log.md` | 各写 memory 的 skill 同步维护（运行时数据） |
| `README.md` | memex 定位 + 3 层架构 + connector 抽象 |

---

## 9. 不变的东西（v1 已调好，不动）

- 写 memory 必须用户 W4 ABCD 确认（循环到 A/C）；写消息必须 dry-run
- 三种回复策略不擅自增减；"我"身份不持久化（运行时查）
- checkpoint 归 `raw/_meta.json`；8 类 olden-patterns（`(pattern:: §N)` 引用，作为 reply-coach/recap 内部参考）
- raw 不进 git、每人独立

---

## 10. 设计借鉴（Karpathy LLM Wiki + OpenHuman）

memex 借**数据模型与概念结构**，不借 OpenHuman 的**运行时机器**（无 daemon / job 队列 / SQLite / embedding / 自动 seal 级联 / 20min 调度）——后台 worker 持续做的，agent 在一次 skill 调用里做完。

| 借鉴点 | 来源 | 落地到 memex |
|---|---|---|
| 三层：raw（只读）→ canonical .md → LLM 拥有的 wiki | 两者 | `raw/` → `sources/` → `memory/`（同构，已验证） |
| **compile**：LLM 把 raw 增量编译成 wiki | Karpathy | `recap` 的本质 |
| **triage 准入**（score → admitted/dropped，不全收） | OpenHuman | recap 只提信号、丢噪音；两遍 distill 控大窗口成本 |
| **hotness 提升**（实体越热越建独立树） | OpenHuman | events/topics 提升用累积热度（`(seen::)` + link 数）表述 |
| `index.md` 内容目录 + 各文档 brief summary | Karpathy | `memory/index.md`；~100 篇规模 grep+index 不需 RAG |
| `log.md` append-only 活动日志 | Karpathy | `memory/log.md`（`## [date] <verb> | <源>`） |
| **lint**：查矛盾/孤儿/缺链 + **impute 补全** + **提议新 article** | Karpathy | comm-memory 的 lint 模式（含提议新 events/topics、用 web/contact 补全） |
| **输出回填**：每次 query 的产物 file 回 wiki，探索 add up | Karpathy | reply-coach 末尾 offer 回填策略 + outcome |
| backlinks / Obsidian 为前端 | Karpathy | `[[link]]` 喂 Obsidian backlink/graph；用户用 Obsidian 看 vault |
| **用户角色**：Karpathy "LLM 拥有 wiki，你几乎不写" | 调整 | memex 保留**用户共同作者 + W4 确认**——memex 写的是"人"，比研究笔记高敏，确认门不省 |

