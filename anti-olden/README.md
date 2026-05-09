# anti-olden

职场沟通参谋 / Workplace communication coach for Lark (飞书). Three Claude Code skills that help you analyze high-friction messages, maintain person + group profiles, and draft replies under three preset strategies.

> "老登" 是 Harold 给 anti-olden 的项目内部代号，指**高沟通成本协作对象**（高 ego / 习惯性否定 / 推卸责任 / 公开施压等）。这个代号只在 plugin 内部 prompts 和 patterns 文件里使用，**不会出现在任何 UI 文案、回复草稿或档案正文里**。

## What's inside

| Skill | When to use | Reads | Writes |
|---|---|---|---|
| [`reply-coach`](./skills/reply-coach/) | 起草高情绪成本消息的回复——拉消息上下文 → 加载档案 → 生成 3 个**完整可发**候选（保守 / 标准 / 微刺）+ 反应分支预判 | memory + lark messages | nothing (只读) |
| [`comm-memory`](./skills/comm-memory/) | 纯**用户口述**驱动的记忆 CRUD——查 / 改 / 新建 用户画像 + 人物档案 + 群组档案 | memory | memory |
| [`chat-recap`](./skills/chat-recap/) | 从飞书 IM 消息（群 / DM）提炼候选观察 → 用户审 → 落档案 | lark IM messages + memory | memory + raw cache |
| [`meeting-recap`](./skills/meeting-recap/) | 从飞书会议 / 妙记转录提炼候选观察（带"线下尾巴"框架）→ 用户审 → 落档案 | lark vc transcripts + memory | memory + raw cache |

## Architecture in one paragraph

`lark-cli` 是唯一数据接入层（来自官方 `larksuite/cli` skills 包，**不**自建 SDK / 不包装 MCP）。所有飞书消息 / 转录 / 附件先按追加协议落到 `~/.anti-olden/raw/`（事实层），4 个 skill 共享读取；提炼后的人物 / 群组 / 用户画像写到 `~/.anti-olden/memory/`（画像层，自然语言）。Plugin 目录里 `references/` 装方法论 / 命令配方 / 模板，**只读**——版本升级换路径时用户数据不动。

**chat-recap vs meeting-recap**：schema 不同（IM 消息是结构化 ndjson；妙记转录是说话人时间戳+文本流）、分析框架不同（消息侧侧重跨群频率 / 模式重复；转录侧侧重"线下尾巴"——hedging / 插话 / 被追问反应）。两者互补，不重叠。

## Install

前置：先装官方 Lark CLI plugin（提供 `lark-cli` 和 `lark-im` / `lark-contact` / `lark-vc` 等 skills）：

```bash
npx skills add larksuite/cli -y -g
lark-cli auth login                       # OAuth，一次性
```

然后装 anti-olden：

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install anti-olden
/reload-plugins
```

## Quick start

第一次用，建议这个顺序：

1. **建用户画像**：`/anti-olden:comm-memory` → 顺着引导问答把"我是谁、什么风格、绝对不用的措辞、默认策略偏好"答一遍（不答完也行，渐进累积）
2. **遇到不好回的消息**：`/anti-olden:reply-coach` → 贴消息 / 给 chat_id → 自动拉上下文 + 加载档案 + 给 3 候选 + 分支预判
3. **想给某人 / 某群建档**：
   - 已经有完整口述（"X 是 xx 风格，雷区是 yy"） → `/anti-olden:comm-memory`
   - 想基于飞书 IM 消息提炼 → `/anti-olden:chat-recap`
   - 想基于会议 / 妙记转录提炼 → `/anti-olden:meeting-recap`

## Data layout

```
~/.anti-olden/                            # 用户数据（跨会话持久，gitignore，每人独立）
├── memory/
│   ├── user-profile.md                  # 自己的画像（始终加载）
│   ├── persons/<pinyin>.md              # 人物档案（按需建）
│   └── groups/<pinyin>.md               # 群组档案（按需建）
└── raw/
    ├── chats/<chat_id>/
    │   ├── _meta.json                   # last_fetched_* IO 状态
    │   ├── <YYYY-MM>.ndjson             # 主消息按月分桶
    │   └── threads/<thread_id>.ndjson   # thread 子消息（lazy）
    ├── attachments/<file_key>.<ext>     # 图片 / 文件 / 音频
    └── transcripts/<minute_token>/      # 会议逐字稿（跨会话持久）

${CLAUDE_PLUGIN_ROOT}/                    # plugin 目录（只读）
└── references/
    ├── conventions.md                   # 跨 skill 行为约定
    ├── memory-index.md                  # 三层加载 + 写入通用规则
    ├── lark-cli-cookbook.md             # CLI 命令 + 落盘协议
    ├── olden-patterns.md                # 8 类高沟通成本模式速查
    ├── diff-format.md                   # chat-recap / meeting-recap / comm-memory 共用的 W4 自然语言展示格式
    ├── prompts/{analyze,analyze-transcript,reply-soft,reply-factual,reply-push}.md
    └── templates/{user,person,group}-profile.md
```

## Design principles

- **AI + 用户共同维护 memory**——同等权威，混在同一文件不区分来源
- **渐进累积**——不预填空 section，用户答"不知道"就跳过
- **未命中不自动建档**——`persons/<X>.md` / `groups/<X>.md` 必须用户触发才创建
- **Checkpoint 归 raw 不归 memory**——拉取状态在 `raw/chats/<id>/_meta.json`，画像归 memory，IO 状态不污染正文 frontmatter
- **写 memory 必须用户确认**——AskUserQuestion 给 ABC 选项，B 修改循环直到 A 或 C
- **写飞书消息必须 dry-run**——生成回复默认是"用户复制粘贴"，要求"帮我发"时也得 dry-run + 用户确认才真发
- **三种回复策略不擅自增减**——柔和推进 / 就事论事 / 强势推回；用户场景明显不在范围内先和用户对齐

## Caveats

- **`lark-cli auth status` 拿的 `userOpenId` 不持久化进 memory** —— 运行时查，避免 ID 漂泊
- **会议转录拉一场就持久化** —— `~/.anti-olden/raw/transcripts/<token>/transcript.txt` 跨会话不删，重看不再调 API
- **today-@ 路径**部分 lark-cli shortcut 还需 Phase 0 实测确认（cookbook "仍需 Phase 0 发现"段）—— 短期兜底是逐 chat + jq 过滤 mentions
- **三个 skill 共享 `~/.anti-olden/`，不要并行跑两个 anti-olden skill** —— raw 追加协议没设计并发锁

## License

MIT
