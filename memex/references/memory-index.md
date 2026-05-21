# Memory 索引（memex 核心规格）

memex 的记忆是一个**透明 markdown wiki**：connector 拉来的对话先忠实渲染成 `sources/`，再提炼成 `memory/` 里"人和事"的实体 note。每条结论用 `[[...#^anchor]]` 指回 `sources/` 的原文。本文件是 memory 层的权威规格，所有 skill 共享。

## 三层 + 实际路径

| 文档里写的 | 实际位置（用户数据，可写，每人独立，不进 git） |
|---|---|
| `config.json` | `~/.memex/config.json`（connector 注册表：`default_connector` + `connectors{<name>:{enabled, self{name,id}, added_at}}`；ingest 首次 bootstrap） |
| `raw/<connector>/...` | `~/.memex/raw/<connector>/...`（机器事实：ndjson / transcript / 附件 / `_meta.json` checkpoint） |
| `sources/<connector>/...` | `~/.memex/sources/<connector>/...`（raw 的忠实 markdown 渲染，见 `render-spec.md`） |
| `index.md` | `~/.memex/memory/index.md`（LLM 维护的内容目录：导航/概览，按类别列各 note 一行摘要） |
| `log.md` | `~/.memex/memory/log.md`（**按日 digest**：时序记"哪天发生了啥"，承载事件流，见下「index.md + log.md」） |
| `user-profile.md` | `~/.memex/memory/user-profile.md` |
| `persons/<name>.md` | `~/.memex/memory/persons/<name>.md` |
| `groups/<name>.md` | `~/.memex/memory/groups/<name>.md` |
| `topics/<slug>.md` | `~/.memex/memory/topics/<slug>.md`（话题/项目线/重大事件 的统一 hub） |

**层间职责**：`raw/` = 事实真相（去重/增量/checkpoint）→ `sources/` = 确定性渲染（人可读、给锚点）→ `memory/` = LLM 提炼的画像（connector 无关）。

**实体类型（一级 note）**：`user-profile` / `persons/` / `groups/` / `topics/`。**没有独立的 `events/` 类型** —— 一次性事件用行内 `#event` 观察记在所属 person/group 里；够"热"（跨实体、反复出现）的事件/话题升成 `topics/` hub；时序"哪天发生啥"落 `log.md` 按日 digest。（设计依据：Karpathy 与 OpenHuman 都不设独立 event 类型，见 `docs/refactor-v2-obsidian-wiki.md` §7。）

**模板（只读）**：`${CLAUDE_PLUGIN_ROOT}/references/templates/{user,person,group,topic}-profile.md` —— SCHEMA / 格式参考，**不被复制**。建新档时按用户实际信号拼合适 section + observation，按模板演示的 obsidian 原生格式落到 `~/.memex/memory/...`，模板本身永不被覆盖、永不被当骨架先 cp 后填。

`~/.memex/` 不存在时由各 skill §1 前置检查统一 `mkdir -p`，详见 `conventions.md` §1。

---

## 设计原则

- **AI 和用户是共同作者。** AI 每次交互后提取观察写入；用户随时手动修正。两者同等权威，混在同一文件，不区分来源。
- **三层加载。** `user-profile.md` 始终加载 → 按当前群加载 `groups/{group}.md` → 按对话人加载 `persons/{person}.md` → 相关 `topics/` 按 `[[link]]` 顺藤摸瓜。
- **人记稳定特征，群记场景特征，话题记跨时间线/重大事件。** 同一个人在不同群的"多面性"通过群档案 + topics 索引。
- **persons 跨 connector 合并，groups 平台独立。** 张三在飞书 = 张三在微信（一份 person 档案，frontmatter `identities` 多 ID）；飞书群 ≠ 微信群（各自档案）。同一件事跨平台靠 `topics/` hub `[[link]]` 串起来。
- **身份必须落实到 connector ID。** 任何 person 的 `identities` 主键必须经 connector 的 `## identity` 解析（如 lark `contact +search-user`）得到稳定 ID，**禁止只凭显示名/代号建档**；解析不到则标"待确认"不硬建（见检索 R0）。
- **渐进累积。** 第一次只写最小 frontmatter + 一条观察；不预填空 section。
- **可被推翻。** Memory 是"写入时的认知"，新信息冲突就更新原条目，不死守旧结论。
- **connector 无关。** memory 层只认 `sources/` 渲染出的统一格式，不关心数据来自哪个平台。

---

## Memory 内容边界

正文只写**自然语言** + obsidian 原生标记。**技术 ID 不进正文**，进 frontmatter：

- person frontmatter 带 **identities map**（跨 connector）：
  ```yaml
  identities:
    lark: ou_xxx
    wechat: wxid_yyy
  ```
- group frontmatter 带 **connector + chat_id**（平台独立）：`connector: lark` / `chat_id: oc_xxx`
- **"我"自己的身份不持久化** —— 运行时查（lark：`lark-cli auth status --format json | jq -r '.userOpenId'`）；可缓存进 `config.json` 的 `self`。
- **拉取状态（`last_fetched_*`）不进 memory** —— 归 `raw/<connector>/chats/<id>/_meta.json`。

**正文 section 自由，frontmatter 字段固定。** 模板里的 `## 沟通风格` 等是参考骨架不是 schema；每份档案按真实特点增删 section。沿用文件既有 section，新观察无处落就新开一个并在 W4 跟用户确认。

---

## Observation 格式（obsidian 原生）

每条 observation 是 section 下的一行 list 项：

```markdown
- <自然语言描述> #<type> (key:: val) (key:: val) → [[<provenance 锚点>]]
```

四个组成，下游各取所需：

| 维度 | 形式 | 闭合/自由 | 用途 | 谁管 |
|---|---|---|---|---|
| **type** | `#profile` `#event` `#behavior` `#strategy` tag | **4 类严管** | 跨文件 `grep '#behavior'` 分类 / salience | 模型严守，不擅自新增 |
| **kv** | Dataview inline field `(seen:: 4)` | 完全自由 | 出现就利用 | 模型按需加 |
| **实体关联** | `[[persons/x]]` `[[groups/x]]` `[[topics/x]]` | 按需 | 织 wiki graph / backlinks | 模型按需加 |
| **provenance** | `→ [[<connector>/chats/<群>/<月>#^anchor]]` | 按需（消息/会议来源强烈建议带） | 回溯到 sources/ 原文 | 模型尽量带 |

> 同一份既喂 Obsidian 原生 tag pane / Dataview query，又喂我们的 `grep` 和 reply-coach。`#tag` 在行尾或描述中皆可被 grep 命中；inline field 用 `(key:: val)` 圆括号形式（Obsidian Dataview 认）。

### 4 类 type 语义边界

```
#profile  ── 静态特征 / 角色 / 关系 / 风格 / 雷区 / 兴趣 / 权力位置
             （持久；变化时改原条目而非新增）
#event    ── 一次性事件（必带 (date:: YYYY-MM-DD)）；行内记在所属 person/group 里，
             不单独立 note（够热则升 topics/，见「topics 提升」）
#behavior ── 模式命中（必带 (pattern:: §N) (seen:: N) (last:: dates)）
             pattern 引用 olden-patterns.md 的 8 类编号
#strategy ── 策略验证（必带 (outcome:: ✓/✗) (scenario:: X) (when:: Y)）
```

**type 闭合理由**：reply-coach 要 `grep '#behavior'` 拿模式历史、`grep '#strategy'` 拿过往验证。type 漂流会让下游 grep 失效。新增 type 只走"用户对齐流程"，不允许模型 reactive 新建。不贴 4 类的 → 塞最近 type + 用 KV/section 名补语义。

### inline field 常见键（自由扩展）

```
(date:: YYYY-MM-DD)        #event 必填
(pattern:: §N)             #behavior 必填；引用 olden-patterns.md 编号
(seen:: N)                 #behavior 必填；累积命中次数（reinforcement count）
(last:: d1, d2)            #behavior 必填；最近命中日期
(outcome:: ✓/△/✗)         #strategy 必填
(scenario:: <标签>)        #strategy 必填
(when:: YYYY-MM-DD)        #strategy 必填（long-term = 长期反复）
(source:: 消息/会议/转录/口述)  observation 来源（让用户审时一眼分辨）
(severity:: high/medium/low)  雷区/事件严重度
(revised:: YYYY-MM-DD)     修订日期；改原 entry 时加 + 一行括号备注
(one-off:: true)           临时性 event 标记
```

### Reinforcement: update vs new entry

每次写入前 AI **自己读现有档案做语义 dedup**（不引入向量/fuzzy，靠 LLM 判断）：

| 候选 | 现有有近似？ | 怎么写 |
|---|---|---|
| `#behavior` 同 pattern | 有 | **update**：`(seen:: N→N+1)` + last 追加日期 |
| `#behavior` 同 pattern | 无 | new entry |
| `#event` 同 date+场景 | 有 | 跳过 |
| `#event` 不同 date/新场景 | / | new entry |
| `#strategy` 同 scenario+when | 有 | 跳过 |
| `#strategy` 新场景/新 outcome | / | new entry |
| `#profile` 语义重复 | 有 | 改原条目/合并（不堆冗余） |
| `#profile` 跟现有有出入 | 有 | **改原条目** + `(revised::)` + 括号说明（不留旧版本） |
| `#profile` 新维度 | 无 | new entry |

### 修订 / break-change

发现旧记录有偏差 → **直接改原 entry**：改正文 + 必要时改字段 + 加 `(revised:: YYYY-MM-DD)` + 末尾一行括号备注原因。**不**保留旧条目并新增 follow-up，**不**复制旧条目到 "## 历史认知"。审计靠 git diff + `(revised::)`。

---

## topics 提升规则（防 note 爆炸 —— 热度驱动）

借 OpenHuman 的 hotness + Karpathy 的"LLM 自由长文章节点"。**memex 不设独立 events 类型**：值得成为图谱节点的"事/线/重大事件"统一升成 `topics/<slug>.md` hub。

| 默认落点 | 升 `topics/` 的触发（hotness） |
|---|---|
| 一次性、单实体的事 → 行内 `#event` 记在 person/group | 跨多人/多群、反复出现的话题或项目线（lint 的"新连接"检查命中：多实体在某语境反复共现）；或单次重大事件被 ≥2 实体牵涉；或用户显式要求 |

- **判定"热"靠 LLM 语义判断**（不引入打分算法）：是否跨实体反复共现 / 是否被多条 observation 当 scenario 锚点 / `(seen::)` 与 link 数累积。
- **升 topics 必须用户在 W4 ABCD 确认才建，绝不静默创建。** 对人保守（身份高敏），**对事相对大方**（topics 是连接组织、低 PII，倾向于建 + 事后可删）。
- `topics/<slug>.md` = hub：参与人 `[[persons/x]]`、相关群 `[[groups/x]]`、关键决策、时间线；不重复抄各档案细节，给指针。
- 凡涉及某 topic 的 person/group 观察，都 `[[topics/x]]` 链过去（双向可达）。
- 时序"哪天发生啥"的流水**不进 topics**，落 `log.md` 按日 digest。

---

## Maintenance：老 entry 清理

任何写入 skill 在 W2 dedup 时**顺带扫现有档案**找符合清理条件的老 entry，**在 W4 同一轮 ABCD 里**一并问用户（不单独跑清理流程）。

触发条件（任一命中即建议）：
- 行内 `#event (one-off:: true)` **且** date 距今 > 30 天
- 普通行内 `#event` **且** date 距今 > 6 个月 **且** 没被任何 `#strategy` 引用作 scenario 锚点
- `#behavior` 的 `(last::)` 最近一次距今 > 6 个月（模式退潮）

**不自动清理**：`#profile`（稳定特征不过期）、`#strategy`（历史教训长期有效）。永远用户确认才删。

---

## 运行时路由（索引即 frontmatter，不维护集中表）

- **按 sender 查人物**：拿到 `<connector>:<id>` → glob `~/.memex/memory/persons/*.md` → 读 frontmatter `identities.<connector>` 匹配。命中 Read；未命中**不自动建**。
- **按 chat 查群**：glob `groups/*.md` → 匹配 frontmatter `connector` + `chat_id`。未命中**不自动建**。
- **顺藤摸瓜话题**：person/group 命中后，跟着正文里的 `[[topics/x]]` link 加载相关 hub。

---

## 检索顺序 + 按 type grep

### R0. 身份落实（建/认人前必做）
拿到的若是显示名/代号（非稳定 ID）→ 先经 connector `## identity` 解析成 `<connector>:<id>`（lark：`contact +search-user --query "<名>"`），再走 R1 路由 / 建档。解析不到 → 标"待确认"，不凭名字硬建 person。

### R1. 三层定位
1. 始终加载 `user-profile.md`（不存在软提示先跑 comm-memory，不阻塞）
2. 群命中 → Read `groups/<x>.md`
3. sender 命中 → Read `persons/<x>.md`
4. 跟 `[[link]]` 加载相关 `topics/`

### R2. 按 type grep 抓结构化证据（reply-coach 主战场）

```bash
grep '#profile'  ~/.memex/memory/persons/<X>.md   # 稳定特征/雷区/关系
grep '#behavior' ~/.memex/memory/persons/<X>.md   # 拿 (pattern:: §N)(seen:: N)，按 seen 倒序 = 最稳模式
grep '#strategy' ~/.memex/memory/persons/<X>.md   # outcome:: ✓ 优先复用，✗ 避开
grep '#event'    ~/.memex/memory/persons/<X>.md   # 按 date 倒序拿最近 1-3 条
```

**收益**：拿到的是"累积 N 次命中、最近 5-08"（in-band）而非窗口内手算；过往 strategy outcome ✓/✗ 直接拿到，不用读完整档案推理。

---

## 所有 memory 写入的通用流程（W1–W5，不要跳）

无论 comm-memory（口述）/ recap（sources 提炼），写入流程统一：

### W1. Type 分类 + KV 补全
模型给每条候选打 `#type` + 必填 inline field（见上 4 类）。

### W2. Dedup（LLM 语义判断，不算法）
Read 目标档案 → 对每条候选判**新发现 / 强化 / 出入**（见上表）。同时扫老 entry 找清理候选。

### W3. Section 归位 + 提升判断
优先复用文件已有 section（先 `grep '^## '`）；都不贴切 → 新开 section（W4 显式标记让用户审）。想改名/合并已有 section → AI 建议，**必须 W4 用户确认**，不静默改。同时判断是否有内容达到 `topics/` 提升条件（热度，见上）——达到则在 W4 一并提议建 topic。

### W4. 自然语言展示 + AskUserQuestion 合一步
**不**给用户看 markdown diff / `seen:: N→N+1`。给用户看用人话讲的故事，分 3 段（+ 可选清理段 + 可选 topic 提议）：

```
看了 <数据源描述>，跟 <目标档案> 对了一下：

**有几条新东西**（之前没记的）
1. …（可附证据 / [[provenance]]）

**现有认知又被验证了几次**
1. …（"X 模式 14 天又触发 3 次，累积已 N 次"）

**有几条跟之前认知有点出入**
1. …（"档案写 A，回看实际是 B，建议改 / 加 revised"）

**顺便，档案里有几条老 entry 看着可以清了**（命中 Maintenance 条件才出）
1. …

**这条线/这件事好像值得单独成页了**（达到 topics 提升条件才出）
1. …（"张三和李四在'预算'上反复掐，要不要建 topics/...，把人和事串起来"）

我落档之前你看下：
A. 全部按这个落（含清理 / 建 topic）  B. 让我改一下  C. 都不动  D. 我先补一段口述
```

**调 `AskUserQuestion` 工具**给 ABCD：
- A → W5 真写 + 真清理 + 真建 topic
- B → 用户口述改哪条 → 重算 → 回 W4 重展示 → 循环直到 A/C
- C → 跳过写入 + 清理 + 提升
- D → 用户补口述（标 `(source:: 口述)`）→ 融合进候选 → 重算 W1-W3 → 回 W4

**多文件分别确认**：同时写 `persons/X` + `groups/Y` + `topics/Z` 时各自一轮 ABCD，不打包。

### W5. Edit/Write + frontmatter 同步
- 新条目 → Edit 在 section 末尾追加 / Write 新文件（含建 `topics/` hub + 在相关档案补 `[[topics/x]]` link）
- update → Edit 改 entry（inline field + 必要时正文）
- 修订 → 改原 entry + `(revised::)` + 括号备注
- frontmatter `last_updated` 同步；person `interaction_count += N`
- **永远不改** `${CLAUDE_PLUGIN_ROOT}/references/templates/`

### 为什么没有"只更 checkpoint"选项
IO 状态归 `raw/<connector>/chats/<id>/_meta.json`，ingest 拉消息时就地 bump，不需用户确认。用户选 C 不影响下次增量起点。

---

## 谁写什么（写权限边界）

| 写入目标 | reply-coach | ingest | recap（sources 提炼） | comm-memory（口述） |
|---|---|---|---|---|
| `user-profile.md` 正文 | ❌ | ❌ | ❌（"我"不从对话反推） | ✅ |
| `persons/*.md` | ❌ | ❌ | ✅（消息 + 会议"线下尾巴"） | ✅ |
| `groups/*.md` | ❌ | ❌ | ✅（chat kind） | ✅ |
| `topics/*.md` | ❌ | ❌ | ✅（达提升条件，用户确认） | ✅ |
| `index.md` / `log.md` | ❌ | ❌ | ✅（落档后同步） | ✅（落档后同步） |
| `sources/<connector>/...` | ❌ | ✅（渲染写入，含 sender roster） | ❌ | ❌ |
| `raw/<connector>/...` + `_meta.json` | ❌ | ✅（拉取 + bump） | ❌ | ❌ |

**ingest 只碰 raw/ + sources/ + config.json，不写 memory。** distill（recap）从 sources/ 提炼才写 memory，且全部受 W1–W5 + 用户 ABCD 约束。

---

## 命名约定

- 人物：`persons/<name-pinyin>.md`；同名冲突 `persons/<pinyin>_<id 后 6 位>.md`。`identities` map 是唯一主键，姓名仅显示。
- 群组：`groups/<group-name-pinyin>.md`；群名不明确用 `groups/<chat_id>.md`。
- 话题：`topics/<slug>.md`（重大一次性事件也走这里，slug 可带日期如 `2026-05-08-yusuan-pingshen`）。

---

## Distill triage（recap 准入，不逐条转写）

借 OpenHuman 的 score→admitted/dropped：**大多数消息是噪音**（"收到/ok/好的"、物流贴图、纯寒暄）。recap 从 `sources/` 提炼时**先筛信号、丢噪音**，只把有信号的内容提成 observation —— 不要逐条转写整个对话。

- **大窗口两遍 distill**（活跃群半年几千条）：先快扫 `sources/` 标记"哪几段有信号"（便宜），再只对标记段深抽 observation（贵）。镜像 fast-score / deep-score，省 token 又不漏。
- 判定"有信号"靠 LLM 语义判断（不引入打分算法）：是否揭示某人的稳定特征 / 模式命中 / 策略效果 / 重大事件。

### Distill 三条防瞎猜铁律（血泪教训）

1. **承重证据在手才下结论**：一条 observation 若依赖某张图/某条媒体，**证据必须在手**——sources 有 caption 就用，没有就**先下载 Read 那张图再说**。**绝不在"未看的图"旁边对其内容下断言**（render-spec 已要求 ingest 给图配 caption；若遇到裸 `[图片]` 占位，自己补看）。〔反例：「戒不掉啊戒不掉」+ 一张没看的图 → 脑补成"抽烟"，图其实是 ChatGPT Pro 订阅页。〕
2. **personal-habit 类 `#profile` 需佐证或标推测**：从单条玩笑/闲聊推出来的个人习惯（抽烟/作息/嗜好…），**要么不落，要么标 `(source:: 推测)` 等佐证**。`#behavior/#strategy` 有 pattern/seen/outcome 硬字段相对收敛；`#profile` 最容易被一句俏皮话带偏。
3. **不透明黑话 token 降置信，不收编进假设**：看不懂的梗/缩写（"少吸点二"的"二"）应**降低**结论置信度，而不是被强行解读来支持已有假设。

---

## index.md + log.md（导航 + 事件流）

借 Karpathy（index/log）+ OpenHuman（daily digest）。**路由仍靠 frontmatter glob**（精确定位文件）；这俩是**导航 + 时序**，职责不同。

### `memory/index.md` —— 内容目录（LLM 维护）
按类别列 persons / groups / topics，每个 note 一行摘要 + `[[link]]`。agent 在 grep 前先读它定向"我对谁建了档、有哪些话题"。任何 skill 写/删 memory note 后**同步更新对应行**。漂移由 lint 自愈（见下）。

```markdown
## Persons
- [[persons/zhang-san]] —— 跨部门周会强势方，公开施压 ×4，就事论事策略 ✓
## Topics
- [[topics/zhifu-zhonggou]] —— 支付重构项目线，张三/李四，2026 Q1–Q2
```

### `memory/log.md` —— 按日 digest（事件流）
**承载"事件"的时序层**（取代独立 events 类型）。每次 ingest / recap / comm-memory 操作后，把"这次涉及哪天、发生了啥、牵涉谁"按日 append 成语义化条目（不是纯改动流水），便于"memex 最近 / 那几天学到啥、发生啥"回看：

```markdown
## [2026-05-08] 跨部门周会 · 预算评审
- 张三公开施压把延期甩锅给我（#behavior §7 seen→4）；当场摆数据挡回 ✓ → [[persons/zhang-san]]
- 李四私下中立、附和张三 → [[persons/li-si]]
- 关联线：[[topics/zhifu-zhonggou]]
```

按日期组织、只追加；一天可多条。它是可读的时间轴 changelog，不进 git 也不影响。

---

## Lint（健康检查，并入 comm-memory）

借 Karpathy。comm-memory 的"健康检查"模式（用户喊"体检下我的 memex"触发），扫全 `memory/`：

| 检查 | 例 | 处置 |
|---|---|---|
| 孤儿 note | 某 person 没有任何 note `[[link]]` 它，也不在 index.md | 提议归档或补链 |
| 缺失交叉引用 | topic 正文提到张三却没 `[[persons/zhang-san]]` | 提议补 `[[link]]` |
| 矛盾 | 两条 `#profile` 互斥 | 提议改原条目 + `(revised::)` |
| 过时 | 命中 Maintenance 清理条件 | 提议清理 |
| 数据空洞 | person 只有 ID 没画像 / 未解析身份的说话人 | 提议 impute（contact 搜补全 / web 查） |
| **新连接（= topics 提升候选）** | 张三+李四反复在"预算"语境共现 | **提议建新 topic**（hotness 提升） |

lint 产出报告后**走 W4 ABCD 确认**才改 —— 不静默修。index.md 在 lint 时一并重建对账（自愈漂移）。
