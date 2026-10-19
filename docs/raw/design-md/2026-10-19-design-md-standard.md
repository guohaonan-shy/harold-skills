---
type: raw
source_type: document
captured: 2026-10-19
title: DESIGN.md 写入标准（Harold 已认可）
tags: [design-md, idea-loop, design-md-write-entry]
related: ["[[design-md-write-entry]]", "[[2026-10-17-design-md-survey]]"]
---

> 来源：ui-state-archive 审核会话的共享笔记 design-md-standard.md，由调研会话与 Harold 定稿，抓取于 2026-10-19。以下为原文，未编辑。文中「同目录 design-md-survey.md」即 [[2026-10-17-design-md-survey]]。

# DESIGN.md 写入标准（Harold 已认可）

状态：Harold 已明确认可。第七章 Components 保留，只放系统级可复用基础组件的配方，不放特定页面或场景里的组件描述。

依据：Google design.md 规范（alpha），加对 VoltAgent/awesome-design-md 全部 84 份样本的阅读（见同目录 design-md-survey.md）。

修订记录（第二轮）：① 准入判据改写，新增“整改优先于追加”的维护原则（1.1、1.3、1.4、第五章）；② Motion 章正式设立，且只收全局原则，不枚举具体动效；③ 删除 Iteration Guide 章；④ front matter 强制规则定为正式规则。

范围声明：本文只定义 **DESIGN.md 本身是什么、每章写什么、不写什么**。设计决策、判例、过程怎么沉淀并最终进入 DESIGN.md，由 ui-state-archive 那边定；本文只在文末给它留一个接口要求。

---

## 第一章　整体目录框架

### 1.1 定义

Google 的定义（原文）：

> DESIGN.md is a self-contained, plain-text representation of a design system. It defines the visual identity of a brand and product, thereby ensuring that these stylistic choices can be followed across design sessions and between different AI agents and tools. As a human-readable, open-format document, it serves as a living source of truth that both humans and AI can understand and refine.
>
> A DESIGN.md file contains two parts: human-readable markdown prose and machine-readable YAML design tokens. The markdown body sections provide human-readable design rationale and guidance. … The tokens are the normative values; the prose provides context for how to apply them.

我们在此基础上的落地理解：

- DESIGN.md 是**设计系统本身**的自然语言加 token 表达，是 living source of truth。它描述“现在是什么、必须怎么做”。
- 它**不包含**：某一天做了什么改动、做了什么决策、某个特定组件或页面的具体描述。这些是设计过程，不是设计系统。
- 它是“被整理的”，不是“被追加的”：每次有新内容，先整改已有内容中过时、矛盾的部分；只有已有内容没有覆盖某个 seam（缺口）时，才新增（见 1.4）。

### 1.2 文件结构

```
DESIGN.md
├── YAML front matter          机器可读的全部数值（token）
└── Markdown 正文（## 二级标题，按下列顺序）
    ├── 1  Overview             品牌气质与设计立场
    ├── 2  Colors               色板与每色的用途、限制
    ├── 3  Typography           字阶与排版原则
    ├── 4  Layout               间距、栅格、留白
    ├── 5  Elevation & Depth    层级怎么表达
    ├── 6  Shapes               圆角与形状规则
    ├── 7  Components           组件配方（含状态）
    ├── 8  Do's and Don'ts      可判定的约束
    ├── 9  Responsive Behavior  断点、折叠、触控尺寸      ← 扩展
    ├── 10 Motion               动效的全局原则与禁令        ← 扩展（我们新增，已确定）
    └── 11 Known Gaps           没覆盖什么                   ← 扩展
```

暂不设 Iteration Guide（样本里 50 份有，但与 Do's 容易重复，Harold 决定暂不加）。

来源标注：

| 章 | 来源 |
|---|---|
| 1–8 | Google 规范的 8 节，名称与顺序照搬（规范要求：出现的章节按此顺序，全部用 `##`，重复标题报错） |
| 9、11 | VoltAgent 样本里的稳定扩展：Responsive Behavior 在 84 份中有 61 份、Known Gaps 有 43 份。Google 规范允许未知章节（“Unknown section heading: Preserve; do not error”） |
| 10 Motion | **Google 规范与全部 84 份样本都没有这一节**，是我们自己的扩展，已正式设立。形态参照样本里最好的做法（tesla，见第三章 Motion 一节） |

不需要的章节，用 front matter 的 `omitted:` 声明并写原因，不要留空标题（Google 规范提供这个字段）。

### 1.3 全文通用的五条写法规则

这五条对每一章都生效，也是样本里“好文件”和“坏文件”的分界。

1. **准入判据。** DESIGN.md 只收**设计系统本身**的信息：全局的、当前生效的、下一个 agent 可以直接照做的规则与数值。凡是“某天做了什么改动”“做了什么决策”“某个特定组件或页面的具体描述”，都不是设计系统，不进（见第四章）。
2. **一条规则只写一处。** 样本里最常见的缺陷是自相矛盾（84 份里约 57 份被点名）：同一规则在 Overview、Do's、各组件条目里各写一遍，改一处漏另一处。例：lamborghini 的颜色章列了三个强调色，Don'ts 却写“只许金色一个强调色”；ferrari 的层级表给了柔和阴影，Do's 却写“不加阴影”。
3. **数值只在 front matter，正文用名字引用。** 正文写 `{colors.primary}`，不重抄 `#533afd`。样本里 airtable 的 Colors 章逐条重复 hex，违反了它自己写的“hex 至多出现一次”。
4. **每条规则带“为什么”或“边界”。** 只给数值不给理由，agent 遇到没覆盖的情况无法推断。例：mastercard 解释了为什么跳过 8–12px 圆角（要么小、要么大、要么全圆，中间档不存在），比单给一张圆角表有用得多。
5. **只写当前状态，不写演进。** 不写“从 X 改成了 Y”“某月某页确认”。

### 1.4 维护原则：整改优先于追加

DESIGN.md 是 living source of truth，靠**整理**保持可维护，而不是靠追加。每次有新的内容要改动，按这个顺序处理：

1. **先找已有内容里受影响的部分。** 在所有章节和 front matter 里找：这条新内容是否与已有规则矛盾、是否让已有规则过时、是否已经被某条已有规则覆盖。
2. **能整改就整改。** 过时的改写或删除，矛盾的统一成一条，已覆盖的什么都不加。
3. **只有已有内容没有覆盖某个 seam 时才新增。** 新增时仍然写成全局规则，放进最合适的一章，并同时更新 front matter 里对应的 token。
4. **改完要读一遍相关章节**，确认没有留下同一规则的两种写法。

判断标准：这份文件即使被反复修改，行数也不应随改动次数单调增长；它的大小应由“设计系统有多少 seam”决定。

---

## 第二章　Front matter（token）

**定义：** 文件开头 `---` 包起来的 YAML，是设计系统的全部**数值**，也是唯一的数值来源。Google 规范称“tokens are the normative values; the prose provides context”。

**写什么：** `colors`、`typography`、`rounded`、`spacing`、`components` 五组；加 `name`、`description`、`version`、必要时 `omitted`。

**怎么写：**
- 颜色用 CSS 颜色串，hex 为默认。
- 字阶含 `fontFamily / fontSize / fontWeight / lineHeight / letterSpacing`。
- 组件的值用 `{colors.primary}` 这类引用，不写裸值。
- 状态拆成独立条目：`button-primary`、`button-primary-hover`、`button-primary-pressed`。

**不写什么：** 理由、用途说明、日期。这些在正文里。

**样本案例：** linear.app 的 `components:` 里，`button-primary` / `-hover` / `-pressed` 三个条目都只引用 token（`backgroundColor: "{colors.primary-hover}"`），改一个色值全局生效。几乎所有样本（74 份）都用了这种写法。

**样本里的坏例：** ibm 把 `button-tertiary` 的边框只写在正文括号里，front matter 的配方里没有，只读 token 的 agent 会漏掉。opencode.ai 同类问题（正文里的 1px 边框、2px 下划线在 YAML 里缺字段）。

**正式规则（已确定）：凡是影响渲染的属性，必须在 front matter 的 token 里有。** 正文只负责解释“怎么用、为什么”，不能成为某个渲染属性的唯一出处。

---

## 第三章　各章定义

每章按“定义 / 写什么 / 不写什么 / 样本案例”给出。

### 1　Overview

**定义：** 一屏以内的设计立场，用来在“没有具体规则覆盖”时指导 agent 的取舍。

**写什么：**
- 品牌气质：克制或活泼、紧凑或舒展。
- 最多 5–8 条关键特征，每条能转化成可检查的判断。

**不写什么：**
- 不重复后面各章的规则。
- 不用“signature / engineering-grade / elegant”这类没有可执行含义的修辞（clickhouse 被点名）。

**样本案例（好）：** tesla 的 Overview 一句话点明立场：“radical subtraction——产品是一切，界面几乎为零”，关键特征全部可检查：整页只有一个强调色、没有阴影、没有渐变、没有边框。

**样本案例（坏）：** linear、mongodb、framer、clay 的 Overview 与 “Key Characteristics” 与 Do's 三处重复同一条规则。

### 2　Colors

**定义：** 色板，以及**每个颜色什么时候用、什么时候不能用**。

**写什么：**
- 按角色分组：品牌、表面、文字、语义（成功 / 警告 / 错误）。
- 每色一行：名字、token 引用、用途、限制。

**不写什么：** 不贴采集来源页面，不逐条重抄 hex（见通用规则 3）。

**样本案例（好）：**
- stripe：Ruby 一行写明“渐变强调与图表高亮；永远不是按钮”。
- oura：primary 只限转化类 CTA。
- tesla：“没有第二强调色。刻意避免颜色变化以维持极端的视觉纪律”。

“限制”比“颜色本身”更有价值：agent 最容易犯的错就是把强调色用到不该用的地方。

### 3　Typography

**定义：** 字阶表加排版原则。

**写什么：**
- 字阶按语义命名（`display-xl`、`body-md`、`label-caps`），Google 建议 9–15 级。
- 每级的用途。
- 原则：字重范围、行高与字号的关系、字体缺失时的替代方案。

**不写什么：** 不写页面里某个标题具体多大。

**样本案例（好）：**
- hashicorp：“紧的展示行高（1.17–1.21）配松的正文行高（1.50–1.71）。这个对比就是品牌的声音。”
- vodafone：说明 -1px 字距是为 144px 字号校准的，改成中性字距会软化字形。
- clay：字体缺失时给出具体替代（Inter 500 加负字距）。
- tesla：字重只用 400–500，不用粗体、细体和极端。

**样本案例（坏）：** figma 的 Do's 规定字重只许 320/330/340/480/540/700，Overview 里却用了 450。

### 4　Layout

**定义：** 间距刻度、栅格、容器宽度，以及留白的理由。

**写什么：** 间距 token、最大内容宽度、栅格列数与间隙、留白原则、图片比例。

**不写什么：** 断点与折叠（放第九章）。

**样本案例（好）：** tesla 把留白写成原则：每个主要内容块占满一屏高，一屏只传达一条信息。

### 5　Elevation & Depth

**定义：** 层级关系怎么表达。有阴影就写阴影参数，没有阴影就写替代手段。

**写什么：** 层级表（层级 / 处理方式 / 用在哪），明确禁用的手段。

**样本案例（好）：** linear.app 的层级表用底色阶梯加 1px 边框表达，第 0 到第 4 层逐级写明“处理方式”和“用在哪”，最后一层是焦点环；并写明“在深色上基本不用投影”。

**样本案例（坏）：** 许多样本自动生成的示例块（`ex-modal-card`、`ex-toast`）写了阴影，与本章“无阴影”直接矛盾（aljazeera、nerdwallet、dell-1996、wired、vodafone、x.ai 等）。**所以不要生成示例块。**

### 6　Shapes

**定义：** 圆角刻度和形状规则。

**写什么：** 圆角 token、每档用在哪、图片几何、**为什么没有某一档**。

**样本案例（好）：** mastercard 说明“多数系统用 4/8/12/16，这里要么 ≤6、要么 20–40、要么全圆，8–12 这个中间档刻意缺席”。

### 7　Components

**定义：** 设计系统里**可复用的基础组件**的配方：外观属性加全部状态。是“agent 可以直接抄”的一章。

**写什么：**
- 系统级的通用组件：按钮、输入框、卡片、徽章、导航、列表项、对话框等。
- 每个组件：用 token 引用写颜色、字阶、圆角、内边距、尺寸；一句用途；状态（default / hover / pressed / focused / disabled）。

**不写什么：**
- 不写某个特定组件在某个页面或场景里的具体描述（这是页面的事，不是设计系统的事）。
- 不写页面级结构（“首页 hero 的布局”“分析页的进度列表”）。
- 不写某个页面特有的组件。
- 不写生成的示例块。

判别方法：这个组件的配方换到任何一个页面都成立，才进这一章。

**样本案例（好）：** framer 把 pressed、focused 这些状态单列成条目，便于机械校验；mongodb 同理。

**样本案例（坏）：**
- kraken：只给默认态，没有 hover、focus、disabled。
- intercom：`text-input-focused` 与默认态取值完全相同，焦点态没有可见差异。
- mydealz：示例里引用了文件里不存在的 token。

### 8　Do's and Don'ts

**定义：** 可判定的约束。读完这一章，agent 能判断“这样做算不算违规”。

**写什么：** 每条“做 / 不做”加一句理由；引用 token，不写裸值。

**不写什么：** “应该美观”“保持一致”这类无法判定的话。

**样本案例（好）：**
- tesla：“不要加 scale / translate 的 hover 动画——交互只有颜色过渡。”
- hashicorp：每个产品的专属色只能用在该产品语境里，越界使用说明“品牌在漂移”。
- tesla：“每屏至多两个行动按钮。”

**样本案例（坏）：** slack 的 Do's 规定按钮内边距不得低于 14px 28px，secondary pill 却写 10px 30px（规则与组件自相矛盾）。

### 9　Responsive Behavior（扩展）

**定义：** 断点、折叠策略、触控尺寸。

**写什么：** 断点表（名称 / 宽度 / 变化）、折叠规则、触控目标最小尺寸、图片处理。

**样本案例（好）：** airtable 用表格写断点（Mobile < 768px、Tablet 768–1024px、Desktop 1024–1440px、Wide > 1440px），触控尺寸直接引用组件 token 并说明对比 WCAG 的 44px。

**样本案例（坏）：** apple 的断点表写 736/834，末尾却列了 734、833、480。expo 的 Mobile 写 <640px，折叠段却写 768px 以下汉堡菜单。**断点数值只能出现一次。**

### 10　Motion（扩展，已正式设立）

**定义：** 动效的**全局通用规则**：全站原则和禁令。不是动效清单，不是先例库，不是具体动画的枚举。

**写什么：**
- 统一时长和缓动（一个或一小组，作为 token）。
- 可以动什么、不可以动什么（禁令）。
- reduced-motion 要求。
- 在“安静”和“活泼”场景之间怎么取舍（若产品有多个调性）。

**不写什么：**
- 不写某个页面做了什么动画、什么时间定的。
- 不枚举具体的动效模式或案例（“滑动指示器”“处理中的光扫”“重试光环”这类逐条列举）。列举会让这一章只增不减，最终无法维护。
- 如果多个具体动效背后有共同规律，把规律抽成一条原则写进来，而不是把各个动效都留着。

**样本案例（唯一的好范本，tesla）：**
- 原则：“0.33s cubic-bezier 是所有交互状态变化的统一时长。”
- 要求：“所有过渡保持 0.33s——动效的一致和颜色的一致同样重要。”
- 禁令：“不要加 scale / translate 的 hover 动画——Tesla 的交互只有颜色（背景与边框）过渡。”
- 全文没有一条带日期的先例。

theverge 同类（约 150–180ms ease，只作用于颜色，hover 不位移不缩放）；starbucks 有真实 token（`--duration`、`--expanderDuration: 300ms`）。

**样本的空白：** 其余约 80 份没有动效数值，其中 7 份用同一句模板“时长未提取，建议 150–200ms ease”。所以这一章的形态要靠我们自己定，tesla 是仅有的参照。

### 11　Known Gaps（扩展）

**定义：** 这份文件**没有覆盖什么**，以及已知的数据局限。是对读者的诚实声明，**不是变更日志**。

**写什么：** 未覆盖的范围（暗色模式、错误态样式）、数值是估测还是权威、缺口的临时处理。

**不写什么：** 不写“某日做了什么改动”，不写决策历史。

**样本案例（好）：**
- hashicorp：“暗色是唯一的营销模式，亮色适配未记录。”
- airtable：颜色取自截图采样，可能随季节换色。
- bmw-m：诚实列出缺口与可信度。

---

## 第四章　明确不进 DESIGN.md 的内容

| 内容 | 为什么不进 | 样本里的情况 |
|---|---|---|
| 判例（situation → decision → reasoning，带日期） | 是决策与过程，不是设计系统；随时间只增不减，会把文件变成决策堆叠 | 0 / 84 份有 |
| 带日期的先例（“2026-07-14，analysis 页”） | 同上 | 0 / 84 份有 |
| 具体动效的枚举（逐条列出各种动画） | 只增不减，无法维护；Motion 章只收全局原则 | 样本里除 tesla 外都没有动效规则 |
| 单个页面的设计决定、特定组件在特定场景的具体描述 | 属于页面，不属于设计系统 | 样本都不含 |
| 某天的快照、变更记录 | DESIGN.md 描述当前状态 | 0 / 84 份有 |
| 采集来源页面清单、脚本生成说明 | 是取证说明；对自己维护的项目没有意义 | 59 份有来源说明，15 份残留脚本痕迹 |
| 自动生成的示例块（`ex-*`、`TO_FILL`） | 几乎不增加信息，还引入错误引用 | 约 15 份残留 |
| 被多处遵循的先例 | 应先改写成无日期的通用规则，再并入对应章节；原始判例留在别处 | — |

---

## 第五章　对 ui-state-archive 的接口要求

只列 DESIGN.md 这一侧**对外的要求**，具体怎么实现由那边定：

1. **入口只收设计系统层面的内容。** 任何要写进 DESIGN.md 的内容，必须先改写成全局规则的形态（无日期、无页面名、可直接照做），并指明并入哪一章。
2. **不满足的，留在设计过程数据里**（页面说明、“设计法候选”），不写 DESIGN.md。
3. **先整改，后追加**（见 1.4）：写入前先找出已有内容中被它影响的部分（矛盾、过时、已覆盖），在原处改写或删除；只有已有内容没有覆盖某个 seam 才新增。样本里最常见的缺陷是新旧规则并存。
4. **新增也要同步 token。** 影响渲染的属性必须进 front matter。
5. **格式校验。** 写入后跑官方 `@google/design.md` lint（token 引用有效、没有重复章节、对比度）。
6. **Motion、Responsive Behavior、Known Gaps 是我们的扩展章。** 它们不在 Google 规范里；lint 对未知章节只保留不报错，所以它们不会被校验到，写入时要靠人或脚本守住形态。

---

## 附：已定事项

| 事项 | 结论 |
|---|---|
| 准入判据与维护原则 | 只收设计系统本身；整改优先于追加，缺 seam 才新增（1.1、1.3、1.4） |
| Motion 章 | 正式设立，只收全局通用规则，不枚举具体案例 |
| Iteration Guide | 暂不加 |
| front matter | 强制：凡影响渲染的属性都进 token |

| Components 章 | 保留，只放系统级可复用基础组件的配方（按钮、输入框等）；不放特定页面或场景里的组件描述（Harold 已确认） |
