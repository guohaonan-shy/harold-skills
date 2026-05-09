# Memory 索引

## 实际路径（plugin 模式）

本文中所有形如 `user-profile.md` / `persons/*.md` / `groups/*.md` / `raw/chats/...` 的相对路径，**运行时落位**：

| 文档里写的 | 实际位置（用户数据，可写） |
|---|---|
| `user-profile.md` | `~/.anti-olden/memory/user-profile.md` |
| `persons/<name>.md` | `~/.anti-olden/memory/persons/<name>.md` |
| `groups/<name>.md` | `~/.anti-olden/memory/groups/<name>.md` |
| `raw/chats/<id>/...` | `~/.anti-olden/raw/chats/<id>/...` |
| `raw/attachments/<key>` | `~/.anti-olden/raw/attachments/<key>` |
| `raw/transcripts/<token>/` | `~/.anti-olden/raw/transcripts/<token>/` |

**模板（只读）**：`${CLAUDE_PLUGIN_ROOT}/references/templates/{user,person,group}-profile.md` —— SCHEMA / 格式参考，**不被复制**。建新档时 AI 按用户实际信号拼合适 section + entry，按 templates 演示的 inline 格式落到 `~/.anti-olden/memory/...`，模板本身永不被覆盖、永不被作为档案"骨架"先 cp 后填。

`~/.anti-olden/` 不存在时由每个 skill §1 前置检查统一 `mkdir -p`，详见 `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` §1。

---

## 设计原则

- **AI 和用户是共同作者。** AI 在每次交互后自动提取观察写入；用户随时手动修正或补充。两者同等权威，混在同一文件里，不区分来源——跟 Claude Code 的 memory.md 同一思路。
- **三层加载。** `user-profile.md` 始终加载 → `groups/{group}.md` 按当前群加载 → `persons/{person}.md` 按对话人加载。
- **人档案记稳定特征，群档案记场景特征。** "张三 ego 高、看数据"放 person file；"张三在跨部门群收着"放 group file。同一个人在不同群的"多面性"通过群档案索引。
- **渐进累积。** 第一次交互只写最小 frontmatter + 一条观察；不预填空 section。
- **可被推翻。** Memory 是"写入时的认知"，新消息明显冲突就更新，不死守旧结论。

---

## Memory 内容边界

Memory 文件（`user-profile.md` / `persons/*.md` / `groups/*.md`）的**正文**只写**自然语言描述**——我是谁、某人什么风格、这个群什么氛围。

**技术 ID（`lark_user_id` / `chat_id` / `app_id`）不进正文**，只作为结构化元数据进 **frontmatter**（见 templates/），或编码在文件名里。正文是供人读、供 Agent 理解语境的；ID 是路由用的机器字段。

**当前用户自己的身份不持久化**——运行时查 `lark-cli auth status --format json` 拿 `userOpenId`（详见 cookbook "查当前用户身份"）。不把 ou_id / app_id 写进 `user-profile.md`。

**正文 section 自由，frontmatter 字段固定。** Template 里列的 `## 沟通风格` / `## 群氛围` 等是**参考骨架，不是 schema**——每份档案可以按对方/该群的真实特点增删改 section（老板档案 vs 同事 vs 朋友 section 应不同）。AI 不要为"符合模板"强行填空或漏填；也不要在已有档案里乱改 section 结构——**沿用该文件既有的 section**，新观察无处可落就新开一个 section 跟用户确认。只有 frontmatter 机器字段（`lark_user_id` / `chat_id` / `last_updated`）是必守的。**拉取状态（`last_fetched_*`）不在 memory frontmatter 里**——归 `raw/chats/<chat_id>/_meta.json`（见下文 §"Checkpoint 归属"）。

---

## Observation 三维度（section / type / KV）

每条 observation 是档案里 `## ...` section 下面的一行 list 项，长这样：

```
- [type | kv1:val | kv2:val] 自然语言描述
  （可以多行，可以包含说明 / 引用 / 备注）
```

**三维度独立运转**，下游 skill 各取所需：

| 维度 | 闭合 / 自由 | 用途 | 谁管 |
|---|---|---|---|
| **section 名**（`## XXX`） | 完全自由 | 给人读的主题分组 | AI + 用户合作起名 |
| **type**（4 类闭合） | **严管** | 跨文件 grep / 分类 / salience 累积 | 模型严守，不擅自新增 type |
| **KV 元数据**（`\| key:val`） | 完全自由 | 出现就利用，不强制 | 模型按需加 |

### 4 类 type 的语义边界

```
profile  ── 静态特征 / 角色 / 关系 / 风格 / 雷区 / 兴趣 / 权力位置
            （持久；变化时**改原条目**而非新增）
event    ── 一次性事件（必带 date KV）
behavior ── 模式命中（必带 pattern:§N + seen:N + last:dates）
             pattern:§N 引用 olden-patterns.md 里的 8 类编号
strategy ── 策略验证（必带 outcome:✓/✗ + scenario + when）
```

**type 闭合理由**：reply-coach 要 grep `\[behavior\]` 拿模式历史、grep `\[strategy\]` 拿过往验证——type 漂流（一文件 `[event]` 另一文件 `[incident]`）会让下游 grep 失效，等于打了 type 跟没打一样。新增 type 只走"用户对齐流程"（半年级别周期），不允许模型 reactive 自己新建。

碰到不贴 4 类的 → **塞最近的 type + 用 KV / section 名补充语义**（例：临时一次性备注塞 `[event | one-off:true]`，关系背景塞 `[profile | source:口述]`）。

### KV 常见键（自由扩展）

```
date:YYYY-MM-DD          event 必填；observation 发生日期
pattern:§N               behavior 必填；引用 olden-patterns.md 编号
seen:N                   behavior 必填；累积命中次数（reinforcement count）
last:dates               behavior 必填；最近 N 次命中日期，逗号分隔
outcome:✓/△/✗           strategy 必填；策略效果
scenario:<场景标签>       strategy 必填；适用场景
when:YYYY-MM-DD          strategy 必填；策略试用日期（long-term 表示长期反复）
source:口述/消息/会议/转录   observation 来源（让用户审时一眼分辨"这是 AI 从消息提的还是我口述的"）
severity:high/medium/low  雷区 / 事件严重度
revised:YYYY-MM-DD        修订日期；旧条目内容有偏差时**直接改原 entry** 并加这个 KV
                          + 一行括号备注说明改的原因（保留 audit trail）
mode:增量/冷启动            近期简报条目用，标这条来自哪种拉取模式
one-off:true              临时性 event 标记（建议不长期保留）
```

### Reinforcement: update vs new entry

每次新增观察前，AI **自己读现有档案做 dedup 判断**（不引入向量 / fuzzy 匹配算法，靠 LLM 语义判断）：

| 候选观察 | 现有档案有近似条目？ | 怎么写 |
|---|---|---|
| `[behavior]` 同 pattern:§N | 有 | **update**：`seen:N → N+1` + last 追加新日期 |
| `[behavior]` 同 pattern:§N | 无 | **new entry** |
| `[event]` 同 date + 同场景 | 有 | **跳过**（已记过） |
| `[event]` 不同 date 或新场景 | / | **new entry** |
| `[strategy]` 同 scenario + when | 有 | **跳过**（已记过） |
| `[strategy]` 新场景 / 新 outcome | / | **new entry** |
| `[profile]` 内容近似（语义重复） | 有 | **改原条目**或合并表述（不堆冗余 profile）|
| `[profile]` 跟现有有出入 | 有 | **直接改原条目** + revised KV + 括号说明（**不**保留旧版本作冗余）|
| `[profile]` 新维度 | 无 | **new entry** |

### 修订 / break-change 规则

发现旧记录有偏差（"回看消息其实柔和推进当时被解读成认怂"）→ **直接修改原 entry**：
- 改条目正文 + 必要时改 outcome / KV 字段
- 加 `revised:YYYY-MM-DD` KV 标修订日期
- 在条目末尾加一行括号备注，说明改的原因

**不**做这两件事：
- ❌ 保留旧条目同时新增 follow-up（冗余、跨时间矛盾）
- ❌ 把旧条目复制到 "## 历史认知" section 当 changelog（git diff 已经是 changelog）

审计追踪靠 git diff（如果用户把 `~/.anti-olden/memory/` 进了 private repo）+ revised KV 的日期。这两个组合够用。

---

## Maintenance: 老 entry 的清理

memory 是渐进累积的，但有些 entry 本身就是临时性的 / 时效性的，长期堆积会让档案变成"无差别历史日志"。任何写入 skill（comm-memory / chat-recap / meeting-recap）在 W2 dedup 时**顺带扫一遍现有档案**找符合清理条件的 entry，**在 W4 同一轮展示 + ABCD 里**一并问用户——**不**单独跑一轮清理流程，合并到写入决策更简洁。

清理建议在 W4 展示三段后单独成段（参见上文 "W4. 自然语言展示 + AskUserQuestion 合一步"）：

```
**顺便，档案里有几条老 entry 看着可以清了**

1. [event | date:2026-01-12 | one-off:true] 上次出差忘记带充电器 ——
   一次性事件，距今已 4 个月，对未来分析没参考价值
2. [behavior | pattern:§7 | seen:2 | last:2025-09 ...] 公开施压 ——
   最近一次距今 8 个月，模式已退潮
```

ABCD 决策**统一覆盖**写入 + 清理两件事——A 全部按这个落（含清理）/ B 改（用户可以分别说"写入按 A、清理只清第 1"）/ C 都不动 / D 先口述。

### 清理触发条件（任一命中即建议清理）

- `[event | one-off:true]` **且** `date` 距今 > 30 天
- `[event]` 普通事件 **且** `date` 距今 > 6 个月 **且** 没被任何 `[strategy]` 引用作 scenario 锚点
- `[behavior]` `seen:N` 但 `last:` 最近一次距今 > 6 个月（模式退潮 → 已不是当前规律）

**注意：**
- `[profile]` 永远不自动建议清理（稳定特征不过期）
- `[strategy]` 永远不自动建议清理（历史教训长期有效）
- 自动建议永远要用户确认才执行——不静默删

---

---

## 运行时路由（不维护集中索引）

Skill 需要定位某条消息对应的 person/group 文件时：
- **按 sender 的 `lark_user_id` 查人物** → `glob persons/*.md` → 读每个文件 frontmatter 的 `lark_user_id` 字段匹配
- **按 chat_id 查群** → `glob groups/*.md` → 读 frontmatter 的 `chat_id` 字段匹配

不维护一个集中的路由表（容易跟实际文件漂移）。索引即文件 frontmatter。

---

## 所有 memory 写入的通用流程（W1–W5，**不要跳**）

无论是 comm-memory（口述驱动）、chat-recap（消息驱动）、还是 meeting-recap（转录驱动），**写入流程统一**：

### W1. Type 分类 + KV 补全

模型给每条候选观察打 `[type | kv...]`：
- 静态特征 / 关系 / 雷区 / 风格 → `[profile]`
- 一次性事件 → `[event | date:YYYY-MM-DD]`
- 模式命中 → `[behavior | pattern:§N | seen:N | last:dates]`
- 策略验证 → `[strategy | outcome:✓/✗ | scenario:X | when:Y]`

### W2. Dedup 判断（LLM 语义判断，不算法）

模型 Read 目标档案 → 对每条候选判**新发现 / 强化 / 出入**（参见上文 "Reinforcement: update vs new entry" 表）。

**关键**：dedup 由 LLM 直接读现有 entry 的自然语言描述做语义判断，**不引入** embedding / 关键词 fuzzy 匹配。模型有这个能力。

### W3. Section 归位

- 优先复用文件**已有的 section 名**（先 grep `^## ` 拿现有 section list）
- 都不贴切 → **新开 section**（在 W4 展示时显式标记"建议新开 section: `## XXX`"，让用户审）
- 已有 section 名起得不贴切想改名 / 合并 / 拆分？**AI 可以建议**，但**必须经用户在 W4 展示里确认**才能改——不静默改。建议格式："建议把 `## XXX` 改名为 `## YYY`，因为现在条目实际涵盖的维度是 ZZZ（理由）"

### W4. 自然语言展示 + AskUserQuestion 合一步

**不**给用户看 markdown diff / `[更新]` / `seen:N → N+1` 这种底层 marker——那些是模型 Edit 时自己用的。

**给用户看的是用人话讲的故事**，分 3 段（标题用对话语气，不严肃）：

```
看了 <数据源描述>，跟 <目标档案> 对了一下：

**有几条新东西**（档案里之前没记的）

1. <自然语言描述新观察 1，可附证据 / 引用消息>
2. <...>

**现有认知又被验证了几次**

1. <"X 模式 14 天又触发 3 次，累积已 N 次，是稳定模式不是偶发">
2. <...>

**有几条跟之前认知有点出入**

1. <"档案里 X 写的是 A，回看实际是 B，建议改 / 加 revised">
2. <...>

我落档之前你看下：
A. 全部按这个落
B. 让我改一下（说哪条要怎么改）
C. 不落
D. 我先补一段口述（口述完合并再展示）
```

**清理建议跟写入展示一起出（一轮 ABCD）**：W2 dedup 时模型顺带扫现有档案，找符合下文 "Maintenance" 触发条件的老 entry。如果有，**在三段叙述末尾加一段独立的清理建议**（不混进三段）：

```
**顺便，档案里有几条老 entry 看着可以清了**

1. ...（建议清理 entry 1）
2. ...

[空行]
我落档之前你看下：
A. 全部按这个落（含清理建议）
B. 让我改一下（说写入或清理哪条要怎么改）
C. 都不动（既不写也不清）
D. 我先补一段口述
```

**调 `AskUserQuestion` 工具**给 ABCD（不是文本让用户打 A/B/C/D）：
- **A. 全部按这个落** → W5 真写盘 + 真清理
- **B. 让我改一下** → 用户口述写入 / 清理哪条改（"写入按 A，但清理只清第 1 条" / "写入要改 Y，清理都不执行" 都行）→ 模型重算 diff → 回 W4 重新展示 → 再 AskUserQuestion → **循环直到 A 或 C**
- **C. 都不动** → 跳过本次写入 + 跳过清理
- **D. 我先补一段口述** → 用户自由输入补充内容 → 模型把口述融合进候选观察列表（标 `source:口述`）→ 重算 W1-W3 → 回 W4 重新展示 → 再 AskUserQuestion

**多文件分别确认**：同时写 `persons/X.md` + `groups/Y.md` 时，各文件的展示 + ABCD **独立一轮**，不要打包"全部 yes/no"——用户可能群档案 OK 但人档案还想改。

### W5. Edit / Write + frontmatter 同步

- 新条目 → Edit 在对应 section 末尾追加 / Write 新文件
- update 现有 entry → Edit 改 entry 行（KV 字段 + 必要时正文）
- 修订 break-change → 直接改原 entry，加 `revised:YYYY-MM-DD` + 括号备注
- frontmatter `last_updated` 同步更新；person 档案 `interaction_count += N`
- **永远不改** `${CLAUDE_PLUGIN_ROOT}/references/templates/`

### 为什么没有"只更 checkpoint"选项

双层架构下 IO 状态（`last_fetched_*`）属于 `~/.anti-olden/raw/chats/<id>/_meta.json`，chat-recap / meeting-recap 拉消息时**就地**自动 bump，不需要用户确认。用户选 C（不写 memory）不影响下次增量起点——raw 已经吃过这批消息。

memory 是 AI + 用户共同作者的产物；用户必须有"我说了算 + 我能改"的纠偏权。

---

## 谁写什么（写权限边界）

**驱动源不同**：
- **chat-recap = IM 消息驱动**：从 `lark-cli im` 拉到的飞书 IM 消息（群 / DM）里提炼观察 → 候选写入
- **meeting-recap = 会议转录驱动**：从 `lark-cli vc +notes` 拉到的妙记转录里提炼观察 → 候选写入
- **comm-memory = 用户口述驱动 + clarifier**：依赖用户口述，主动 AskUserQuestion 追问获取上下文。**不拉消息也不拉转录**。复合意图（"基于最近聊天给 X 建档"）→ 建议用户先跑 `/chat-recap` 或 `/meeting-recap`

| 写入目标 | reply-coach | chat-recap（IM 消息） | meeting-recap（会议转录） | comm-memory（口述） |
|---|---|---|---|---|
| `user-profile.md`（正文） | ❌ | ❌（"我"不该从群聊反向推）| ❌（同上）| ✅ |
| `persons/*.md`（正文 + frontmatter） | ❌ | ✅（消息观察）| ✅（会议"线下尾巴"）| ✅ |
| `groups/*.md` → `群氛围` / `关键人物` / `注意事项` | ❌ | ✅（消息观察）| △（仅当会议=该群常规会议）| ✅ |
| `groups/*.md` → `话题基线` / `近期简报` | ❌ | ✅（冷启动 / 增量）| ❌（不汇总群话题）| ✅ |
| `raw/chats/<id>/_meta.json` → `last_fetched_*` | ❌ | ✅（拉消息自动 bump）| ❌（不拉 IM）| ❌ |
| `raw/transcripts/<token>/` | ❌ | ❌ | ✅（拉转录写入）| ❌ |

**所有写入都受上面"通用规则"约束**——经用户 ABCD 选 A 才写，选 C 要循环改。

为什么 chat-recap / meeting-recap 也能写人档案？因为群聊和会议本身就是观察人的主要场。"张三这两周在 X 群密集吐槽 Y" 或 "张三在 5-08 Kickoff 被追问就坦白" 这种观察直接写到 `persons/zhang-san.md` 的某个段更自然，而不是让用户事后用 comm-memory 口头再报告一遍。

---

## Checkpoint 归属于 raw/_meta.json

**不再在 memory frontmatter 里存 `last_processed_*`**。IO 状态（拉到哪里了）归 raw 层：

- `raw/chats/<chat_id>/_meta.json` 的 `last_fetched_at` / `last_fetched_message_id`
- chat-recap 拉消息时自动 bump，不走用户确认
- 冷启动触发条件不变：`_meta.json` 不存在 / `last_fetched_at` 距今 > 30 天 → 冷启动默认拉近 **14 天**

memory 文件专注承载"画像"，IO 状态不污染正文和 frontmatter。

---

## 命名约定

### 人物
- 默认：`persons/<name-pinyin>.md`（例：`zhang-san.md`）
- 同名冲突：`persons/<name-pinyin>_<ou_id 后 6 位>.md`（例：`zhang-san_abc123.md`）
- `lark_user_id` 是唯一主键，姓名仅用于显示

### 群组
- 默认：`groups/<group-name-pinyin>.md`（例：`chanpin-jishu-zhouhui.md`）
- 群名不明确时：`groups/<chat_id>.md`

---

## 检索顺序 + 按 type grep

### R1. 三层定位（顺序不变）

处理一条消息时：
1. **始终加载** `~/.anti-olden/memory/user-profile.md`（不存在就软提示用户先跑 comm-memory 建用户画像，**不阻塞**）
2. 消息来自某个群 → glob `~/.anti-olden/memory/groups/*.md` → frontmatter 的 `chat_id` 匹配 → 命中就 Read；未命中**不自动建**，等用户通过 chat-recap / comm-memory 触发
3. 按 sender 的 `lark_user_id` → glob `~/.anti-olden/memory/persons/*.md` → frontmatter 匹配 → 命中就 Read；未命中**不自动建**

### R2. 按 type 分块抓证据（**reply-coach 主战场**）

reply-coach / chat-recap / meeting-recap 不要"读整个档案让模型自己消化"——**按 type grep 拿结构化证据**：

```bash
# 稳定特征 / 雷区 / 关系背景
grep '^- \[profile' ~/.anti-olden/memory/persons/<X>.md

# 模式历史 + reinforcement 强度
grep '^- \[behavior' ~/.anti-olden/memory/persons/<X>.md
# → 拿到 pattern:§N + seen:N，按 seen 倒序就是"最稳定的模式"

# 过往策略验证（最值钱）
grep '^- \[strategy' ~/.anti-olden/memory/persons/<X>.md
# → outcome:✓ 的优先复用；outcome:✗ 的避开

# 最近事件（context 用）
grep '^- \[event' ~/.anti-olden/memory/persons/<X>.md
# → 按 date 倒序拿最近 1-3 条
```

**收益**：reply-coach §5 简要分析时拿到的不是"3 次命中"（窗口内手算）而是"累积 7 次命中、最近一次 5-08"——signal 强度直接 in-band；过往 strategy outcome ✓/✗ 历史也是直接拿到的，不需要让模型读完整档案推理。
3. 按 sender 的 `lark_user_id` → glob `persons/*.md` → frontmatter 的 `lark_user_id` 匹配 → 命中就 Read；未命中同上
4. 建档基于 `${CLAUDE_PLUGIN_ROOT}/references/templates/` 作为 schema 参考（只读），Write 到 `~/.anti-olden/memory/{groups,persons}/` 下的新文件——**template 本身永不被覆盖**
