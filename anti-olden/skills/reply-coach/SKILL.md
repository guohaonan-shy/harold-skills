---
name: reply-coach
description: 飞书 / Lark 高情绪成本消息的回复参谋——拉消息上下文 + 加载人物 / 群档案 + 生成 **3 个完整可发的候选回复**（保守 / 标准 / 微刺）+ 预判对方反应分支并给每个分支的 ready-to-send 后续。任何提到 飞书 / Lark / @ 我 / 群聊 / 这条不好回 / 帮我想想怎么回 / 这消息怎么处理 / 跟 X 之前的冲突最好怎么回 / 怎么跟 X 沟通 / 这条怎么回他 / 这话怎么应 / 有点烦怎么回 / 老板这话什么意思 / 阴阳怪气怎么应 / 公开施压回不回 / 越权指点回不回 的场景都触发本 skill。**只读 memory，不写**——记忆维护是 comm-memory / chat-recap / meeting-recap 的事；**不自动发送**，dry-run + 用户确认才真发。
allowed-tools: Bash(lark-cli:*), Bash(mkdir:*), Bash(ls:*), Bash(jq:*), Bash(grep:*), Bash(cat:*), Read, AskUserQuestion, WebSearch
---

# reply-coach — 高情绪成本消息回复参谋

用户在飞书遇到不好回的消息。本 skill 帮用户**想清楚怎么说**——但产出物是 **3 个完整可发的候选 + 反应分支预判**，用户主动选 + 通常会改 + 自己决定发不发。

## 0. 必读约定

- 跨 skill 行为约定（"参谋而非代笔" / "3 候选 + 主动选" / 写操作安全 / 不公司腔 / "老登"代号仅内部用）→ `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` §3 §4
- **Memory 三层加载 R1 + 按 type grep R2 + Observation 三维度（type/KV）+ 4 类 type 的语义** → `${CLAUDE_PLUGIN_ROOT}/references/memory-index.md`（本 skill **只读不写**，但要知道 entry 格式才能解析）
- Lark CLI 命令 + **消息上下文 hydration**（reply_to 链 / thread / 附件） → `${CLAUDE_PLUGIN_ROOT}/references/lark-cli-cookbook.md`
- 8 类高沟通成本模式速查（用于 §5 分析 + 策略推荐，对应 `[behavior | pattern:§N]` 编号）→ `${CLAUDE_PLUGIN_ROOT}/references/olden-patterns.md`
- 8 个回复策略的 prompts → `${CLAUDE_PLUGIN_ROOT}/references/prompts/reply-{soft,factual,push,play-dumb,cold-public,anchor-time,defuse-emotion,lock-vague}.md`

## 1. 前置检查 + bootstrap

```bash
mkdir -p ~/.anti-olden/memory/persons ~/.anti-olden/memory/groups \
         ~/.anti-olden/raw/chats ~/.anti-olden/raw/attachments
lark-cli --version                      # 没装提示 npx skills add larksuite/cli -y -g
lark-cli auth status --format json      # jq -r '.userOpenId' 拿"我"的 ouid，识别"我发的消息"
```

未登录 → 提示 `lark-cli auth login`。

## 2. 理解场景（不要猜，不确定就问）

用户输入可能很模糊（"帮我看看怎么回"）。AskUserQuestion 问清：
- 哪条消息？哪个群 / 哪个 DM？
- 用户没贴消息内容 → 用 §3 拉
- 用户贴了消息但没说群上下文 → §3 仍要拉群里前 15-20 条

**复盘 / playbook 类 query**（"之前跟 X 的冲突最好怎么回"）→ AskUserQuestion 让用户挑一个**具体场景或具体消息**作为靶子。**不接受"抽象场景"输出**——必须落到具体消息才能给 concrete 回复。

## 3. 拉消息 + hydrate

按 `${CLAUDE_PLUGIN_ROOT}/references/lark-cli-cookbook.md` "消息上下文补全"章节：

- 同 chat **前 15-20 条**——行为模式要在上下文里才能判断
- **必须 hydrate**（不 hydrate 等于半残瞎推，禁止）：
  - `reply_to` 指向窗口外 → `+messages-mget` 递归补到链首
  - 在 thread 里 → `+threads-messages-list` 展开整 thread
  - 目标消息或链路里有图片 / 文件 → `+messages-resources-download` 下载后 Read 看
- 解析完 AskUserQuestion 让用户确认"是这条对吧"

**所有拉过的消息按 cookbook 落盘协议追加到 `~/.anti-olden/raw/chats/<chat_id>/`**——本 skill 不主动写 memory，但 raw 是事实层，跟 chat-recap / meeting-recap 共享。落 raw 是**必做**不需要用户确认。

## 4. 加载 memory（**只读**，按 type grep 拿结构化证据）

按 memory-index.md R1-R2 拿证据，**不**简单 Read 整文件让模型自己消化：

### R1. 三层定位

1. `~/.anti-olden/memory/user-profile.md` —— 始终 Read（"我"的视角）
2. 当前 `chat_id` → glob `~/.anti-olden/memory/groups/*.md` + frontmatter `chat_id` / `aliases` 匹配 → 命中 Read
3. 发送方 `ou_id` → glob `~/.anti-olden/memory/persons/*.md` + frontmatter `lark_user_id` / `aliases` 匹配 → 命中 Read

### R2. 按 type 分块抓证据（**核心改造**）

命中 person/group 档案后，**不**整文件读完让模型自己抓——按 type grep 拿结构化片段：

```bash
# 稳定特征 / 雷区 / 风格 / 关系 —— 影响"该不该说" / "不能说什么"
grep '^- \[profile' ~/.anti-olden/memory/persons/<X>.md

# 模式历史 + reinforcement 强度 —— 决定 §5 的"模式信号 / 稳定性"
grep '^- \[behavior' ~/.anti-olden/memory/persons/<X>.md
# 拿到的每行带 pattern:§N + seen:N + last:dates
# → 按 seen 倒序，最稳定模式排前

# 过往策略 ✓/✗ 历史 —— **决定 §6 推荐哪个策略**
grep '^- \[strategy' ~/.anti-olden/memory/persons/<X>.md
# 拿到的每行带 outcome:✓/✗ + scenario + when
# → outcome:✓ 的优先复用；outcome:✗ 的避开
# → 同 scenario 的 ✓ ✗ 都看，权重最近 when 最大

# 最近事件（context 用）
grep '^- \[event' ~/.anti-olden/memory/persons/<X>.md
# → 按 date 倒序拿最近 1-3 条；旧的（> 30 天）跳过
```

群档案同理 grep。

### 不存在的处理（不阻塞主流程）

| 文件 | 处理 |
|---|---|
| `user-profile.md` 不存在 | 软提示"你还没建用户画像，建议先跑 `/anti-olden:comm-memory`，否则我对你的风格只能给通用建议。要继续吗？"——继续就用 AskUserQuestion 问 1-2 条**临时上下文**（沟通风格 / 措辞禁忌） |
| 当前群 `groups/*.md` 不存在 | AskUserQuestion 问临时上下文（"这个群什么氛围？领导在吗？"） |
| 发送方 `persons/*.md` 不存在 | AskUserQuestion 问临时上下文（"这个人什么风格？你怎么跟他相处？有什么雷区？"） |

**临时上下文**只在本会话用，**不**自动落档。§11 收尾时再提示用户用 comm-memory 沉淀。

### 把 grep 出的片段映射回模型理解

grep 拿到的每行是结构化的 `[type | KV] 文本`，模型解析三件事：

1. **type 决定语义角色**：`[profile]` 是稳定事实、`[behavior]` 是模式（带强度）、`[strategy]` 是历史经验（带成败）、`[event]` 是 context
2. **KV 决定权重**：`[behavior]` 的 `seen:7` 比 `seen:1` 强信号；`[strategy]` 的 `when:2026-04-21` 比 `when:2025-09-15` 更近期更值得复用
3. **正文决定具体内容** —— 自然语言的描述还是给模型当 narrative 用

**memory 存在但**消息内容跟现有 `[profile]` / `[strategy]` 描述明显冲突 → §5 显式指出冲突让用户判断（这正是 chat-recap / meeting-recap 下次会处理的 break-change，但本 skill 不写）。

## 5. 简要分析（一屏内，不长篇）

3-4 行对齐理解，**不**贴大段结构化分析（用户要回复不要论文）。从 §4 grep 出的结构化片段拿证据：

- **意图一句话**（例："口号推翻实现 + 推责"）—— 主要看消息本身 + olden-patterns
- **模式信号 + 强度**——基于 `[behavior]` 的 `seen:N`：
  - 命中现有模式 §N，`seen >= 3` → "稳定模式" / `seen == 1-2` → "新出现倾向"
  - 例："命中 §1 习惯性否定（档案 seen:7），稳定的"
- **过往经验 + 推荐策略**——基于 `[strategy]` 的 `outcome` + `when`：
  - 同 scenario 有 `outcome:✓` 历史 → 推荐复用那个策略
  - 同 scenario 有 `outcome:✗` 历史 → 显式避开
  - 例："4-21 用就事论事 ✓、3-15 用柔和推进 ✗ → 推荐 B 就事论事"
- **认知出入**（如果消息行为跟 `[profile]` 有出入）—— 一句话点出，**不主动改 memory**（那是 chat-recap / meeting-recap 的活），但提醒用户"档案说他温和派，今天这条像公开施压，要不要 chat-recap 复盘下"

## 6. 选策略（memory-driven auto-select + 用户确认）

**核心原则**：模型基于 memory + olden-patterns + user-profile **自己挑 1 个最贴的策略**，跟用户说"我推荐用这个 + 为什么"，AskUserQuestion 让用户**接受 / 换 / 自由输入**。**不**让用户每次手挑 ABC——把决策成本降到最低。

### 6.1 策略库（共 8 个 prompt 文件）

```
${CLAUDE_PLUGIN_ROOT}/references/prompts/
├── reply-soft.md             柔和推进 —— ego 高 / 需要被尊重感
├── reply-factual.md          就事论事 —— 习惯性否定但无依据（**没特判默认**）
├── reply-push.md             强势推回 —— 推卸责任 / 越权
├── reply-play-dumb.md        装傻 + 反向倒拉会议 —— 决策权高 / 摘果型老板
├── reply-cold-public.md      公开冷处理 + 私下定界 —— 公开施压（§7）
├── reply-anchor-time.md      锚定时间窗 + 拒绝旧争议 —— 反复翻旧账（§6）
├── reply-defuse-emotion.md   去情绪化 + 切回事实 —— 情绪绑架（§8）
└── reply-lock-vague.md       模糊承诺反向锁死 —— 模糊施压（§5）
```

**策略库扩展规则**：模型**不**允许 reactive 自己新增策略——库里没有合适的→暂用最近的 + AskUserQuestion 让用户用 D. 自由输入指定本次方向。如果用户反复碰到"库里都不贴切"的新模式，跟用户对齐后**走升级流程**加新 prompt 文件（半年级别周期）。

### 6.2 模型自选 1 个策略（multi-factor 决策）

**不**做 1:1 映射（"olden-patterns §N → 唯一策略"）—— 真实场景里同一个 pattern 在不同对手 / 不同关系 / 不同公共场合下应对完全不同。模型按以下**多因子合议**自己挑 1 个，**不**给用户 ABC 列表挑。

#### 优先级（高 → 低）

1. **近期 strategy ✓（< 90 天）+ 同 scenario** —— 直接复用那个策略，硬 override 下面所有信号（"用过的就用"）
2. **近期 strategy ✗（< 90 天）+ 同 scenario** —— **显式排除**那个策略；在剩下 7 个里按以下因子挑
3. **多因子合议** —— 综合下面 4 个信号，给每个候选策略打权重，选最高分的

#### 决策因子（按 olden-patterns 命中模式分别说）

每个 pattern 默认有"主候选"，但要看**对方角色 / 公共 vs 私下 / 用户偏好**做调整：

**§1 习惯性否定**
- 主候选：reply-factual
- 对方 ego 高（看 person `[profile]` 标"ego 高 / 看面子"）→ 切 reply-soft
- 对方决策权高 / 摘果型 → 切 reply-play-dumb（不是接他否定，是反向抛回让他定）

**§2 推卸责任**
- 对方决策权 ≥ 你 + 摘果型 → reply-play-dumb
- 对方同级 / 推卸到你身上 → reply-push
- 对方下级（少见） → reply-soft + 后续档案记 `[behavior]` 累积

**§3 ego 攻击**
- 私下 → reply-soft（私下 ego 攻击给面子能化解）
- 公开 → reply-cold-public（公开不能软，不然成围观）

**§4 越权越界**
- 一次性 → reply-push（直接划线）
- 反复（`[behavior pattern:§4 seen:3+]`）→ reply-push + 同步上级（脱离 reply-coach scope，提醒走真实策略）
- 对方决策权高（"老板腔"越界）→ reply-play-dumb（用"我不太懂"反向抛回）

**§5 模糊施压**
- 主候选：reply-lock-vague（反向锁死）
- 用户 user-profile 标"重视 paper trail" → 强加权 reply-lock-vague
- 对方决策权高 + 模糊 → 仍 reply-lock-vague（先锁定具体动作再说，防止被甩锅）

**§6 反复翻旧账**
- 主候选：reply-anchor-time
- **前提**：旧议题确实有 paper trail（用户必须确认有具体载体）—— 没 paper trail → 不能用 anchor-time，切 reply-factual 或 reply-push

**§7 公开施压**
- 主候选：reply-cold-public（群里冷 + 私下定界）
- 用户偏好"不在公开场合软" → 强加权 reply-cold-public
- 极端公开+施压（@全体 + 跨级）→ reply-cold-public **同步**走真实策略（脱离 reply-coach）

**§8 情绪绑架**
- 主候选：reply-defuse-emotion
- 但**先判**："真受伤"还是"绑架"：消息里有具体伤害事实 → 真受伤，切 reply-soft + 共情；只有抽象情绪话术 → 绑架，用 reply-defuse-emotion

#### 没命中 olden-patterns 时

- user-profile `[profile] 默认策略偏好` → 用户偏好那个（一般是 reply-factual）
- person `[strategy outcome:✓ | when:近期]` 任何 scenario 都有过的 → 优先复用那个
- 都没有 → 默认 reply-factual

#### 远期 strategy（≥ 90 天）

只作**参考权重**，不硬 override 上面任何因子。label 里说"很久前用过 X，不一定还适用"让用户判断（人 / 关系 / 团队都会变）。

### 6.3 展示推理 + AskUserQuestion 二选一

把推荐**连带推理一句话**给用户。**展示给用户的策略名跟随用户对话语言**——中文场景显示中文名（"装傻 + 反向倒拉会议"），英文场景显示英文名（"play-dumb")，模型读 prompt 文件用 slug（`reply-play-dumb`）但展示给用户的是中文。

```
基于以下信号，我建议用 [reply-play-dumb 装傻 + 反向倒拉会议]：
- 档案 [profile]: 张三决策权高 + 摘果型（已记 7 次相关行为）
- 命中 olden-patterns §2 推卸责任
- 你 user-profile 里 [strategy outcome:✗] 标过"独自硬扛被甩锅"——这条路不走
- 4-21 你跟他用"装傻+拉会议"过 ✓（近期，强信号）

[AskUserQuestion]
A. 按这个走（reply-play-dumb）
B. 我换一个（弹完整库列表给我挑）
C. D. Other（自由输入指定本次方向，如"绵里藏针"）
```

**默认是 A**（接受推荐）—— 90% 的场景模型推得对，用户一键过；剩下 10% 用 B/C 切。

### 6.4 用户选 B → 弹完整库

用户选 B → AskUserQuestion **第二轮**，列出所有 8 个策略让用户挑（label 跟随用户语言）：

```
8 个备选策略：
A. 柔和推进                 —— ego 高
B. 就事论事                 —— 习惯性否定（默认）
C. 强势推回                 —— 推卸责任 / 越权
D. 装傻 + 反向倒拉会议       —— 决策权高 / 摘果型
E. 公开冷处理 + 私下定界     —— 公开施压
F. 锚定时间窗 + 拒绝旧争议   —— 翻旧账
G. 去情绪化 + 切回事实       —— 情绪绑架
H. 模糊承诺反向锁死          —— 模糊施压
```

### 6.5 用户选 C → 自由输入

用户选 C 给抽象风格（"绵里藏针" / "冷处理" / "太极拳"）→ 可调 WebSearch 搜该风格的具体表达范式 + 借用最贴的现有 prompt 框架生成。**不**自动入库。

### 6.6 自由输入重复检测 → 提示加入策略库

模型在 §4 加载 memory 时**顺带 grep**：
- 当前 user-profile.md 是否有 `[strategy]` entry 注释里反复出现"绵里藏针" / "冷处理" 等关键词
- 同会话内用户**已经选过 C 自由输入**且方向跟当前类似？（这个靠模型自己留意会话内）

如果**累积 ≥ 2 次同类自由输入** → 在展示推荐时附一句：

> 你之前已经用过几次"绵里藏针"风格了——要不要走升级流程把它加进策略库？这样以后命中类似 [olden-patterns §X] 模式时我会自动推荐。
>
> 加的话需要：
> 1. 给这个策略起个英文 slug（如 `reply-needle-in-cotton`）
> 2. 写一份 `prompts/<slug>.md` —— 我可以基于你这几次自由输入的内容草拟
> 3. 写到本文 §6.1 策略库 + §6.2 决策因子里
>
> （这个升级是修改 plugin 源码 —— 一次设置以后受益。要现在做还是另开会话用 skill-creator 走？）

**不**自动添加 —— 这是 plugin 源码层面的扩展，必须显式经用户走"对齐流程"，参考 conventions.md §4 + memory-index.md "Type 闭合理由" 的同款保护。

## 7. 生成 3 个完整可发候选（**核心步骤**）

**铁律**（详见 conventions.md §4）：

- **完整可发**：每条都是**完整的、可直接复制粘贴**的文字。**不放占位符** / **不放 `[补 XXX]`** / **不公司腔**。
- **缺关键 concrete 信息**（具体数据 / 某次结论 / 文档链接）→ **先 AskUserQuestion 问清楚再生成**，不瞎编也不留空。
- **3 个候选的差异维度**：不是策略不同（策略 §6 已选），而是**强度 / 长度 / 切入角度**：
  - **A. 保守版** —— 最稳妥、最短、最不激怒
  - **B. 标准版** —— 平衡、中等长度、最可能的默认选择
  - **C. 微刺版** —— 在用户允许的"暗讽"边界内加一点，或把对方句式"照样返给他"

**输出格式**（照贴，别加 prose 解释）：

```
=== A. 保守版 ===
[完整可发文字 3-8 行]

（nuance 一句：为什么这版保守 + 适合什么场景）

=== B. 标准版 ===
[完整可发文字]

（nuance 一句）

=== C. 微刺版 ===
[完整可发文字]

（nuance 一句）
```

**禁止**：
- `[这里补具体数据]` / `[换你自己的说法]` —— 这是框架不是候选
- 在同一候选里给"版本 1 / 版本 2" —— 就 3 个候选，干净利落
- 公司腔（"非常感谢" / "烦请" / "如有任何问题"）

## 8. 用户选 + 可能微调（AskUserQuestion）

```
A. 发 A
B. 发 B
C. 发 C
D. 让我改一下（Other 自由输入怎么改）
```

D → 按用户输入定向修改 → **重新展示 3 个候选**（或聚焦改的那条） → 再 AskUserQuestion → 循环到选定 A/B/C。

## 9. 分支预判（**不要跳**——选定候选后必跑）

基于对方档案 / olden-patterns 模式，预判他**最常见的 2-3 种反应**，给每个分支的 **ready-to-send 后续**：

```
你发 [B. 标准版]。基于 [档案 / olden-patterns §1] 模式，他大概率会：

→ 分支 1：他[反应类型，例：搬另一个口号]（概率：高）
   典型话："[引用档案里他的典型话术 / olden-patterns 例句]"
   你的下一句：
   "[完整可发的 ready-to-send 后续]"

→ 分支 2：他[反应类型，例：[捂脸]脱身 / 模糊承诺]（概率：中）
   典型话："..."
   你的下一句：
   "[完整可发后续]"

→ 分支 3：他不回 / 冷处理（概率：低但要想）
   你的下一步：
   "[等几小时 / 主动 follow up / @他老板 / 找其他路径推进 ——具体建议]"
```

**约束**：
- 只给 **2-3 个分支**（最常见反应模式，照档案挑）——不穷举
- 每个分支必须给**完整可发** next-move，不留框架
- 标 **概率**（高 / 中 / 低）让用户知道主路径
- 若分支超过 2 步深 → 直说"到这大概率要脱离 reply-coach 流程，走现实策略（找 leader / 拉第三方 / 走文档）"

## 10.（可选）发送

**仅在用户显式说"帮我发"/"直接发"时**（默认是用户自己复制粘贴）：

```bash
lark-cli im +messages-reply --message-id <mid> --text "..." --dry-run
```

把完整 payload 展示给用户 → 用户**显式确认**后去掉 `--dry-run` 真发。这是写操作安全边界（conventions.md §3）的硬约束，**不能省略 dry-run 步骤**。

## 11. 收尾引导（不代做）

如果本会话有新信号（新认识的人 / 新发现的雷区 / 这次有效策略 / 临时上下文回答），**提示但不写**：

> "这次跟张三用 B. 就事论事效果不错。要不要用 `/anti-olden:comm-memory` 记下来？"

**不自动写 memory**——用户决定记不记。

## 12. 不适用本 skill 的场景（建议路由）

- 用户口述要建 / 改档案（不需要拉消息）→ `comm-memory`
- 用户要从 IM 消息提炼 memory（"分析 X 最近表现"）→ `chat-recap`
- 用户要拉某场会议看 X 的细节 → `meeting-recap`
- 用户要发主动消息（不是回复）→ 不在本 skill scope；写操作严格 dry-run（conventions.md §3）

## 关键约束（汇总）

- **不写 memory**——本 skill 只读
- **不自动发送**——必须 dry-run + 用户确认
- **不确定就问**——缺 memory / 不确定哪条消息 / 用户意图模糊都先 AskUserQuestion
- **3 候选 + 用户主动选**——不留半成品占位符（conventions.md §4）
- **不公司腔**、**不给情绪价值**、**`lark_user_id` 是身份主键不是姓名**、**"老登"代号仅内部用**
