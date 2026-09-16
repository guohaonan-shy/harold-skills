---
type: spec
status: 在飞
tags: [design-workflow, idea-loop, design-plugin, prototype, critic-loop]
summary: 设计工作流 v2：prototype 进 grill 取证；design 并入 idea-loop 拆成 imagine（出 prompt）与 refine（出 HTML 画布）；评委收敛环按 finding 推导评分
related: ["[[2026-09-11-design-loop-prototype-critic]]", "[[2026-09-11-aihero-prototype-skill]]", "[[2026-09-11-lenny-ai-world-class-designer]]", "[[design-plugin-idea-loop-integration]]"]
---

# 设计工作流 v2：两次触碰、imagine 与 refine、一条评委收敛环

> 本 spec **取代** [[design-plugin-idea-loop-integration]] 的四条决策：「design 与 idea-loop 是两个独立 plugin、跨 plugin Skill 调用集成」（其 §2 与 §6）、「grill → design 的移交」（整条流水线嵌在访谈中间跑）、「to-ticket 的设计冻结字段从 spec §4 誊写」、「design-ui / design-motion 维持两个独立 skill」。那份 spec 的其余部分（plugin 迁移、DESIGN.md 八节格式、lint 瘦身、design-port 吸收翻译、references 重组）已合并落地，其内容在本 spec 里被重新安置而不是丢弃。它的了结与 ADR 归 `dreaming`。

## 1 问题

上一版把设计接进 idea-loop 的方式是：`grill` 的设计子树长出来之后，一次性 handoff 给 `design:design` 跑完整条高保真流水线（澄清、候选、design-ui 的八段循环、浏览器 gate、人工签字），产物回到访谈里由人判定满不满意，不满意再回 grill。跑下来有五个卡点：

1. **人在错误的时机评错误的东西。** 结构还在访谈里讨论，摆到人面前的却是高保真视觉稿。人会去评品味而不是评结构，"不满意"这个信号分不清是产品判断错了还是像素没调好。
2. **一个访谈被一整条流水线打断。** design-ui 的浏览器循环、lint 输出、截图会把 grill 主会话的上下文撑满；spec 状态闭集里早就有 `等设计冻结` 一档，但没有任何路径真正让它发生。
3. **设计产物有路径依赖，而收敛环没有独立的品味约束。** 现有 G2 "isolated critique" 是同一个模型自己再看一遍加读 checklist：没有分模型、评委看得到代码和历史、没有可依赖的评分标准（9 分和 8 分说不出差别）。refero 被当成开工前的约束读，等于把模型的路径依赖换成行业的路径依赖。
4. **状态模型类的问题没有仪器。** "这个状态机该长什么样"这类讨论定不了的问题，现在只能靠文字硬答。
5. **design 作为独立 plugin 的前提已经不存在。** 它每个阶段的输入（spec、prototype）和输出（ticket 消费的冻结、implement 调用的仪器）都是 idea-loop 的产物，却要靠跨 plugin 的 Skill 调用衔接，两个 plugin 各自升版本时契约会漂；同时 design-ui / design-motion / design-port / design-brief / design 五个入口让一条线性流程看起来像一张路由表。

## 2 方案

把设计拆成**两次触碰**，放在两个不同时机：

| 触碰 | 时机 | 回答什么 | 产物 | 强制吗 |
|---|---|---|---|---|
| **prototype** | grill 中，某条 frontier 问题文字定不了时 | 选哪个结构 / 状态模型 / 行为 | 答案写进 spec §4；一次性 HTML 进 raw 桶当证据 | 否，按需 |
| **设计冻结** | to-spec 之后、UI ticket 开工之前 | 这个 surface 想要什么、做到什么程度 | HTML 画布 + ledger + 截图进 raw；冻结摘要进 spec | UI ticket 是 |

**`design` 独立 plugin 退役，内容并入 `idea-loop`。** 设计冻结这一次触碰内部再分两段、两个 skill、中间一次 `/clear`：

- **`uiux-imagine`，发散。** 在还没定下来的最高高度上出几个真正不同的变种（随机种子 / ambition / DESIGN.md 三种起点），人看着变种给方向性 note，模型**调向**到人说"方向没有要补的了"。准出物**只有一份 prompt**（方向说明，写进 spec §4），变种的渲染只服务于人的反应，不往下传。没有 DESIGN.md 的项目在这一段把语言选出来并写成 DESIGN.md。原 `design-brief` 溶解在这里。
- **`uiux-refine`，收敛。** 新会话读 spec 里的方向说明，在 DESIGN.md 之下**从 prompt 重建** preview HTML，执行者 Opus 5 对评委 Fable 5.1 跑**打磨**环（评委只收截图，分数从 finding 推导），refero 由具名问题召唤，动效、素材、减法都在这一段。准出物是**一个 HTML 画布**（角色相当于 Figma 画布）加 ledger 和 matrix 截图进 raw，冻结摘要写进 spec，状态翻 `在飞`。
- **UI 实现标准**是一份 plugin 级 reference 加一个 mismatch 脚本，不是 skill：`implement` 接 UI ticket 时读它，把 HTML 画布整理成项目自己的框架代码（react / next / vue / nuxt / svelte），按 ledger 里签字过的 matrix 逐格对着 HTML 比 mismatch，红绿判定。原 `design-port` 溶解在这里。

前向环变成：`grill（按需 prototype）→ to-spec → [uiux-imagine → /clear → uiux-refine] → to-ticket → implement（读 UI 实现标准）→ pr-*`，方括号里的两段**只在 spec 落成 `等设计冻结`（即这次需求碰 UI）时才走**，纯后端、埋点、bug fix 直接从 to-spec 进 to-ticket。三封"给失忆者的信"分别在三道人工闸门压缩一次：prototype 的一句话问题和裁决进 raw；方向说明从 imagine 交给 refine；冻结摘要从 refine 交给 to-ticket 和 implement。

原则一句话：**人拥有方向，机器拥有执行。**

## 3 User Stories

**prototype 与 grill**

1. 作为在 `grill` 里被访谈的人，我想要某条 frontier 问题用文字说不清结构或行为时，能拿到一个可点击的一次性原型来做决定，以便决策建立在看得见的东西上而不是想象上。
2. 作为在 `grill` 里被访谈的人，我想要 prototype 只在讨论定不了时才出现，以便纯技术改动、埋点、bug fix 不被强制拉一轮原型。
3. 作为看 UI 结构原型的人，我想要变体在结构上根本不同而不是配色微调，灰盒、真实数据密度，以便我选的是结构不是壁纸也不是品味。
4. 作为要决定一个状态模型的人，我想要原型带状态面板、自由操作按钮和分 tab 的引导 walkthrough，用领域语言标注，以便非技术同事也能自己点出"这不该可能"这类想法层面的 bug。
5. 作为后来接手的人，我想要原型本体和"当时为什么选它"的裁决一起留在 raw 桶里，以便证据可再看、可重跑。
6. 作为在 grill 里需要可视化选择的人，我想要 prototype 不被 Claude Code 内置的 `/design` 画布替代，以便状态模型交互、灰盒结构变体、可重跑证据这三样内置画布给不了的东西还在。

**spec 与 ticket 的缝**

7. 作为跑 `to-spec` 的人，我想要碰 UI 的 spec 自动落成 `等设计冻结`，§4 记下结构决策和原型指针，以便设计冻结是一个有路径可走的正常状态。
8. 作为切 ticket 的人，我想要 `to-ticket` 只读 spec：spec 已 `在飞` 且 §4 有冻结摘要就誊写，仍是 `等设计冻结` 就落 ⛔，以便切票不依赖 cwd 里的临时文件。
9. 作为切 ticket 的人，我想要非 UI ticket 不被设计冻结阻塞，以便设计和后端工作可以并行。
10. 作为维护 idea-loop 的人，我想要设计侧的 skill、references、lint hook、脚本都住在 idea-loop 里，不存在任何跨 plugin 的 Skill 调用，以便两个 plugin 各自升级时契约不会漂。

**uiux-imagine**

11. 作为在一个没有 DESIGN.md 的项目里开始设计的人，我想要 imagine 用随机种子生成多套真正不同的语言并渲染成 style tile，以便我"看到才知道"想要什么。
12. 作为已经有一个明确 ambition 的人，我想要直接从 ambition prompt 起步而不被强制走种子，以便不为我已经打破的路径依赖再付一次发散成本。
13. 作为已有 DESIGN.md 的项目里做新 UI feature 的人，我想要 imagine 每次都走，但只在还没定的最高高度上发散（结构、布局、组件处理），混一两个种子当 wildcard，以便一致性和想象力同时成立。
14. 作为已有 DESIGN.md 但想换语言的人，我想要语言高度只在我显式说"重探语言"时打开，产物是带日期的修订提案而不是悄悄覆盖，以便打破是显式决定。
15. 作为在 imagine 里的人，我想要 AI 先列刻意缺乏细节的想法清单、可视化我喜欢的几个、按我的方向性 note 调向，满意后由 AI 写出方向说明，以便我的品味贯穿方向决策。
16. 作为在 imagine 里的人，我想要变种保持在能分辨方向差异的最低保真度上、没有评委，以便我评的是方向而不是像素，也不为会丢掉的变种付评委的钱。
17. 作为在 imagine 里顺口说了一句"卡片太挤"的人，我想要这句执行层的话被停进待打磨清单而不是当场改，以便 imagine 不偷偷变成 refine，我也不会觉得被忽略。
18. 作为做小改动的人，我想要 imagine 的大小随打开的高度伸缩：一个有边界的组件改动就是一张三选一的 Variant Board，以便不为加一个 badge 出六套语言。
19. 作为 imagine 收工的人，我想要准出物只有一份方向说明写进 spec §4，然后 `/clear` 进 refine，以便 refine 的会话不带任何 imagine 的对话上下文。
20. 作为选定语言的人，我想要可以选做一次 refero styles 压力测试，以便 style tile 上好看的方向不会在表格和表单前塌掉。

**uiux-refine**

21. 作为进入 refine 的人，我想要它从 spec 里的方向说明和 DESIGN.md 重建 preview，不需要 imagine 的任何渲染物，以便 handoff 是一封写完整的信而不是"如上所述"。
22. 作为等设计收敛的人，我想要执行者和评委是两个模型、评委每轮新开上下文只收截图和方向说明的意图一句，以便评审不被代码细节和历史评语带偏。
23. 作为等设计收敛的人，我想要评委拿着 rubric 给出带维度 / 严重度 / kind 的结构化 finding **和**一个分数，代码只校验分数与 finding 按分数带是否自洽，以便"9 分"有一个我能依赖的定义：8 分和 9 分的差别是有没有一条能用尺子量出来的执行缺陷。
24. 作为等设计收敛的人，我想要收敛环在推导分达到 9 时停、最差严重度连续两轮不降时停下交给我、出现方向级 finding 时立即交给我，以便我不为一个评委修不了的方向问题付无限轮次。
25. 作为等设计收敛的人，我想要执行者每轮先把散点 finding 聚成"本轮核心问题"一句话再决定查 refero 还是直接改，以便一簇细碎意见被读成一条底层规则。
26. 作为等设计收敛的人，我想要 refero 只被具名问题召唤、按布局 / UX pattern / style 路由到 screens / flows / styles，以便别人解过的题不重新想，而品味问题不被行业中位数拉平。
27. 作为签字的人，我想要看到的是收敛后的结果，且我的反馈按性质分流：执行性 note 再跑一轮评委，方向性 note 回 imagine 在对应高度重开，以便 refine 永远不改方向。
28. 作为要做动效的人，我想要动效仍在静态构图冻结之后才做、评委看定格帧序列或 GIF、seek-frame 确定性 gate 保留，以便动效验证标准不因合并 skill 而削弱。
29. 作为做营销页的人，我想要 block 的 job 是 identity 或 atmosphere 时能用 Higgsfield 生成图片或视频素材；作为做 in-app surface 的人，我想要素材生成默认不开、零环境循环不变，以便两种 register 各得其所。
30. 作为收敛完成的人，我想要有一轮显式的减法 pass 和一轮 AI tells 清理 pass，以便"删"是独立目标。
31. 作为 refine 收工的人，我想要 HTML 画布、matrix 截图、ledger、生成素材一起进 raw 桶，冻结摘要写进 spec 并把状态翻 `在飞`，以便 to-ticket 和 implement 各取所需。

**UI 实现标准**

32. 作为实现 UI ticket 的人，我想要一份栈无关的 reference 告诉我怎么把 HTML 画布整理成项目 primitives 的组件树、token 怎么映射到 DESIGN.md、各栈怎么表达状态与断点，以便不把 preview 的 CSS 原样搬进项目变成第二套样式系统。
33. 作为实现 UI ticket 的人，我想要实现完直接跑测量脚本：它在同一 playwright 浏览器里开两个 tab 按 matrix 逐格量 DOM（测量层）加截图比对（像素层），给出带严重度的 finding，我照改到全绿或 plateau，以便视觉正确性是一个会红的测试而不是另一个 agent 的意见。
36. 作为目标项目的维护者，我想要状态 URL 只存在于 dev 构建（dev 专用 harness 路由，prod 下 404 有测试断言），以便为设计校验加的入口不会漏到生产。
34. 作为维护 idea-loop 的人，我想要分数自洽校验和测量比对都是有单测的纯函数，以便评委的打分不能脱离它自己报的 finding，测量层的容差判定也不会漂。
35. 作为写画布的人（refine 阶段），我想要画布带稳定锚点、字体走项目自己的加载方式、每个状态可用 `?state=` 切到，以便实现环的两个 tab 真的在比同一个东西。

## 4 实现决策

### 4.1 idea-loop 原有 skill 的改动

**grill 的设计子树**。保留"只有当某个产品决策需要设计层面的取证才能给出靠谱推荐答案时才长出来"的判据。子树长出来后的动作改成：把那条问题压成一句话，调 `prototype`，人在原型里选，答案作为这条 frontier 的落定回到决策树继续问。删除"handoff 给 design、跳过 clarify、不满意回 grill 而不是回 design"三条，前提不存在了。缺 PRODUCT.md / DESIGN.md 时把核心判断当 frontier 问出来的规则不变；DESIGN.md 本身由 imagine 写。

**prototype，新 skill**，模型可调用（grill 要在会话内调它），人也可直接调。一次只回答**一个**能用一句话说清的问题，问题显示在页面顶部。约束照搬 Matt：没有测试、没有抽象、没有持久化、一次坐下来做完。两个分支：逻辑 / 状态模型（单文件 HTML 双击即开，带标签的状态面板每次交互后重渲染，自由操作按钮，分 tab 的引导 walkthrough，领域语言标注，底层纯逻辑与 DOM 分离）；UI 结构（至少两个结构上根本不同的变体，浮动工具栏加 URL 参数切换，真实数据密度，灰盒，不做视觉决定，可借用原 wireframe-candidates 的结构分歧审计纪律）。产物落 `docs/raw/<topic>/`：HTML 进该桶的 assets 子目录，配一份 `source_type: prototype` 的 raw md，记问题一句话、变体清单、裁决和理由。prototype 自己写这份 raw，`to-spec` 只在 §7 关联它。跑过 prototype 的 feature，imagine 从下一层高度开始，不重做结构。**与内置 `/design` 的关系**：Claude Code 内置 `/design` 把 brief 画成 Claude Design 画布上的静态 artboard 并发布为 artifact，是 mockup 工具：不接问题只接 brief、没有状态与交互、输出带视觉而非灰盒、产物在 claude.ai 上不可重跑，覆盖不了 prototype 的任何一个分支，不作替代。prototype 的 HTML 可以顺手用 Artifact 发布给非技术的人点，那是分发渠道不是 skill 本身。

**to-spec**。碰 UI 的 spec 落 `等设计冻结`；§4 记录结构决策与原型指针；§7 关联原型 raw。收工提示点名下一步 `uiux-imagine`。

**to-ticket**。回到只读 spec。「设计冻结」字段的判定：spec 状态 `在飞` 且 §4 有冻结摘要小节 → 誊写（raw 里 HTML 画布的指针、matrix、mismatch 阈值、ledger 摘要一行）；spec 仍是 `等设计冻结` → `⛔ 未冻结 —— 不可开工`。UI ticket 的验收标准里带 matrix 与阈值。非 UI ticket 不受影响。

**implement**。接到 UI ticket 时读 UI 实现标准 reference（见 4.4），把 mismatch 脚本当视觉正确性这一行的红绿测试跑，跟真 DB 测试、eval 同级。其余流程不变。

### 4.2 Plugin 组织

`design` 独立 plugin 退役，marketplace 条目移除，不留别名或兼容层。其内容整体搬进 `idea-loop`：`uiux-imagine`、`uiux-refine` 两个 skill 进 skills 目录；design 的 references 整体进 idea-loop 的 plugin 级 references 下一个 design 子目录（design-ui 与 design-motion 降级为其中按需加载的 protocol，与现有 surface / module / component protocol 同一模式；design-brief 的八节格式与 T1 要短的规则并入 imagine 的"写 DESIGN.md"一步；design-port 的翻译指南改写成 4.4 的 reference）；lint hook、lint 脚本及其单测随迁；wireframe-candidates workflow 的结构分歧审计并入 prototype 与 imagine 的纪律，workflow 脚本本身退役。

idea-loop 共十个 skill。README 两张表：模型可调用的是 `prototype`、`to-spec`、`to-ticket`、`pr-*`；只能人调的是 `grill`、`implement`、`dreaming`、`uiux-imagine`、`uiux-refine`（后两者是有人工闸门的阶段，且 refine 要求新会话，与 implement 同理）。

### 4.3 uiux-imagine

**高度规则**。imagine 在每个碰 UI 的 feature 上都走（spec 为 `等设计冻结` 是唯一触发条件），但只在**还没定下来的最高高度**上发散，种子作用在那个高度：

| 已经定了什么 | imagine 在哪个高度出变种 | 种子作用 |
|---|---|---|
| 没有 DESIGN.md | 语言：配色、字体、形状、register，渲染成 style tile | 每个种子一套语言 |
| 有 DESIGN.md，结构没定 | 结构：块序、内容责任、页面 IA，灰盒 | 每个种子一种结构赌注 |
| 有 DESIGN.md，结构已定（prototype 或 spec 定的） | 布局与处理：模块构图、组件处理、状态呈现 | 每个种子一种处理 |
| 只是一个有边界的组件改动 | 组件：2 到 3 个选项的 Variant Board | 种子给处理方向 |

语言高度只在没有 DESIGN.md 时自动打开；有 DESIGN.md 时要人显式说"重探语言"才打开（re-explore），产物是带日期的修订提案或营销 register 分支，人决定写不写回。语言高度打开时 imagine 要一路降到 surface：选完语言、写完 DESIGN.md（固定八节，T1 五到八条底线，Case Law 从空开始），再在结构或布局高度出一轮变种，直到方向说明描述的是一个 surface。imagine 的形状每次都在，大小按打开的高度伸缩。

**起点**按人对方向知道多少定：完全空白用 shell 生成随机字母数字串，每个种子独立派一个 subagent 定一套方向；有 ambition 直接用 ambition prompt；有 DESIGN.md 在约束内出清单、混一两个种子当 wildcard。

**调向环**：让 AI 列一批刻意缺乏细节的想法 → 渲染人挑中的几个（最低可分辨保真度）→ 人记录反应、给方向性 note → 按 note 调向 → 迭代到人说"方向没有要补的了"。三条纪律：**只接方向性 note**，执行层的话停进待打磨清单；**不提保真度**，人在低保真下分不出两个变种哪个好，说明差别是执行层的，按推荐选；**没有评委**。refero 不在第一批变种出现之前被读，之后可被人或模型提出的具名问题召唤（这类 flow 别人怎么进的、这种页面 hero 怎么排），按 4.6 路由。人选定语言后可选做一次 refero styles 压力测试。

**准出物只有一份方向说明**，写进 spec §4 一个"设计方向"小节，由模型写、人改过并确认才算闸门通过。变种的渲染物和 contact sheet 只服务于人的反应，不往下传、不留存；落选理由以文字进方向说明。固定七节：

| 节 | 内容 | 谁消费 |
|---|---|---|
| 意图 | 一句话：它想要的美学和 register | 评委每轮收的 Design Read |
| 高度记录 | 打开过哪些高度、各自定了什么；DESIGN.md 是否此刻诞生；结构是否来自 prototype（wikilink 指向那份 raw） | 执行者 |
| 结构 | 块序、内容责任图；结构高度没打开就写"沿用 spec / prototype，未改" | 执行者 |
| 变种裁决 | 选中的赌注一句话；落选变种各一行为什么否 | 执行者，防止打磨时漂回落选方向 |
| 待打磨清单 | 人在 imagine 里给的执行层 note，原样停放 | refine 第一轮连同评委 finding 一起消费 |
| 约束与素材 | 相关 T1 底线、不许动的东西、`(unknown)` 和 `(empty)` 槽 | 执行者 |
| 验收矩阵 | context matrix 各格、mismatch 阈值 | refine 的 gate，之后进冻结摘要和 ticket |

**状态信号**：spec `等设计冻结` 且 §4 有"设计方向"、无"冻结摘要" = 方向已定、待打磨。收工时告诉人去 `/clear` 再 `/uiux-refine`。

### 4.4 uiux-refine 与 UI 实现标准

**输入**（新会话）：spec（含设计方向）、目标项目根的 DESIGN.md 与 PRODUCT.md、plugin 的 references。不读 imagine 的任何渲染物。

**流程**：从方向说明在 DESIGN.md 之下重建 preview HTML（工作文件在 cwd 的 preview 目录，lint hook 盯着它）→ 第一轮消费待打磨清单 → 打磨环 → 静态构图冻结后按需动效（block 的 job 是 state / result / identity / atmosphere 时）→ 素材（营销 register 且 block job 是 identity / atmosphere 时用 Higgsfield 生成图片或关键帧插值视频；in-app 默认不开，零环境循环不变）→ 减法 pass（评委带减法 brief 再跑一轮：去 glow 去渐变去多余容器、图能说清就删标签、原生控件能用就不自造）→ AI tells 清理 → 人签字 → Distill-back 写 T2 → 冻结。

**打磨环每轮**：

- **评委**：Fable 5.1 subagent，新开上下文，收到的只有当前截图、方向说明的意图一句、critic rubric。不给代码、不给历史评语、不给 T1 底线（那是 lint 与 drift check 的活）。输出 finding 列表（每条含维度 Philosophy / Hierarchy / Execution / Specificity / Restraint、严重度 P0–P3、kind direction / pattern / craft、位置、缺陷、顶级工作室会怎么做）**和一个按 rubric 分数带给出的分数**。代码不替评委打分，只做**自洽校验**：分数落在最差 finding 允许的分数带之外（比如报了 P1 却给 9）即判本轮无效、重跑评委。停止阈值 9 写在 rubric 里，评委看得到；它靠自洽校验守，不靠隐藏。评委只评一件事：对照它想要的美学，执行到了什么程度。可用性启发式、对比度与 a11y、DESIGN.md 合规各归原有 gate。
- **执行者**：Opus 5，思考强度默认 high，本轮最差为 P1 或进入 plateau 时 xhigh。读 finding → 聚成"本轮核心问题"一句话 → 按 kind 路由：direction 停环交人；pattern 查 refero（4.6）；craft 直接改 → 改稿 → ledger 落一行（核心问题、查了哪层、选了哪个参考、改了什么）。
- **分数**由评委按 4.5 给出并经自洽校验。**收敛规则**：校验通过的分 ≥ 9 停；最差严重度连续两轮不降为 plateau，停下交人；出现 P0 立即交人。
- **动效阶段**评委看定格帧序列或 GIF；seek-frame 确定性 gate、restraint budget、reduced-motion 全部保留。

**refine 不改方向**：人签字时的反馈按性质分流，执行性 note 再跑一轮评委，方向性 note 回 imagine 在对应高度重开。

**准出物**：HTML 画布（角色相当于 Figma 画布）、matrix 每格截图、ledger、生成素材一起进 `docs/raw/<topic>/assets/`，配一份 `source_type: design-freeze` 的 raw md；spec §4 的"设计方向"小节被"冻结摘要"小节取代（HTML 画布的 wikilink、matrix、阈值、ledger 一行摘要、状态矩阵与数据契约变更），状态翻 `在飞`。

**UI 实现标准**（plugin 级 reference 加脚本，implement 读）。reference 三节：怎么把 HTML 画布读成项目 primitives 的组件树（按状态归属找组件、识别数据契约变更、token 映射到 DESIGN.md 的名字而不是把 preview 的 CSS 原样搬进项目）；各栈短附录（react / next / vue / nuxt / svelte，从 package.json 探测，项目自己的约定从它的 CLAUDE.md 读），讲 token、状态、断点在这个栈里怎么表达，不是属性对照表；校验环怎么跑。**校验做成 UI 实现环**，形状是 TDD 的红绿环，不是 refine 那种双 agent 环：裁判是脚本，没有审查 agent。

- **执行者**（Opus 5）：按 reference 把画布整理成项目框架代码，实现完跑测量脚本，按 finding 修改，再跑，直到全绿或 plateau。
- **测量脚本**（确定性，随迁的 headless playwright）自己在**同一个浏览器**里开两个 tab（画布、本地路由），按 matrix 逐格导航到同一 viewport / 主题 / 状态（状态靠 URL，见下），比对后按严重度输出 finding。驱动状态、排序、容差判定都是脚本逻辑，不需要一个 agent 来做。两层比对：**测量层**为主，按锚点在两个 DOM 里找到同一元素，比 bounding box、font-size、line-height、color、间距、radius，输出"哪个元素哪个属性差多少"；**像素层**为辅，同格截图算 mismatch 百分比，兜住测量层没覆盖的东西。输出是带严重度的 finding 列表，与 design-lint、评委 rubric 同一种形状。不读源码算间距，只量渲染后的 DOM。
- **触发**：implement 在 TDD 环里主动跑，是视觉正确性这一行的红绿测试，不挂在每次 Write/Edit 的 hook 上（要 dev server、秒级、半成品状态假红）。收工时一道 Stop 或 pre-commit hook 只查"最后一轮是绿的"。
- **终止**：全部 finding 在容差内为绿；同一批 finding 两轮不变为 plateau，执行者停下交人，并说明它判断残留差异是实现问题还是设计决策（组件库出不了那个样子）；后者回 refine 弯一下并记 ledger，不在 implement 里硬磨。

**三条环境约定**（refine 写画布时就要遵守，否则比对没有价值）：

1. **锚点**：画布里的块和关键元素带稳定的 data 属性锚点，port 到项目框架时必须保留（与 test id 同理），两个 DOM 靠它对齐。
2. **渲染环境一致**：画布的字体走目标项目自己的加载方式（自托管文件或项目已有链路），不用 Google Fonts CDN；两个 tab 同 viewport、同 DPR、同色彩模式；截图前等 `document.fonts.ready`，动画关闭。
3. **状态格靠 URL，且只在 dev 存在**：画布每个状态是一帧，用 `?state=` 切。本地侧目标项目提供一个 **dev 专用的状态 harness**：一条只在开发构建里注册的路由（或同等机制），按 `?state=` 用 fixture 数据把 surface 渲染到指定状态；生产构建里这条路由不存在，用一个测试断言它在 prod 模式下 404（各栈实现写在 reference 附录：Next.js 的 dev-only route、Vite 的 `import.meta.env.DEV` 守卫、Nuxt 的 `process.dev` 等）。冻结摘要的 matrix 每格记状态名，脚本按名拼 URL；harness 覆盖不了的格标"人看"，不假装绿。

**默认容差**（写在 reference，ticket 可按格覆盖）：位置 ±1px；颜色、字号、行高、圆角等 token 值精确匹配；像素层每格 mismatch ≤ 1%（抗锯齿容差另算）。

### 4.5 critic rubric（新 reference，评委每轮读的就是它）

严重度阶梯，每档锚定"顶级工作室 AD 的动作"：

| 严重度 | 定义 | AD 的动作 | 对应维度 |
|---|---|---|---|
| P0 | 画面读出来的美学和它想要的美学不是同一个；或命中 slop catalog 任一条 | 重开方向，不改稿 | Philosophy；Specificity 里的 filler 内容 |
| P1 | 眯眼测试失败，视线落不到一个地方，主次竞争；或多个 flourish 互相打架 | 这一块打回重排 | Hierarchy；Restraint |
| P2 | 字号、字距、间距、对齐、对比"接近但不对"，存在一个能用尺子量出来的修法 | 红笔标注，再过一轮 | Execution |
| P3 | AD 会注意到但不会因此拦发布的打磨点 | 顺手改，不拦 | 任一维度的余量 |

分数带，由本轮最差 finding 定上限，同带内按数量微调：

| 分 | 最差 finding | 含义 |
|---|---|---|
| 10 | 无 | 评委找不出自己会动手改的地方 |
| 9 | 仅 P3，不超过 2 条 | 工作室会原样发布 |
| 8 | 有 P2，无 P1 | 会批准，但要再过一轮红笔 |
| 7 | 一条 P1 | 某块要重排 |
| 6 | 两条以上 P1，或 P1 叠多条 P2 | 多处重排 |
| 4–5 | 有 P0 | 方向漂移或 slop，重开 |
| ≤ 3 | 多条 P0 | 不是执行问题，是 brief 问题 |

kind 与 P 的关系：P0 一律 direction；P1 可为 pattern 或 craft；P2 / P3 一律 craft。依赖的现有材料：design-core §6 五维 critique、heuristics-checklist 的 P0–P3 定义、ui-craft-checklist 的 slop catalog 与 reference-averaging 条目。

### 4.6 refero 的用法（两段共用）

refero 是被**具名问题**召唤的研究工具，不是开工前读的约束。唯一硬规则：**永远不在第一批变种存在之前被读**。问题来源可以是人看着变种的疑问，也可以是评委 kind 为 pattern 的 finding。路由：布局问题查 screens 按 page type；UX pattern 查 flows 或 screens 按组件；style 查 styles（不覆盖 in-app 的 dashboard / auth / settings）。结果沿用 Can answer / Cannot answer / Keep-Change-Do not copy 三行记录，守 reference-averaging 禁令：参考是某个具体主张的证据，不是投票。

### 4.7 不变的 gate

design-lint hook（随迁，仍只对 preview 目录写入触发）、Nielsen 启发式 gate、DOM 测量的对比度与 a11y、DESIGN.md drift check、Distill-back 只追加 T2 不改 T1/T3。

## 5 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑 / 数据转换 | TDD 单元 | **涉及**：分数自洽校验函数（finding 列表 + 评委分数 → 有效 / 无效，及停止判定）；finding schema 闭集校验（严重度四值、kind 三值、维度五值、kind 与 P 的合法组合）；测量层比对函数（两组按锚点对齐的测量值 + 容差 → finding 列表）；像素层比对函数（两张同尺寸截图 → 百分比） |
| API 契约 | TDD API 测试 | 不涉及 |
| DB schema / 迁移 / 事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量 | eval | **涉及**：评委 prompt、方向说明的生成 prompt、imagine 的种子指令都是新 prompt。产出的**结构**（finding schema、方向说明七节齐全）走 TDD；**质量**走 `skill-creator` 的 eval：uiux-* 实现完成后选一个真实 case 做 baseline，之后每次迭代 skill 都对着 baseline 跑，让改动有依据。这是对本仓库 CLAUDE.md「主观输出跳过 quantitative eval」约定的**有意例外**，理由是这几个 skill 会持续迭代 rubric 和 prompt，没有 baseline 就没法判断一次改动是好是坏 |
| 视觉正确性 | UI 实现环（测量脚本） | 不涉及本次：本次是在建这个仪器，不是用它验某个产品页面；baseline eval 里第一次跑 |
| 端到端用户流程 | `qa:*` | 不涉及："用户"是开发者自己用 idea-loop，整条环的验收并入上面的 skill-creator eval baseline。dev 状态 harness 在 prod 下 404 的断言属于目标项目自己的测试，不属于本 plugin |

**seam**（三个）：

1. **分数自洽校验纯函数**（已确认）：输入评委的 finding 数组、评委给的分数、上一轮最差严重度，输出本轮有效 / 无效，以及停止判定（继续 / 达标 / plateau / direction）。评委按 rubric 打分，代码只守"分数不能脱离 finding"。
2. **测量脚本的两个比对纯函数**（已确认）：测量层输入两组按锚点对齐的测量值和容差表，输出 finding 列表；像素层输入两张同尺寸截图，输出百分比。playwright 的渲染、驱动状态、截图在边界外，不进单测。
3. **skill-creator eval baseline**（已确认，替代人工干跑）：uiux-imagine / uiux-refine / prototype 实现完成后，选一个真实 case（含最小 DESIGN.md、PRODUCT.md）作为 baseline 跑一次 `skill-creator` 的 eval 并存档；此后每次改 rubric、prompt 或 SKILL.md 都对着它重跑。整条环的接通检查（prototype 落 raw、spec 状态翻转、raw 里有画布和 ledger、to-ticket 未冻结落 ⛔、无跨 plugin 调用）作为这个 baseline 的断言项，不再另做一次性干跑。

**增量功能测试**（黑盒，可证伪）：

- 评委报 2 条 P3 给 9 → 有效，停：达标；报 2 条 P3 给 10 → 无效；报一条 P1 给 9 → 无效；报一条 P0 给 5 → 有效且停：direction。
- 连续三轮最差都是 P1 → 第三轮判 plateau。
- 灌一条 kind 为 direction 的 P2 → schema 校验失败。
- 方向说明缺任一节 → imagine 收工校验失败，不写 spec。
- 测量层：两组测量值某锚点 top 差 1px → 无 finding；差 2px → 一条位置 finding；color 差一个色阶 → 一条 token finding（精确匹配）；画布有锚点而本地没有 → 一条缺失 finding，严重度最高。
- 像素层：两张完全相同的截图 → 0；一白一黑 → 100。
- 给 `grill` 一个纯后端问题的访谈 → 全程不触发 prototype。
- 给 `to-ticket` 一份仍是 `等设计冻结` 的 spec 里的 UI ticket → 字段落 ⛔。

**prompt / eval 变动**：新增评委 prompt（含 rubric）、执行者每轮的"聚核心问题 + kind 路由"指令、imagine 的种子与想法清单指令、方向说明生成指令。无 promptfoo 套件；结构靠 TDD，质量靠一到两轮真实收敛观察。

**既有同类测试先例**：design-lint 的单测（纯函数灌 HTML 字符串验规则命中）；eval 先例是 `skill-creator` 自带的 eval 流程，本仓库此前没有跑过。

**mock 边界**：三个纯函数都不需要 mock；playwright 部分不进单测，靠 baseline eval 覆盖。随机种子在 shell 里生成，属于可 mock 的"随机数"边界，本次没有围绕它的自动化测试。

## 6 Out of scope

- 不给退役的 `design` plugin 留别名、兼容层或过渡期双份安装。
- 不自动化任何人工闸门（prototype 的选择、imagine 的方向确认、refine 的签字）。
- 不留存 imagine 的渲染物：变种、style tile、contact sheet 只服务于人的反应。随模型能力增强，prompt 足以承载方向这一假设若被证伪，再议是否回传截图。
- 不做 refero 缓存或自建索引。
- 不改 `dreaming`、wiki-conventions。prototype 与 design-freeze 落 raw 桶、方向说明与冻结摘要落 spec §4，都不需要改契约。
- 不引入 Sonnet 5 作为执行者层级；不把 Codex 接成第二执行者，留到下一版单独 grill。
- 不重写 video-bg-section 的视频生产管线；只在 refine 里定义它的接入闸门。
- 不为评语和方向说明的质量建 promptfoo 套件；质量走 skill-creator 的 baseline eval。
- 不清理上一份 spec 遗留的 ticket 文件（对应的工作已合并但文件仍在）；那是 `dreaming` 的活。

## 7 关联

- raw：[[2026-09-11-design-loop-prototype-critic]]（本轮访谈，跨 09-08 至 09-13）、[[2026-09-11-aihero-prototype-skill]]、[[2026-09-11-lenny-ai-world-class-designer]]
- 被取代的 spec：[[design-plugin-idea-loop-integration]]（四条决策，见本文顶部）；其 raw [[2026-08-28-grill-design-idea-loop]]
- 起点讨论稿：`docs/design-workflow-architecture.md`（本仓库既有文件，早于两轮 grill）
- 现有材料，本次 rubric 与 reference 直接依赖：design plugin 的 design-core §6、heuristics-checklist、ui-craft-checklist、react-port、browser-usage、motion-spec、design-brief 的八节格式
