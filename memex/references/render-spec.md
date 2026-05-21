# Render 规格 — raw → sources/（统一渲染格式 = 集成缝）

`sources/` 是 raw 的**忠实 markdown 渲染**：人能直接读、Obsidian 能打开、memory 用 `^anchor` 回溯。这是 connector 之间的统一格式 —— 任何 connector（lark/wechat/slack）都把它拉到的 raw 渲染成下面的格式，下游 distill / wiki / 消费者**完全 connector 无关**。

`ingest` skill 负责执行渲染；本文件是格式权威。

## 原则

- **忠实无损**：不摘要、不删填充词/重复/打断。渲染是确定性转换，不引入 LLM 判断（判断留给 recap 的 distill 步）。
- **幂等增量**：基于 raw（message_id / 发言序号稳定）重渲染，已有 `^anchor` 不变 → memory 里的 `[[...#^anchor]]` 永久有效。
- **每条带锚点**：每条消息 / 每段发言一个 Obsidian `^id` block anchor，供 memory 深链。

## 路径

```
~/.memex/sources/<connector>/chats/<group-pinyin>/<YYYY-MM>.md   # 群消息，一群一月一文件
~/.memex/sources/<connector>/meetings/<minute_token>.md          # 会议逐字稿
```

`<group-pinyin>` 与 `groups/<group-pinyin>.md` 命名对齐（同一 slug）。

---

## anchor 清洗规则（固定一种）

Obsidian block anchor `^id` 只允许 `[A-Za-z0-9-]`。message_id（如 `om_xxx`）/ 发言序号清洗规则：

- 群消息：`^` + message_id 去掉下划线和非法字符。例 `om_abc123` → `^omabc123`
- 会议发言：`^t` + 4 位零填充序号（按时间顺序）。例第 42 段 → `^t0042`

memory 回溯写：`→ [[<connector>/chats/<群>/<月>#^omabc123]]` / `→ [[<connector>/meetings/<token>#^t0042]]`

---

## 群消息渲染 `chats/<group-pinyin>/<YYYY-MM>.md`

```markdown
---
type: source-render
kind: chat
connector: lark
chat_id: oc_xxx
chat_name: 跨部门周会
month: 2026-05
rendered_from: raw/lark/chats/oc_xxx/2026-05.ndjson
rendered_at: 2026-05-20
roster:                              # 身份落实（R0）：本月发言人 显示名 → <connector>:<id>
  张三: lark:ou_xxx
  李四: lark:ou_yyy
  我: lark:ou_self
---

# 跨部门周会 · 2026-05

> 忠实渲染自 raw，无损。每条消息带 `^<message_id>` 锚点供 memory 回溯。

**05-08 14:32 张三**
进度又延期了，这次是不是你们那边的问题？ ^omabc123

**05-08 14:35 我**
延期是因为上游接口 5-06 才给，有记录。 ^omdef456
↳ 回复 [[#^omabc123]]

**05-08 14:36 张三**
[图片: 一张 ChatGPT Pro 订阅页截图](../../../../raw/lark/attachments/img_v3_xxx.jpg) ^omghi789
```

要点：
- **roster（身份落实，R0）**：frontmatter `roster:` 把本月出现过的所有发言人 `显示名 → <connector>:<id>` 列出（raw 里现成有 `sender.id`，零额外调用）。下游 recap/comm-memory 给群成员 keying 直接读它，不必再调 CLI。
- **每条消息**：`**<MM-DD HH:mm> <发言人显示名>**` 一行 + 正文 + 行尾 `^anchor`。"我"渲染成 `我`（运行时身份比对 `config.self.id`）。
- **实现注意（避坑）**：渲染脚本逐条写盘时，含换行的消息正文会带控制字符——必须用 `jq -c` 直出（一条一行、自动转义），**不要** `echo "$line" | jq`（shell 的 echo 会篡改转义、炸控制字符）。
- **reply 关系**：父消息在同文件 → `↳ 回复 [[#^parent]]`；跨文件（跨月/历史） → `↳ 回复 [[<connector>/chats/<群>/<父月>#^parent]]`。
- **附件 / 媒体 —— 必下载 + 图片必配 caption（铁律，见下「媒体处理」）**：媒体消息**先下载二进制**到 `raw/<connector>/attachments/<file_key>.<ext>`，**图片用视觉 Read 出一句话内容**写进渲染，再附相对链接。格式：`[图片: <一句话内容描述>](../../../../raw/.../attachments/<key>.jpg) ^anchor`。非图片忠实标类型（`[语音 12s]` / `[文件: report.pdf]`），不丢。
- **thread**：thread 子消息在父消息下缩进渲染，或单列一段标 `（thread）`，保持时间顺序。

---

## 媒体处理（铁律：图片必看、必配文字）

> 血的教训：曾把 Pany 发的「戒不掉啊戒不掉」+ 一张图，在**没看图**的情况下脑补成"抽烟"落了 `#profile`；图其实是 **ChatGPT Pro 订阅页**（戒不掉的是 AI 氪金）。**承重内容常在图里，文字只是注脚。**

**渲染媒体消息时，两步都不能省**：
1. **必下载二进制**：`image / file / audio / media` 一律下载到 `raw/<connector>/attachments/<file_key>.<ext>`（去重：已存在跳过）。
2. **图片必配 caption**：对每张**非纯表情**图片，用视觉 **Read 一遍**，把内容浓缩成一句话写进渲染：`[图片: 一句话内容]`。纯表情/sticker 标 `[表情]` 即可，可不细读。

这样 `sources/` 是**文本完备**的（图的语义变成可 grep 的文字 + 二进制可回溯），下游 distill / recall **不必再开图也不会瞎猜**。

**对应的下游纪律**（recap/recall 必守）：**任何结论若依赖某张图，证据必须在手**——sources 里有 caption 就用 caption，没有就**先下载 Read 再说**；**绝不在"未看的图"旁边对其内容下断言**（尤其别落 `#profile`）。详见 `memory-index.md` distill 规矩。

成本权衡：高活跃群图多，caption 全做有视觉调用成本——但**信息密度高的群值得**；可对明显是 sticker/物流截图的降级为 `[表情]`/`[截图]` 不细读，对像是"内容承重"的（文字截图、文档、图表、付费页…）必做 caption。

---

## 会议逐字稿渲染 `meetings/<minute_token>.md`

```markdown
---
type: source-render
kind: meeting
connector: lark
minute_token: xxx
title: Q2 预算评审
meeting_time: 2026-05-08T14:00:00+08:00
rendered_from: raw/lark/transcripts/xxx/transcript.txt
rendered_at: 2026-05-20
participants: ["[[persons/zhang-san]]", "[[persons/li-si]]"]
---

# Q2 预算评审 · 2026-05-08

> 逐字稿忠实渲染，保留填充词/打断/重复（"线下尾巴"分析靠这些）。

**[[persons/zhang-san]]** `14:03:21`
那个…我觉得这个预算其实是不是可以再压一压…（hedging） ^t0001

**我** `14:03:45`
具体压哪一块？ ^t0002
```

要点：
- **说话人归一**：transcript 里是 display name（不是 ID）。先用 connector 的 identity 解析（lark：`contact +search-user --query "<中文名>"`）→ 命中则渲染成 `[[persons/<pinyin>]]`；解析不到保留原名 + 标记 `（待确认身份）`，不瞎归属（避免同名误伤）。
- **frontmatter `participants`**：解析出的人物 `[[link]]` 列表。
- **保留口语细节**：填充词、打断、重复全留。
- **每段发言**：`**<说话人>** \`HH:MM:SS\`` + 正文 + `^t<序号>`。

---

## 增量重渲染

ingest 每次渲染前对比 `rendered_at` 与 raw 的最新 `last_fetched_at`：raw 有新消息 → 重渲染受影响的月文件（追加新消息行，已有 anchor 不动）。message_id 稳定保证 anchor 幂等，memory 里的回溯链不会断。
