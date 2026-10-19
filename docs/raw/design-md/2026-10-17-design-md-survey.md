---
type: raw
source_type: document
captured: 2026-10-17
title: DESIGN.md 写法调研（Google 规范 + VoltAgent 84 份样本）
tags: [design-md, idea-loop, design-md-write-entry]
related: ["[[design-md-write-entry]]", "[[2026-10-19-design-md-standard]]"]
---

> 来源：ui-state-archive 审核会话的共享笔记 design-md-survey.md，调研会话产出，抓取于 2026-10-19。以下为原文，未编辑。

# DESIGN.md 写法调研

调研对象：Google 的 design.md 规范（spec.md，alpha），加 VoltAgent/awesome-design-md（84 个产品）。再拿 Toeflair 的 DESIGN.md（544 行）当对照。

## 方法与口径（先说清楚）

- Google 规范：我自己读了全文。
- 84 个产品：**84 份全部由 haiku 子代理逐份读完**（一个产品一个子代理，并发上限 20，分 4 批）。
  - 章节标题、动效关键词、日期、判例这几项，我另用脚本对 84 份全量扫描做交叉核对，两边吻合。
  - 修订记录：本文第一版只读了前 42 份；Harold 要求补全后，后 42 份已读完，并据此修订了第 3、4 节。

## 一个先要知道的事实：样本不独立

awesome-design-md 里 84 份文件几乎出自**同一条生成流水线**：

- 74 份用同一套 11 节结构（Google 的 8 节 + Responsive Behavior / Iteration Guide / Known Gaps）。
- 10 份用旧式 9 节结构。
- 文件里留着生成痕迹：`derive-examples-block.mjs`、`TO_FILL` 占位、`ex-*` 自动生成示例。

所以“出现频率”反映的是**这条流水线的模板**，不是行业共识。它们全是外部分析：从品牌官网反推设计系统，不是产品团队自己长期维护的 DESIGN.md。这一点对我们很关键，下文再讲。

## 1. 章节出现频率（84 份）

| 章节 | 份数 | 说明 |
|---|---|---|
| Do's and Don'ts | 83 | 几乎全有 |
| Overview / Colors / Typography / Layout / Components | 各 74 | 新式模板 |
| Shapes / Elevation & Depth | 73 | 个别缺一 |
| Responsive Behavior | 61 | 新式模板里的扩展节 |
| Iteration Guide | 50 | 给 agent 的操作提示 |
| Known Gaps | 43 | 声明没覆盖什么 |
| 旧式命名（Visual Theme & Atmosphere / Color Palette & Roles / Typography Rules / Component Stylings / Layout Principles / Depth & Elevation / Agent Prompt Guide） | 各 10 | 旧模板 |

其他事实：

- 74 份有 YAML front matter（token），且 74 份在 front matter 里写了 `components:`。
- 文件平均约 556 行，最短 125 行，最长 852 行。
- **没有任何一份有 Motion / Animation / Interaction / Transition 类标题。** 0 / 84。

## 2. 每类章节通常写什么、写到多细

| 章节 | 内容类型 | 细度 |
|---|---|---|
| front matter | 全部机器可读 token：colors / typography / rounded / spacing / components | 数值精确到 hex / px。组件用 `{colors.x}` 引用 token |
| Overview | 气质叙述 + “Key Characteristics” 要点 | 几段话。常和 Do's 重复 |
| Colors | 每个色值 + 用途规则（“只用于主 CTA”） | 每色一行。好的写法把语义和限制绑在一起 |
| Typography | 字阶表（字号 / 字重 / 行高 / 字距）+ 排版原则 | 表格。常含字体缺失时的替代方案 |
| Layout | 间距 token、栅格、容器宽度、留白理由 | 数值 + 一两句理由 |
| Elevation & Depth | 层级表；很多是“不用阴影，靠底色差”的理由 | 表格 + 规则 |
| Shapes | 圆角 token 表 + 图片几何 | 表格 |
| Components | 组件配方：token 引用 + 尺寸 + 状态 | 每个组件一条，状态（pressed / focused）单列成条目最好 |
| Do's and Don'ts | 可执行规则，好的每条附理由 | 10–20 条 |
| Responsive Behavior | 断点表 + 折叠策略 + 触控尺寸 | 表格 |
| Iteration Guide | 给 agent 的操作步骤（“改颜色先查哪里”“hover 不记录”） | 5–10 条 |
| Known Gaps | 没覆盖什么、数据局限、临时推荐值 | 5–8 条 |

## 3. 动效 / 交互怎么写

Google 规范没有这一节，样本里也**没有人补这一节**。实际处理有四种：

1. **声明不记录（最多）。** Known Gaps 写“动画时长、缓动不在范围内”（airtable、claude、clay、cursor、ferrari、figma 等）。
2. **no-hover 政策。** Components 或 Iteration Guide 开头写“不记录 hover 态，只记 Default 与 Pressed”。64 份提到 hover，其中 26 份明确写了不记录。
3. **给一句推荐值。** Known Gaps 里写“时长未提取，建议 150–200ms ease”。meta、minimax、mintlify、mistral、miro、mongodb、notion 同一句话。这是流水线模板，不是各产品的真实决定。
4. **真有动效规则的只有 3 个，都没有独立一节（补读后）：**
   - **tesla：写成全站原则加一条禁令。** 开头一句“0.33s cubic-bezier 是所有交互状态变化的统一时长”，各组件配方里写 Transition 字段，Do's 里写“动效统一 0.33s——动效的一致和颜色的一致同样重要”，Don'ts 里写“不要加 scale / translate 的 hover 动画，Tesla 的交互只有颜色（背景与边框）过渡”。这是样本里最接近“动效怎么写进 DESIGN.md”的范本：**原则、数值、禁令，没有一条带日期的先例。**
   - **theverge：** 在组件里写“约 180ms ease / 150ms ease，只作用于颜色”，加“hover 不位移、不缩放”。
   - **starbucks：** 有真实 token（`--duration`、`--expanderDuration: 300ms`、缓动曲线），写在组件状态下，并自述“逐组件动画时长没有全部采集”。
   - 其余约 80 份没有动效数值（含 7 份用同一句模板“时长未提取，建议 150–200ms ease”）。

交互态（pressed / focused）是个例外：它们当作**组件状态**写进 `components:` 配方，不算动效。

小结：样本里没有人建“Motion”一节。唯一像样的做法（tesla）把动效写成**一条全站原则加一条禁令**。Toeflair 的 Motion 一节前半（时长地板、缓动、reduced-motion、何时允许更多动效）形态和 tesla 一致，合理；后半“先例库”和 Case Law 在样本里没有对照。

## 4. 过程信息（日期、来源、先例、判例）

- **日期：** 0 / 84 份有 `YYYY-MM` 形式的日期。
- **判例 / 先例 / 变更记录：** 0 / 84。扫出的 4 个命中（linear、mintlify、opencode、raycast）都是内容里的“Changelog”链接或组件名，不是文件自己的变更记录。
- **来源：** 59 份有，但只是**取证说明**，不是历史。写法是：
  - Colors 开头一行 “Source pages: 首页、定价页…”。
  - Known Gaps 里写“色值取自截图像素 / CSS 变量，非官方值”。
- **生成痕迹：** 约 15 份（补读后，84 份中）残留脚本名 `derive-examples-block.mjs`、`TO_FILL`、“Examples 为脚本生成”（uber、wise、warp、vercel、webflow、zapier、voltagent、together.ai 等）。是缺陷，不是设计。
- **零星“历史”：** 补读后只发现几处“背景叙述”——tesla 一句字体由 Gotham 换成 Universal Sans、theverge 一句“2024 年重设计”、dell-1996 / nintendo-2001 的时代背景。这些是**风格语境**，不是设计决定的演进记录。

所以样本里的过程信息只有两类：**来源（证明数据哪来的）** 和 **缺口（声明没覆盖什么）**。没有任何一份把“某月某日这条规则是怎么定的”写进 DESIGN.md。

## 5. 对照 Toeflair 的 DESIGN.md（544 行）

| 部分 | 行数（约） | 样本里有无对应 |
|---|---|---|
| front matter | 1–130 | 有 |
| Overview / Colors / Typography / Layout / Elevation / Shapes / Components / Do's | 133–482（除 Motion） | 有，且内容更丰富（Named Rules 带 *Floor* 标注） |
| Motion 一节（含 “in-app motion precedent library”，322 行起） | 306–379，约 74 行，其中先例库约 58 行 | **样本无 Motion 节。** 先例带日期、来源（如“2026-07-14, analysis page”） |
| Case Law | 483–544，约 62 行 | **样本中 0 / 84** |

即：先例库 + Case Law 合计约 120 行，占全文 22%。它们是 Toeflair 独有的过程信息，样本里没有任何同类。

## 6. 样本里特别好 / 特别差的写法（反复出现）

好：

- 组件配方用 `{token}` 引用，不写裸 hex，可机械校验（几乎每份）。
- Do's and Don'ts 每条附理由，可判定（hashicorp：“Vault 页用 Terraform 紫即品牌违规”）。
- 状态（pressed / focused）单列成条目（framer、mongodb、miro）。
- Known Gaps 诚实写出缺口和可信度（bmw-m、airtable、clickhouse）。
- 解释“为什么不用某档”，而不只给数值（mastercard 跳过中间圆角）。

差：

- **自相矛盾（最常见，84 份里有约 57 份被子代理点名）。** 同一规则在多节重复，改一处漏另一处。例：lamborghini 先列三个强调色，后写“只许金色一个”；ferrari 阴影表给 soft drop、Do's 写不加阴影；elevenlabs 写 hover 从未记录、Elevation 却有 hover 阴影；linear / mongodb / framer / clay 的 Overview 与 Do's 重复同一条。
- 引用不存在的 token（mydealz、aljazeera、1win、mistral：`{colors.cream-soft}` 实为 `cream-light`）。
- 生成示例（ex-*）几乎不增信息，还带来错误引用。
- 响应式数值只写在散文里，没有 token（figma），无法机械校验。
- 只给默认态，缺 hover / focus / disabled（kraken、cursor）。
- Overview 里“signature / engineering-grade”之类修辞，没有可执行约束（clickhouse）。

## 7. 建议的章节骨架（调研层面的初稿，待讨论后收敛成写入标准）

骨架 = Google 的 8 节 + 两节来自样本的实用扩展 + 一节我们要自己决定的。

| 节 | 写什么 | 不写什么 |
|---|---|---|
| front matter（token） | 机器可读的全部数值：colors / typography / rounded / spacing / components | 不写理由、不写日期 |
| Overview | 品牌气质 + 设计立场（一屏） | 不重复后面各节的规则 |
| Colors | 色板 + 每色的用途与限制 | 不逐条重抄 front matter 的 hex |
| Typography | 字阶用途 + 原则 | 同上 |
| Layout | 间距、栅格、留白理由 | |
| Elevation & Depth | 层级处理（阴影或底色差）+ 规则 | |
| Shapes | 圆角规则 | |
| Components | 组件配方（token 引用 + 状态） | 不放页面级结构、不放某个页面特有的组件 |
| Do's and Don'ts | 可判定的规则，每条附理由 | 不写“应该好看”类修辞 |
| Responsive Behavior | 断点 + 折叠 + 触控尺寸 | |
| 动效（Google 规范与样本都没有，需决定） | 通用原则：时长地板、缓动、reduced-motion、何时可动 | 不放具体先例；先例属于设计过程数据 |
| Known Gaps / 来源 | 没覆盖什么、数据可信度 | 不是变更日志 |
| **不进 DESIGN.md** | 带日期的先例、判例（Case Law）、单个页面的设计决定、设计过程记录 | 这些归页面说明或“设计法候选”，由 dreaming 蒸馏后，**把已被多处遵循的结论改写成通用规则，再并入对应章节** |

最后一行是 Toeflair 的现实需要，样本里没有对照，是否这样处理要和 Harold 讨论。
