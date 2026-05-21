# Connector: lark / 飞书

memex 的飞书驱动。底层是官方 `larksuite/cli` 包提供的 `lark-cli`（**二进制名 `lark-cli`，不是 `lark`**）。本文件按四节契约（`identity` / `fetch` / `render` / `send`）组织，是 skill 运行时**查命令的首选**。cookbook 里没有的，用 `lark-cli schema <path>` 或 `lark-cli <cmd> --help` 发现后再写，**不要凭记忆猜语法**。

Lark CLI：https://github.com/larksuite/cli ｜ 安装：`npx skills add larksuite/cli -y -g`（或 `npm install -g @larksuite/cli`）

---

## 前置：auth + scope（一次性）

```bash
lark-cli config init --new                       # 配置应用凭证
lark-cli auth login --scope "<显式 scope 列表>"   # 授权（从下面最小集复制）
lark-cli auth status                             # 验证 token 实际带了哪些 scope
```

**精确 `--scope`，不用 `--recommend` / `--domain`**：后者只请求"常用"scope，需审核的（如 `minutes:minutes.transcript:export`）不进授权页，到 `vc +notes` 就 `missing_scope` 401。

**最小 scope 集（16 条，2026-04-23 实测）：**

```
# 认证基建
auth:user.id:read
offline_access
# 消息读取（reply-coach / ingest chat）
im:message:readonly
im:message.group_msg:get_as_user
im:message.p2p_msg:get_as_user
im:chat:read
im:chat.members:read
# 联系人查找（identity 解析）
contact:user.base:readonly
contact:user:search
# 会议索引（ingest meeting）
vc:meeting.search:read
vc:record:readonly
vc:note:read
# 妙记内容（transcript 链路）
minutes:minutes.search:read          # 免审
minutes:minutes:readonly             # 需审核
minutes:minutes.artifacts:read       # 免审
minutes:minutes.transcript:export    # 需审核（逐字稿导出）
```

**Write scope 刻意不申请**：默认行为是生成文本让用户复制粘贴。reply-coach 真要自动发再单独追加 `im:message`。

**⚠️ OAuth scope 累积坑**：飞书不允许用 `--scope` 缩窄 token，新 token scope = `历史累计 ∪ 本次`。真要缩范围：`auth logout` → 后台删 scope → 重新 `auth login`。

**Agent 非阻塞授权流**（Claude Code）：`auth login` 默认阻塞等浏览器。拆两步：
```bash
lark-cli auth login --no-wait --json --scope "<列表>"   # 返回 device_code + verification_url，立刻返回
lark-cli auth login --device-code "<code>" --json       # run_in_background + Monitor 挂 "ok":true
```

**需审核权限**走应用管理员在企业后台审批（自建应用管理员通常就是创建者本人，自批即可，不等飞书人工审）。

兜底：`lark-cli auth scopes`（可申请的全部）/ `lark-cli auth check --scope "<x>"`（当前 token 是否含某 scope）。

---

## 命令形态 + 发现顺序

两种形态并存：**shortcut**（`+` 前缀，高频简写：`lark-cli im +chat-messages-list ...`）和 **raw API**（覆盖 2000+ 端点：`lark-cli api GET /open-apis/<path> --params '{...}'`）。

发现命令按序查：`lark-cli <service> --help` → `lark-cli schema` → `lark-cli schema <service>.<resource>.<action>` → 官方 REST 文档兜底。输出统一 `--format json`（下游 `jq`）；大批量用 `ndjson`。

---

## `## identity`

person frontmatter 字段名：**`lark: ou_xxx`**（open_id，`ou_` 前缀）。

**拿当前用户（"我"）：** 用于过滤"我发的消息" + 写进 `config.json` 的 `self`。
```bash
lark-cli auth status --format json | jq '{name:.userName, id:.userOpenId}'
```
**不把 ou_id 持久化进 memory 正文**（运行时查 / config self 缓存）。

**display name → ou_id（会议归属、人物建档）：**
```bash
lark-cli contact +search-user --query "<中文名或英文名>" --format json \
  | jq '.data.users[] | {open_id, name, en_name, department_ids}'
```
解析不到 → 保留原名 + 标 `（待确认身份）`，**不瞎归属**（避免同名误伤）。

**反查 ou_id（按 email/mobile）/ 拿用户详情：**
```bash
lark-cli api POST /open-apis/contact/v3/users/batch_get_id --params '{"user_id_type":"open_id"}' --data '{"emails":["x@co.com"]}'
lark-cli api GET /open-apis/contact/v3/users/<user_id> --params '{"user_id_type":"open_id"}' --format json
```

**别名/代号坑**：同事群里常用数字代号 / 表情 / 昵称 / 英文缩写互称，光搜真名会漏一半信号 —— 建档前问用户该人在群里有没有别称，加进过滤词。

---

## `## fetch`

拉 raw → `~/.memex/raw/lark/`。目录约定：

```
~/.memex/raw/lark/
├── chats/<chat_id>/
│   ├── _meta.json                    # chat 元信息 + last_fetched_*（checkpoint）
│   ├── <YYYY-MM>.ndjson              # 主消息按月分桶，一行一条
│   └── threads/<thread_id>.ndjson    # thread 子消息，按需拉
├── attachments/<file_key>.<ext>      # 图片 / 文件 / 音频
└── transcripts/<minute_token>/{_meta.json, transcript.txt}   # 会议逐字稿，跨会话持久
```

`~/.memex/raw/` 是用户本地数据，每人独立，不同步，**不进 git**。Checkpoint（`last_fetched_at` / `last_fetched_message_id`）只放 `_meta.json`，不进 memory。

### 拉消息

```bash
lark-cli im +chat-messages-list --chat-id "<oc_xxx>" --start "<ISO8601>" \
  --page-size 50 --sort asc --format json
# --user-id "<ou_xxx>" 拉 P2P（与 --chat-id 互斥）；--page-token 翻页；--end 截止
lark-cli im +messages-mget --message-ids "om_a,om_b" --format json   # 批量详情，≤50，自动补 sender 名
lark-cli im +messages-search --keyword "<词>" --format json          # 跨聊天搜（--sender/--chat-id 可选；首用 --help 确认 flag）
```

**返回结构（2026-05 实测，重要）**：`+chat-messages-list` 返回在 `.data.messages[]`（不是 `.data.items[]`）；每条**字段已扁平化**：
- `.content` 是**已解码的顶层字符串**（text 类型直接是正文，**不用** `.body.content | fromjson`；`.body` 实际为 null）。
- `.sender` = `{id, id_type, name, sender_type}`（`name` 已带，省一次补全）；`.create_time` 格式是 **`YYYY-MM-DD HH:mm`（到分钟、无秒、无时区后缀）**——渲染 `stamp` 直接 `.create_time[5:]`，月分桶 `.create_time[:7]`。
- 非 text：`image` 的 `.content` 是图片 key、`post` 的 `.content` 可能图文混排（`[Image: key]` + 文字）、`merge_forward`（合并转发的群聊会话记录）的 `.content` 已被 CLI 解码成 `<forwarded_messages>` 文本块（`[ISO时间] 发言人: 正文`）——渲染规则见 render-spec「转发会话记录」（引用块 + 内嵌图拉不到只留字面）。其余按 `.msg_type` 分支。
- ⚠️ 这跟 raw API `GET /open-apis/im/v1/messages`（外层 `data.items[]`、`body.content` 是 JSON 字符串需 `fromjson`）**不一样**。本 connector 默认走 shortcut，按上面的扁平结构处理。

### 分页拉取脚手架（窗口内翻到底）

活跃群半年可能几千条。复用脚本（落 `/tmp/paginate-out/`）：

```bash
cat > /tmp/paginate.sh <<'EOF'
#!/bin/bash
CHAT_ID="$1"; LABEL="$2"; START="$3"; CAP="${4:-200}"
OUTDIR="/tmp/paginate-out"; mkdir -p "$OUTDIR"; TOKEN=""; PAGE=1
while :; do
  if [ -z "$TOKEN" ]; then
    lark-cli im +chat-messages-list --chat-id "$CHAT_ID" --start "$START" --page-size 50 --sort desc --format json > "$OUTDIR/${LABEL}_page${PAGE}.json"
  else
    lark-cli im +chat-messages-list --chat-id "$CHAT_ID" --start "$START" --page-size 50 --sort desc --page-token "$TOKEN" --format json > "$OUTDIR/${LABEL}_page${PAGE}.json"
  fi
  HAS_MORE=$(jq -r '.data.has_more' "$OUTDIR/${LABEL}_page${PAGE}.json")
  TOKEN=$(jq -r '.data.page_token // ""' "$OUTDIR/${LABEL}_page${PAGE}.json")
  echo "[$LABEL] page$PAGE has_more=$HAS_MORE"
  if [ "$HAS_MORE" != "true" ] || [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then break; fi
  PAGE=$((PAGE+1)); if [ $PAGE -gt $CAP ]; then echo "[$LABEL] CAP HIT"; break; fi
done
echo "[$LABEL] DONE pages=$PAGE"
EOF
chmod +x /tmp/paginate.sh
# 用法：/tmp/paginate.sh "oc_xxx" "mygroup" "2025-11-01T00:00:00+08:00" 100
```

**page_cap 估算**：先 peek 第一页看 50 条时间跨度 → 目标窗口 / 单页跨度 × 1.5 余量。活跃群半年常 50-200 页。后台 `run_in_background` 起多群并行。

### 增量追加协议

```bash
CHAT_ID="oc_xxx"; RAW_DIR=~/.memex/raw/lark/chats/$CHAT_ID; mkdir -p "$RAW_DIR/threads"
SINCE=$(jq -r '.last_fetched_at // "2026-01-01T00:00:00+08:00"' "$RAW_DIR/_meta.json" 2>/dev/null)
lark-cli im +chat-messages-list --chat-id "$CHAT_ID" --start "$SINCE" --page-size 50 --sort asc --format json > /tmp/fetch.json
jq -c '.data.messages[]' /tmp/fetch.json | while read -r msg; do
  MID=$(echo "$msg" | jq -r '.message_id'); MONTH=$(echo "$msg" | jq -r '.create_time[:7]')
  BUCKET="$RAW_DIR/$MONTH.ndjson"
  if [ -f "$BUCKET" ] && grep -qF "\"message_id\":\"$MID\"" "$BUCKET"; then continue; fi
  echo "$msg" >> "$BUCKET"
done
LAST_MID=$(jq -r '.data.messages[-1].message_id' /tmp/fetch.json); LAST_TS=$(jq -r '.data.messages[-1].create_time' /tmp/fetch.json)
jq --arg mid "$LAST_MID" --arg ts "$LAST_TS" '. + {last_fetched_at:$ts, last_fetched_message_id:$mid}' \
   "$RAW_DIR/_meta.json" > "$RAW_DIR/_meta.json.tmp" && mv "$RAW_DIR/_meta.json.tmp" "$RAW_DIR/_meta.json"
```

**首次冷启动**（`_meta.json` 不存在）：写初始 meta（`chat_id / chat_type / name / member_open_ids / first_fetched_at`）。**群成员名单**（2026-05 实测：**没有 `+chat-members` shortcut**）走 raw API：
```bash
lark-cli api GET "/open-apis/im/v1/chats/<chat_id>/members" --params '{"member_id_type":"open_id","page_size":50}' --format json \
  | jq -r '.data.items[] | "\(.name)\t\(.member_id)"'
```
群名/类型从 `api GET /open-apis/im/v1/chats/<id>` 或搜索结果拿。**注意**：只有群成员才在名单里——被群里"议论"但不在群的人（如代号同事）要靠 `## identity` 的 `contact +search-user` 解析。

### 上下文 hydration（reply-coach 混合取数补拉）

仅凭最近 N 条不够，按需补三种：

| 触发 | 拉什么 | 命令 |
|---|---|---|
| `reply_to` 指向窗口外 | 递归补到链首 | `+messages-mget --message-ids "om_parent,..."` |
| 有 `thread_id` / `merge_forward` | 整 thread | `+threads-messages-list --thread "<om_/omt_>" --sort asc --page-size 500` |
| `msg_type ∈ {image,file,audio,media}` | 下载附件后 Read | `+messages-resources-download --message-id <om> --file-key <key> --type <t> --output ~/.memex/raw/lark/attachments/<key>.<ext>` |

thread 子消息 **lazy**（用到才拉），落 `threads/<thread_id>.ndjson`；附件 `file_key` 全局唯一，已存在跳过。

### 群与共同语境（人物建档）

```bash
lark-cli im +chat-search --query "<群名关键字>" --format json          # ⚠️ 是 --query 不是 --keyword；空格/连字符敏感，先试空格版
lark-cli im +chat-search --member-ids "<ou_target>,<ou_me>" --format json | jq '.data.chats[] | {chat_id, name}'   # 共同群
lark-cli im +chat-messages-list --user-id "<ou_target>" --start "<ISO>" --page-size 50 --sort desc --format json   # DM（量小一次拉完）
```

### 会议转录（vc / minutes）—— "线下尾巴"数据源

群里是他愿意让你看的形象，会议里才漏尾巴。三步链路（前置：三个妙记 scope 齐全否则 403）：

```bash
# 1) 搜会议（按参会人 + 时间）
lark-cli vc +search --participant-ids "<ou_target>" --start "2026-03-01" --end "2026-04-23" \
  --page-size 15 --format json | jq '.data.meetings[] | {minute_token, title, start_time, duration}'
# 也支持 --query / --organizer-ids；--participant-ids 可传 "me"
# 2)（少数场景）meeting_id → minute_token
lark-cli vc +recording --meeting-ids "<meeting_id>" --format json
# 3) 拉 notes（summary + todos + transcript）
lark-cli vc +notes --minute-tokens "<token>" \
  --output-dir ~/.memex/raw/lark/transcripts/<minute_token>/ --format json \
  > ~/.memex/raw/lark/transcripts/<minute_token>/_meta.json
```

坑：
- **说话人是 display name 不是 open_id** —— 严谨归属先 `contact +search-user` 解析（见 `## identity`）。
- **`--output-dir` 必须显式给** —— 不给污染 cwd。统一 `~/.memex/raw/lark/transcripts/<token>/`。
- **transcript 跨会话持久，不删** —— 重看 / 纵向对比用 Read 本地。
- **长会议 token 贵**（1 小时 ~10-30K tokens）—— 让用户挑场次（AskUserQuestion），不自动全量。

`transcript.txt` 格式：
```
<ISO 时间>|<总时长>

关键词:
<AI 抽取关键词>

<说话人英文名>(<中文名>) HH:MM:SS.ms
<发言内容，原始逐字，含填充词/打断/重复>
```

---

## `## render`

raw → `sources/lark/`，遵 `../render-spec.md` 的**统一格式**（下游 connector 无关）。本节只补 lark 特定映射。

### anchor 映射

- 群消息：`^` + message_id 去下划线/非法字符。`om_abc123` → `^omabc123`
- 会议发言：`^t` + 4 位零填充序号（按时间）。第 42 段 → `^t0042`

### 群消息 → `sources/lark/chats/<group-pinyin>/<YYYY-MM>.md`

读 `raw/lark/chats/<chat_id>/<YYYY-MM>.ndjson`（每行一条 raw 消息），按 render-spec 渲染每条：`**MM-DD HH:mm 发言人**` + 正文 + `^anchor`；reply → `↳ 回复 [[#^parent]]`；附件 → 指向 `raw/lark/attachments/` 的相对链接；媒体类型忠实标注。"我"（`config.self.id` 匹配 `.sender.id`）渲染成 `我`。

**正文取 `.content`**（shortcut 已扁平化为顶层已解码字符串，**不要** `fromjson`，见上"返回结构"）。逐条用 **`jq -c`** 渲染，**别 `echo | jq`**（含换行的正文会被 shell echo 篡改转义、炸控制字符）。anchor = `"^" + (.message_id | gsub("[^A-Za-z0-9]";""))`。

**生成 roster（写进 frontmatter）**：
```bash
jq -rs '[.[].sender | {(.name): ("lark:" + .id)}] | add' raw/lark/chats/<chat_id>/<YYYY-MM>.ndjson
# → 显示名→lark:open_id 映射，塞进该 sources 文件 frontmatter 的 roster:（供 recap R0 给群成员 keying）
```

### 会议 → `sources/lark/meetings/<minute_token>.md`

读 `transcript.txt`，说话人 display name 经 `contact +search-user` 归一为 `[[persons/<pinyin>]]`（解析不到留原名 + `（待确认身份）`）；填充词/打断/重复**保留**；每段 `^t<序号>`；frontmatter `participants` 列解析出的 `[[link]]`。

### 增量重渲染

渲染前对比 `sources` 的 `rendered_at` 与 raw 最新 `last_fetched_at`：raw 有新消息 → 重渲染受影响月文件（追加新行，已有 anchor 不动）。message_id 稳定保证 anchor 幂等。

---

## `## send`

**所有写操作：先 `--dry-run` 把 payload 贴给用户 → 用户说"发"才去掉 `--dry-run` 真跑**（`../conventions.md` §3 硬约束）。仅 reply-coach 在用户明确"帮我发"时调用。

```bash
lark-cli im +messages-reply --message-id "<mid>" --text "<text>" --dry-run   # 回复成 thread
lark-cli im +messages-send --chat-id "<oc_xxx>" --text "<text>" --dry-run    # 发新消息；--as user|bot 切身份
```

---

## JSON 解析 + 错误兜底

- 外层统一 `{ "code":0, "msg":"...", "data":{...} }`，`code==0` 才成功；列表常在 `data.items[]` / `data.messages[]`，游标 `data.page_token`。
- `sender.id` 的 type 看 `sender.id_type`（我们存 `open_id` / `ou_` 前缀）。

| 现象 | 处理 |
|---|---|
| `command not found` | `npx skills add larksuite/cli -y -g` |
| `not authenticated` / `401` | 按最小 scope 集 `auth login --scope "<完整列表>"` |
| `403` / `missing_scope` | `auth check --scope "<x>"` 找缺的，补进字符串重 `auth login`（注意 OAuth 累积） |
| `429` 限流 | 等几秒重试；多次缩 `page_size` |
| JSON 解析失败 | 原始输出贴用户看，**不假装拿到结构化数据** |
| shortcut 不认 | 用 `lark-cli api` 走 raw API |

raw API 兜底端点：`GET/POST /open-apis/im/v1/messages[/<id>][/reply]`、`GET /open-apis/im/v1/chats`、`POST /open-apis/contact/v3/users/batch_get_id`。
