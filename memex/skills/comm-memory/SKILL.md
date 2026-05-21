---
name: comm-memory
description: memex 记忆的口述驱动 CRUD + 健康检查（看 / 改 / 新建 人物 / 群组 / 话题 / 用户画像，以及 lint 体检）。**纯用户口述**驱动，不拉消息；除新建人物时按需做一次身份解析（connector identity）外不调平台 CLI。任何提到 看 X 档案 / X 是什么风格 / 给 X 建档 / 改我的沟通风格 / 记一下 X 配合得好 / X 有什么雷区 / 这次就事论事有效记下 / 这个群什么氛围 / 加一条观察 / 改 user-profile / 调整默认策略 / 建个话题 / 记个事件 / 体检下我的 memex / 检查我的记忆库 / 档案乱了帮我理 / 查有没有矛盾 / 高 ego 同事画像 / 习惯性否定 / 推卸责任 的场景都触发本 skill。**分界**：用户只给名字没给描述（"基于最近聊天给 X 建档" / "看 X 在那场会的表现"）→ 走 ingest + recap（要拉数据分析），不走本 skill。
allowed-tools: Bash(mkdir:*), Bash(grep:*), Bash(ls:*), Bash(cat:*), Bash(lark-cli contact:*), Bash(lark-cli auth:*), Read, Write, Edit, AskUserQuestion, WebSearch
---

# comm-memory — 记忆 CRUD + Clarifier + Lint

纯用户口述维护 memex 的 wiki：用户画像 / 人物 / 群组 / 事件 / 话题。AI 和用户共同作者，混在同一文件不区分来源。**不拉消息也不拉转录**——那是 `ingest` + `recap` 的活。本 skill 还兼**健康检查（lint）**模式（用户喊"体检下我的 memex"触发）。

**本 skill 不是被动记录器，是主动 clarifier。** 用户口述往往粗颗粒（"张三还可以" / "X 群最近紧张"），**不要**直接打 type 写入——先 AskUserQuestion 层层追问拿到足够具体的上下文，再走 W1-W5 落档。粗颗粒直接写 = 档案变成"用户的喃喃自语"，对下游 reply-coach / recap 没分析价值。

## 0. 必读约定

- 跨 skill 行为约定 → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **身份落实 R0 / 写入流程 W1-W5 / 检索 R1-R2 / Observation 原生格式（#tag + 字段 + [[link]] + ^anchor）/ 4 类 type / Reinforcement / 修订 / Maintenance / topics 提升（hotness）/ index.md+log.md(按日 digest) / Lint** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`
- **W4 自然语言展示格式** → `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`
- Section 骨架 + 格式示例参考 → `${CLAUDE_PLUGIN_ROOT}/references/templates/{user,person,group,event,topic}-profile.md`（**只读 schema 参考，不被复制**）

## 1. 前置检查 + bootstrap

```bash
mkdir -p ~/.memex/memory/persons ~/.memex/memory/groups ~/.memex/memory/topics
ls ~/.memex/memory/persons ~/.memex/memory/groups ~/.memex/memory/topics
```

**只 mkdir，不 cp 模板。** 任何 memory 文件按需由用户触发才建——templates/ 是 schema 参考，AI 引导问答时按 template 演示的 obsidian 原生格式（`- <描述> #type (key:: val)`）写真实内容，**不**把 template cp 成实际档案。

## 2. 用户意图路由

| 动作 | 触发 | 分支 |
|---|---|---|
| **查看** | "看 X 档案" / "X 什么情况" / "我有哪些档案" | §6 |
| **新建** | "给 X 建档"（**且立刻给了描述**） / "问我吧" / "建个话题" / "记个事件" | §4 |
| **编辑已有** | "记一下 X 这次..." / "X 还有个雷区..." / "改我的默认策略" | §5 |
| **体检 lint** | "体检下我的 memex" / "查矛盾" / "档案乱了帮我理" | §7 |

**意图含糊时 AskUserQuestion**："口述一段直接写"（→ §4/§5）/ "先看现有档案"（→ §6）/ "给记忆库做个体检"（→ §7）。

用户说"基于最近聊天给 X 建档" / "分析 Y 群最近氛围"——这是**数据驱动**意图，本 skill 不接：

> 这种基于对话提炼的，先跑 `/memex:ingest` 拉 + 渲染，会自动接 `/memex:recap` 提炼。本 skill 是纯口述 CRUD + 体检。

## 3. 写入流程 W1–W5（**所有 §4 / §5 写入都走这一套**）

详见 `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`。落到口述场景：

| 阶段 | 本 skill 怎么做 |
|---|---|
| **W1. Type + 字段** | 模型按口述内容分类：稳定特征 / 一次性事件 / 模式命中 / 策略验证。每条候选打 `#type (key:: val)`（用户看不到，模型自己用） |
| **W2. Dedup** | Read 目标档案 → 判断每条候选是 **新发现 / 强化 / 认知出入**。LLM 语义判断，不算法。同时扫老 entry 找清理候选。 |
| **W3. Section 归位 + 提升判断** | 优先复用已有 `## XXX`（先 grep `^## `）；都不贴切才新开（W4 显式标）。跨人跨时间反复共现的线索 / 单次重大事件 → 判断是否提议升 `topics/`（hotness，**W4 确认才建**；无独立 events 类型）。改名/合并 section 只能 W4 建议。 |
| **W4. 自然语言展示 + ABCD** | 按 `diff-format.md` 三段 + ABCD：**A 落 / B 改循环 / C 不落 / D 先补口述**。多文件分别一轮，**不打包**。 |
| **W5. Edit/Write + frontmatter + index/log** | A → Edit/Write 落盘 + `last_updated: 今天`，person `interaction_count += N`；建 topics 时在牵涉档案补 `[[topics/x]]`；**同步 index.md + 按日 append log.md digest**。 |

**修订 break-change**：旧 entry 有偏差（用户口述纠正）→ **直接改原 entry** + `(revised:: YYYY-MM-DD)` + 行尾括号备注。不保留旧版本。

## 4. Clarifier 模式 + 引导式问答

### 4.1 Clarifier 协议（**核心**）

1. 听取原始描述（一句话即可）
2. 识别歧义维度（"还可以/挺好" → 哪方面？"最近紧张" → 怎么紧张？"改默认策略" → 改成什么？）
3. **AskUserQuestion 一次追问 1-2 个最关键维度**（不一次问 5 个，分层问）
4. 用户答完仍粗 → 继续追问场景 / 话术 / 策略效果
5. 拿到 entry-level 具体上下文 → 走 §3 W1-W5

目的是**让 W1 type 分类有足够依据**。粗颗粒"还可以"打不出有意义的 `#profile`；具体的"4-21 周会上他主动让我决定 X 怎么推，没甩锅"才能打出 `#event (date:: 2026-04-21)` + 关联 `#strategy (outcome:: ✓) (scenario:: 跨部门推进)`。

### 4.2 新建人物档案

路径：`~/.memex/memory/persons/<pinyin>.md`（重名 → `<pinyin>_<id 后 6>.md`）。frontmatter 用 **`identities` map**（`lark: ou_xxx`，跨平台多 ID）+ `aliases`。

**先落实身份（R0，必做）**：建档前用 connector `## identity` 把人解析成稳定 ID（lark：`lark-cli contact +search-user --query "<名>"` → open_id）。**禁止只凭显示名/代号建档**；解析不到/用户也说不清 → frontmatter 标 `identities: {待确认}` 留待后续 ingest+recap 落实，不硬编。

clarifier 可能追问的维度（不是 checklist）：基础（部门/角色/群里别称 → frontmatter）/ 风格（→ `#profile`）/ 雷区（→ `#profile (severity:: ?)`）/ 互动模式 / 关系（→ `#profile (source:: 口述)`）/ 策略历史（→ `#strategy`，追问 scenario+when）/ 模式倾向（→ `#behavior`）/ 骨架外维度。

**Type 识别 + 模式起步值**：
- 风格 / 雷区 / 关系 / 角色 / 默认偏好 → `#profile`
- "上次开会他怎样 / 4-22 那次" → `#event (date:: 具体日期)`
- "他**一贯**习惯性否定" / "**经常**推卸责任" —— **追问"差不多见过几次？最近一次？"**：
  - 给具体次数 → `#behavior (pattern:: §N) (seen:: 数) (last:: 日期)`
  - 答"忘了次数但反复多次" → 默认 `#behavior (pattern:: §N) (seen:: 3) (last:: 今天) (source:: 口述)`（口述长期观察隐含 ≥3 次，不是 1）
  - 后续 recap 拉数据接力 +N 验证
- "我跟他用 X 成功/失败过" → `#strategy (outcome:: ✓/✗)`，**追问"具体什么场景？哪次？"** 拿 scenario+when 才产出

### 4.3 新建群组档案

路径：`~/.memex/memory/groups/<group-pinyin>.md`（群名不明 → `<chat_id>.md`）。frontmatter **`connector` + `chat_id`**（平台独立）。

clarifier 维度：基础（群名/connector/chat_id → frontmatter）/ 氛围（→ `#profile`）/ 关键人物（关联 `[[persons/X]]`）/ 注意事项（→ `#profile (severity:: ?)`）/ 特色 / 历史事件（→ `#event`）/ 模式（→ `#behavior`）。协议同 §4.1。

### 4.4 新建 topics（含重大事件，无独立 events 类型）

仅当用户**显式要求**（"给这条线建个话题/事件页"）或 clarifier 中浮现跨人跨时间反复共现的线索/单次重大事件时建（hotness，提升规则见 memory-index.md）：
- `topics/<slug>.md`：hub —— 参与人 / 相关话题 / 关键决策 / 时间线，全用 `[[link]]`；重大一次性事件 slug 可带日期（如 `2026-05-08-yusuan-pingshen`）。
- 琐碎一次性事件 → 留在所属 person/group 行内 `#event`，不单独建页；时序流落 `log.md` 按日 digest。
- 建完**在牵涉的 person/group 档案补一行 `[[topics/x]]`**（双向可达）。仍走 §3 W4 确认。

### 4.5 用户画像首次建档

`[ ! -f ~/.memex/memory/user-profile.md ]` 时跑 clarifier。维度：角色 / 风格（→ `#profile`）/ 禁忌（→ `#profile (severity:: high)`）/ 默认策略（→ `#profile`）/ 历史经验（→ `#strategy`）/ 骨架外。

用户首次大概率描述短（"我是 PM、就事论事"）—— **先追问 1-2 轮**（"什么类型的就事论事？跟数据 / 流程 / 边界？"）拿具体描述再 W1-W5。

## 5. 编辑已有档案（同样走 Clarifier）

"记一下张三这次配合得好"——**别直接打 strategy ✓ 写盘**。先 clarifier："具体哪次？什么场景？用了什么策略？为什么算 ✓？"

1. **定位文件**：按人 → `ls ~/.memex/memory/persons/` + Read frontmatter 匹配 `name` / `identities` / `aliases`；按群 → 匹配 `connector` + `chat_id` / `group_name`；用户画像 → Read `user-profile.md`。
2. **定位 section + type**（W1-W3 核心）：
   - "这次配合了" → `#strategy (outcome:: ✓) (scenario:: ...) (when:: 今天)` 落 `## 有效策略`
   - "以后跟他用就事论事" → `#profile` 默认策略偏好（覆盖原 profile）
   - "他不喜欢群里被反驳" → `#profile (severity:: high)` 落 `## 雷区`
   - "他在产品群很安静" → `groups/<X>.md` 的 `## 关键人物` `#profile`
   - "上周三当众反问我" → `#event (date:: 2026-MM-DD)`
   - "我之前用柔和推进被解读成认怂" → break-change 改原 `#strategy` outcome ✓→✗ + `(revised:: 今天)` + 括号备注
3. **进 §3 W1-W5**：D 选项依然有效。

## 6. 查看 / 批量回顾

- **看单个**：定位文件后**按 type grep**（memory-index.md R2）：
  ```bash
  grep '#profile'  ~/.memex/memory/persons/<X>.md
  grep '#behavior' ~/.memex/memory/persons/<X>.md
  grep '#strategy' ~/.memex/memory/persons/<X>.md
  grep '#event'    ~/.memex/memory/persons/<X>.md
  ```
  按结构化摘要用人话说，**不**原样输出 markdown 全文。
- **批量**：先读 `~/.memex/memory/index.md`（导航目录，最快）；没有或要核对时 `ls memory/{persons,groups,topics}/*.md` + Read frontmatter，按 `last_updated` 排序展示。

## 7. Lint 健康检查模式

用户喊"体检下我的 memex"触发。扫全 `~/.memex/memory/`，按 memory-index.md "Lint" 表出报告：

| 检查 | 怎么查 | 处置 |
|---|---|---|
| 孤儿 note | 某 note 没有任何别的 note `[[link]]` 它，也不在 index.md | 提议归档或补链 |
| 缺失交叉引用 | event/topic 正文提到某人却没 `[[persons/x]]` | 提议补 `[[link]]` |
| 矛盾 | 两条 `#profile` 互斥 | 提议改原条目 + `(revised::)` |
| 过时 | 命中 Maintenance 清理条件（`#event (one-off:: true)` >30天 等） | 提议清理 |
| 数据空洞 | person 只有 ID 没画像 / 未解析身份的说话人 | 提议 impute（用 WebSearch 查公开信息 / 提示用户补口述） |
| 新连接 | 多实体反复在某语境共现（如张三+李四+"预算"） | **提议建新 topic/event**（hotness 提升候选） |

**lint 不静默修**：产出报告 → 走 §3 W4 ABCD 确认才改。**index.md 在 lint 时一并重建对账**（自愈漂移：扫所有 note 重写 index 的目录行）。impute 用 WebSearch 时只补公开、低敏信息，拿不准就转成"提示用户补口述"，不瞎填。

## 8. 不适用本 skill 的场景

- 基于**对话内容**提炼建档 / 更新 → `ingest` + `recap`
- 生成**回复草稿** / 分析单条具体消息 → `reply-coach`
- 发送消息 → 不在本 plugin 范围（写操作严格 dry-run，详见 `conventions.md` §3）

## 关键约束（汇总）

- **纯口述 CRUD + lint**，不拉数据、不碰平台 CLI
- 主动 **clarifier**：粗颗粒先追问再写，不直接打 type
- observation 用 **obsidian 原生格式**；`#behavior` 必带 `(pattern:: §N)(seen:: N)(last::)`
- 写 memory 必须 **AskUserQuestion ABCD**，多文件分别确认；**topics 提升（hotness）必须用户确认**；建 person 前先 R0 落实身份
- 修订直接改原 entry + `(revised::)`，不留旧版本
- 每次落档 / lint **同步 index.md + append log.md**
- person 用 `identities` map 主键 / group 用 `connector`+`chat_id`；"我"身份不持久化进画像
