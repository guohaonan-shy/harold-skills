# memex

个人记忆 wiki / Personal memory wiki built from your conversations. 可插拔 connector（lark / 飞书 today；wechat / slack later）拉对话 → 忠实渲染成 markdown → 慢慢提炼成"人和事"的 obsidian wiki。Five Claude Code skills, verb-oriented: `ingest`（拉+渲染）/ `recap`（提炼）/ `comm-memory`（口述 CRUD + 体检）/ `recall`（模糊召回前门）/ `reply-coach`（起草高情绪成本回复）。

> **memex** = Vannevar Bush 1945 的 "memory extender"：存下你所有记录/通信、用关联轨迹（associative trails = `[[link]]` / provenance）串起来的个人设备。第二大脑的鼻祖概念。记忆框架参考 OpenHuman obsidian-wiki + Karpathy 的 LLM Wiki。
>
> "老登" 是项目内部代号，指**高沟通成本协作对象**（高 ego / 习惯性否定 / 推卸责任 / 公开施压等），只在 plugin 内部 prompts / patterns 文件里用，**不出现在任何 UI 文案、回复草稿或档案正文里**。

## What's inside

| Skill | When to use | Reads | Writes |
|---|---|---|---|
| [`ingest`](./skills/ingest/) | 把对话从某平台拉进来并渲染成可读 markdown（fetch + render） | connector（lark…） | `raw/` + `sources/` + `config.json` |
| [`recap`](./skills/recap/) | 把已渲染的 `sources/` 提炼成人/事档案（kind-aware：chat 跨群模式 / meeting "线下尾巴"）→ 用户审 → 落档 | `sources/` + memory | memory（+ index/log） |
| [`comm-memory`](./skills/comm-memory/) | 纯**用户口述**驱动的记忆 CRUD + **lint 健康检查**——查 / 改 / 新建 画像 / 人 / 群 / 话题 | memory | memory（+ index/log） |
| [`recall`](./skills/recall/) | **读取侧统一前门**：把任意**模糊 query**（"那个想挤我走的人是谁" / "怎么回这条" / "上个月发生啥"）落到 wiki 相关上下文并作答（带 provenance） | memory + sources/ + connector(身份) | nothing（只读） |
| [`reply-coach`](./skills/reply-coach/) | recall 的回复型消费场景——3 个**完整可发**候选（保守/标准/微刺）+ 分支预判 | memory + sources/ + connector | nothing（只读；末尾 offer 回填） |

**5 个 skill，写 3 读 2**：写入侧 `ingest`→`recap`（拉完自动接，写 memory 仍走 W4 ABCD）+ `comm-memory`（口述/lint）；读取侧 `recall`（模糊召回的唯一前门）+ `reply-coach`（回复型消费）。connector 是运行时加载的**驱动**（`references/connectors/<name>.md`），不是 skill。

## Architecture in one paragraph

三层、connector 无关：**connector 层**（lark/wechat/slack 各自的 fetch+render 驱动）把对话拉成 `raw/` 再忠实渲染成 `sources/<connector>/*.md` 的**统一格式**（= 集成缝）；**核心层** `memory/` 是 connector 无关的 obsidian wiki，用 `#tag`（type）+ Dataview `(key:: val)`（字段）+ `[[wikilink]]`（实体关联）+ `^anchor`（回溯 sources 原文）写人/群/话题；**消费者层**走 `recall`（读取前门：模糊 query→相关上下文，引擎是 Claude Code 自带的 grep/Read，无 embedding），`reply-coach` 等是它的细分场景。**加新平台 = 写一份 connector 模块，核心和消费者一行不动。** persons 跨平台合并（frontmatter `identities` map），groups 平台独立（`connector` + `chat_id`），同一件事跨平台靠 `topics/` hub `[[link]]` 串起来。**没有独立 events 类型**：一次性事件用行内 `#event` 记在所属 person/group，够热的（跨实体反复）升 `topics/`，时序"哪天发生啥"落 `log.md` 按日 digest（Karpathy/OpenHuman 都不设独立 event 类型）。

memex 是 **agent-driven**：借 OpenHuman / Karpathy 的数据模型和概念（三层 / compile / triage 准入 / index+log / lint），但不要后台 daemon / job 队列 / SQLite / embedding——后台 worker 持续做的，agent 在一次 skill 调用里做完，用 grep + LLM 语义判断而非向量。

## Install

前置：当前 connector 是 lark，先装官方 Lark CLI plugin（提供 `lark-cli` + `lark-im` / `lark-contact` / `lark-vc` 等）：

```bash
npx skills add larksuite/cli -y -g
lark-cli auth login --scope "<最小 scope 集，见 references/connectors/lark.md>"   # OAuth，一次性
```

然后装 memex：

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install memex
/reload-plugins
```

## Quick start

第一次用，建议这个顺序：

1. **建用户画像**：`/memex:comm-memory` → 顺着引导问答把"我是谁、什么风格、绝对不用的措辞、默认策略偏好"答一遍（不答完也行，渐进累积）
2. **接入 + 提炼**：`/memex:ingest` → 选 lark（只有一个 connector 不问）、拉近 14 天消息渲染成 `sources/`，自动接 `recap` 筛信号、提观察、走 ABCD 落档
3. **遇到不好回的消息**：`/memex:reply-coach` → 贴消息 / 给 chat_id → 历史上下文读 sources、目标消息实时补拉 + 加载档案 + grep 该人模式/策略 → 3 候选 + 分支预判；用完 offer 回填这次用了哪个策略
4. **日常维护**：想起点关于某人的事 → `/memex:comm-memory` 口述补充；档案乱了/久了 → `/memex:comm-memory` 喊"体检下我的 memex"（lint：孤儿/缺链/矛盾/过时/数据空洞/新连接 + 提议新话题）

**用 Obsidian 打开 `~/.memex/memory/`**：graph 看人/事连接、backlinks 看谁牵涉谁、`index.md` 一眼总览。你几乎不用手写，skill 在维护；但随时能改，改了下次 skill 认你的。

## Data layout

```
~/.memex/                                  # 用户数据（跨会话持久，gitignore，每人独立）
├── config.json                            # connector 注册表：default_connector + connectors{lark:{enabled, self, added_at}}
├── raw/<connector>/                       # 机器事实（不进 git）
│   ├── chats/<chat_id>/{_meta.json, <YYYY-MM>.ndjson, threads/}
│   ├── transcripts/<minute_token>/{_meta.json, transcript.txt}
│   └── attachments/<file_key>.<ext>
├── sources/<connector>/                   # raw 的忠实 markdown 渲染（统一格式，可 Obsidian 打开）
│   ├── chats/<group-pinyin>/<YYYY-MM>.md
│   └── meetings/<minute_token>.md
└── memory/                                # connector 无关的 wiki
    ├── index.md                           # LLM 维护的内容目录（导航/概览）
    ├── log.md                             # 按日 digest（事件流：哪天发生啥、牵涉谁）
    ├── user-profile.md                    # 自己的画像（始终加载）
    ├── persons/<pinyin>.md                # 人物档案（frontmatter identities map）
    ├── groups/<pinyin>.md                 # 群组档案（frontmatter connector + chat_id）
    └── topics/<slug>.md                   # 话题/项目线/重大事件 hub（无独立 events/）

${CLAUDE_PLUGIN_ROOT}/                      # plugin 目录（只读）
└── references/
    ├── conventions.md                     # 跨 skill 行为约定
    ├── memory-index.md                    # 三层 + 写入 W1-W5 + 检索 + triage + index/log + lint（核心规格）
    ├── render-spec.md                     # raw → sources 渲染格式（集成缝）
    ├── connectors/{README,lark,wechat,slack}.md   # connector 契约 + 各平台驱动
    ├── olden-patterns.md                  # 8 类高沟通成本模式速查
    ├── diff-format.md                     # recap / comm-memory 共用的 W4 自然语言展示格式
    ├── prompts/{analyze,analyze-transcript,reply-*}.md   # 分析 + 8 个回复策略
    └── templates/{user,person,group,event,topic}-profile.md
```

## Design principles

- **AI + 用户共同维护 memory**——同等权威，混在同一文件不区分来源；写的是"人"，比研究笔记高敏，**确认门不省**
- **observation = obsidian 原生标记**——`#tag` + `(key:: val)` + `[[link]]` + `^anchor`，同时喂 Obsidian Dataview / graph 和我们的 grep + reply-coach
- **渐进累积，未命中不自动建档**——`persons` / `groups` / `topics` 必须用户触发才创建；建 person 前先经 connector 落实身份（不凭显示名/代号）
- **triage 准入**——recap 筛信号丢噪音、不逐条转写；大窗口两遍 distill；0 条是合理结果
- **写 memory 必须用户确认**——AskUserQuestion ABCD，B 修改循环直到 A/C；topics 提升（hotness）也必须确认
- **写消息必须 dry-run**——生成回复默认"用户复制粘贴"，要求"帮我发"时也得 dry-run + 确认才真发
- **回复策略库不擅自增减**——8 个 prompt（柔和/就事论事/强势/装傻/公开冷处理/锚定时间/去情绪/锁死模糊）；"3"指 3 个候选强度
- **输出回填复利**——reply-coach 末尾 offer 把用过的策略 + outcome 沉淀回 wiki，下次决策更准（Karpathy 的 add-up）

## Caveats

- **"我"的身份不持久化进 memory** —— 运行时查 connector identity，避免 ID 漂泊；`config.json` 的 `self` 是可刷新的机器层缓存
- **会议转录拉一场就持久化** —— `raw/<connector>/transcripts/<token>/transcript.txt` 跨会话不删，重看不再调 API
- **connector 名只在 skill 的 allowed-tools 和 config 选择里出现** —— skill 正文 connector 无关，全部驱动 `connectors/<name>.md` 契约
- **wechat / slack 当前是 stub** —— 核心层已 connector 无关，接入 = 补齐 `connectors/<name>.md` 四节契约（identity/fetch/render/send），skill 不动
- **不要并行跑两个 memex skill** —— raw 追加协议没设计并发锁
- **从 anti-olden 迁移**：用户数据目录 `~/.anti-olden/` → `~/.memex/`；老的 bracket DSL（`[behavior | pattern:§N]`）→ obsidian 原生（`#behavior (pattern:: §N)`）。迁移老数据可手动 `mv ~/.anti-olden ~/.memex` 后按新语法整理（或重新 ingest）。

## License

MIT
