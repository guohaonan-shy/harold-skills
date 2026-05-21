---
name: recall
description: memex 的统一召回前门——把任意**模糊自然语言 query** 落到 wiki 里的相关上下文并作答（带 provenance）。任何提到 那个 X 的事是谁 / 我跟谁有过 X / 上次那个 X 怎么回事 / 上个月发生了啥 / 关于 X 我都知道些什么 / 我对哪些人有 X / 怎么跟 X 沟通 / 这条怎么回 / 我该怎么处理 X / 之前 X 讨论到哪了 / 查一下 X / 找跟 X 相关的 的场景都触发本 skill。这是**读取侧唯一前门**：reply-coach 等都是它的消费场景（"怎么回复 / 怎么做"只是 query 的一种形状）。**只读不写**。
allowed-tools: Grep, Glob, Read, Bash(grep:*), Bash(jq:*), Bash(ls:*), Bash(cat:*), Bash(lark-cli contact:*), Bash(lark-cli auth:*), AskUserQuestion
---

# recall — 模糊 query → 相关上下文 → 作答

memex 的读取地基。引擎是 Claude Code 自带的 **Grep / Glob / Read**；memex 给了**可被引擎高效检索的结构**（frontmatter 键 / `#tag` / `[[link]]` / `^anchor` / `index.md` / `log.md`）；本 skill 给的是**用引擎的章法**——三者合起来把"那个公开施压的破事是谁""我跟谁在预算上掐过""这条怎么回"这类模糊 query 可靠地落到上下文。**无 embedding**：LLM 把模糊描述翻译成可 grep 的字面，grep 执行，LLM 裁定相关性。

## 0. 必读约定

- 跨 skill 行为约定 → `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`
- **身份落实 R0 / 检索 R1-R2 / Observation 原生格式 / 4 类 type / index.md+log.md** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`
- advice 型 query（怎么回/怎么处理）补料：8 类模式 → `${CLAUDE_PLUGIN_ROOT}/references/olden-patterns.md`；回复策略 → `${CLAUDE_PLUGIN_ROOT}/references/prompts/reply-*.md`
- 解析人名/代号用选中 connector 的 `## identity` → `${CLAUDE_PLUGIN_ROOT}/references/connectors/<name>.md`

## 1. 前置 + 永远先定向

```bash
ls ~/.memex/memory/{persons,groups,topics} 2>/dev/null
cat ~/.memex/memory/index.md 2>/dev/null      # 内容目录：模糊匹配的第一落点
```

`index.md` 的一行摘要 + 各 note 的 `aliases` 是**把模糊描述映射到候选实体**的主面；`log.md`（按日 digest）是**把"上个月/那次"映射到时间窗/事件**的主面。**先读 index（必要时 log），再决定往哪 grep**——不要盲 grep。memory 空 → 软提示先 `ingest`+`recap`，不阻塞。

## 2. 判 query 形状（可组合）

| 形状 | 例 | 主检索路 |
|---|---|---|
| **锚定** | "怎么跟 Lucas 沟通"（点名了人/群） | §3.A |
| **按描述** | "那个想把我挤走的人是谁" | §3.B |
| **按属性/聚合** | "我对哪些人有有效策略 / 所有 ✗ 的策略" | §3.C |
| **按时间** | "上个月发生了啥" | §3.D |
| **advice 型** | "这条怎么回 / 我该怎么处理跟九万的汇报线" | §3.A/B 拿上下文 **+** §3.E 补打法 |

## 3. 检索路（章法）

### A. 锚定召回（query 点名了实体）
R0→R1→R2（memory-index）：
- R0 名字/代号 → 稳定 ID：先在 `index.md`/各 note `aliases` 里找（如"三万"→`persons/qi-xian-hu`）；找不到再 connector `## identity`（`lark-cli contact +search-user --query`）。
- R1 frontmatter glob 定位文件：`grep -l "identities:\|chat_id:" ...` 匹配。
- R2 按 type 抓证据：`grep '#behavior' persons/<X>.md`（拿 `(seen::)` 倒序）/ `#strategy`（拿 `(outcome::)`）/ `#profile` / `#event`。

### B. 按描述召回（无 ID，只有模糊话）
1. **LLM 把描述翻成候选锚点**：读 `index.md` 摘要 → 匹配最像的 person/topic（"想挤我走"→看 index 里谁标了威胁/汇报线 → `xiong-hao`）。
2. **关键词/别名 grep 兜底**：`grep -rl "汇报线\|挤\|小报告" ~/.memex/memory/`。
3. **topic hub 当 join**：命中话题就 load `topics/<x>`，沿 `[[persons/..]]` 扇出。
4. 多个候选 → AskUserQuestion 让用户挑（§6）；唯一候选直接走 A 的 R2。

### C. 按属性/聚合召回（跨文件）
```bash
grep -rn '#strategy' ~/.memex/memory/persons/ | grep 'outcome:: ✗'   # 所有失败策略
grep -rln '#behavior (pattern:: §7)' ~/.memex/memory/persons/        # 谁公开施压过
```
解析 inline field 排序（`(seen::)` 高的优先、`(when::)` 近的优先）。

### D. 按时间召回
`grep -nE '^## \[2026-04' ~/.memex/memory/log.md` 定位时间窗 → Read 该段 digest → 顺条目里的 `[[link]]` 进实体。

### E. advice 型补料（仅"怎么回/怎么做"加这步）
在 A/B 拿到对象上下文后，**再捞打法**：该人 `#behavior` 命中的 olden-patterns §N → Read 对应 `prompts/reply-*.md` / olden-patterns 段；user-profile 的默认策略偏好。advice query 既要"人的上下文"又要"playbook"。

## 4. 扩展 + 下钻
- **扩一跳**：命中 note 后顺 `[[topics/x]]` / `[[persons/x]]` backlink 拉相邻上下文（别无限展开，一跳够）。
- **下钻 provenance**：要精确原话/证据 → 顺 observation 行尾 `→ [[<connector>/chats/<群>/<月>#^anchor]]` Read 进 `sources/` 那条原文。**只在需要原文时下钻**，平时停在 memory 层（便宜）。
- **媒体必看(铁律,memory-index「Distill 三条防瞎猜」)**：若结论依赖某张图/媒体——sources 有 caption 就用;没 caption 但二进制在 `raw/.../attachments/` 就**直接 Read 那个文件看**;**绝不对"没看过的图"断言其内容**。〔教训:没看图把 ChatGPT Pro 订阅页脑补成"抽烟"。〕

## 5. 产出

默认 **检索 + 作答一体**（recall 是问答器，不只是检索器）：

- 用人话回答 query，**每个关键结论挂 provenance**（`→ [[persons/x]]` 或 `→ [[...#^anchor]]`），让用户能核。
- advice 型 → 给出基于召回上下文的建议/回复方向（如需"3 候选 + 分支预判"那套完整产物，路由 `reply-coach`，它会复用本次召回）。
- **被别的 skill 调用时**（如 reply-coach）→ 产出"紧凑上下文包"（命中的 person/topic 片段 + provenance），不替调用方下结论。
- **不糊原始文件全文**给用户/调用方——给提炼过的、带指针的结论。

## 6. 模糊不命中 / 歧义
- 描述映射到多个候选 → AskUserQuestion 列候选（带 index 摘要）让用户挑，**不猜**。
- 完全 grep 不到 → 如实说"memory 里没有相关记录"，并提示可能要先 `ingest`+`recap` 拉那段对话（如"这个群/这段时间还没拉进来"）。**不编**。

## 7. 边界
- **只读，绝不写 memory**。召回中若发现新信号（用户顺口补充了新事实）→ §结尾提示用 `comm-memory` 沉淀，不自动写。
- 召回 `sources/` 仅为取证；不改 raw/sources/memory。

## 8. 跟其他 skill 的关系
- recall = **读取侧唯一前门**。reply-coach（回复型）、未来的 weekly-digest / person-brief 都是它的消费场景。
- 写入侧 ingest/recap/comm-memory 与本 skill 正交。
- 用户 query 形状决定终点：纯问答 recall 自己答完；要完整回复参谋产物 → 路由 reply-coach（带着已召回的上下文，不重复检索）。

## 关键约束（汇总）
- **先读 index.md（必要时 log.md）定向，再 grep**——不盲 grep
- 模糊描述靠 **LLM 翻成字面 + grep**，无 embedding；命中靠 index/log 摘要质量
- 召回主打 `memory/`（便宜），`sources/` 仅按 `^anchor` 下钻取证
- 结论**带 provenance**；歧义**问不猜**；查无**说没不编**
- 只读；advice 型才补 olden-patterns/策略料
