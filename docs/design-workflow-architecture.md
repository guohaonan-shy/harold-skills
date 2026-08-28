# Design Workflow 架构讨论稿

> 状态：讨论已收敛，待实现。写于 2026-08-28，源自与 Harold 在 `design-lib` 仓库的一轮多次架构讨论。
> 目的：让一个**没有那次对话上下文**的新会话能直接接手实现，不需要重新论证一遍。下面每个结论都标了出处文件，新会话动手前应该自己去读那个文件核实，不要只信这份摘要。

## 结论速览

- **生产侧(自建研究知识库)判死刑，消费侧(design 编排 workflow)是唯二要建的东西**——见「生产侧判决」。
- **design 不是独立产品，是插进 `idea-loop` 生命周期的一步**——`to-ticket` 已经有名为「设计冻结」的字段在等一个产物。
- **重构目标是 `design-lib` 仓库的 `plugins/design`（0.2.0），不是 `TOFEL-demo` 里那份旧拷贝（0.0.7）**。
- **灰盒候选(wireframe-candidates)默认跳过，直接产出 wireframe+视觉+motion+prototype 合一的产物**——只有结构真正开放时才触发多候选。
- **DESIGN.md 采用 `google-labs-code/design.md` 规范**，现有的 T1/T2/T3 三层法整体可以映射过去，不用推倒重来。
- **产物是 HTML + Tailwind class，不是 React**——预览机制是本地 `http.server` + Playwright，已经在 `plugins/design/references/browser-usage.md` 里跑通，跟 claude.ai 的 Artifact 发布功能无关。
- **不新建 design-port 之外的翻译步骤**——`design-port`(截图对比)已经是 `idea-loop` 自己认的"视觉正确性"验证仪器，`implement` 直接用它，把冻结的 HTML 产物编进项目真实技术栈。

---

## 1. 生产侧判决

### 死的

自建"知识库"这条路——`design-lib/landing-page/` 里那套 `research.md → distill → prototypes → skill/index.md allow-list` 治理机制，包括 T1–T3/G1–G5/M0–M4/P0–P4 四条治理轴。理由：Refero(见下)已经是一个覆盖 web 营销站(styles)+ web/iOS 具体界面与流程(screens/flows) 的活研究后端，自建索引是重复造轮子，而且花了整轮讨论都没能把 allow-list 填满一条——空索引本身就是这条路走不通的证据。

### 活的，但换了个形态

生产侧作为"workflow 内部即时取证"还在：设计一个具体页面时现开 Playwright 截一张竞品页、现拉一次 Refero screen/flow，用完即扔，不进库不建索引。

### 完全不受影响、design-lib 仓库仍然独有的

Motion 生产——measure-first 的像素级复刻方法论、image→video、three.js/GSAP 编排、`design-motion` 的 reduced-motion/freezable-timeline/deterministic-seek 验证 gate。Refero 的 `motion.md` 只是 CSS 缓动曲线一类的 craft 建议，不是取证/测量管线，这块它替代不了，继续留在 `design-lib`。

### design-lib 仓库的新身份

`landing-page/` 建议**冻结不删**——里面是真实做过的研究(ElevenLabs、Linear、Figma、Vercel……)，保留可读、可查，只是不再投入新案例。`design-lib` 仓库收缩为：motion 生产车间 + 一份冻结的历史研究档案。它不再是"设计知识库"。

---

## 2. Design 在 idea-loop 里的位置

真相源：`~/.claude/plugins/marketplaces/harold-skills/idea-loop/`（v0.0.3，见该目录 `README.md` 顶部对 marketplace 归属的说明）。**本地 `~/projects/harold-skills` 这份 checkout 目前没有 `idea-loop/` 目录**——新会话动手时从 marketplace 那份下手，或者先确认这份 checkout 有没有更新。

idea-loop 的 forward loop：`grill → to-spec → to-ticket → implement → pr-open-review → pr-fix-verify`，外加周期性的 `dreaming`（维护扫描，不在 forward loop 里）。

### 关键证据：`to-ticket` 已经在等这个产物

`idea-loop/skills/to-ticket/SKILL.md` 第 62–82 行，每张 ticket 落盘时头部有这一行：

```
**设计冻结**：不涉及 UI ｜ 已冻结（<产物>）｜ ⛔ 未冻结 —— 不可开工
```

原文（第 78–82 行）：

> 设计冻结闸门挂在这里——动 UI 的 ticket 要求设计已冻结才能开工；spec 不要求（spec 可以停在 `status: 等设计冻结`）。设计冻结是**开工前置条件**，不是规格的完成度指标。挂在 spec 上就会积一批"想清楚了但画不出来"的文档长期驻留。

**这句话直接决定了 design 该在哪个阶段跑**（见下面 §3），不是我们这边推导出来的，是 idea-loop 自己的既有文字。

### 关键证据：`design-port` 已经是 idea-loop 认的验证仪器

`idea-loop/skills/to-spec/SKILL.md`（约第 74–79 行）和 `idea-loop/skills/implement/SKILL.md`（约第 41–44 行）都有一张"缝按性质选仪器"的表：

| 缝的性质 | 仪器 |
|---|---|
| DB schema / 迁移 / 事务语义 | 真 DB 测试 |
| LLM 输出质量 | eval |
| **视觉正确性** | **截图对比（`design-port`）** |
| 端到端流程 | `qa:*` |

结论：design 的产物不需要自己的翻译/验收流程，`design-port` 已经是这套体系里"视觉正确性"这一类缝的现成仪器，跟"用真 DB 测试 schema"是同一个思路的实例，不是要新造的东西。

### design 该在哪个阶段跑

三件事分给三个阶段，不要挤在一起：

- **`to-spec` 负责点名**——它自己的测试决策表里已经有"视觉正确性→design-port"这一行，这就是判断"这份 spec 有没有视觉正确性缝、需不需要走一次 design"的天然时刻。
- **design 产物生产是独立一步，解耦执行**——不卡在 to-spec 完工那一刻，可以晚点做、可以攒几个一起做、可以跟其他非 UI ticket 并行。这正是 to-ticket 那句"挂在 spec 上会积压"想避免的问题。
- **`to-ticket` 负责检查**——切 UI 相关 ticket 时看这个产物存不存在，存在就写"已冻结（<产物>）"，不存在就"⛔ 未冻结"，ticket 就地等着，不阻塞其他 ticket 开工。

### grill 的分叉 vs design 的分叉

`idea-loop/skills/grill/SKILL.md`：grill 是决策树式拷问，一轮轮问到 frontier 清空，格式是纯 chat markdown 问答，agent 给推荐答案，人拍板。这个格式**适合产品决策，不适合视觉/结构决策**——"这个页面该长什么样"如果在聊天里直接给一个"推荐答案"，就是 refero-design 明确禁止的"凭 vibe 记忆设计"。

分工：grill 的决策树一旦分叉到设计形状的问题，**整支移交给 design 步骤**，不在 grill 里就地回答。design 步骤自己的 clarify（下面 §4 的 Refero Discovery brief）+ 综合出的 decision ledger，就是这条分叉的验证标准，不需要再造一个新机制。

---

## 3. 消费侧现有机器：不是从零开始

`design-lib` 仓库 `plugins/design/` 已经有相当一部分这次讨论要的东西，重构是**在这上面改**，不是重写：

- `skills/design/SKILL.md`——总入口，一轮 `AskUserQuestion` clarify + `wireframe-candidates` workflow（灰盒、结构性差异审计、每个槽位标 `(real)`/`(empty)`/`(unknown)`）+ 人工选择关口 + 下游路由 + Distill-back。**已经有"结构已谈拢就跳过候选生成"这条逃生舱**（SKILL.md §0）——这正是本文档第 5 节"默认收起灰盒 gate"要用到的既有机制，不是新提案。
- `skills/design-brief/SKILL.md`——写 DESIGN.md，infer(从现有代码推断) / establish(从零建立) 两模式，T1(identity floors)/T2(case law)/T3(bans) 三层结构。
- `skills/design-ui/SKILL.md`——altitude 路由(Surface/Module/Component)，浏览器内真实 DOM 验证循环，lint/隔离批判/视觉矩阵/人工签字四道 gate。
- `skills/design-motion/SKILL.md`——motion 作为独立验证阶段(reduced-motion/freezable-timeline/deterministic-seek)，Refero 没有对应物。
- `references/browser-usage.md`——预览机制的真相源，见下面 §5。

**重构目标是这份（0.2.0），不是 `~/projects/TOFEL-demo/.claude/plugins/design-workflow/` 那份旧拷贝（0.0.7）**——本仓库 `README.md` 自己写着 TOFEL-demo 那份是待替换的旧版本，且经比对，它没有任何 harold-skills 里缺失的内容，反而缺了 `design-brief`/`design` 总入口/`wireframe-candidates`/`design-landing*`。

---

## 4. Refero 的角色

已核实（读的是 `~/.claude/skills/refero-design/SKILL.md` + `referodesign/refero_skill` 仓库最新版，两者 diff 过，`mcp-tools.md` 完全一致）：

- Refero 有三层研究：**styles**(视觉方向，目前只覆盖 web 营销/产品站，**不覆盖** app 内 dashboard/auth/设置页/iOS 界面的 style 系统)、**screens**(具体界面模式，`platform: web|ios`，覆盖 app 内界面)、**flows**(多步骤旅程，同样分 web/ios)。
- 更新后的 SKILL.md 已经有一个 Discovery clarify 阶段(what/platform/audience/goal/tone/objection/constraints) + workflow routing(direct build/visual exploration/audit/asset generation) + reference-lock + anti-averaging + decision ledger + quality gate 的完整方法论。**这一整套不需要我们重建**，直接复用。
- **没有"搜索 design.md"这个工具**——之前一度以为有，diff 后确认没有。但 `refero_get_style` 的返回字段(visual thesis、tokens、typography、layout/rhythm、component 处理、do/don't)结构上跟 `google-labs-code/design.md` 的八节几乎一一对应，**可以当 `design-brief` Establish 模式的草稿输入**：检索一个可比产品的 style，重排成 spec 的八节格式，人再改。

---

## 5. 产物格式与预览机制

### 格式：HTML + Tailwind class，不是 React

样式语言(Tailwind class)和产物的组件架构(React vs 静态 HTML)是两个独立的轴，这次结论是保留前者、拒绝后者。三条理由：

1. 预览要能过 `python3 -m http.server` 直接 serve，也可能要兼职当可发布的 Artifact——两者都要求自包含 HTML；CSP 会挡掉外部 CDN 加载的 React/Babel，JSX 没有构建步骤没法直接预览。
2. `design-ui`/`design-motion`/`design-port` 现有的整套机器(浏览器验证、lint hook、`design-preview/<surface>.html`、截图仪器)都是围着静态 HTML 建的。
3. 就算产物是 React，也贴不进真实的 Next.js 项目(项目有自己的组件原语/server component/data hook)，`implement` 照样要重新接线——JSX 语法不省这一步，只是白白搭上预览链路的代价。

如果这份 HTML 还要兼职当可发布的 Artifact，Tailwind 得用**内联编译好的样式表**，不能用 play CDN(同样是 CSP 原因)。建议用 data 属性标出组件边界(如 `data-component="PricingCard"`)，让 `implement` 后续把 HTML 切成 JSX 组件是机械操作，不是重新设计。

### 预览机制：本地 server + Playwright，不是 claude.ai Artifact

真相源：`plugins/design/references/browser-usage.md`。原话："the preview HTML **is** the artifact — no separate export step."

实际机制：
1. 静态 HTML 写在 scratch 目录 `design-preview/<surface>.html`，不进 app 代码树；
2. `python3 -m http.server <port>`(后台跑)serve 这个目录——纯本地，不碰任何外部网络；
3. Playwright MCP(headless)驱动自动化截图/对比/验证；
4. **人来看的方式是打开 `http://localhost:<port>/...`**——跟用哪个 MCP 驱动无关。

这条链路本来就是 Claude Code TUI/终端环境原生能跑的，不需要 claude.ai 的 Artifact 发布功能(那是完全独立的另一个能力，"把网页发布成一个有 URL、可分享的 claude.ai 页面"，跟这里的预览无关，只在需要长期保留/分享一份文档时才用)。如果实现环境本身访问不到本地端口，退路是用 claude-in-chrome/Playwright 截图直接发到对话里。

### `/implement` 与 design-port

不新建"设计产物 → React 翻译"的独立技能/阶段。`implement`(idea-loop 已有的、TDD 收尾的构建阶段)直接读冻结的 HTML + DESIGN.md，把它写进项目真实的技术栈；当这张 ticket 的缝是"视觉正确性"时，调 `design-port` 做截图对比，跟调真 DB 测试、调 eval 是同一件事的不同实例(见 §2 那张表)。

---

## 6. DESIGN.md 格式统一

现有 `design-brief` 输出的是 T1(identity floors)/T2(case law)/T3(bans) 三层法，跟 `google-labs-code/design.md` 规范(YAML frontmatter tokens + 固定八节：Overview/Colors/Typography/Layout/Elevation & Depth/Shapes/Components/Do's and Don'ts，允许扩展自定义 section)不是同一套格式，但可以映射，不需要推倒重来：

| 现有三层法 | 映射到 spec 的位置 | 依据 |
|---|---|---|
| T1 identity floors | Overview + Colors/Typography/Layout/Elevation/Shapes/Components 这几节本身 | token 和 prose 一起写就是 floor |
| T3 bans | 原生 "Do's and Don'ts" 节 | 规范的 `PHILOSOPHY.md` 本来就强调"有理由的否定约束"，跟现有"每条 ban 必须带理由"的写法一致 |
| T2 case law | 自定义追加的 `## Case Law` 节，按日期追加 | 规范 `docs/spec.md` 明确写了"未知 heading 会被保留、不报错"，dated 记录完全合规 |

这个映射需要在动 `design-brief` 之前，由人确认一次(上一轮讨论已经初步认可，实现时建议再对一遍规范原文：`docs/spec.md` 第 100–115 行 Section Order，`PHILOSOPHY.md` 全文)。

---

## 7. 待实现清单(新会话动手前建议按这个顺序过一遍)

1. 确认 `~/projects/harold-skills` 本地 checkout 是否已有 `idea-loop/`；没有则从 `~/.claude/plugins/marketplaces/harold-skills/idea-loop/` 或对应 git 分支/PR 取最新版。
2. 把 `design-lib` 仓库 `plugins/design/` 整体迁入 `harold-skills`(具体 plugin 命名、目录位置待定)，参照它自己 `MIGRATION.md` 记录过的上一次迁移(TOFEL-demo → design-lib)怎么做的。
3. 改 `design-brief`：输出格式换成 `google-labs-code/design.md` 规范(§6 映射表)。
4. 改 `design`(总入口)：默认路径改成"结构由 grill/to-spec 谈定 → 跳过候选 → 一次产出 wireframe+视觉+motion+prototype"；候选生成保留，只在结构真正开放时触发(现有 SKILL.md §0 的逃生舱条件要重新措辞，明确"idea-loop 语境下这是默认路径")。
5. 把 Refero 的 styles/screens/flows 接成 design-ui Stage B(concept & expression)的研究后端，替换/补充现有 vendored taste layer(`references/design-core.md` 等)。
6. 在 grill 和 design 之间接一条明确的移交规则(grill 遇到设计形状的分叉 → 转 design 步骤 → 产出 decision ledger 回填)。
7. 在 to-spec/to-ticket 里落实"点名 → 独立生产 → 检查"三段式(§2)，确认 `<产物>` 字段具体填什么(建议：预览 HTML 的路径 + 一行 fidelity/decision ledger 摘要)。
8. 保留 `design-port` 现有截图对比机制，接成 `implement` 的"视觉正确性"仪器调用点。
9. `design-lib` 仓库：`landing-page/` 标注冻结，更新其 `README.md` 说明仓库新身份(motion 生产 + 历史档案)。

## 参考来源(建议新会话自己重新核实，不要只信本文摘要)

- idea-loop 真相源：`~/.claude/plugins/marketplaces/harold-skills/idea-loop/`(README.md、`skills/{grill,to-spec,to-ticket,implement}/SKILL.md`)
- design-lib 消费侧现状：`plugins/design/skills/{design,design-brief,design-ui,design-motion}/SKILL.md`、`plugins/design/references/browser-usage.md`、`plugins/design/MIGRATION.md`、仓库根 `README.md`
- design-lib 生产侧现状(待冻结)：`landing-page/research/{research-method,product-taxonomy-method,prototype-method}.md`、`landing-page/distill/schema.md`、`landing-page/skill/index.md`
- Refero：本机已装 `~/.claude/skills/refero-design/`(SKILL.md + references/mcp-tools.md)；上游仓库 `github.com/referodesign/refero_skill`
- DESIGN.md 规范：`github.com/google-labs-code/design.md`(`docs/spec.md`、`PHILOSOPHY.md`)
- 一个已作废的中间产物：`design-lib` 会话早期发布过一份自建"画廊"架构的 Artifact(生产/消费两侧、快慢轨、Gallery Index)，已被本文档第 1 节的判决取代，仅作历史记录，不代表当前方向。
