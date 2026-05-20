---
name: recap
description: 把已渲染的 sources/ 对话提炼成 memex 的人/事 wiki（distill → 人物 / 群组 / 事件 / 话题档案）。任何提到 提炼 / 沉淀 / 给 X 建档 / 分析 X 最近表现 / 看 X 群最近什么情况 / 半个月 X 群有什么变化 / 跟 X 最近互动怎样 / X 在群里怎么样 / 跨群对比 X / 分析这场会 / 看 X 在 Kickoff 的表现 / 会议里 X 怎么 hedging / X 的线下尾巴 / 高沟通成本 / 高 ego 同事画像 / 习惯性否定 / 推卸责任 / 公开施压 / 越权越界 的场景都触发本 skill。**分界**：（1）还没拉数据 / sources 为空 → 先 ingest；（2）用户已自足口述（"X 是 xxx 风格"，不需要分析对话）→ comm-memory；（3）只想要某条消息的回复 → reply-coach。本 skill **基本 connector 无关**：只读 `sources/` 提炼，唯一例外是建人前用 connector `## identity` 落实身份（见 R0）。
allowed-tools: Bash(mkdir:*), Bash(ls:*), Bash(jq:*), Bash(grep:*), Bash(cat:*), Bash(tail:*), Bash(lark-cli contact:*), Bash(lark-cli auth:*), Read, Write, Edit, AskUserQuestion
---

# recap — 把 sources 提炼成人/事 wiki（distill）

**输入**：`~/.memex/sources/<connector>/` 里 ingest 已渲染好的对话 markdown（chat 月文件 / meeting 逐字稿）。**输出**：到 `~/.memex/memory/` 的人/事观察，经用户**自然语言三段展示 + ABCD 决策**后落盘，并同步 `index.md` / `log.md`。

recap 是 Karpathy LLM Wiki 里"把 raw 增量编译成 wiki"那一步的本质。它**基本 connector 无关** —— 只认 sources 的统一格式提炼；唯一碰 connector 的地方是给被议论的非成员做身份解析（R0），这是 keying person 的前提，不是数据获取。

## 0. 必读约定

- 跨 skill 行为约定 → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **身份落实 R0 / 检索 R1-R2 / 写入流程 W1-W5 / Observation 原生格式（#tag + 字段 + [[link]] + ^anchor）/ 4 类 type / Reinforcement / 修订 / Maintenance / Distill triage / topics 提升（hotness）/ index.md+log.md(按日 digest)** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`（**核心依赖，通读**）
- **W4 自然语言展示标准结构 + ABCD** → `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`
- 8 类高沟通成本模式速查（W2 dedup 识别 `#behavior (pattern:: §N)`）→ `${CLAUDE_PLUGIN_ROOT}/references/olden-patterns.md`
- 分析 prompt：**chat 侧** → `${CLAUDE_PLUGIN_ROOT}/references/prompts/analyze.md`；**meeting 侧（线下尾巴框架）** → `${CLAUDE_PLUGIN_ROOT}/references/prompts/analyze-transcript.md`
- Section 骨架 + 格式示例 → `${CLAUDE_PLUGIN_ROOT}/references/templates/{person,group,event,topic}-profile.md`

## 1. 前置检查

```bash
mkdir -p ~/.memex/memory/persons ~/.memex/memory/groups ~/.memex/memory/topics
ls ~/.memex/sources/*/ 2>/dev/null            # 有没有已渲染的 sources
```

- **sources 为空 / 没有目标对话** → 提示先跑 `/memex:ingest` 拉 + 渲染，**不自己拉**（拉是 ingest 的活，recap 只消费 sources）。
- `user-profile.md` 不存在 → 软提示先跑 `/memex:comm-memory`，**不阻塞**。

## 2. 范围确认

- **从 ingest 自动续来**：直接拿刚渲染的 sources 文件作为范围，不再问。
- **独立唤起**：AskUserQuestion 让用户挑要提炼的对象 —— 某个群（→ `sources/<c>/chats/<群>/`）/ 某个人（跨群聚合，grep sources 里该人发言）/ 某场会议（→ `sources/<c>/meetings/<token>.md`）。

**kind 自动判定**：读 sources 文件 frontmatter 的 `kind`（`chat` / `meeting`），决定走哪套分析框架，不用问用户。

## 3. Distill triage（准入 —— 先筛信号丢噪音）

**大多数消息是噪音**（"收到/ok/好的"、物流贴图、纯寒暄）。**不要逐条转写整个对话** —— 按 memory-index.md "Distill triage" 段：

- **小窗口**：直接 Read sources，LLM 语义判断哪些内容揭示稳定特征 / 模式命中 / 策略效果 / 重大事件，只把有信号的提成候选。
- **大窗口两遍 distill**（活跃群半年几千条）：先快扫 sources 标记"哪几段有信号"（便宜），再只对标记段深抽 observation（贵）。镜像 fast-score / deep-score，省 token 不漏。

判定"有信号"靠 LLM 语义判断，**不引入打分算法**。triage 后真没信号 → §6 如实说"没什么可沉淀的"，0 条是合理结果。

## 4. 身份落实 R0 + 读 background memory（按 type 分块加载，原生 grep）

### R0. 先把人落实到 connector ID（建/认人前必做）
- **群成员**：直接读 sources frontmatter 的 `roster:`（ingest 已写好 `显示名→<connector>:<id>`），零额外调用。
- **被议论的非成员**（代号/绰号/只出现真名的人）：用 connector `## identity` 解析（lark：`lark-cli contact +search-user --query "<名>"` → 拿 open_id）。**禁止只凭显示名/代号建 person**；解析不到 → 标"待确认"，不硬建。
- 拿到 `<connector>:<id>` 后再走 R1 路由 / W5 keying。

### R1-R2. 按 memory-index.md 拿结构化证据，**不**整文件读完让模型自己消化：

- `~/.memex/memory/user-profile.md` —— 始终 Read（"我"的视角；不存在软提示后跳过）
- 涉及的人 → glob `~/.memex/memory/persons/*.md` + frontmatter `identities.<connector>` / `aliases` 匹配；命中后按 type grep：
  ```bash
  grep '#profile'  ~/.memex/memory/persons/<X>.md   # 现有稳定特征（dedup baseline）
  grep '#behavior' ~/.memex/memory/persons/<X>.md   # 现有模式 + (seen:: N)（reinforcement baseline）
  grep '#strategy' ~/.memex/memory/persons/<X>.md   # 现有策略 ✓/✗ 历史
  grep '#event'    ~/.memex/memory/persons/<X>.md   # 最近事件（避免重记）
  ```
- 涉及群 → glob `groups/*.md` + frontmatter `connector` + `chat_id` 匹配；同样按 type grep
- 跟正文 `[[topics/x]]` link 加载相关 hub（顺藤摸瓜）

**memory 不存在不报错、不中断** —— 这正是 recap 要往里**填**的东西。

## 5. 生成观察候选 → W1-W3（kind-aware）

跑对应分析 prompt，**chat 侧**用 `analyze.md`（侧重跨群频率 / 模式重复 / 群内成员定位），**meeting 侧**用 `analyze-transcript.md`（侧重"线下尾巴"：hedging / 插话 / 被追问反应 / 模糊承诺）。会议里看到的侧面消息里看不到——两类互补。

走 memory-index.md 写入流程前 3 步，**observation 用 obsidian 原生格式**（`#tag` + `(key:: val)` + `[[link]]` + `→ [[...#^anchor]]`）：

### W1. Type 分类 + 字段补全

| 信号 | type | 必填字段 | provenance |
|---|---|---|---|
| 稳定特征 / 风格 / 雷区 / 关系 | `#profile` | `(source:: 消息/会议)` | 可带 |
| 一次性事件 | `#event` | `(date:: YYYY-MM-DD)`；会议加 `(time:: 00:14:32)` | **强烈建议** `→ [[...#^anchor]]` |
| 模式命中 | `#behavior` | `(pattern:: §N)`（olden-patterns 编号）`(seen:: N)` `(last:: dates)` | 强烈建议 |
| 策略验证 | `#strategy` | `(outcome:: ✓/✗)` `(scenario:: X)` `(when:: date)` | 可带 |

`#strategy` **批量确认**：把识别出的所有 strategy 候选列成清单一次问（不逐条独立 AskQ），用户标了 ✓/✗ 的才产出，标"不算"的丢掉。

### W2. Dedup（LLM 语义判断，不算法）

按 §4 grep 拿到的现有 entry 跟候选对比 → **新发现 / 强化（命中现有 `#behavior` 同 pattern → `(seen:: N→N+1)` + last 追加）/ 认知出入（跟现有 `#profile`/`#strategy` 不一致 → 拟改原 entry + `(revised:: 今天)` + 备注）**。详见 memory-index.md "Reinforcement" 表。同时扫老 entry 找清理候选（Maintenance 条件）。

**会议侧的高价值信号是认知出入**：消息里"温和派" + 会议里"被追问就坦白" → 出入显著 → `#profile` break-change 优先候选。

### W3. Section 归位 + topics 提升判断

- 优先复用现有 `## XXX`（先 `grep '^## '`）；都不贴切 → 新开 section（W4 显式建议）。
- **topics 提升判断（hotness，memory-index.md "topics 提升规则"）**：跨多人跨时间反复共现的话题/项目线，**或**单次重大事件被 ≥2 实体牵涉 → 候选升 `topics/<slug>.md`（重大事件 slug 可带日期）。**必须 W4 用户确认才建，绝不静默**；对人保守、对事相对大方。未达条件的一次性事件就留 person/group 行内 `#event`，时序流落 `log.md`。

## 6. W4 自然语言展示 + AskUserQuestion ABCD

**严格按 `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md` 标准结构**。三段对话语气标题（"有几条新东西" / "现有认知又被验证了几次" / "有几条跟之前认知有点出入"）+ 1/2/3 编号列点，**不**给用户看 markdown diff / `#tag` / `(seen:: N→N+1)`。会议侧附**时间戳引用**（转录侧特殊价值）。

建 topics 时在展示里说人话（"张三和李四在'预算'这条线上反复掐，要不要给这条线建个话题页 `topics/...`，把相关的人和事都串起来？"），同样走 ABCD 确认。

**调 AskUserQuestion 工具**给 ABCD（A 落含清理 / B 改循环 / C 都不动 / D 先补口述）。**B 循环到 A/C**；**D** 用户补口述（标 `(source:: 口述)`）→ 重算 W1-W3 → 重展示。**多文件分别确认**（`groups/X` + `persons/zhang-san` + `topics/Z` 各一轮，不打包）。

## 7. W5 Edit/Write + frontmatter 同步

- **新条目** → Edit 在 section 末尾追加 `- <描述> #type (key:: val) → [[...#^anchor]]`
- **强化** → Edit 改 `(seen:: N)` + `(last::)`
- **修订** → 改原 entry 正文 + 字段 + `(revised:: 今天)` + 括号备注
- **新建 person/group** → Read template 拿 frontmatter schema（person 用 `identities` map / group 用 `connector`+`chat_id`）→ Write 含 frontmatter + 用户答了的 section + 观察 entry
- **建 topics hub**（W4 确认后）→ Write `topics/<slug>.md`，**并在每个牵涉的 person/group 档案补一行 `[[topics/x]]`**（双向可达）
- **frontmatter 同步**：`last_updated: 今天`；person `interaction_count += N`
- **永远不改** `${CLAUDE_PLUGIN_ROOT}/references/templates/`

## 8. 同步 index.md + append log.md

每次落档后（memory-index.md "index.md + log.md"）：

- **`~/.memex/memory/index.md`**：写/删/改了哪些 note → 同步对应类别的一行摘要 + `[[link]]`（新建 note 加行，画像有重大变化更新摘要）。
- **`~/.memex/memory/log.md`（按日 digest）**：按 observation 涉及的**日期**归档"那天发生了啥、牵涉谁"（语义化，承载事件流，取代独立 events）。同一天 append 到该日块下：
  ```markdown
  ## [2026-05-08] 跨部门周会 · 预算评审
  - 张三公开施压把延期甩锅给我（#behavior §7 seen→4）；当场摆数据挡回 ✓ → [[persons/zhang-san]]
  - 关联线：[[topics/zhifu-zhonggou]]
  ```
  日期以"事件发生日"为准（不是落档日）；一天可多条。

只追加，不改写。用户选 C（都不动）则不写 index/log。

## 9. 收尾

> "还要提炼别的群 / 人 / 会议吗？观察没写完可以说'再加一条 xxx'我补进去。"

- 用户要回某条消息 → 路由 `reply-coach`
- 用户要纯口述改档案 → 路由 `comm-memory`
- 用户要拉新数据 → 路由 `ingest`

## 10. 不适用本 skill 的场景

- sources 为空 / 还没拉数据 → 先 `ingest`
- 用户已自足口述（不需要分析对话） → `comm-memory`
- 生成回复草稿 / 分析单条具体消息 → `reply-coach`
- 发送消息 → 不在本 skill scope

## 关键约束（汇总）

- 产物是 **W4 自然语言三段 + ABCD**，不是 markdown diff、不是简报文章
- **基本 connector 无关**：只读 `sources/` 提炼,不拉数据（拉数据是 ingest 的活）；仅 R0 身份解析调 connector `## identity`
- **建 person 前必先 R0 落实身份**（roster 或 `## identity` 解析）,禁止凭显示名/代号建档
- **triage 准入**：筛信号丢噪音，不逐条转写；大窗口两遍 distill；0 条是合理结果
- observation 用 **obsidian 原生格式**；`#behavior` 必带 `(pattern:: §N)(seen:: N)(last::)`
- 写 memory 必须 **AskUserQuestion**，多文件分别确认；**topics 提升（hotness）必须用户确认**
- 只对真实存在身份的人写 `persons/*.md`（`identities` map 主键）；口头提到无账号的外部人写到 `groups/<群>` 的"话题基线"
- 每次落档**同步 index.md + append log.md**
- **不分析单条消息怎么回**——那是 `reply-coach`
