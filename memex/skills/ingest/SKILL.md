---
name: ingest
description: 把对话从某个平台拉进 memex 并渲染成可读 markdown（fetch + render，不写 memory）。任何提到 拉消息 / 同步 / 把 X 群拉进来 / 拉一下飞书 / 同步最近的聊天 / 把跟 X 的对话拉进来 / 拉会议转录 / 拉妙记 / 把 Kickoff 拉进来 / 更新原始数据 / ingest / sync / 接入飞书 / 连接飞书 / 渲染对话 的场景都触发本 skill。**分界**：（1）拉完要提炼成人/事档案 → 接着走 recap；（2）用户只是口述建档（不拉数据）→ comm-memory；（3）只想要某条消息的回复 → reply-coach。本 skill **只碰 raw/ + sources/，不写 memory**。
allowed-tools: Bash(lark-cli:*), Bash(mkdir:*), Bash(ls:*), Bash(jq:*), Bash(grep:*), Bash(cat:*), Bash(tail:*), Bash(chmod:*), Read, Write, Edit, AskUserQuestion
---

# ingest — 拉数据 + 渲染（fetch + render）

memex 的数据入口。读 `config.json` 选 connector → 驱动该 connector 的 `## fetch` 把对话拉成 `raw/` → 驱动 `## render` 渲染成 `sources/` 的统一 markdown。**不分析、不写 memory** —— 提炼是 recap 的活，本 skill 只负责把"原始事实"和"人可读渲染"准备好。

集成缝是 `sources/` 的统一格式：任何 connector 都吐出同一种渲染，下游 recap / reply-coach 完全 connector 无关。

## 0. 必读约定

- 跨 skill 行为约定（数据分层 / connector 是唯一接入层 / 写操作安全） → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **connector 契约 + config.json 注册表** → `${CLAUDE_PLUGIN_ROOT}/references/connectors/README.md`
- **选中 connector 的驱动**（fetch / identity / render 命令） → `${CLAUDE_PLUGIN_ROOT}/references/connectors/<name>.md`（lark 已实现）
- **raw → sources 渲染格式** → `${CLAUDE_PLUGIN_ROOT}/references/render-spec.md`
- 数据三层路径（raw / sources / memory 的实际位置） → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md` 顶部路径表（本 skill 只写前两层）

## 1. 前置检查 + bootstrap

```bash
mkdir -p ~/.memex/memory/persons ~/.memex/memory/groups ~/.memex/memory/topics
```

### 1.1 选 connector（读 config.json）

```bash
cat ~/.memex/config.json 2>/dev/null | jq .
```

- **`config.json` 不存在 → bootstrap**（首次接入；**只注册这次要用的那个 connector**，其他平台等真用到再注册）：
  1. 确认这次要用哪个 connector（用户的请求里通常已隐含，如"拉飞书"→lark；不明确则 AskUserQuestion）。跑它的前置命令（lark：`lark-cli --version`）；没装 → 提示安装（lark：`npx skills add larksuite/cli -y -g`）。
  2. 跑该 connector `## identity` 的"拿当前用户"命令验证已登录（lark：`lark-cli auth status --format json | jq '{name:.userName, id:.userOpenId}'`）。未登录 → 提示 `lark-cli auth login`（agent 非阻塞流见 `connectors/lark.md`），暂停等用户。
  3. Write `~/.memex/config.json`：`default_connector` = 这个 connector + `connectors.<name>.{enabled:true, self:{name,id}, added_at:今天}`（只这一个条目）。
- **`config.json` 存在**：取 `default_connector`；多个 `enabled` 时 AskUserQuestion 让用户选这次用哪个。
- **`self` 过期/缺失**（token 换了）→ 重跑 identity 命令刷新 `connectors.<name>.self`。

> connector 名只在 allowed-tools 和此处选择里出现。下文一律说"驱动 `## fetch` / `## render`"，不写平台分支。

## 2. 范围确认（AskUserQuestion）

**拉什么** —— 决定走 chat 还是 meeting 渲染：

- "某个群 / DM 的消息" → **chat 路径**（§3.1 + §4.1）
- "某个人最近的表现"（跨群聚合） → **chat 路径**，多 chat
- "会议 / Kickoff / 妙记 / 转录" → **meeting 路径**（§3.2 + §4.2）
- "今日 @ 我" → chat 路径，过滤 mentions

群名 / 人名歧义 → 用驱动 `## fetch` / `## identity` 的搜索命令（lark：`+chat-search --query` / `contact +search-user --query`）解析，AskUserQuestion 让用户确认 `chat_id` / 人物 ID。

**人物路径必问"代号 / 别名"**（群里常用绰号 / 数字代号 / 英文缩写，光搜真名漏一半信号）：
> "你们群里叫他有别的称呼吗？数字代号 / 绰号 / 英文名 / 外号？"
代号加进过滤关键词。

## 3. fetch → raw（驱动 connector `## fetch`）

**拉取命令、分页脚手架、增量追加协议、checkpoint 全部按选中驱动的 `## fetch` 节，直接用不要重写。** 落 `~/.memex/raw/<connector>/`。

### 3.1 chat 路径

- 主消息按月分桶 ndjson + 去重（message_id）+ bump `_meta.json` 的 checkpoint。
- 媒体消息默认下载附件；带 `thread_id` 的按 lazy 规则拉 thread。
- **窗口判断**（按 `_meta.json`）：

| 条件 | 模式 | 窗口 |
|---|---|---|
| `_meta.json` 不存在 / `last_fetched_at` > 30 天 | 冷启动 | 默认 14 天 |
| `last_fetched_at` 在 30 天内 | 增量 | `--start = last_fetched_at + 1s` |
| 用户显式指定 | 自定义 | 按用户 |

文本告诉用户走了哪个模式（不用 AQ）。人物路径 = 对每个共同 chat 分别走，checkpoint per-chat。

### 3.2 meeting 路径

- 按驱动 `## fetch` 的会议链路：搜会议 → **用户挑 1-3 场议题密集的**（每场数万 tokens，AskUserQuestion multiSelect，**不全量拉**）→ 拉 transcript 到 `raw/<connector>/transcripts/<token>/`。
- 已有 `transcript.txt` 跳过（妙记一旦生成不变）。

**完整性校验**：拉完确认 checkpoint 指向的 message_id 能在月桶里 grep 到、附件齐全，避免半拉状态污染下次增量。

## 4. render → sources（驱动 connector `## render`，遵 render-spec）

把刚拉的 raw 渲染成 `~/.memex/sources/<connector>/` 的统一 markdown。**格式权威是 `render-spec.md`，平台特定映射（anchor 清洗 / 字段路径）在驱动 `## render` 节。**

### 4.1 chat → `sources/<connector>/chats/<group-pinyin>/<YYYY-MM>.md`

- 每条消息 `**MM-DD HH:mm 发言人**` + 正文 + 行尾 `^anchor`；reply → `↳ 回复 [[#^parent]]`。
- **媒体铁律(render-spec「媒体处理」)**：媒体消息**必下载二进制**到 `raw/.../attachments/`，**图片必用视觉 Read 出一句话 caption** 写进渲染 `[图片: <内容>](相对链接) ^anchor`(纯表情标 `[表情]` 可不细读)。**不留只标 `[图片]` 的裸占位**——否则下游会"绕图瞎猜"(踩过坑)。承重图必看。
- "我"（`config.self.id` 匹配 sender）渲染成 `我`。
- `<group-pinyin>` 与未来 `groups/<group-pinyin>.md` 命名对齐（同 slug）。
- **写 sender roster（身份落实，#1）**：渲染时把本月出现过的所有发言人 `显示名 → <connector>:<id>` 写进该 sources 文件 frontmatter 的 `roster:` 字段（raw 里现成有 `sender.id`，零额外调用）。下游 recap 直接读 roster 给群成员 keying，无需再调 CLI；被议论的非成员仍由 recap 走 connector `## identity` 解析。
- **幂等增量**：已有 anchor 不动，只追加新消息行（message_id 稳定保证 memory 的 `[[...#^anchor]]` 永久有效）。

### 4.2 meeting → `sources/<connector>/meetings/<token>.md`

- 说话人 display name 经驱动 `## identity` 解析归一为 `[[persons/<pinyin>]]`；**解析不到保留原名 + 标 `（待确认身份）`，不瞎归属**（同名误伤会污染下游）。
- 填充词 / 打断 / 重复**全保留**（recap 的"线下尾巴"分析靠这些）；每段发言 `^t<序号>`；frontmatter `participants` 列解析出的 `[[link]]`。

渲染是确定性转换 —— **不摘要、不删、不引入 LLM 判断**（判断留给 recap）。

## 5. 自动接 recap 提炼

fetch + render 完成后**自动续上 recap 的 distill 流程**（不要停下来等用户手敲 `/memex:recap`）。先一句话报告拉了什么、渲染到哪：
> "拉好了：X 群 2026-04 ~ 2026-05 共 N 条 → `sources/lark/chats/x-qun/`。我接着提炼成人/事档案。"

然后按 **`skills/recap/SKILL.md` 的 distill 流程**（triage 准入 → W1–W5）处理刚渲染的 sources。**写 memory 仍走 recap 的 W4 ABCD 用户确认门**——"自动连跑"指不用用户重新唤起 skill，不是跳过确认。

例外（不自动续）：
- 用户在 §2 明确说"只拉不提炼" / "先拉着" → 停在渲染，提示之后可 `/memex:recap`。
- 渲染出的 sources 没有可提炼信号（纯物流/寒暄）→ recap 的 triage 会判空，如实说"没什么可沉淀的"。

## 6. 不适用本 skill 的场景

- 已自足口述、不需要拉数据 → `comm-memory`
- 已有 sources 只差提炼成档案 → `recap`
- 单条消息怎么回 → `reply-coach`
- 发送消息 → 不在本 skill scope（写操作走驱动 `## send` 的 dry-run，见 `conventions.md` §3）

## 关键约束（汇总）

- **只写 `raw/` + `sources/` + `config.json`，绝不写 `memory/`**（写权限边界见 memory-index.md "谁写什么"）。
- **connector 无关**：skill 正文不写平台分支，全部驱动 `connectors/<name>.md` 的契约节。
- 渲染**忠实无损 + 幂等**：不摘要、anchor 稳定、增量只追加。
- 拉会议**必须用户挑场次**；说话人归属解析不到不瞎归。
- checkpoint 归 `raw/<connector>/chats/<id>/_meta.json`，不进 memory。
