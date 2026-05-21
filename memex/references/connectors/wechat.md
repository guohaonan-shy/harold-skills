# Connector: wechat / 微信 — 🚧 待实现

微信驱动占位。memex 的核心层（render-spec / memory wiki）已 connector 无关，接入微信 = 补齐下面四节，skill 不动。

person frontmatter 字段名：**`wechat: wxid_xxx`**。groups 平台独立（飞书群 ≠ 微信群，各自 `connector: wechat` + `chat_id`）；同一个人跨平台靠 person 的 `identities` map 合并、同一件事跨平台靠 `topics/` hub `[[link]]`。

## `## identity`
TODO：sender → wxid 解析；display name → wxid；拿"我"的 wxid（写 `config.json` 的 `self`）。微信无开放 OAuth，可能走第三方协议层 / 网页版抓取 —— 接入时评估合规与稳定性。

## `## fetch`
TODO：拉 raw → `~/.memex/raw/wechat/`，沿用 chats 按月 ndjson + `_meta.json` checkpoint 结构。微信无官方历史消息 API，需评估数据来源。

## `## render`
TODO：raw → `sources/wechat/chats/<group-pinyin>/<YYYY-MM>.md`，遵 `../render-spec.md` 统一格式 + 补 wechat 的 message_id → `^anchor` 映射。

## `## send`
TODO：`--dry-run` 先行 + 用户确认（`../conventions.md` §3）。
