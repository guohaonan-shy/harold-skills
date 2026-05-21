---
name: reply-coach
description: 高情绪成本消息的回复参谋——取消息上下文 + 加载人物 / 群 / 事 档案 + 生成 **3 个完整可发的候选回复**（保守 / 标准 / 微刺）+ 预判对方反应分支并给每个分支的 ready-to-send 后续。任何提到 飞书 / Lark / @ 我 / 群聊 / 这条不好回 / 帮我想想怎么回 / 这消息怎么处理 / 跟 X 之前的冲突最好怎么回 / 怎么跟 X 沟通 / 这条怎么回他 / 这话怎么应 / 有点烦怎么回 / 老板这话什么意思 / 阴阳怪气怎么应 / 公开施压回不回 / 越权指点回不回 的场景都触发本 skill。**只读 memory，不写**——记忆维护是 recap / comm-memory 的事；**不自动发送**，dry-run + 用户确认才真发。
allowed-tools: Bash(lark-cli:*), Bash(mkdir:*), Bash(ls:*), Bash(jq:*), Bash(grep:*), Bash(cat:*), Read, AskUserQuestion, WebSearch
---

# reply-coach — 高情绪成本消息回复参谋

用户遇到不好回的消息。本 skill 帮用户**想清楚怎么说**——产出物是 **3 个完整可发的候选 + 反应分支预判**，用户主动选 + 通常会改 + 自己决定发不发。memex 的消费者层 skill：吃 memory wiki + sources，不写。

## 0. 必读约定

- 跨 skill 行为约定（"参谋而非代笔" / "3 候选 + 主动选" / 写操作安全 / 不公司腔 / "老登"代号仅内部用）→ `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` §3 §4
- **Memory 三层加载 R1 + 按 type grep R2 + Observation 原生格式（#tag / 字段 / [[link]]）+ 4 类 type 语义** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`（本 skill **只读不写**，但要懂 entry 格式才能解析）
- **取数**：默认读已渲染 `sources/`（格式见 `${CLAUDE_PLUGIN_ROOT}/references/render-spec.md`）；缺则按 config 走 connector 实时补拉 + hydration → `${CLAUDE_PLUGIN_ROOT}/references/connectors/<name>.md` 的 `## fetch`；发送走 `## send`
- 8 类高沟通成本模式速查（§5 分析 + 策略推荐，对应 `(pattern:: §N)`）→ `${CLAUDE_PLUGIN_ROOT}/references/olden-patterns.md`
- 8 个回复策略 prompts → `${CLAUDE_PLUGIN_ROOT}/references/prompts/reply-{soft,factual,push,play-dumb,cold-public,anchor-time,defuse-emotion,lock-vague}.md`

## 1. 前置检查

```bash
mkdir -p ~/.memex/memory/persons ~/.memex/memory/groups ~/.memex/memory/topics
cat ~/.memex/config.json 2>/dev/null | jq -r '.default_connector'   # 选 connector
```

读 config 选 connector（多个 enabled 时 AskUserQuestion 让用户选）。跑该 connector 前置 + auth 检查（lark：`lark-cli --version` / `lark-cli auth status`；拿"我"身份用 `config.self` 或 `## identity` 命令）。`config.json` 不存在 → 提示先跑 `/memex:ingest` bootstrap，或本会话只用用户粘贴的消息 + 临时上下文。`user-profile.md` 不存在 → 软提示先跑 `/memex:comm-memory`，**不阻塞**。

## 2. 理解场景（不要猜，不确定就问）

AskUserQuestion 问清：哪条消息？哪个群 / DM？用户没贴内容 → §3 取；贴了但没说群上下文 → §3 仍取群里前 15-20 条。

**复盘 / playbook 类 query**（"之前跟 X 的冲突最好怎么回"）→ AskUserQuestion 让用户挑一个**具体场景或具体消息**作靶子。**不接受"抽象场景"输出**——必须落到具体消息才能给 concrete 回复。

## 3. 取消息 + hydrate（**混合取数**）

reply-coach 要**新鲜**上下文（消息刚到，sources/ 可能还没渲染到）。按这个顺序：

1. **历史上下文优先读 `sources/`**（便宜、已渲染）：目标群 → `~/.memex/sources/<connector>/chats/<群>/<月>.md` 已有的前文直接 Read，拿模式判断需要的语境。
2. **目标消息 + 即时 hydration 走 connector 实时补拉**（不在 sources 范围内时）：按驱动 `## fetch` 的 hydration 协议——
   - 同 chat **前 15-20 条**（行为模式要在上下文里才能判断）
   - `reply_to` 指向窗口外 → 递归补到链首；在 thread 里 → 展开整 thread；有图片/文件 → 下载后 Read 看
   - **拉过的消息按驱动落盘协议追加到 `~/.memex/raw/<connector>/`**（事实层，跟 ingest 共享；落 raw 是必做，不需确认）
3. 解析完 AskUserQuestion 让用户确认"是这条对吧"。

**不 hydrate 等于半残瞎推，禁止。**

## 4. 加载 memory（**只读**，按 type grep 拿结构化证据）

按 memory-index.md R1-R2，**不**简单 Read 整文件让模型自己消化：

### R1. 三层定位
1. `~/.memex/memory/user-profile.md` —— 始终 Read（"我"的视角）
2. 当前 `chat_id` → glob `~/.memex/memory/groups/*.md` + frontmatter `connector` + `chat_id` / `aliases` 匹配 → 命中 Read
3. 发送方 ID → glob `~/.memex/memory/persons/*.md` + frontmatter `identities.<connector>` / `aliases` 匹配 → 命中 Read
4. 跟正文 `[[topics/x]]` link 加载相关 hub（顺藤摸瓜拿背景）

### R2. 按 type grep 抓证据（**核心**）

命中 person/group 后**不**整文件读完，按 type grep 拿结构化片段：

```bash
grep '#profile'  ~/.memex/memory/persons/<X>.md   # 稳定特征/雷区/风格/关系——"该不该说"/"不能说什么"
grep '#behavior' ~/.memex/memory/persons/<X>.md   # 拿 (pattern:: §N)(seen:: N)，按 seen 倒序 = 最稳模式
grep '#strategy' ~/.memex/memory/persons/<X>.md   # (outcome:: ✓) 优先复用，✗ 避开；权重看 (when::) 最近
grep '#event'    ~/.memex/memory/persons/<X>.md   # 按 date 倒序拿最近 1-3 条
```

群档案同理 grep。每行解析三件事：**type 决定语义角色**（profile 稳定事实 / behavior 模式带强度 / strategy 经验带成败 / event 是 context）、**字段决定权重**（`(seen:: 7)` 比 `(seen:: 1)` 强；`(when:: 近期)` 比久远的值得复用）、**正文是 narrative**。

### 不存在的处理（不阻塞）

| 文件 | 处理 |
|---|---|
| `user-profile.md` 不存在 | 软提示先跑 `/memex:comm-memory`——继续就 AskUserQuestion 问 1-2 条**临时上下文**（沟通风格 / 措辞禁忌） |
| 当前群档案不存在 | AskUserQuestion 问临时上下文（"这个群什么氛围？领导在吗？"） |
| 发送方档案不存在 | AskUserQuestion 问临时上下文（"这个人什么风格？有什么雷区？"） |

**临时上下文**只在本会话用，**不**自动落档。§11 收尾再提示用 comm-memory / recap 沉淀。

消息内容跟现有 `#profile` / `#strategy` 描述明显冲突 → §5 显式指出让用户判断（这是 recap 下次会处理的 break-change，本 skill 不写）。

## 5. 简要分析（一屏内，不长篇）

3-4 行对齐理解，**不**贴大段结构化分析。从 §4 grep 出的片段拿证据：

- **意图一句话**（例："口号推翻实现 + 推责"）——看消息本身 + olden-patterns
- **模式信号 + 强度**——基于 `#behavior` 的 `(seen:: N)`：命中 §N 且 `seen >= 3` → "稳定模式" / `seen 1-2` → "新倾向"（例："命中 §1 习惯性否定，档案 seen 7，稳定"）
- **过往经验 + 推荐策略**——基于 `#strategy` 的 `(outcome::)` + `(when::)`：同 scenario 有 ✓ → 推荐复用；有 ✗ → 显式避开
- **认知出入**（消息行为跟 `#profile` 有出入）—— 一句话点出，**不主动改 memory**，但提醒"档案说他温和派，今天像公开施压，要不要回头 recap 复盘下"

## 6. 选策略（memory-driven auto-select + 用户确认）

**核心**：模型基于 memory + olden-patterns + user-profile **自己挑 1 个最贴的策略**，跟用户说"推荐这个 + 为什么"，AskUserQuestion 让用户**接受 / 换 / 自由输入**。**不**让用户每次手挑。

### 6.1 策略库（8 个 prompt 文件）

```
prompts/reply-soft.md          柔和推进 —— ego 高 / 需要被尊重感
prompts/reply-factual.md       就事论事 —— 习惯性否定但无依据（**没特判默认**）
prompts/reply-push.md          强势推回 —— 推卸责任 / 越权
prompts/reply-play-dumb.md     装傻 + 反向倒拉会议 —— 决策权高 / 摘果型老板
prompts/reply-cold-public.md   公开冷处理 + 私下定界 —— 公开施压（§7）
prompts/reply-anchor-time.md   锚定时间窗 + 拒绝旧争议 —— 反复翻旧账（§6）
prompts/reply-defuse-emotion.md 去情绪化 + 切回事实 —— 情绪绑架（§8）
prompts/reply-lock-vague.md    模糊承诺反向锁死 —— 模糊施压（§5）
```

**策略库不擅自增减**：库里没合适的 → 暂用最近的 + AskUserQuestion 让用户 D. 自由输入；反复碰到新模式 → 跟用户对齐走升级流程加 prompt 文件（半年级别）。

### 6.2 模型自选 1 个策略（multi-factor 决策）

**不**做 1:1 映射——同一 pattern 在不同对手 / 关系 / 公共场合应对不同。优先级：

1. **近期 strategy ✓（< 90 天）+ 同 scenario** → 直接复用，硬 override（"用过的就用"）
2. **近期 strategy ✗（< 90 天）+ 同 scenario** → 显式排除那个，在剩下 7 个里挑
3. **多因子合议** —— 综合下面信号给候选打权重选最高

按 olden-patterns 命中模式分别说（每个 pattern 有主候选，看对方角色 / 公共 vs 私下 / 用户偏好调整）：

- **§1 习惯性否定** → 主 reply-factual；对方 ego 高（person `#profile` 标）→ reply-soft；决策权高/摘果型 → reply-play-dumb
- **§2 推卸责任** → 决策权≥你+摘果型 → reply-play-dumb；同级/推到你身上 → reply-push；下级 → reply-soft + 档案累积
- **§3 ego 攻击** → 私下 reply-soft；公开 reply-cold-public
- **§4 越权越界** → 一次性 reply-push；反复（`#behavior (pattern:: §4)(seen:: 3+)`）→ reply-push + 同步上级（脱离 scope，提醒走真实策略）；老板腔越界 → reply-play-dumb
- **§5 模糊施压** → 主 reply-lock-vague；user-profile 标"重视 paper trail" → 强加权；决策权高+模糊 → 仍 reply-lock-vague
- **§6 反复翻旧账** → 主 reply-anchor-time；**前提**旧议题有 paper trail（用户确认有载体）—— 没有 → 切 reply-factual / reply-push
- **§7 公开施压** → 主 reply-cold-public（群里冷+私下定界）；极端（@全体+跨级）→ 同步走真实策略
- **§8 情绪绑架** → 主 reply-defuse-emotion；**先判**真受伤（有具体伤害事实 → reply-soft + 共情）vs 绑架（只有抽象情绪话术 → reply-defuse-emotion）

**没命中 olden-patterns**：user-profile `#profile` 默认策略偏好 → 用户偏好；person `#strategy (outcome:: ✓)` 任何 scenario 有过的 → 复用；都没有 → 默认 reply-factual。**远期 strategy（≥90 天）**只作参考权重，不硬 override，label 里说"很久前用过，不一定还适用"。

### 6.3 展示推理 + AskUserQuestion

把推荐**连带推理一句话**给用户。**策略名跟随用户语言**（中文显示中文名，模型读 prompt 用 slug）。

```
基于以下信号，我建议用 [装傻 + 反向倒拉会议]：
- 档案 #profile：张三决策权高 + 摘果型（已记 7 次相关行为）
- 命中 olden-patterns §2 推卸责任
- 你 user-profile 里 #strategy (outcome:: ✗) 标过"独自硬扛被甩锅"——这条不走
- 4-21 你跟他用"装傻+拉会议"过 ✓（近期，强信号）

[AskUserQuestion] A. 按这个走  B. 我换一个（弹完整库）  C/D. 自由输入指定方向
```

**默认 A**（90% 推得对，一键过）。用户选 **B** → 第二轮 AskUserQuestion 列全 8 个策略让挑（label 跟随语言）。选 **C/D** 自由输入抽象风格（"绵里藏针"）→ 可 WebSearch 搜该风格表达范式 + 借最贴的现有 prompt 框架生成，**不**自动入库。**自由输入累积 ≥2 次同类** → 附一句提议走升级流程加进策略库（不自动加，需用户对齐——同 conventions.md §4 保护）。

## 7. 生成 3 个完整可发候选（**核心**）

**铁律**（详见 conventions.md §4）：
- **完整可发**：每条都可直接复制粘贴，**不放占位符 / `[补 XXX]` / 不公司腔**
- **缺关键 concrete 信息**（具体数据 / 某次结论 / 文档链接）→ **先 AskUserQuestion 问清再生成**，不瞎编不留空
- **3 个候选差异维度是强度 / 长度 / 切入角度**（策略 §6 已选）：A. 保守版（最稳妥最短）/ B. 标准版（平衡，默认）/ C. 微刺版（暗讽边界内，或把对方句式照样返回）

输出格式（照贴，别加 prose）：
```
=== A. 保守版 ===
[完整可发文字 3-8 行]
（nuance 一句：为什么保守 + 适合什么场景）

=== B. 标准版 ===
[完整可发文字]
（nuance 一句）

=== C. 微刺版 ===
[完整可发文字]
（nuance 一句）
```

**禁止**：占位符框架 / 同一候选里给"版本 1/2" / 公司腔（"非常感谢"/"烦请"/"如有任何问题"）。

## 8. 用户选 + 可能微调（AskUserQuestion）

```
A. 发 A   B. 发 B   C. 发 C   D. 让我改一下（Other 自由输入怎么改）
```
D → 定向修改 → **重新展示 3 个候选**（或聚焦改的那条）→ 再 AskUserQuestion → 循环到选定 A/B/C。

## 9. 分支预判（**不要跳**——选定候选后必跑）

基于对方档案 / olden-patterns，预判他**最常见的 2-3 种反应**，给每个分支的 **ready-to-send 后续**：

```
你发 [B]。基于 [档案 / olden-patterns §1] 模式，他大概率会：

→ 分支 1：他[反应类型]（概率：高）
   典型话："[引用档案里他的典型话术 / olden-patterns 例句]"
   你的下一句："[完整可发的 ready-to-send 后续]"

→ 分支 2：他[反应类型]（概率：中）
   典型话："..." 你的下一句："[完整可发后续]"

→ 分支 3：他不回 / 冷处理（概率：低但要想）
   你的下一步："[等几小时 / 主动 follow up / @他老板 / 找其他路径 ——具体建议]"
```

约束：只给 **2-3 个分支**（照档案挑最常见）；每个分支**完整可发** next-move 不留框架；标**概率**；超过 2 步深 → 直说"大概率要脱离 reply-coach，走现实策略（找 leader / 拉第三方 / 走文档）"。

## 10.（可选）发送

**仅在用户显式说"帮我发"/"直接发"时**（默认用户自己复制粘贴）：按驱动 `## send`，先 `--dry-run` 把完整 payload 展示 → 用户**显式确认**后去掉 `--dry-run` 真发（lark：`lark-cli im +messages-reply --message-id <mid> --text "..." --dry-run`）。这是写操作安全边界（conventions.md §3）硬约束，**不能省 dry-run**。

## 11. 收尾引导 + offer 回填（复利）

本会话有新信号（新认识的人 / 新雷区 / 这次用了哪个策略、效果如何 / 临时上下文回答），**offer 回填但不自己写**——这是 memex 复利的关键：把用过的策略 + outcome 沉淀回 wiki，下次 §6 决策更准。

> "这次跟张三用了 B 装傻+拉会议。等他回了你知道效果后，可以用 `/memex:comm-memory` 记一条 `#strategy`（我帮你起草），下次我就能直接复用。要现在记个初步的吗？"

- 用户要立刻沉淀 → 路由 `comm-memory`（口述）
- 信号来自对话内容、值得系统提炼 → 路由 `recap`
- **不自动写 memory**——用户决定记不记。

## 12. 不适用本 skill 的场景（建议路由）

- 用户口述要建 / 改档案（不需取消息）→ `comm-memory`
- 用户要从对话提炼 memory（"分析 X 最近表现"）→ 先 `ingest` 再 `recap`
- 用户要发主动消息（不是回复）→ 不在本 skill scope；写操作严格 dry-run（conventions.md §3）

## 关键约束（汇总）

- **不写 memory**——本 skill 只读；末尾 offer 回填但由 comm-memory / recap 执行
- **不自动发送**——必须 dry-run + 用户确认
- **混合取数**：历史上下文读 sources/，目标消息缺则 connector 实时补拉 + hydrate（落 raw）
- **不确定就问**——缺 memory / 不确定哪条消息 / 意图模糊都先 AskUserQuestion
- **3 候选 + 用户主动选**——不留半成品占位符
- 检索按 type **grep `#tag`**；`identities` map 是身份主键不是姓名
- **不公司腔**、**不给情绪价值**、**"老登"代号仅内部用**
