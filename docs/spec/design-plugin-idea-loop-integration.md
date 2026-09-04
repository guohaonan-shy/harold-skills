---
type: spec
status: 在飞
tags: [design-workflow, idea-loop, design-plugin, plugin-migration]
summary: 把 design-lib 消费侧 design 工作流迁入 harold-skills 独立 plugin，接入 idea-loop 生命周期
related: ["[[grill-design-idea-loop]]"]
---

# 把 Design 工作流迁入 harold-skills 并接入 idea-loop 生命周期

## 1 问题

Harold 现在维护 build 和 design 两条日常工作流，但 design 这条散落在多处：`design-lib` 仓库的 `plugins/design`（0.2.0，最新）、`TOFEL-demo` 项目里已经落后的 `design-workflow`（0.0.9）拷贝、`refero-design` skill、以及 `open-design` 这个不相关但有参考价值的产品仓库。日常真正在用的 `idea-loop` 工作流（`grill → to-spec → to-ticket → implement → pr-*`）里，design 只是一个悬空的占位——`to-ticket` 落盘的每张 ticket 头部都有"设计冻结"这一行字段，等着一个从来没接上的产物。结果是：涉及 UI 的 ticket 卡在"设计已冻结"这道闸门前，却没有实际路径把设计做完、把产物填进这个字段。

## 2 方案

把 `design-lib/plugins/design`（已确认版本 0.2.0，是 `TOFEL-demo` 0.0.9 拷贝的严格超集，唯一无损的迁移源）整体迁移成 harold-skills 顶层一个独立 plugin（暂定名 `design`，与 `idea-loop` 平级，不做目录合并）。两个 plugin 之间通过 Claude Code 原生的 Skill 工具、跨 plugin 时带 `plugin:skill` 前缀寻址（例如 `design:design`）互相调用——这跟 `design` 总入口内部调用它自己的兄弟 skill 是同一套机制，不需要新协议。

### design 不是独立的 frontier，是产品功能 frontier 里挂着的子树

`grill` 的决策树不再区分"产品 frontier"和"设计 frontier"两条平行的轨道——设计形状的决策是**挂在某个产品功能决策节点下面的子树**：只有当确认某个产品决策需要设计层面的取证才能给出靠谱的推荐答案时，这棵子树才长出来，不强制每次都单独走一轮。子树本身该问什么，判据不是"这个页面该长什么样"，而是**能让 Refero 研究问得准的检索参数**——ux pattern、page type、色彩方向、涉及哪些 UI 元素这类东西；`who`/`what` 这类 PRODUCT.md 里已经写明的东西不重问，clarify 只问文档答不了、又会改变产出的部分。真正的视觉/结构判断，留给候选生成之后的人工选择环节，不在聊天里由 AI 给"推荐答案"——那正是 `design`/`refero-design` 明确要避免的"凭 vibe 记忆设计"。

设计形状的子树需要取证时，走的是 `grill` 自己"事实是我的活，决策是人的活"这条既有原则的延伸：跟核实一个文件是否存在、一段代码是否已实现是同一类动作——只是这次核实对象换成了设计事实（Refero 的 styles/screens/flows 研究），核实结果用来支撑 frontier 问题的 ➡️ 推荐答案，不是让人在聊天里替 AI 做设计判断。核心原则不允许 vibe：任何设计相关的推荐都必须有真实的研究支撑，不能是假设。

`design` 被 `grill` 嵌套调用时，它自己 §2 那轮 `AskUserQuestion` 式的 clarify 视为已经被 `grill` 的 frontier 覆盖，直接跳过——避免访谈中途从连续编号问答切换成卡片式选择这种格式割裂。`design` 被人直接单独调用（不经过 `grill`）时，仍然走它原生的完整流程，不受这条规则影响。

### 自动执行段与人工决策点的边界

`design` 的研究/构建过程会产生大量截图、lint 输出、迭代记录，不能直接跑在 `grill` 主会话的上下文里，否则会迅速填满上下文窗口。但 `design` 自己的候选人工选择关口、`design-ui` §H 的人工签字都要求真人 live 交互，而 subagent/Workflow 都没有"跟真人对话、等真人回答"这条通道——不能把整段流程一次性甩给后台任务。

实际的执行形态是自动段和人工决策点交替，由 `grill` 主会话串起来：**frontier 完全清空之前**，`grill` 该问的直接问，需要设计取证时派一个纯粹做研究、不需要人介入的 subagent 去查 Refero，查完的结果回到主会话，继续支撑 frontier 问题的推荐答案；**frontier 完全清空之后**（产品决策和设计的结构选择都已经拍板），才一次性 handoff 给 subagent/Workflow，让它跑纯自动的构建段——因为这时已经没有需要问的东西了，构建段本身不需要中途交互。

构建段内部调用 `design` 总入口一个入口点：`design` 自己按 §5 的既有职责决定是否需要接 `design-motion`（"Motion is not automatic"），调用方（`grill` 派发的这次 handoff）不需要知道内部走了几步、UI→motion 的先后顺序细节。构建段跑完，产出（预览路径 + decision ledger + 验证证据）回到 `grill` 主会话，人来判定这份设计产物满不满意——**满意，才算这条 frontier 子树清空，可以进 `to-spec`；不满意，回到新一轮 `grill`，不是回 `design` 内部原地调视觉**。这个信号被当成"可能是某个产品判断需要重新审"来处理，不是默认当成"视觉细节没调好"。

`design-brief`（写 DESIGN.md）跟 `design-ui` 的构建绑在同一个阶段前置：`grill` 的 design 子树如果检测到目标项目缺 `DESIGN.md`/`PRODUCT.md`，就把 `design-brief` Establish 模式的判据（T1 identity floors 那几条）当成新解锁的 frontier 节点问出来，不是拖到后面另起一轮交互。

`design` 走完自己的候选生成/人工选择/下游路由/Distill-back 后，产出的预览 HTML 路径 + fidelity/decision ledger 摘要回填进 `to-ticket` 的"设计冻结"字段；`implement` 阶段把 `design-port`（已有的截图对比机制）当"视觉正确性"这一类缝的仪器调用，跟调真 DB 测试、调 eval 是同一套体系里的不同实例。

`to-spec` 的职责不变：只沉淀 raw transcript + spec，不产出任何设计物——但因为 `grill` 不再对涉及 UI 的分叉提前收工，`to-spec` 落盘时通常已经有现成的高保真产物可以引用。`wiki-conventions` 里 spec 合法状态本来就含 `等设计冻结` 一档，继续作为逃生舱：真遇到设计需要单独另找时间做的场景，`grill` 可以显式把这个分叉标成"设计未完成，记录待办"，不阻塞其他决策项，spec 照常落盘成 `等设计冻结`，不强制卡死 `to-spec`。

### 设计知识与规范的组织

`DESIGN.md` 的格式换成 `google-labs-code/design.md` 规范的固定八节 + YAML frontmatter，现有 T1/T2/T3 三层法作为这份规范之上的治理层继续保留。`refero-design` 的三层研究（styles/screens/flows）继续作为 `design-ui` 的研究后端；`open-design` 只作为这次会话的一次性灵感来源（不建立机器可读的路径依赖），蒸馏出来的内容整理进 `design` plugin 自己的 references。`design-lint.mjs` 里三条项目专属的硬编码 P0 规则被移除，项目专属的品牌红线交给已经存在的"DESIGN.md governance"机制处理，不新增结构化解析引擎。

`design-landing`/`design-landing-plan` 不作为独立 skill 迁移——它们深度耦合 `$DESIGN_LIB_ROOT/landing-page/skill/index.md`，正是原讨论稿已经判死刑的自建知识库，继续保留这条依赖会把一个要冻结的东西焊进新 plugin 的核心路径。两者的方法论拆开处理：page taxonomy 分类、Hero 七槽模型是真正 landing 专属的结构词汇，拆成一份 landing 专属 reference，`design-ui` 走 landing/IA 这档 altitude 时才读；proof map、responsive re-edit 方法论、runtime/fallback 状态模型其实是任何 altitude 都用得上的通用 craft，直接并入 `design-ui` 现有的通用 craft reference。研究后端统一走 Refero，不需要 landing 专属的研究通道。

`design-ui`/`design-motion` 维持两个独立 skill，不合并——不是内容话题不同，是两套有先后依赖的验证协议：`design-motion` 的 gate（`window.__maTimeline.seek(t)` 确定性帧检查、reduced-motion 回退检查）测的是时间维度上的行为正确性，只能靠"真实浏览器里 seek 到不同时间点、断言帧确实不同"这类可执行验证拿到，不是读一份文档能替代的判断；而且明文要求 `design-ui` 人工签字之后才能进入 `design-motion`。合并会把这条先后依赖藏进一个 skill 内部的隐藏状态机，反而更不清楚。UI→motion 的编排顺序由 `design` 总入口内部持有，调用方不需要看见。

## 3 User Stories

1. 作为在 `idea-loop` 里跑 `grill` 的人，我想要决策树分叉到"这个页面该长什么样"这类设计问题时，`grill` 能直接把这条分叉转交给 `design` 工作流处理，而不是在聊天里凭 vibe 给一个"推荐答案"，以便设计决策仍然走它该走的验证标准（研究、候选、人工选择），不被 `grill` 的访谈格式稀释。

2. 作为切 ticket 的人，我想要 `to-ticket` 在识别到一张 ticket 涉及 UI 时，能检查设计冻结产物是否存在，并把预览 HTML 路径 + fidelity/decision ledger 摘要写进"设计冻结"字段，以便这张 ticket 在开工前有一个可核实的、不是空话的冻结依据。

3. 作为写代码实现一张 UI ticket 的人（`implement` 阶段），我想要视觉正确性这类缝直接调用 `design-port` 做截图对比，跟调真 DB 测试、调 eval 是同一套体系里的不同实例，不需要额外学一套新流程。

4. 作为维护 `design` plugin 本身的人，我想要 `design-brief` 产出的 `DESIGN.md` 严格遵循 `google-labs-code/design.md` 的固定八节顺序 + YAML frontmatter schema，并且允许追加自定义章节（如 Case Law）而不报错，以便这份文档既符合外部规范、又能承载我们自己的 T1/T2/T3 治理需要。

5. 作为在项目迭代过程中不断补充 case law 的人，我想要 T2 只能追加、不能重写 T1/T3，以便设计身份的底线不会在功能迭代中被悄悄磨掉。

6. 作为 `design-ui` 的使用者，我想要它继续按最高受影响 altitude（Surface/Module/Component）路由，并且在结构已经谈拢时（比如 `grill` 已经问清楚了）跳过多候选生成，直接进 wireframe+视觉+motion+prototype 合一产出，以便不为已经拍板的结构重新走一遍候选生成的开销。

7. 作为在真正结构开放的场景（比如一个全新的 greenfield 页面）里工作的人，我想要 `wireframe-candidates` 这条多候选生成机制仍然可用，以便结构没谈拢时依然能拿到"结构性差异审计"的候选对比，而不是被逼着自己瞎猜一个结构。

8. 作为审查设计预览产物的人，我想要 `design-lint` 这个 PostToolUse hook 只检查跨项目通用的 AI-tell（gradient-text、emoji-icon、filler-verbs 之类），不再包含任何单一项目专属的品牌红线硬编码，以便这个 lint 脚本对任何接入 `idea-loop` 的目标项目都成立，不会把别的项目的品牌决策错误地当成通用默认值。

9. 作为一个新项目第一次接入这套 design 工作流的人，我想要项目自己的品牌红线（品牌色号、字体禁令等）完全由我自己的 `DESIGN.md` 承载，`design-ui` 在 build 前读入这份 `DESIGN.md` 后，凭 agent 的判断在整个构建过程和人工签字环节守住这些红线，而不需要我去写一份符合某种正则可解析格式的规则文件。

10. 作为要给一个页面做动效的人，我想要 `design-motion` 继续作为独立的 Stage 2（只有在 `design-ui` 人工签字之后才进入），并且它的四道 gate（mechanical lint / impeccable audit / deterministic seek-frame / motion DoD checklist）保持不变，以便动效的验证标准不会因为这次迁移被削弱。

11. 作为要核对一次 React 端口是否忠实还原设计预览的人，我想要 `design-port` 继续复用 `design-ui` 已有的 replication-diff-loop 机制，跑在相反方向（预览 HTML 是真值，线上路由是候选），以便端口验证跟设计验证是同一套仪器思维的两个方向。

12. 作为要浏览这次迁移出来的 `design` plugin references 的人，我想要 refero 相关内容、open-design 蒸馏出来的 craft 知识、以及现有已泛化的 references（如 `design-core.md`），被整理成职责单一的独立 reference 文件（仿 `refero-design` 自己 references 目录的粒度），每个 skill 用 prose 显式点名要读哪几个。

13. 作为要决定"这次改动碰不碰得到 `design-port`"的人（`to-spec` §5 测试决策表已经有这一行），我想要"视觉正确性"这一类缝从这次迁移开始有真正落地的仪器可用，而不是表格里挂着一行没人接的空话。

14. 作为管理 harold-skills 这个 marketplace 仓库结构的人，我想要新 plugin 遵循仓库既有的标准目录结构约定，并且明确写清楚 `design` plugin 跟 `idea-loop` 是两个可以独立分发、通过标准 Skill 工具跨 plugin 调用互相引用的 plugin，不产生跟仓库约定冲突的组织方式。

15. 作为 `design-lib` 仓库（旧的生产侧）的维护者，我想要 `landing-page/` 研究档案在这次迁移后被明确标注为"冻结但不删"，README 更新说明仓库新身份（motion 生产车间 + 历史研究档案），以便这个仓库的定位不再被误解成还在扩张的"设计知识库"。

16. 作为在 `grill` 里被访谈的人，我想要设计形状的分叉只在某个产品决策确实需要设计取证才能问出好推荐答案时才长出来，不是每次都被强制单独拉一轮"设计 frontier"，以便日常不涉及 UI 的功能讨论不会平白多出一段设计访谈。

17. 作为看着 `grill` 给出推荐答案的人，我想要涉及设计的推荐都有真实的 Refero 研究支撑，而不是模型凭 vibe 编一个听起来合理的答案，以便我不用每次都反过来核实推荐本身站不站得住脚。

18. 作为审阅设计产物的人，我想要"我是否满意"就是唯一决定"进入 to-spec 还是回到新一轮 grill"的关口，不满意时明确回到 grill 重新审视决策（而不是在 design-ui 内部原地调视觉细节），以便设计不达标这个信号能被当成产品判断可能需要重审来处理。

19. 作为直接单独调用 `design`（不经过 idea-loop）的人，我想要它保留自己原生的 `AskUserQuestion` clarify 流程，不受"被 grill 嵌套调用时跳过 clarify"这条规则影响，以便 `design` 仍然是一个可以独立使用的完整工具。

20. 作为在一个还没有 `DESIGN.md`/`PRODUCT.md` 的项目里工作、又要做 UI 相关功能的人，我想要 `grill` 的设计子树把"建立这两份文档的核心决策"当成新解锁的 frontier 节点问出来，而不是悄悄推迟到后面单独另起一次 `design-brief` 交互。

21. 作为要做落地页/营销页的人，我想要 `design-ui` 的 altitude 路由里有专门的 landing/IA 档，能读到 page taxonomy 分类和 Hero 七槽模型这类专属参考，而不需要一个独立的 `design-landing` skill，也不需要连到已经冻结的 design-lib 知识库。

22. 作为要核实这次迁移落地质量的人，我想要 `design-lint` 的 `PostToolUse` 路径匹配规则、以及它链式调用 `impeccable` 探测器所用的路径解析方式，在新 plugin 的安装位置下被重新核实一遍——后者目前是硬编码的 marketplace 缓存路径，不是相对当前 plugin 安装位置解析的，虽然已有优雅降级，但值得在迁移时确认一次。

## 4 实现决策

**Plugin 组织**：harold-skills 顶层新增一个独立 plugin（暂定名 `design`），遵循仓库既有标准目录结构（`.claude-plugin/plugin.json` + `README.md` + plugin 级 `references/` + `skills/<name>/{SKILL.md,references/}` + 可选 `workflows/`）。源内容来自 `design-lib` 仓库 `plugins/design`。沿用 `design-lib` 自己 `MIGRATION.md` 记录过的上一次迁移模式：硬编码的项目专属路径/名称替换成"目标项目根目录"式的运行时查找，缺失时优雅降级；产品特定知识作为带标注的案例保留，不删除。

**跨 plugin 调用协议**：不新造协议。`design` 与 `idea-loop` 之间的调用走 Claude Code 原生的 Skill 工具，跨 plugin 时用 `plugin:skill` 形式寻址；这跟同一 plugin 内部 skill 互相调用是同一套机制，机制层面不区分"同 plugin"还是"跨 plugin"。真正决定一个 skill 能不能被模型自己调用的开关是它自己的 `disable-model-invocation` frontmatter，与它住在哪个 plugin 目录无关。

**grill → design 的移交**：`grill` 的 SKILL.md 里补一条规则——决策树分叉到设计形状的问题（结构/视觉判断）时，直接调用 `design` 总入口（跨 plugin Skill 调用），`design` 走完自己的候选生成/人工选择/下游路由/Distill-back 后，把产出（预览 HTML 路径 + 冻结状态摘要）作为这条分叉的答案带回 `grill` 的决策树，`grill` 继续往下问其余的 frontier。

**to-ticket 的设计冻结字段**：`<产物>` 具体格式定为"预览 HTML 的路径 + 一行 fidelity/decision ledger 摘要"，形如 `已冻结（design-preview/pricing.html · fidelity 92% vs Stripe reference · 3 条 decision ledger 已锁定）`；数字与措辞由 `design` 产出时自行填。

**implement 的 design-port 调用点**：视觉正确性缝直接调用 `design-port`（复用 `design-ui` 已有的 replication-diff-loop 机制，跑反方向：预览 HTML 是真值，线上路由是候选），跟"调真 DB 测试"、"调 eval"是同一张仪器矩阵里的不同实例。

**DESIGN.md 格式**：改用 `google-labs-code/design.md` 规范。frontmatter 必填 `name`，可选 `version`/`description`/`omitted`/`colors`/`typography`/`rounded`/`spacing`/`components`；固定章节顺序 Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts（全部 `##`）；未知/自定义标题保留不报错（spec 明文）。T1/T2/T3 三层法映射到这份规范之上：T1 落在 Overview 及 Colors/Typography/Layout/Elevation/Shapes/Components 各节本身的 token+prose，T3 落在原生的 "Do's and Don'ts" 节，T2 落在追加的自定义 `## Case Law` 节（按日期追加，只增不改，绝不重写人工写定的 T1/T3）。

**wireframe-candidates 逃生舱**：机制本体保留（`design` 总入口 §0 的"结构已谈拢则跳过候选生成"判断 + 独立的候选生成 workflow 脚本，走并行 agent fan-out + 结构性差异审计 + human-selection 硬性关口），只重新措辞成"idea-loop 语境下这是默认会走的路径（因为 grill/to-spec 通常已经谈定结构），候选生成保留给结构真正开放的场景"。

**design-lint 的规则集边界**：`design-lint.mjs`（PostToolUse hook，Write|Edit 触发）删除三条项目专属的 P0 硬编码规则（`retired-ink`/`warm-action-tint`/`instrument-serif`——这三条是 Toeflair 一个项目自己 DESIGN.md 的决定，不该焊进通用脚本），只保留跨项目通用的 AI-tell 检查（P0 的 `hard-offset-shadow`/`ai-purple-indigo`/`gradient-text`/`em-dash-copy`，以及全部 P1/P2 规则）。项目专属的品牌红线改由已经存在的"DESIGN.md governance"机制承接：`design-ui` 在 build 前读入目标项目的 `DESIGN.md`，"T1/T3 never relax silently"作为 agent 判断的一部分贯穿整个构建过程，人工签字环节逐条对账偏离项——不新增任何结构化解析引擎，`DESIGN.md` 的 T3 bans 保持自由文本形态。

**design-lint hook 的路径核实**：`PostToolUse` 的匹配正则（限定在 `design-preview/`/`design-motion-preview/` 下的 HTML 文件）已核实是正确的，不用改。但它链式调用 `impeccable` 探测器时用的是硬编码的 marketplace 缓存路径查找，不是相对当前 plugin 安装位置解析——已有优雅降级（找不到就跳过，不是硬错误），但迁移到新 plugin 后要核实一遍这条链路在目标环境下还能不能找到 `impeccable`。

**研究后端**：`refero-design` 的三层研究（styles/screens/flows，含它已有的 Discovery clarify、reference-lock、anti-averaging、decision ledger、quality gate）接成 `design-ui` 的 Concept & Expression 阶段研究后端。`open-design` 不建立任何机器可读的路径依赖，只作为这次会话的一次性灵感来源：把 `craft/`（accessibility-baseline / laws-of-ux / anti-ai-slop 一类品牌无关规则）里蒸馏出来的内容，跟 refero 相关内容、`design-lib` 现有已经泛化的 references 一起，重新整理成职责单一的独立 reference 文件，各 skill 用 prose 显式点名要读哪几个。`open-design` 自己那套"生成 UI 对着设计系统做程序化 adherence 校验"的机制明确排除在这次迁移范围外——它在上游本身还没定型，已经 revert 过两次，现在在一条未合并回 main 的分支上第三次重启。

**design-lib 仓库收尾**：`landing-page/` 标注冻结（不删），更新 `design-lib` 仓库根 README 说明新身份（motion 生产车间 + 历史研究档案）。TOFEL-demo 现存的 `design-workflow`（0.0.9）装机不动，出这次重构范围。

## 5 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑 / 数据转换 | TDD 单元 | `design-lint.mjs` 删规则后的行为守恒——见下 |
| API 契约 | TDD API 测试 | 不涉及 |
| DB schema / 迁移 / 事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量 | eval | 不涉及——本次是给 agent 看的 SKILL.md 指令文本迁移，不是喂给下游 LLM 判分的 prompt |
| 视觉正确性 | 截图对比（`design-port`） | 不涉及——本次范围是"把 `design-port` 接成 `implement` 的仪器调用点"这件事本身，不是用它验一个具体产品页面；下一次真正做 UI ticket 时才会触发 |
| 端到端用户流程 | `qa:*` | 不涉及——这次的"用户"是开发者自己用 `idea-loop`，验收方式是一次真实的干跑，不是面向产品终端用户的浏览器测试 |

**seam**：这次改动的核心是多个 SKILL.md 之间的文本契约（`grill` 如何描述移交、`to-ticket` 如何描述 `<产物>` 字段格式），以及一段可独立测试的纯函数逻辑。选两个 seam：

1. `design-lint.mjs` 导出的 `lintHtml()` 函数——直接灌 HTML 字符串验证规则命中/不命中，不碰文件系统或 hook 触发链路。
2. 一次端到端干跑：搭一个最小 target project 骨架（放一份最小 `DESIGN.md`），触发 `grill → design` 移交，检查 `design` 落的产物路径，检查 `to-ticket` 消费该产物时字段格式对不对——这是"跨 skill 协作是否真的按约定运转"的功能验收，人工过一遍，不是自动化测试。

**增量功能测试**（黑盒验收，可证伪）：

- 给一条最小 `DESIGN.md`（只有 `name` + 两三节）跑 `design-brief`，验收：产出严格符合固定八节顺序，出现自定义 `## Case Law` 节不报错。
- 给 `lintHtml()` 灌一段包含 `#0a0a0a` 等 Toeflair 专属红线的 HTML，验收：不再命中被删的三条规则 id。
- 给 `lintHtml()` 灌一段包含通用 AI tell（gradient-text、emoji）的 HTML，验收：仍然命中对应 P0/P1 规则。

**prompt / eval 变动**：无。本次没有改任何 LLM prompt 的输出结构，只是重排/迁移给 agent 看的 SKILL.md 指令文本。

**既有同类测试先例**：`design-lint.mjs` 目前没有找到配套的单元测试套件——这次如果要给 `lintHtml()` 补测试，是这个脚本第一次有测试覆盖，没有"照着谁写"的先例，切 ticket 阶段需要决定要不要顺手补上。

**mock 边界**：`lintHtml()` 是纯函数（输入 HTML 字符串，输出 findings 数组），不碰文件系统/网络，新写的测试不需要 mock 任何东西。

## 6 Out of scope

- 不实现 `open-design` 那套"生成 UI 对着设计系统做程序化 adherence 校验"的机制——上游本身还没定型。
- 不给 `design-lint.mjs` 的 T3 bans 做结构化解析/动态生成规则的引擎——项目专属红线继续走已存在的 `DESIGN.md governance`（agent 判断 + 人工签字对账），不是正则。
- 不改动 TOFEL-demo 项目里现存的 `design-workflow`（0.0.9）装机——出这次重构范围。
- 不把 `design` 的 skill 文件直接搬进 `idea-loop/skills/` 目录——保持独立 plugin，通过跨 plugin Skill 调用集成。
- 不建立对 `open-design` 仓库本地 checkout 的机器可读路径依赖——不可移植，只作为这次会话的一次性灵感来源，蒸馏完即止。
- 不新增 design 产物到 React 的额外翻译层——`implement` 直接读冻结的 HTML+DESIGN.md 写进项目真实技术栈，`design-port` 只做视觉正确性验证，不是翻译步骤。
- 不尝试把"设计产物是否满意"这道人工判定关口自动化掉——subagent/Workflow 没有跟真人对话等回答的通道，这道关口设计上就该留在 grill 主会话里，不是待办事项。
- 不把设计取证研究做成强制流程——只有当某个产品决策确实需要设计层面的事实支撑才派 subagent 去查 Refero，不是每次涉及 UI 的分叉都强制跑一轮研究。
- 不在这版做 icon、motion 更进一步的生成能力、以及"高级"视频类 asset 生产——这些想法留到下一个版本单独 grill、充分讨论后再定，这版只迁移+整合已有机制。

## 7 关联

- raw：[[grill-design-idea-loop]]
- 起点讨论稿：`docs/design-workflow-architecture.md`（本仓库既有文件，早于本次会话，记录了上一轮多次讨论收敛的结论；本次 grill 是在它基础上补齐待定项，并订正了其中一处对 refero-design 路由机制的错误描述）
- 外部真相源（迁移执行时需要重新核实，不要只信这份 spec 的摘要）：
  - `design-lib` 仓库 `plugins/design/`（0.2.0）：`skills/{design,design-brief,design-ui,design-motion}/SKILL.md`、`references/browser-usage.md`、`MIGRATION.md`、`hooks/hooks.json`、`scripts/design-lint.mjs`
  - `refero-design` skill：`~/.claude/skills/refero-design/SKILL.md` + `references/mcp-tools.md`
  - `google-labs-code/design.md` 仓库：`docs/spec.md`、`PHILOSOPHY.md`
  - `open-design` 仓库（`nexu-io/open-design`，仅作参考，不建立依赖）：`craft/`、`design-systems/`
