---
name: chat-recap
description: 飞书 IM 消息驱动的 memory 沉淀（人物档案 + 群组档案）。任何提到 给 X 建档（基于聊天）/ 分析 X 最近表现 / 看 X 群最近什么情况 / 半个月 X 群有什么变化 / 跟 X 最近互动怎样 / 今天谁 @ 我 / X 在群里怎么样 / 跨群对比 X / X 在 DM 里说了啥 / 高沟通成本 / 高 ego 同事画像 / 习惯性否定 / 推卸责任 / 公开施压 / 越权越界 的场景都触发本 skill。**分界**：（1）用户已经把完整口述讲出来（"X 是 xxx 风格"）→ 走 comm-memory 不走本 skill；（2）用户想分析的是**会议 / Kickoff / 妙记转录**——那是 meeting-recap 的活，不走本 skill。
allowed-tools: Bash(lark-cli:*), Bash(mkdir:*), Bash(ls:*), Bash(jq:*), Bash(grep:*), Bash(cat:*), Bash(tail:*), Read, Write, Edit, AskUserQuestion
---

# chat-recap — 飞书 IM 消息驱动的 memory 沉淀

**输入**：飞书 IM 消息（群 / DM）。**输出**：到 `~/.anti-olden/memory/{persons,groups}/*.md` 的观察，经用户**自然语言三段展示 + ABCD 决策**后落盘。

**会议转录是 `meeting-recap` 的活，本 skill 不接**——schema 不同（消息有 sender / mentions / reply_to / msg_type；转录是说话人时间戳+文本流）、分析框架也不同（消息侧侧重跨群频率 / 模式重复；转录侧侧重"线下尾巴"如 hedging / 插话 / 被追问反应）。

## 0. 必读约定

- 跨 skill 行为约定 → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **写入流程 W1-W5 / Observation 三维度（section/type/KV）/ 4 类 type / Reinforcement / 修订 / Maintenance 清理** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`
- **W4 自然语言展示标准结构 + ABCD** → `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`
- Lark CLI 命令 + **Raw 数据缓存落盘协议** → `${CLAUDE_PLUGIN_ROOT}/references/lark-cli-cookbook.md`
- 8 类高沟通成本模式速查（用于 W2 dedup 时识别 `[behavior | pattern:§N]`）→ `${CLAUDE_PLUGIN_ROOT}/references/olden-patterns.md`
- 消息分析 prompt → `${CLAUDE_PLUGIN_ROOT}/references/prompts/analyze.md`（转录侧分析 prompt 见 meeting-recap skill）
- Section 骨架 + 格式示例参考 → `${CLAUDE_PLUGIN_ROOT}/references/templates/{person,group}-profile.md`

## 1. 前置检查 + bootstrap

```bash
mkdir -p ~/.anti-olden/memory/persons ~/.anti-olden/memory/groups \
         ~/.anti-olden/raw/chats ~/.anti-olden/raw/attachments ~/.anti-olden/raw/transcripts
lark-cli --version                      # 没装提示 npx skills add larksuite/cli -y -g
lark-cli auth status --format json      # jq -r '.userOpenId' 拿"我"的 ouid
```

未登录 → 提示 `lark-cli auth login`。`user-profile.md` 不存在 → 软提示先跑 `/anti-olden:comm-memory` 建用户画像，**不阻塞**。

## 2. 范围确认（一步 AskUserQuestion）

**分析对象类型**——三选一：
- "某个群的动态" → §3 群路径
- "某个人最近的表现 / 给某人建档" → §3 人物路径
- "今日 @ 我汇总" → §3 today-@ 路径

**含"开会 / Kickoff / 会议 / 妙记 / 转录"等关键词** → 提示用户路由到 meeting-recap：

> "听起来你想分析的是会议表现，那个走 `/anti-olden:meeting-recap` 更合适——它专门处理妙记转录，能识别会议里的'线下尾巴'（hedging / 插话 / 被追问反应）。本 skill 是 IM 消息侧。要切过去吗？"

群名 / 人名歧义时用 `+chat-search --query "<关键词>"` 或 `contact +search-user --query "<名字>"`，再 AskUserQuestion 让用户确认 `oc_xxx` / `ou_xxx`。

**人物路径必问"代号 / 别名"**：群里常用绰号 / 数字代号 / 英文名缩写——光搜真名漏一半信号。AQ 自然语言模板：
> "你们群里叫他有别的称呼吗？数字代号 / 绰号 / 英文名 / 外号？"

代号加进 §3 / §5 的文本过滤关键词；新建档案时写到 frontmatter `aliases: [...]`。

## 3. 拉数据 → 写 raw（按追加协议）

**所有拉取必须落盘 raw**。脚本和协议见 cookbook **"Raw 数据缓存落盘协议"** 章节，直接 copy 不要重写。核心四件事：

1. 主消息追加到 `~/.anti-olden/raw/chats/<chat_id>/<YYYY-MM>.ndjson`（按 create_time 月分桶，去重靠 message_id）
2. `msg_type ∈ {image, file, audio, media}` 默认下载附件到 `~/.anti-olden/raw/attachments/<file_key>.<ext>`
3. 带 `thread_id` 的主消息按 lazy 规则拉到 `threads/<thread_id>.ndjson`
4. bump `~/.anti-olden/raw/chats/<chat_id>/_meta.json` 的 `last_fetched_at` / `last_fetched_message_id`

**窗口判断（按 `_meta.json` 是否存在 + 距今多久）：**

| 条件 | 模式 | 窗口 |
|---|---|---|
| `_meta.json` 不存在 / `last_fetched_at` > 30 天 | 冷启动 | 默认 14 天 |
| `last_fetched_at` 在 30 天内 | 增量 | `--start = last_fetched_at + 1s` |
| 用户显式指定 | 自定义 | 按用户 |

文本告诉用户走了哪个模式（不用 AQ）："这个群 10 天前处理过，走增量，拉 2026-04-XX 起的消息。"

**人物路径**是多 chat 聚合：对目标参与的每个共同 chat 分别走上面流程，checkpoint per-chat。

**Today-@ 路径**：cookbook "@ 我的消息"段；短期兜底 = 逐 chat 拉近 24h + `jq` 过滤 `mentions` 含 `userOpenId`，过经的消息**仍写 raw**。

**完整性校验**：拉完检查 `_meta.last_fetched_message_id` 能 grep 到对应月桶 + 附件全存在，避免半拉状态污染下次增量。

## 4. 读 background memory（按 type 分块加载）

按 memory-index.md R2 拿结构化证据，不是 Read 整文件让模型自己消化：

- `~/.anti-olden/memory/user-profile.md` —— 始终 Read（"我"的视角；不存在则软提示后跳过）
- 涉及群成员 → glob `~/.anti-olden/memory/persons/*.md` + frontmatter `lark_user_id` / `aliases` 匹配；命中后**按 type grep**：
  ```bash
  grep '^- \[profile' ~/.anti-olden/memory/persons/<X>.md   # 现有稳定特征（dedup baseline）
  grep '^- \[behavior' ~/.anti-olden/memory/persons/<X>.md  # 现有模式 + seen:N（reinforcement baseline）
  grep '^- \[strategy' ~/.anti-olden/memory/persons/<X>.md  # 现有策略 ✓/✗ 历史
  grep '^- \[event' ~/.anti-olden/memory/persons/<X>.md     # 最近事件（避免重记）
  ```
- 涉及群 → glob `~/.anti-olden/memory/groups/*.md` + frontmatter `chat_id` 匹配；同样按 type grep

**memory 不存在不报错、不中断**——这正是本 skill 要往里**填**的东西。

## 5. 生成观察候选 → W1-W3

跑消息分析 prompt → `${CLAUDE_PLUGIN_ROOT}/references/prompts/analyze.md`。

走 memory-index.md 写入流程的前 3 步：

### W1. Type 分类 + KV 补全

每条候选打 inline 标签（用户看不到，模型自己用）：

| 信号 | 类型 | 关键 KV |
|---|---|---|
| "X 在 Y 群密度高 / 某种风格 / 雷区" | `[profile]` | `source:消息` |
| "X 周三在 Y 群当众反问我" | `[event]` | `date:YYYY-MM-DD` + 必要 `severity` |
| "X 14 天 3 次习惯性否定" | `[behavior]` | `pattern:§N`（参考 olden-patterns.md 8 类编号）+ `seen:N` + `last:dates` |
| "上次跟 X 用就事论事，结果 ✓/✗" | `[strategy]` | `outcome:✓/✗` + `scenario:X` + `when:YYYY-MM-DD`（`source:消息`）—— **批量确认**：把识别出的所有 strategy 候选信号列成清单一次问，**不要每条独立跑 AskQ**。例：`AskUserQuestion("我从消息里看到这几条像是策略验证：1. 4-21 跟张三那次像是就事论事推 → 他接住了，看着是 ✓；2. 3-15 跟李四那次像是柔和推进 → 他变本加厉，像是 ✗；3. 4-08 跟王五那条不太确定。你逐条说哪些算 ✓ / 哪些算 ✗ / 哪些不算 strategy 不要记？")`，用户标了的才产出 `[strategy]`，标"不算"的丢掉|

### W2. Dedup 判断（LLM 语义判断）

模型按 §4 grep 拿到的现有 entry 跟候选对比，归类成：

- **新发现** —— 档案里之前没记过的
- **强化** —— 命中现有 `[behavior pattern:§N]` → update `seen:N → N+1` + `last` 追加新日期。或者命中现有 `[profile]` 完全一致 → 跳过（已记过）
- **认知出入（break-change）** —— 跟现有 `[profile]` / `[strategy]` 描述/outcome 不一致 → 拟改原 entry + 加 `revised:今天` KV + 括号备注

详见 memory-index.md "Reinforcement: update vs new entry" 表。

### W3. Section 归位

- 优先复用文件已有的 `## XXX`（先 grep `^## ` 拿 list）
- 都不贴切 → 新开 section，W4 展示时显式建议
- 想改名 / 合并已有 section → W4 同步建议（不静默改）

## 6. W4 自然语言展示 + AskUserQuestion ABCD

**严格按 `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md` 标准结构**。三段对话语气标题 + 1/2/3 编号列点，**不**给用户看 markdown diff / 底层 KV / `seen:N → N+1`：

```
看了过去 14 天 X 群 + 张三的消息，跟 persons/zhang-san.md 对了一下：

**有几条新东西**（档案里之前没记的）

1. ...（新观察 + 证据）
2. ...

**现有认知又被验证了几次**

1. 习惯性否定模式 14 天又触发 3 次（...日期），累积已 7 次 —— 是稳定模式
2. ...

**有几条跟之前认知有点出入**

1. 4-22 那次比档案的"温和派"形象更激进 —— 这其实是公开施压，建议把"沟通风格"改一下
2. 档案里"柔和推进 [outcome:✓]"，回看实际是变本加厉，建议改成 ✗ + revised 备注

[如有顺带建议清理：W2 扫到符合 memory-index.md "Maintenance" 触发条件的老 entry，
 显示成"**顺便，档案里有几条老 entry 看着可以清了**" + 列点；如没有则省略整段]

我落档之前你看下：
A. 全部按这个落（含清理建议）
B. 让我改一下（说写入或清理哪条要怎么改）
C. 都不动（既不写也不清）
D. 我先补一段口述（口述完合并再展示）
```

**调 AskUserQuestion 工具**（不是文本让用户打字）。

- **B 选项必须循环**：用户口述哪条改 → 模型重算 W1-W3 → 重新 W4 展示 → 再 AskUserQuestion → 直到 A 或 C
- **D 选项**：用户输入补充内容 → 模型把口述融合（标 `source:口述` 区别于消息观察）→ 重算 W1-W3 → 重新 W4 展示 → 再问。原 §6 "主动问口述补充"折进 D，**不再单独跑一轮**

**多文件分别确认**：同时写 `groups/X.md` + `persons/zhang-san.md` + `persons/li-si.md` 时**每个文件独立一轮 W4 + ABCD**，**不打包**——用户可能群档案 OK 但人档案还想改。

**清理建议跟写入合一轮 ABCD**：ABCD 同时覆盖写入 + 清理两件事——A=都按方案落（写入+清理）/ B=用户分别口述写入或清理哪条改 / C=既不写也不清 / D=先补口述。详见 `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md` "顺带建议清理" 段。

IO 状态（`last_fetched_*`）跟用户选 A/B/C/D **无关**——§3 拉消息时已自动 bump 到 raw `_meta.json`。用户选 C 不影响下次增量起点。

## 7. W5 Edit + frontmatter 同步

- **新条目** → Edit 在对应 section 末尾追加 `- [type | KV] 自然语言描述`
- **强化更新** → Edit 改 entry 行的 `seen:N` + `last:` 字段
- **break-change 修订** → Edit 改原 entry 正文 + KV `outcome` + 加 `revised:YYYY-MM-DD` + 末尾括号备注原因
- **新建文件** → Read template 拿 frontmatter schema → Write 含 frontmatter + 用户答了的 section + 用户给了观察的 entry（按 §5 W1 的 type 标签）→ 落到 `~/.anti-olden/memory/{persons,groups}/<pinyin>.md`
- **frontmatter 同步**：`last_updated:今天`；person 档案 `interaction_count += N`
- **永远不改** `${CLAUDE_PLUGIN_ROOT}/references/templates/`

## 8. 收尾

> "还要看别的群 / 人吗？观察没写完可以说'再加一条 xxx'我补进去。"

- 用户要回某条消息 → 路由 `reply-coach`
- 用户要纯口述改档案 → 路由 `comm-memory`
- 用户继续追加新观察 → 留本 skill，append 到 W1-W3 再走一次 W4

## 9. 不适用本 skill 的场景

- 用户已自足口述（不需要拉消息） → `comm-memory`
- 用户想分析**会议 / Kickoff / 妙记转录** → `meeting-recap`
- 生成回复草稿 / 分析单条具体消息 → `reply-coach`
- 发送消息 / 改群设置 → 不在本 plugin 范围（写操作严格 dry-run，详见 `conventions.md` §3）

## 关键约束（汇总）

- 产物是 **W4 自然语言三段 + ABCD**，不是 markdown diff、不是简报文章
- 写 memory 必须 **AskUserQuestion**，多文件分别确认
- **只对飞书账号真实存在的人**写 `persons/*.md`（`lark_user_id` 主键，frontmatter 列别名）；口头提到但无飞书账号的外部人物写到 `groups/<群>.md` 的"话题基线"
- 增量语气：新发现 / 强化 / 认知出入 —— 不写"此人是 X"
- **所有 `[behavior]` 必须带 `pattern:§N`**（引用 olden-patterns.md 8 类编号）+ `seen:N` + `last:`
- **不分析单条消息怎么回**——那是 `reply-coach`
