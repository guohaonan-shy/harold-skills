# anti-olden 跨 skill 约定

本文件被 plugin 内 4 个 skill（`reply-coach` / `comm-memory` / `chat-recap` / `meeting-recap`）共同遵守。每个 SKILL.md §0 必读约定 段引用本文件，不重复抄写。

## 1. 数据存储分层

- **plugin 目录（只读）**：`${CLAUDE_PLUGIN_ROOT}/references/` 下的 cookbook / prompts / templates / olden-patterns / memory-index —— 模板和方法论，跟随 plugin 版本。
- **用户数据（可写，跨会话持久）**：`~/.anti-olden/`
  - `~/.anti-olden/memory/user-profile.md` —— 用户画像
  - `~/.anti-olden/memory/persons/<pinyin>_<ouid后6>.md` —— 人物档案
  - `~/.anti-olden/memory/groups/<group-slug>.md` —— 群组档案
  - `~/.anti-olden/raw/chats/<chat_id>/_meta.json` + `<YYYY-MM>.ndjson` + `threads/<thread_id>.ndjson`
  - `~/.anti-olden/raw/attachments/<file_key>.<ext>`
  - `~/.anti-olden/raw/transcripts/<minute_token>/`

**首次运行 bootstrap**（每个 skill §1 前置检查里固定一段，幂等）：

```bash
mkdir -p ~/.anti-olden/memory/persons ~/.anti-olden/memory/groups \
         ~/.anti-olden/raw/chats ~/.anti-olden/raw/attachments ~/.anti-olden/raw/transcripts
```

**只 mkdir，不 cp 模板。** Memory 文件（`user-profile.md` / `persons/<X>.md` / `groups/<X>.md`）都按需由**用户触发**才建——templates/ 是只读 schema 参考，AI 在引导问答时按 template 的 section 列表问问题、用回答拼实际内容写盘，但**不把 template 文件复制成实际档案**。这对齐 memory-index.md 两条原则：渐进累积不预填空 section / 未命中不自动建。

**user-profile.md 不存在的处理：**
- `comm-memory` —— 走 §4.4 引导问答，问完写一份只含用户答了的 section 的真实档案
- `reply-coach` / `chat-recap` / `meeting-recap` —— 软提示用户先跑 `/anti-olden:comm-memory` 建用户画像，**不阻塞主流程**：
  > "你还没建用户画像，建议先跑 `/anti-olden:comm-memory`，否则我对你的风格只能给通用建议。要继续吗？"

**persons/`<X>`.md / groups/`<X>`.md 不存在的处理：**
- `comm-memory` —— 走 §4.2 / §4.3 引导问答
- `chat-recap` / `meeting-recap` —— 拉到消息 / 转录后提炼 → 候选写入流程 → 经用户确认才建
- `reply-coach` —— 软提示"还没给 X 建档" → 不阻塞，按通用模式给建议

## 2. Lark CLI 是唯一数据接入层

- 所有飞书读写都走 `lark-cli`（来自官方 `larksuite/cli` skills 包），**不**自建 SDK / 不包装 MCP。
- 每个 skill §1 前置检查必跑：
  ```bash
  lark-cli --version       # 是否安装
  lark-cli auth status     # 是否登录
  ```
  没装提示 `npx skills add larksuite/cli -y -g`；未登录提示 `lark-cli auth login`。
- 输出统一 `--format json`，程序侧解析。
- 所有具体 shortcut 的 flag 表查 `${CLAUDE_PLUGIN_ROOT}/references/lark-cli-cookbook.md`。

## 3. 写操作的安全边界

- **读消息 / 拉历史 / 落 raw / 写 memory** —— 不需要确认。
- **发送消息 / 修改群设置 / 任何对外可见的写操作** —— 必须先 `--dry-run` 把 payload 给用户看，用户显式确认后才去掉 `--dry-run` 真跑。
- 默认行为是"生成回复草稿让用户自己复制粘贴"，**不**自动发送。

## 4. "参谋"而非"代笔"

精神是"用户最终决定 + 大概率会改"，不是"留半成品给用户填"。具体落到 reply-coach 的设计：

- 输出 **3 个差异候选**（保守 / 标准 / 微刺），每条都是**完整可发的文字**，**不放 `[占位符]` / `[补 XXX]`**——半成品占位符体验差，用户每次得自己填一遍。
- 用户**主动选一条**（AskUserQuestion）才进入下一步；**不**自动发送。
- 禁止公司腔客套话（"特别感谢"、"非常理解"、"高度重视"、"烦请"、"如有任何问题"等）——飞书消息像正常人说话。
- **不给情绪价值**——用户要策略不要共情。
- 缺失关键 concrete 信息（具体数据、某次会议结论、文档链接）时，**先 AskUserQuestion 问清楚再生成**，不瞎编也不留空。
- 三种预设回复策略，**不擅自增减**：
  - **柔和推进**（`prompts/reply-soft.md`）—— 对方需要被尊重感、ego 很高
  - **就事论事**（`prompts/reply-factual.md`）—— 对方习惯性否定但无实质论据（**没特别判断时默认这个**）
  - **强势推回**（`prompts/reply-push.md`）—— 对方在推卸责任或越界
  - 用户场景明显不在这三种里 → AskUserQuestion 给 D. Other 自由输入；如果出现规律性新模式，先和用户对齐再考虑加策略。

## 5. 提问规范

按 harold-skills 顶层约定（AskUserQuestion vs 自然语言模板）：
- AQ 适用：单一离散选择 / 2-4 个选项 / 短 label / 不需要复合信息（典型场景：选回复策略 / 选时间范围 / 选群）
- 自然语言模板适用：粘贴 / 自由描述 / 文件路径 / 复合信息（典型场景：用户口述记忆 / 描述某人风格）
- 一次最多 3 个问题；自然语言模板始终保留"自定义"逃逸通道。

## 6. 输出语言

跟随用户输入语言。中文消息 → 中文输出（含回复草稿）；英文消息 → 英文输出。**不混用**。回复草稿中**不**出现"老登"二字（这是项目内部代号，仅 prompts / olden-patterns 内部使用，UI 文案禁用）。

## 7. Memory 写入原则

详见 `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`（写入流程 W1-W5、读取 R1-R2）+ `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`（W4 自然语言展示格式）。要点：

- **AI + 用户共同维护，同等权威。** 用户必须有"我说了算 + 我能改"的纠偏权。
- **三层加载：** `user-profile.md` 始终 → `groups/{group}.md` 按当前群 → `persons/{person}.md` 按对话人。
- **人档案记稳定特征 + 互动模式；群档案记场景特征。** 同一人在不同群的多面性走群档案索引。
- **渐进累积，可被推翻。** 新观察跟旧记录冲突时**直接修改原 entry** + 加 `revised:YYYY-MM-DD` KV，不堆冗余、不保留旧版本。
- **Observation 三维度独立运转：**
  - `## section 名` 自由（按真实维度起，"权力逻辑" / "兴趣点" / "承诺记录" 都行）
  - `[type | KV]` inline 标签：type 闭合 4 类（**profile / event / behavior / strategy**），KV 自由
  - 详见 memory-index.md "Observation 三维度"段
- **写入流程 W1-W5：** Type 分类 → Dedup（LLM 语义判断，不算法）→ Section 归位 → 自然语言三段展示 + AskUserQuestion ABCD（**A 落 / B 改循环 / C 不落 / D 先补口述**）→ Edit + 同步 frontmatter `last_updated`。
- **多文件分别确认：** 同一次调用要写多个档案，每个文件独立一轮 ABCD，不打包。
- **修订规则：** 旧 entry 有偏差 → 直接改 + 加 `revised` KV + 行尾括号备注原因。**不**保留旧条目作冗余、**不**另开 "## 历史认知" section（git diff + revised 已经够 audit trail）。
- **顺带清理建议：** 写入 W2 时模型扫一遍现有档案，老 `[event | one-off:true] > 30 天` / 普通 `[event] > 6 个月` / `[behavior]` 最近一次 `> 6 个月` 的退潮模式 → 在 W4 末尾建议清理（独立一轮 ABC，不混进写入决策）。`[profile]` / `[strategy]` 永不自动建议清理。
- **Section 名改名 / 合并：** AI 可以建议，必须用户在 W4 确认才改，不静默改。
- **拉取状态（`last_fetched_*`）只放 `~/.anti-olden/raw/chats/<id>/_meta.json`，不进 memory frontmatter。** IO 状态归 raw，画像归 memory。
