# Connector: slack — 🚧 待实现

Slack 驱动占位。核心层已 connector 无关，接入 = 补齐下面四节，skill 不动。

person frontmatter 字段名：**`slack: U…`**（Slack user ID）。groups 平台独立（`connector: slack` + `chat_id`=channel ID）。跨平台合并/串联同 wechat。

## `## identity`
TODO：sender (`U…`) → person；display name / @handle → user ID（`users.lookupByEmail` / `users.list`）；拿"我"的 user ID（`auth.test`，写 `config.json` 的 `self`）。走 Slack Web API + Bot/User OAuth token。

## `## fetch`
TODO：拉 raw → `~/.memex/raw/slack/`。channel 历史 `conversations.history` + threads `conversations.replies`；按月 ndjson + `_meta.json` checkpoint（Slack 用 `ts` 游标做增量）。

## `## render`
TODO：raw → `sources/slack/chats/<channel-name>/<YYYY-MM>.md`，遵 `../render-spec.md` + 补 Slack `ts` → `^anchor` 映射（`ts` 含小数点，清洗成合法 anchor）。

## `## send`
TODO：`chat.postMessage` / threaded reply；`--dry-run` 等价预演 + 用户确认（`../conventions.md` §3）。
