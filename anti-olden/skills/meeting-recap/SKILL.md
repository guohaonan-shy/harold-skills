---
name: meeting-recap
description: 飞书会议 / 妙记转录驱动的 memory 沉淀（人物档案为主，群档案少量）。任何提到 我刚跟 X 开完会能分析下他吗 / 看 X 在 Kickoff 里的表现 / 跨会议对比 X / 会议里 X 怎么 hedging / X 在会上是怎么应的 / 妙记转录 / 看上周那场会 X 怎么样 / 会议里 X 的'线下尾巴' / 会议里有人插话推责吗 / 看 X 在评审会的表现 / 高沟通成本 / 高 ego 同事画像（基于会议表现）/ 习惯性否定（在会议里）的场景都触发本 skill。**分界**：（1）用户已经把完整口述讲出来（"X 在那场会怎样"）→ 走 comm-memory 不走本 skill；（2）用户想分析的是**飞书 IM 群 / DM 消息**——那是 chat-recap 的活，不走本 skill。
allowed-tools: Bash(lark-cli:*), Bash(mkdir:*), Bash(ls:*), Bash(jq:*), Bash(grep:*), Bash(cat:*), Read, Write, Edit, AskUserQuestion
---

# meeting-recap — 会议转录驱动的 memory 沉淀

**输入**：飞书妙记会议转录（说话人时间戳 + 逐字稿）。**输出**：到 `~/.anti-olden/memory/{persons,groups}/*.md` 的观察，经用户**自然语言三段展示 + ABCD 决策**后落盘。

**和 chat-recap 的边界**：
- IM 消息（群 / DM 文字）→ `chat-recap`
- 会议转录（妙记 .docx / transcript.txt）→ 本 skill
- schema 完全不同（消息是结构化 ndjson；转录是文本流），分析框架也不同：消息侧侧重**跨群频率 / 模式重复 / 群内成员定位**；转录侧侧重 **"线下尾巴"**——hedging / 插话 / 被追问的瞬间反应、跨会议同人对比

会议里看到的人物侧面是消息侧观察不到的（群里他愿意让你看到他想被看到的形象，会议是即时反应）。两个 skill 互补，不重叠。

## 0. 必读约定

- 跨 skill 行为约定 → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **写入流程 W1-W5 / 三维度（section/type/KV）/ 4 类 type / Reinforcement / 修订 / Maintenance** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`
- **W4 自然语言展示 + ABCD** → `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`
- Lark CLI 命令（`vc +search` / `vc +notes`）+ **Raw 数据缓存落盘协议**（transcript 段） → `${CLAUDE_PLUGIN_ROOT}/references/lark-cli-cookbook.md`
- 8 类高沟通成本模式速查 → `${CLAUDE_PLUGIN_ROOT}/references/olden-patterns.md`
- 会议转录分析 prompt（**线下尾巴框架**） → `${CLAUDE_PLUGIN_ROOT}/references/prompts/analyze-transcript.md`
- Section 骨架 + 格式示例参考 → `${CLAUDE_PLUGIN_ROOT}/references/templates/{person,group}-profile.md`

## 1. 前置检查 + bootstrap

```bash
mkdir -p ~/.anti-olden/memory/persons ~/.anti-olden/memory/groups \
         ~/.anti-olden/raw/transcripts ~/.anti-olden/raw/attachments
lark-cli --version                      # 没装提示 npx skills add larksuite/cli -y -g
lark-cli auth status --format json      # jq -r '.userOpenId' 拿"我"的 ouid
```

未登录 → 提示 `lark-cli auth login`。`user-profile.md` 不存在 → 软提示先跑 `/anti-olden:comm-memory` 建用户画像，**不阻塞**。

## 2. 范围确认（AskUserQuestion）

**目标人 + 时间窗**：
- "刚跟 X 开完会" → 时间窗自动 = "最近 1 周"，目标 = X
- "看 X 最近 1 个月在所有会议里" → 时间窗 = 30 天，目标 = X
- "跨会议对比 X 跟 Y" → 多目标，时间窗自定

**含"群消息 / DM / 群里 X 说"等 IM 关键词** → 提示用户路由到 chat-recap：

> "听起来你想分析的是 IM 消息表现，那个走 `/anti-olden:chat-recap` 更合适。本 skill 是会议转录侧。要切过去吗？"

人名歧义时用 `contact +search-user --query "<名字>"` + AskUserQuestion 让用户确认 `ou_xxx`。

**必问"代号 / 别名"**：会议里说话人显示是 `EnglishName(中文名)` —— 跟 IM 群里的代号 / 绰号可能不同。AskUserQuestion 自然语言模板：

> "妙记转录里他显示的中文名是什么？英文名缩写？跟 IM 群代号不一样的话告我。"

代号 + 中英文名都加进 §4 的说话人识别关键词。

## 3. 拉转录 → 写 raw

按 cookbook **"会议转录拉取"** + **"Raw 数据缓存落盘协议 → Transcript"** 章节，**直接 copy 不要重写**。核心三步：

### 3.1 搜会议

```bash
lark-cli vc +search --participant-ids <ou_target> --start <window> --end <now>
```

→ 列出目标参与过的会议（title / minute_token / start_time / duration）。

### 3.2 用户挑场次（**非常重要**）

调 `AskUserQuestion` 让用户**勾选 1-3 场议题密集的**——**不要全量拉**。每场 transcript 数万 tokens，整窗口拉会爆上下文，且很多会议只是例会 / 顺口提，没有信号。

AQ 选项形态：

```
A. <2026-05-08 X 项目周会 (1h, 4 人)>
B. <2026-05-05 跨部门 Kickoff (2h, 8 人)>
C. <2026-04-29 季度总结 (1.5h, 12 人)>
D. <自定义场次>
```

让用户挑（multiSelect: true）。**默认建议挑议题密集的（Kickoff / 评审 / 跨部门对齐）**，跳过例会 / 周会（除非用户明确要）。

### 3.3 下载到 raw（按追加协议）

```bash
lark-cli vc +notes --minute-tokens <token> \
  --output-dir ~/.anti-olden/raw/transcripts/<token>/ \
  --format json > ~/.anti-olden/raw/transcripts/<token>/_meta.json
```

- 已存在 `transcript.txt` 跳过下载（妙记一旦生成不变，缓存可信）
- `_meta.json` 保留 `vc +notes` 的 JSON 响应（title / meeting_time / creator_id / note_doc_token / verbatim_doc_token）
- **跨会话持久不删**——重看某场会议直接 Read 本地

### 3.4 说话人 → open_id 归属（**核心校验**）

transcript 里说话人是 `EnglishName(中文名)` 显示名，**不是** `open_id`。**归属前必须解析**：

```bash
contact +search-user --query "<中文名>"
```

→ 拿到 `ou_id` → 跟目标 `ou_id` 比对 → 一致才把那段说话归到目标。

**警示**：同名 / 音近名 / 多公司同事 → 误伤直接污染档案。**不确定 → 跳过那段**，AskUserQuestion 让用户判（"转录里出现了一个'张明'，跟你目标'张明 (ou_abc...)'是同一个人吗？还是别的同事？"）。

## 4. 读 background memory（按 type 分块加载）

按 memory-index.md R2 拿结构化证据：

- `~/.anti-olden/memory/user-profile.md` —— 始终 Read
- 涉及参会人 → glob `~/.anti-olden/memory/persons/*.md` + frontmatter `lark_user_id` / `aliases` 匹配；命中后**按 type grep**：
  ```bash
  grep '^- \[profile' ~/.anti-olden/memory/persons/<X>.md   # 现有稳定特征
  grep '^- \[behavior' ~/.anti-olden/memory/persons/<X>.md  # 现有模式 + seen:N
  grep '^- \[strategy' ~/.anti-olden/memory/persons/<X>.md  # 现有策略 ✓/✗ 历史
  grep '^- \[event' ~/.anti-olden/memory/persons/<X>.md     # 最近事件
  ```
- 涉及群（如果会议 = 某固定群的常规会议）→ glob `groups/*.md` 找对应 chat_id，按 type grep

memory 不存在不报错、不中断。

## 5. 生成观察候选 → W1-W3

**跑会议转录分析 prompt** → `${CLAUDE_PLUGIN_ROOT}/references/prompts/analyze-transcript.md`（**线下尾巴框架** —— hedging / 插话 / 被追问反应 / 主动让 / 主动接 / 模糊承诺 / 推责瞬间 等）。

走 memory-index.md 写入流程的前 3 步：

### W1. Type 分类 + KV 补全

会议转录场景下 type 偏好：

| 信号 | 类型 | 关键 KV |
|---|---|---|
| "X 在那场会一直温和派 / 看数据" | `[profile]` | `source:会议:<title>` |
| "X 在 5-08 那场被追问时直接说不知道" | `[event]` | `date:2026-05-08` + `meeting:<title>` + `time:<00:14:32>` |
| "X 在 3 场会都出现 hedging 模式" | `[behavior]` | `pattern:§N`（参考 olden-patterns 编号；会议里常见的是 §3 模糊施压、§7 公开施压、§8 情绪绑架 + 转录特有的"hedging 模式"等）+ `seen:N` + `last:dates`，明确标 `source:会议` |
| "X 在那场会主动让我决定 → 我用就事论事推 → ✓" | `[strategy]` | `outcome:✓/✗` + `scenario:<会议名 / 类型>` + `when:date` —— **批量 AskUserQuestion 让用户逐条确认才产出**（参考 chat-recap §5 strategy 处理） |

**线下尾巴特殊收益**：会议里的 hedging / 插话 / 反应跟消息里"刻意发的话"风格往往**有出入**。这种"出入"是高价值 W2 信号——`[profile]` break-change 优先候选。

### W2. Dedup 判断（LLM 语义判断）

模型按 §4 grep 拿到的现有 entry 跟候选对比，归类成：**新发现 / 强化 / 认知出入**。

转录侧最有价值的是**认知出入**：消息里"温和派"+ 会议里"被追问就直接说'这个我没想过'" → 出入显著 → 拟改原 `[profile]` + `revised:今天` + 备注"会议里更坦诚" 。

### W3. Section 归位

跟 chat-recap 一致：优先复用现有 section / 都不贴切才新开 / 想改名 W4 建议。

## 6. W4 自然语言展示 + AskUserQuestion ABCD

**严格按 `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md` 标准结构**。三段对话语气标题 + 1/2/3 编号列点。**附时间戳引用**（这是转录侧 vs chat-recap 的特殊价值）：

```
看了 5-08 X 项目周会 + 5-05 跨部门 Kickoff 两场转录，跟 persons/zhang-san.md 对了一下：

**有几条新东西**（档案里之前没记的）

1. 在 5-05 Kickoff 上 00:14:32 被追问"这数据哪来的"，他直接说"这个我没想过"——
   档案里没记这种"被追问就坦白"的反应，建议加进 `## 互动模式`
2. 5-08 周会 00:32:10 主动让你决定 X 怎么推，没甩锅——是新观察到的"主动放权"模式

**现有认知又被验证了几次**

1. ...

**有几条跟之前认知有点出入**

1. 档案里"沟通风格 [profile]"写的是"直接、看数据、温和派"，但 5-08 会议 00:14:32 那段
   像是在公开场合用模糊施压（§3）—— 这是面向不同场景的两副面孔，建议在档案里
   补一条 [profile] 区分 "私下聊天的他" vs "公开会议的他"，不替换原条目

[如有顺带建议清理：W2 扫到符合 memory-index.md "Maintenance" 触发条件的老 entry]

我落档之前你看下：
A. 全部按这个落（含清理建议）
B. 让我改一下（说写入或清理哪条要怎么改）
C. 都不动（既不写也不清）
D. 我先补一段口述（口述完合并再展示）
```

**调 AskUserQuestion 工具**（不是文本让用户打字）。B 选项必须循环、D 选项让用户补充口述、多文件分别一轮。详细规则见 diff-format.md。

## 7. W5 Edit + frontmatter 同步

跟 chat-recap §7 一致：
- 新条目 → Edit 在对应 section 末尾追加
- 强化更新 → Edit 改 `seen:N` + `last:` 字段
- break-change 修订 → 直接改原 entry + `revised:今天` + 括号备注
- 新建文件 → Read template → Write 含 frontmatter + 用户答了的 section + 用户给了观察的 entry
- frontmatter 同步：`last_updated:今天`；person 档案 `interaction_count += N`
- **永远不改** `${CLAUDE_PLUGIN_ROOT}/references/templates/`

## 8. 收尾

> "还要看别的会议 / 别的人吗？"

- 用户要回某条消息（不是会议） → 路由 `reply-coach`
- 用户要纯口述改档案 → 路由 `comm-memory`
- 用户要拉 IM 消息侧 → 路由 `chat-recap`

## 9. 不适用本 skill 的场景

- 用户已自足口述 → `comm-memory`
- 用户想分析 **IM 消息（群 / DM 文字）** → `chat-recap`
- 生成回复草稿 → `reply-coach`

## 关键约束（汇总）

- **只跑会议转录**——不接 IM 消息
- 拉 transcript **必须用户挑场次**（每场数万 tokens）
- **说话人归属必须 search-user 解析 ou_id**——同名误伤会污染档案；不确定的 AskUserQuestion 让用户判
- transcript **跨会话持久不删**（妙记一旦生成不变，本地缓存可信）
- W4 用 `[event]` / `[behavior]` 标条目时附 **`time:<00:14:32>`** 时间戳锚点（让用户审时能精确定位证据）
- **线下尾巴**优先记 `[profile]` break-change（会议里看到的"另一面"）和新 `[behavior]` 模式
- 写 memory 必须 **AskUserQuestion**，多文件分别确认
- **不分析单条消息怎么回**——那是 `reply-coach`
