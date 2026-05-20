# memex 跨 skill 约定

本文件被 plugin 内 4 个 skill（`ingest` / `recap` / `comm-memory` / `reply-coach`）共同遵守。每个 SKILL.md §0 必读约定 段引用本文件，不重复抄写。

memex = 多源个人记忆 wiki：可插拔 connector 拉对话 → 忠实渲染 `sources/` → 提炼成"人和事"的 obsidian wiki。connector 是运行时加载的驱动（见 `connectors/README.md`），不是 skill。

## 1. 数据存储分层

- **plugin 目录（只读）**：`${CLAUDE_PLUGIN_ROOT}/references/` 下的 connectors / prompts / templates / olden-patterns / memory-index / render-spec —— 方法论和驱动，跟随 plugin 版本。marketplace 升级会换路径，**runtime-mutable 状态绝不落这里**。
- **用户数据（可写，跨会话持久，每人独立，不进 git）**：`~/.memex/`
  - `~/.memex/config.json` —— connector 注册表（见 `connectors/README.md`）
  - `~/.memex/raw/<connector>/...` —— 机器事实（ndjson / transcript / 附件 / `_meta.json` checkpoint）
  - `~/.memex/sources/<connector>/...` —— raw 的忠实 markdown 渲染（见 `render-spec.md`）
  - `~/.memex/memory/` —— connector 无关的 wiki：`index.md` / `log.md` / `user-profile.md` / `persons/` / `groups/` / `topics/`（**无独立 events/ 类型**：一次性事件用行内 `#event` 记在所属 person/group，够热的升 `topics/`，时序流落 `log.md` 按日 digest）

**首次运行 bootstrap**（每个 skill §1 前置检查里固定一段，幂等）：

```bash
mkdir -p ~/.memex/memory/persons ~/.memex/memory/groups ~/.memex/memory/topics
# raw/ 和 sources/ 的 <connector> 子目录由 ingest 按选中的 connector 现建
```

**只 mkdir，不 cp 模板。** Memory 文件都按需由**用户触发**才建——`templates/` 是只读 schema 参考，AI 引导问答时按 template 的 section 列表问、用回答拼实际内容写盘，但**不把 template 复制成实际档案**。对齐 memory-index.md 两条原则：渐进累积不预填空 section / 未命中不自动建。

**`user-profile.md` 不存在的处理：**
- `comm-memory` —— 走引导问答，问完写一份只含用户答了的 section 的真实档案
- `reply-coach` / `recap` —— 软提示先跑 `/memex:comm-memory` 建用户画像，**不阻塞主流程**：
  > "你还没建用户画像，建议先跑 `/memex:comm-memory`，否则我对你的风格只能给通用建议。要继续吗？"

**`persons/<X>.md` / `groups/<X>.md` 不存在的处理：**
- `comm-memory` —— 走引导问答
- `recap` —— 从 `sources/` 提炼 → 候选写入流程 → 经用户确认才建（建 person 前必先经 connector `## identity` 落实身份，见 memory-index.md R0）
- `reply-coach` —— 软提示"还没给 X 建档" → 不阻塞，按通用模式给建议

## 2. connector 是唯一数据接入层

- 所有平台读写都走选中的 connector 驱动（`connectors/<name>.md`），**不**自建 SDK / 不包装 MCP。
- skill 读 `~/.memex/config.json` 选 connector（`default_connector` 或按 enabled 列表问用户），加载对应 `connectors/<name>.md` 当驱动。**skill 正文不写 connector 分支逻辑**；connector 名只出现在 allowed-tools 权限模式里。
- 每个碰平台的 skill §1 前置检查跑该 connector `## identity` / 前置段规定的安装 + auth 检查（lark：`lark-cli --version` / `lark-cli auth status`）。
- 输出统一 `--format json`，程序侧解析。具体 shortcut/API 的 flag 查 `connectors/<name>.md`。

## 3. 写操作的安全边界

- **读消息 / 拉历史 / 渲染 sources / 写 memory** —— 不需要平台层确认（写 memory 仍走 §7 的 W4 用户确认）。
- **发送消息 / 任何对外可见的写操作** —— 必须先 `--dry-run`（或 connector `## send` 的等价预演）把 payload 给用户看，用户显式确认后才真发。
- 默认行为是"生成回复草稿让用户自己复制粘贴"，**不**自动发送。

## 4. "参谋"而非"代笔"

精神是"用户最终决定 + 大概率会改"，不是"留半成品给用户填"。落到 reply-coach：

- 输出 **3 个差异候选**（保守 / 标准 / 微刺），每条都是**完整可发的文字**，**不放 `[占位符]` / `[补 XXX]`**。
- 用户**主动选一条**（AskUserQuestion）才进入下一步；**不**自动发送。
- 禁止公司腔客套话（"特别感谢"、"非常理解"、"高度重视"、"烦请"、"如有任何问题"等）——消息像正常人说话。
- **不给情绪价值**——用户要策略不要共情。
- 缺关键 concrete 信息（具体数据、某次会议结论、文档链接）→ **先 AskUserQuestion 问清楚再生成**，不瞎编也不留空。
- **预设策略库不擅自增减**：策略以 `prompts/reply-*.md` 文件为准（当前 8 个），reply-coach 按 memory + olden-patterns 自选 1 个推荐。库里没有合适的 → 暂用最近的 + 让用户 D. 自由输入；出现规律性新模式先和用户对齐、走升级流程加 prompt 文件，**模型不 reactive 新建**。注意"3"指 3 个候选强度，不是策略数。

## 5. 提问规范

按 harold-skills 顶层约定（AskUserQuestion vs 自然语言模板）：
- AQ 适用：单一离散选择 / 2-4 个选项 / 短 label / 不需要复合信息（选 connector / 选回复策略 / 选时间范围 / 选群 / W4 的 ABCD）
- 自然语言模板适用：粘贴 / 自由描述 / 文件路径 / 复合信息（用户口述记忆 / 描述某人风格 / 选项 > 4）
- 一次最多 3 个问题；自然语言模板始终保留"自定义"逃逸通道。

## 6. 输出语言

跟随用户输入语言。中文消息 → 中文输出（含回复草稿）；英文消息 → 英文输出。**不混用**。回复草稿中**不**出现"老登"二字（项目内部代号，仅 prompts / olden-patterns 内部使用，UI 文案禁用）。

## 7. Memory 写入原则

详见 `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`（写入流程 W1-W5、读取 R1-R2、observation 格式）+ `${CLAUDE_PLUGIN_ROOT}/references/diff-format.md`（W4 自然语言展示格式）。要点：

- **AI + 用户共同维护，同等权威。** 用户必须有"我说了算 + 我能改"的纠偏权。
- **三层加载：** `user-profile.md` 始终 → `groups/{group}.md` 按当前群 → `persons/{person}.md` 按对话人 → 相关 `events/` `topics/` 顺 `[[link]]` 摸瓜。
- **人记稳定特征 + 互动模式；群记场景特征；事记一次性；话题记跨时间线。** 同一人在不同群的多面性走群档案 + topics 索引。
- **渐进累积，可被推翻。** 新观察跟旧记录冲突 → **直接改原 entry** + `(revised:: YYYY-MM-DD)`，不堆冗余、不留旧版本。
- **Observation = obsidian 原生标记**（详见 memory-index.md "Observation 格式"）：
  - `## section 名` 自由（按真实维度起）
  - `#tag` type 闭合 4 类（**#profile / #event / #behavior / #strategy**）
  - `(key:: val)` inline field 自由 / `[[link]]` 实体关联 / `→ [[...#^anchor]]` provenance 回溯
- **写入流程 W1-W5：** Type 分类 → Dedup（LLM 语义判断，不算法）→ Section 归位 → 自然语言三段展示 + AskUserQuestion ABCD（**A 落 / B 改循环 / C 不落 / D 先补口述**）→ Edit + 同步 frontmatter。
- **多文件分别确认：** 一次调用写多个档案，每个文件独立一轮 ABCD，不打包。
- **topics 提升必须用户 W4 确认才建，绝不静默创建**（无独立 events 类型；一次性事件行内 `#event`，够热升 topics）。**身份落实**：建 person 前必经 connector `## identity` 解析得稳定 ID，禁止凭显示名/代号建档（memory-index.md R0）。
- **顺带清理建议：** W2 dedup 时扫老 entry，命中 Maintenance 条件的在 W4 末尾一并问（不另开流程）。`#profile` / `#strategy` 永不自动建议清理。
- **跨 connector：** persons 合并（frontmatter `identities` map）/ groups 平台独立（`connector` + `chat_id`）。
- **"我"的身份不持久化进 memory**（运行时查 connector identity；可缓存进 `config.json` 的 `self`）。**checkpoint（`last_fetched_*`）只放 `raw/<connector>/chats/<id>/_meta.json`**，不进 memory。
- **每次写 memory 后**同步 `memory/index.md` 对应行 + 按日 append `memory/log.md` 的 digest 条目（见 memory-index.md "index.md + log.md"）。
