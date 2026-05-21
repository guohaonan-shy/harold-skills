# Connector 契约（memex 多源抽象）

connector 是 memex 接入某个 IM 平台的**驱动**。它**不是 skill** —— 是一份 skill 在运行时按需加载的参考模块。skill 持**连接器无关的通用逻辑**（拉取节奏、渲染目标、提炼流程、回复策略）；具体"怎么跟 lark / wechat / slack 说话"全压进 `references/connectors/<name>.md`。

**加新平台 = 写一份 `connectors/<name>.md` + 在 `config.json` 注册，skill 一行不动。**

---

## connector 名只在两处出现

1. **skill 的 allowed-tools 权限模式**（plumbing，非逻辑）：如 ingest/reply-coach 声明 `Bash(lark-cli:*)`。加 wechat 时追加该平台 CLI 的模式。
2. **运行时由 config 选中后加载对应驱动文件**。skill 正文里不写"如果是 lark 就……"的分支 —— 它读 config 拿 `default_connector`，加载 `connectors/<那个名字>.md`，按下面四节契约调用。

skill 正文、memory 层、消费者层**完全 connector 无关**：它们只认 `sources/` 的统一渲染格式（见 `../render-spec.md`）和 memory wiki 格式（见 `../memory-index.md`）。

---

## 四节契约（每个 connector 必须实现）

每份 `connectors/<name>.md` 用固定四个 `##` 小节，skill 按节名查：

### `## identity`
sender → 规范人物 + **本 connector 在 person frontmatter `identities` map 里的字段名**。
- 字段名固定：lark→`lark`、wechat→`wechat`、slack→`slack`，值是该平台的稳定用户 ID。
- 提供"display name → 平台 ID"的解析命令（会议/转录里只有显示名时用），解析不到要能优雅降级（保留原名 + 标记待确认，不瞎归属）。
- 提供"拿当前登录用户（'我'）身份"的命令 —— 用于过滤"我发的消息"。**"我"的 ID 不持久化进 memory**，运行时查（可缓存进 `config.json` 的 `self`，见下）。

### `## fetch`
拉 raw → `~/.memex/raw/<name>/`，含**增量 / checkpoint 协议**。
- 落盘目录结构（chats 按月分桶 ndjson / transcripts / attachments / `_meta.json`）。
- checkpoint 字段（`last_fetched_at` 等）只放 `raw/<name>/chats/<id>/_meta.json`，**不进 memory**。
- 上下文 hydration（reply 链 / thread / 附件）—— 供 reply-coach 混合取数补拉。
- 去重靠平台稳定 message_id。

### `## render`
raw schema → `sources/<name>/` 的**统一格式**（遵 `../render-spec.md`，**不 connector 特异**）。
- 群消息 → `sources/<name>/chats/<group-pinyin>/<YYYY-MM>.md`
- 会议逐字稿 → `sources/<name>/meetings/<token>.md`
- 给出本平台 message_id → `^anchor` 的清洗映射（render-spec 规定通用规则，connector 补平台细节）。
- 渲染是确定性转换，不引入 LLM 判断（判断留给 recap 的 distill）。

### `## send`
对外写操作（回复消息）。
- **必须 `--dry-run` 先预演 payload**，用户显式确认后才真发（见 `../conventions.md` §3）。
- 仅 reply-coach 在用户明确"帮我发"时调用。

---

## `~/.memex/config.json` —— connector 注册表

用户的 connector 启用状态 + "我"身份缓存。**运行时数据**，由 `ingest` 首次 bootstrap，不是 plugin 文件。

```json
{
  "default_connector": "lark",
  "connectors": {
    "lark": {
      "enabled": true,
      "self": { "name": "Harold", "id": "ou_xxx" },
      "added_at": "2026-05-20"
    }
  }
}
```

- **`default_connector`**：只启用一个时，skill 不问直接用；多个时 AskUserQuestion 让用户选。
- **`connectors.<name>.enabled`**：哪些平台已接入。
- **`connectors.<name>.self`**：当前登录用户身份缓存（机器层，可刷新）。token 换了 / 解析过期就重查 `## identity` 的"拿当前用户"命令刷新 —— 区别于 memory 里"不持久化我的身份"那条原则：这里是**机器层可丢弃缓存**，不是画像。

skill 读 config 的顺序：`config.json` 不存在 → ingest bootstrap（跑该 connector 的 auth 检查 + 写 self）；存在 → 读 `default_connector` 或按 enabled 列表问用户。

---

## 当前 connector 状态

| connector | identities 字段 | 状态 | 驱动文件 |
|---|---|---|---|
| lark / 飞书 | `lark: ou_xxx` | ✅ 已实现 | `lark.md` |
| wechat / 微信 | `wechat: wxid_xxx` | 🚧 stub | `wechat.md` |
| slack | `slack: U…` | 🚧 stub | `slack.md` |
