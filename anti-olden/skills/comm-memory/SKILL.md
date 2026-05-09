---
name: comm-memory
description: 飞书 / 职场沟通的 memory CRUD（看 / 改 / 新建 人物档案 + 群组档案 + 用户画像）。**纯用户口述**驱动，不拉消息、不调 lark-cli 读 API。任何提到 看 X 档案 / X 是什么风格 / 给 X 建档 / 改我的沟通风格 / 记一下 X 配合得好 / X 有什么雷区 / 这次就事论事有效记下 / 这个群什么氛围 / 加一条观察 / 改 user-profile / 调整默认策略 / 高沟通成本 / 高 ego 同事画像 / 习惯性否定 / 推卸责任 的场景都触发本 skill。**分界**：用户只给名字没给描述（"基于最近聊天给 X 建档" / "看 X 在那场会的表现"）→ 走 chat-recap（IM 消息侧）或 meeting-recap（会议转录侧），不走本 skill。
allowed-tools: Bash(mkdir:*), Bash(grep:*), Bash(ls:*), Read, Write, Edit, AskUserQuestion
---

# comm-memory — 沟通记忆 CRUD + Clarifier

纯用户口述维护三层 Memory：用户画像 / 人物档案 / 群组档案。AI 和用户共同作者，混在同一文件不区分来源。**不拉消息也不拉转录**——那是 `chat-recap` / `meeting-recap` 的活。

**本 skill 不是被动记录器，是主动 clarifier。** 用户给的口述往往是粗颗粒（"张三还可以" / "X 群最近紧张"），**不要**直接打 type 写入——先用 AskUserQuestion 层层追问拿到足够具体的上下文，再走 W1-W5 落档。粗颗粒直接写 = 档案变成"用户的喃喃自语"，对下游 reply-coach / chat-recap / meeting-recap 没分析价值。

## 0. 必读约定

- 跨 skill 行为约定 → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **写入流程 W1-W5 / 检索 R1-R2 / 三维度（section/type/KV）/ 4 类 type / Reinforcement / 修订 / 清理** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`
- **W4 自然语言展示格式** → `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`
- Section 骨架 + 格式示例参考 → `${CLAUDE_PLUGIN_ROOT}/references/templates/{user,person,group}-profile.md`（**只读 schema 参考，不被复制**）

## 1. 前置检查 + bootstrap

```bash
mkdir -p ~/.anti-olden/memory/persons ~/.anti-olden/memory/groups \
         ~/.anti-olden/raw/chats ~/.anti-olden/raw/attachments ~/.anti-olden/raw/transcripts
ls ~/.anti-olden/memory/persons ~/.anti-olden/memory/groups
```

**只 mkdir，不 cp 模板。** 任何 memory 文件按需由用户触发才建——templates/ 是 schema 参考，AI 引导问答时按 template 演示的 inline 格式（`[type | KV] text`）写真实内容，**不**把 template 文件 cp 成实际档案。

## 2. 用户意图路由

四类动作，先 confirm：

| 动作 | 触发 | 分支 |
|---|---|---|
| **查看** | "看 X 档案" / "X 什么情况" | §6 |
| **新建** | "给 X 建档"（**且用户立刻给了描述**） / "我自己还没建档，问我吧" | §4 |
| **编辑已有** | "记一下 X 这次..." / "X 还有个雷区..." / "改我的默认策略" | §5 |
| **批量回顾** | "我有哪些档案" / "最近改过哪些" | §6 |

**意图含糊时用 AskUserQuestion 二选一**：
- "口述一段直接写"（→ §4 / §5）
- "先看现有档案再说"（→ §6）

如果用户说"基于最近聊天给 X 建档" / "分析一下 Y 群最近氛围"——这是**消息驱动**意图，本 skill 不接，引导：

> 这种基于消息提炼的，跑 `/anti-olden:chat-recap` 更合适（IM 消息侧）；如果想看会议表现走 `/anti-olden:meeting-recap`（会议转录侧）。它们会拉数据 + 落 raw + 提炼观察后再回到 memory 写入。本 skill 是纯口述 CRUD。

## 3. 写入流程 W1–W5（**所有 § 4 / § 5 写入都走这一套**）

详细规则见 `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`。本 skill 落到口述场景：

| 阶段 | 本 skill 怎么做 |
|---|---|
| **W1. Type 分类 + KV** | 用户口述完后，模型按内容分类：稳定特征 / 一次性事件 / 模式命中 / 策略验证。每条候选打 `[type \| kv...]`（用户看不到 type，但模型自己用） |
| **W2. Dedup** | 模型 Read 目标档案 → 判断每条候选是 **新发现** / **强化** / **认知出入**。LLM 自己语义判断，不算法。 |
| **W3. Section 归位** | 优先复用文件**已有**的 section（先 grep `^## ` 拿现有 list）；都不贴切才新开（W4 展示时显式标"建议新开 section: `## XXX`"，让用户审）。AI 想改名/合并已有 section 也只能在 W4 建议、用户确认才改。 |
| **W4. 自然语言展示 + AskUserQuestion ABCD** | 按 `diff-format.md` 标准结构展示三段 + ABCD：**A 落 / B 改循环 / C 不落 / D 我先补口述**。多文件分别一轮 ABCD，**不打包**。 |
| **W5. Edit + frontmatter 同步** | A → Edit 落盘 + bump `last_updated:今天`，person 档案 `interaction_count += N`。 |

**修订 break-change**：旧 entry 内容有偏差（用户口述纠正） → **直接改原 entry** + 加 `revised:YYYY-MM-DD` KV + 行尾括号备注原因。**不**保留旧版本作冗余。

## 4. Clarifier 模式 + 引导式问答

### 4.1 Clarifier 协议（**核心**）

用户口述往往粗颗粒。**不要直接打 type 写入**，先 clarifier：

1. **听取用户原始描述**——一句话即可
2. **识别歧义维度**——哪些点没说清？
   - "还可以" / "挺好的" / "有点烦" → 哪方面？
   - "最近紧张" / "气氛不一样" → 怎么紧张？什么变了？
   - "改默认策略" → 改成什么？为什么？
   - "记一下张三那次" → 哪次？什么场景？
3. **AskUserQuestion 一次追问 1-2 个最关键的维度**——不一次问 5 个，分层问
4. **用户答完仍粗** → 继续追问（"具体什么场景？" / "他通常用什么话术？" / "你试过什么策略效果如何？" / "档案里你还想加什么背景？"）
5. **拿到 entry-level 具体上下文后** → 走 §3 W1-W5（type 分类 → dedup → section 归位 → W4 自然语言展示 + ABCD）

Clarifier 的目的是**让模型在 W1 type 分类时有足够依据**。粗颗粒的"还可以"打不出有意义的 `[profile]`；具体的"4-21 周会上他主动让我决定 X 怎么推，没甩锅"才能打出 `[event | date:2026-04-21]` + 关联 `[strategy | outcome:✓ | scenario:跨部门推进]`。

### 4.2 新建人物档案

写入路径：`~/.anti-olden/memory/persons/<pinyin>.md`（重名 → `<pinyin>_<ou_id 后 6>.md`）。

**话题清单**（不是 checklist，是模型 clarifier 时**可能**追问的维度，按用户给的原始描述选最贴的入口）：

```
- 基础：叫什么？部门 / 角色？群里别的称呼（数字代号 / 绰号 / 英文名）？  → frontmatter
- 风格：直接 / 绕 / 看数据 / 看感觉？  → [profile]
- 雷区：什么话不能说、什么场合不能反驳？  → [profile | severity:?]
- 互动模式：你打算怎么跟他相处？（公事公办 / 笑里藏刀 / 真诚严谨 / 保持距离）
- 关系：汇报线 / 矛盾 / 团队影响力？  → [profile | source:口述]
- 策略历史：试过哪些策略 ✓ / ✗？  → [strategy] **追问具体 scenario + when**
- 模式倾向：他有哪些反复出现的行为？（习惯性否定 / 推卸责任 / 公开施压 / ...）  → [behavior]
- 骨架外维度：还有什么关于他你想记的？
```

**Type 识别 + 模式起步值规则**：
- 风格 / 雷区 / 关系 / 角色 / 默认偏好 → `[profile]`
- "上次开会他怎样 / 4-22 那次" → `[event | date:具体日期]`
- "他**一贯**习惯性否定" / "他**经常**推卸责任" —— **clarifier 追问"差不多见过几次？最近一次什么时候？"**：
  - 用户给具体次数 → `[behavior | pattern:§N | seen:用户给的数 | last:用户给的日期]`
  - 用户答"忘了具体次数，但反复多次" → 默认 `[behavior | pattern:§N | seen:3 | last:今天 | source:口述]`（口述长期观察隐含 ≥3 次累积，不是 1）
  - 后续 chat-recap / meeting-recap 拉数据接力 +N 验证
- "我跟他用 X 成功过 / 失败过" → `[strategy | outcome:✓/✗]`，**clarifier 追问"具体什么场景？哪次？"** 拿到 scenario + when 才产出

### 4.3 新建群组档案

写入路径：`~/.anti-olden/memory/groups/<group-pinyin>.md`（群名不明 → `<chat_id>.md`）。

**话题清单**（clarifier 时可能追问的维度）：

```
- 基础：群叫什么？chat_id？  → frontmatter
- 氛围：正式 / 轻松？领导在不在？  → [profile]
- 关键人物：谁主导？他在这个群跟平时有什么不同？  ← 关联 persons/<X>.md
- 注意事项：发消息要注意什么？  → [profile | severity:?]
- 特色：里程碑追踪 / 跨部门立场对立 / 瓜源属性？
- 历史事件：群里发生过什么需要记的关键事件？  → [event]
- 模式：群里反复出现的高沟通成本场景？  → [behavior]
```

Clarifier 协议同 §4.1：用户给"X 群最近紧张" → 追问"怎么紧张？冲突 / 节奏 / 老板压力？" → 拿到具体上下文再 W1-W5。

### 4.4 用户画像首次建档

`[ ! -f ~/.anti-olden/memory/user-profile.md ]` 时，clarifier 协议跑：

**话题清单**：

```
- 角色：团队中是什么位置？负责什么？汇报线？
- 风格：飞书上说话风格？简洁 / 铺垫 / 数据驱动 / 口语？  → [profile]
- 禁忌：绝对不用的措辞？（"您" / 感叹号 / emoji / 长段 …）  → [profile | severity:high]
- 默认策略：遇到不好回的消息，倾向哪种？（就事论事 / 柔和推进 / 强势推回）  → [profile]
- 历史经验：过去哪种应对反复证明有效 / 无效？  → [strategy]
- 骨架外维度：情绪触发 / 体能节奏 / 不容妥协的边界 ……
```

**Clarifier 优先做这件事**：用户首次建档大概率描述很短（"我是 PM、就事论事"）—— 不要一句话就 W1-W5 写盘，**先追问 1-2 轮关键维度**（"什么类型的就事论事？跟数据 / 跟流程 / 跟边界？"）拿到具体描述。

问完进 §3 W1-W5，A 才 Write。

## 5. 编辑已有档案（同样走 Clarifier）

用户说"记一下张三这次配合得好"——**别直接打 strategy ✓ 写盘**。先 clarifier："具体哪次？什么场景？你用了什么策略？为什么算 ✓？"。拿到具体上下文再 §3 W1-W5。

1. **定位文件**：
   - 按人 → `ls ~/.anti-olden/memory/persons/` + Read frontmatter 匹配 `name` / `lark_user_id` / `aliases`
   - 按群 → `ls ~/.anti-olden/memory/groups/` + Read frontmatter 匹配 `chat_id` / `group_name`
   - 用户画像 → Read `~/.anti-olden/memory/user-profile.md`

2. **定位 section + type**（这是 §3 W1-W3 的核心）：
   - "这次配合了" → `[strategy | outcome:✓ | scenario:... | when:今天]` 落 `## 有效策略`（dedup：同 scenario+when 跳过；不同 → new）
   - "以后跟他用就事论事" → `[profile]` 默认策略偏好（dedup：覆盖原 profile）
   - "他不喜欢在群里被反驳" → `[profile | severity:high]` 落 `## 雷区`（dedup：跟现有 [profile] 雷区是否重复）
   - "他在产品群里很安静" → 对应 `groups/<X>.md` 的 `## 关键人物` `[profile]`
   - "上周三他当众反问我" → `[event | date:2026-MM-DD]` 落 `## 互动模式` 或 `## 雷区` 看上下文
   - "我之前用'柔和推进'被解读成认怂" → 这是 break-change 修订旧 `[strategy]`，**直接改原 entry** outcome:✓ → ✗ + 加 `revised:今天` + 括号备注

3. **进 §3 W1-W5**：编辑流程的 ABCD 里 D 选项依然有效（"我先补一段口述" 同样适用——口述完合并继续展示）。

## 6. 查看 / 批量回顾

- **看单个**：定位文件后 **按 type grep** 拿结构化片段（参考 memory-index.md R2 部分）：
  ```bash
  grep '^- \[profile' ~/.anti-olden/memory/persons/<X>.md   # 稳定特征
  grep '^- \[behavior' ~/.anti-olden/memory/persons/<X>.md  # 模式 + reinforcement
  grep '^- \[strategy' ~/.anti-olden/memory/persons/<X>.md  # 策略验证
  grep '^- \[event' ~/.anti-olden/memory/persons/<X>.md     # 最近事件
  ```
  按结构化摘要用人话说，**不**原样输出 markdown 全文。可以提示"档案里有 N 条 [strategy]，最近一次 ✓"等汇总信息。

- **批量**：`ls ~/.anti-olden/memory/persons/*.md ~/.anti-olden/memory/groups/*.md` + Read frontmatter 拿 `name` / `group_name` / `last_updated` / `interaction_count`，按最近更新排序展示，用户可选某个深入看。

## 7. 不适用本 skill 的场景

- 基于**飞书 IM 消息内容**提炼建档 / 更新 → `chat-recap`
- 基于**会议转录**提炼 → `meeting-recap`
- 生成**回复草稿** / 分析单条具体消息 → `reply-coach`
- 发送消息 / 改群设置 → 不在本 plugin 范围（写操作严格 dry-run，详见 `conventions.md` §3）
