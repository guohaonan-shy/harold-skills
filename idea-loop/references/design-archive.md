# 设计档案：`docs/design/prod/` 的结构

目标项目的 `docs/design/prod/` 是一张图，记录**线上现在的样子**：每个页面有哪些状态、状态之间怎么跳、用到哪些组件和动效、当初为什么这样定。这份 reference 回答：图由什么组成、文件怎么放、每份文件的 frontmatter 和正文写什么、怎么校验。读档案、写档案、查档案的 skill 与 agent 都以它为准。

> 与 `DESIGN.md` 的分工：`DESIGN.md` 是**设计系统本身**（全局、无页面名、可照做的规则，见 `design-md.md`）；档案是**每个页面、组件、动效的现状与决定**。一条内容两边都像时，按 `design-md.md` §7 的分层表落。

## 1 图的模型

- **节点 = 页面状态**：一个页面在某一刻的完整一屏，已经包含其中每个组件当时的样子。组件自己的状态不单独建模——「播放按钮在下载中」就是「某页 · 题位下载中」这一屏的一部分。
- **边 = 从一个状态到另一个状态的一次触发**，两类：
  - **用户行为**（`kind: user`）：在某个组件上做某个操作。边上引用这个组件，并用 ARIA 角色和名字定位它（`locate`），写出操作（`action`）。
  - **系统行为**（`kind: system`）：不经过组件的变化（2 秒后、请求失败、轮询发现完成）。边上写触发条件（`trigger`）和怎么让它发生（`how`：拦哪个请求、等多久）。
- **跨页跳转也是边**：A 页的某个状态连到 B 页的某个状态。页面文件不描述跳转，边只写在状态文件里。
- **分段 = 长页面的入口状态在空间上的组成部分**：状态是时间维度，分段是空间维度。页面的滚动高度大于主视口时，入口状态按内容声明 `sections`（自上而下，名字取自 §3 的类型表，用可访问性树定位），整页每段有图。分段**不是节点**，不进图的拓扑——往下滚不改状态，可达、进入方式、用户路径都照旧只看状态和边。边写从本页哪一段出发（`from`）、落到目标状态的哪一段（`section`）；**页内锚点**是入口状态的自环加落点段，不另建状态；段内的交互（FAQ 展开、切标签）仍是页面的另一个状态，状态写它在哪一段（`section`）。
- **可引用对象**——节点和边用 wikilink 引用，它们本身不进图的拓扑：
  - **组件**：一个前端组件 = 一份组件文件，挂代码路径。**每个代码组件都单独存**，不论几个页面用；页面只记「哪个区域用哪个组件」。展示类组件同样存档，只是不出现在边上。
  - **动效**：每个具体动效一份文件，写参数与理由。边引用的是「切换时怎么动」，节点引用的是「这一屏常驻的动」（加载转圈）。**具体动效只落在档案里**，不进 `DESIGN.md`；`DESIGN.md` 的 Motion 章只收全局原则。
  - **用户路径**：有名字的一串状态，表达一个关键用户意图，可以跨页面。它只表达意图，**不承担「怎么进状态」**——进入方式从图推导（§5）。
- **组件和 `DESIGN.md` 的基础件是两层**：基础件（按钮、输入框）的配方在 `DESIGN.md` 的 Components 章；档案组件是代码里的具体组件，可以引用基础件的 token（`tokens` 字段），不重抄配方。

### 建模的取舍

写档案时遇到下面这些情形，照这里定，不各凭感觉：

- **结构相同的多项只记一个代表**：一段里有几个结构相同的项（场景、FAQ 条目、卡片、目录项），截图、状态、边都只记第一个，其余在状态文件里一句话说明「还有 N 个同样的」。指向这些项的目录一类入口也只留第一条边。
- **入口是加载中**：页面一打开就发请求的，入口状态是「加载中」（拦住那条请求停在这一屏），加载完、加载失败各用一条 `system` 边连出去，`async` 写在加载中的状态上。于是回到这个页面的边都指向加载中。
- **组件自己的指示状态不建成页面状态**：计时器变色、字数变色、进度条走到哪里这类，是组件自己的指示，写在组件文件里。页面状态只在出现了新一屏时建：默认状态加有内容的状态，然后沿提交 / 退出的流程往后走。
- **公共组件的交互状态只在一个代表页上记**：顶栏菜单、页脚这类多页共用的组件，展开菜单之类的状态只在一个页面上建，其余页面不重复建（组件文件里写在哪一页记了）。
- **站外链接、其他语言版本的链接不画成边**：边只连档案里的状态。在页面文件里列一节「站外链接」（链接文字加去向，文字即可）；跳到别的语言版本的链接同样处理。
- **同一个文件里没导出的内部组件、不画东西的组件**（布局壳、`<head>` 之类）不单独存，写在所属组件或页面文件里；整页写在一个文件里、没有拆出子组件的，这个文件本身就是那个组件。
- **`async` 的 `failure` 可以指向别的页面的状态**：加载失败后页面跳去别处，failure 就写那一页的状态；用户看不到失败提示是目标项目自己的问题，不在这里记。
- **边的条件**：同一个操作按环境去不同状态时（麦克风被拒 / 已授权），拆成几条边，各写 `when`（一句话的条件）；去向取决于浏览历史的「返回上一页」，`to` 写走到这一步的那条路径上的目标，`when` 写「从 X 进来时」。

## 2 目录与分工

```
docs/design/
├── tmp/<spec-slug>/{imagine,canvas,delta}/   只在本地，不进 git
└── prod/
    ├── index.md                              生成；frontmatter 里定主视口 / 主题 / 语言 / 动效模式，多前端的项目还有工作区前缀
    ├── pages/<page>/<page>.md                页面
    ├── pages/<page>/<page>--<state>.md       页面状态 = 图上唯一的节点
    ├── components/<Component>/<Component>.md 代码组件（每个组件都单独一份）
    ├── motions/<motion>.md                   具体动效
    └── journeys/<journey>.md                 用户路径
```

- 各对象可带同目录的 `assets/`（状态截图、动效 GIF、交互图 `flows/`）。
- **页面是目录，每个状态一份文件**：状态若只是页面文件里的一节，页面内的流转在 Obsidian 图上全变成自环。**状态文件名带页面前缀**（`<page>--<state>`），因为 wikilink 按 basename 解析，不同页面都有 `loading` 时靠前缀区分。组件文件用代码组件名；**项目有不止一个前端时，组件文件名一律带工作区前缀**（`mkt-SiteFooter`、`app-SiteFooter`：两个前端各有一个同名的页脚，basename 就撞了），前缀由项目在 `prod/index.md` 里声明（§3），校验认它。
- **basename 在 `docs/` 下全局唯一**（`wiki-conventions.md` §4），由校验查；工单文件与 `index.md` 豁免。
- **`tmp/` 与 `prod/` 的分工**：`tmp/<spec-slug>/` 放进行中需求的全部设计过程产物（`imagine/` 方向说明、`canvas/` 画布与冻结记录与完整验收矩阵、`delta/` 对 `prod/` 的差异），只在本地，目标项目要把它排除出 git；`prod/` 放线上现在的样子，提交。放弃的需求不上线，有价值的结论写回 spec 或 issue。
- **`delta/` 与 `prod/` 同构**：新增或改动的对象放它改完之后的**全文**（路径与 `prod/` 里相同）；删除的对象 id 列在 `delta/removed.md`，一行一条，`- [[<id>]]`（后面可跟一句原因）。于是归档 = 覆盖 + 删除，需求差异 = 逐个对象比对，都不用解析补丁格式。
- **`prod/` 只存精简矩阵**：每个状态一张主视口截图（主视口、主题、语言、动效模式写在 `prod/index.md` 的 frontmatter，项目定一次；`motion` 取 `default`（默认动效，拍之前把整页滚一遍让内容出现）或 `reduce`，不写时是 `default`）。**长页面的入口状态（声明了 `sections` 的）改成每段一张图**，叫 `<入口状态 id>@<段 id>.png`，放入口状态同目录的 `assets/`；**每段单独截**：滚到这一段、等它的内容全部出现并稳定、冻结页面时钟，再截这一段的范围（§10），不拍整页长图，也不从长图里切。段与段之间没有可点元素的空隙只在归属结果里列出、不拦。段内交互的状态（带 `section` 的）只拍那一段，截图照旧叫状态自己的名字；浮层越出所在段时（顶栏下拉菜单比顶栏高）把浮层一起拍进去（§10 的 `--include`）。每个有动效的边或节点一张 GIF。完整矩阵（主题 × 视口 × 语言 × 动效偏好）只在 `tmp/<spec-slug>/canvas/`，随 `tmp/` 清掉。截图是派生物，随时可重拍。
- **素材走 Git LFS**：目标仓库的 `.gitattributes` 管 `docs/design/prod/**/assets/` 下的 png / gif / webm。归档脚本首次归档时检查，没配就提示要加哪一行，不代改。
- **写 `prod/` 只有归档脚本一条路**：任何 agent 都直接编辑 `tmp/<spec-slug>/delta/`，不碰 `prod/`；`prod/` 只由归档脚本（人批过之后）写，写之前先跑校验。
- **旧布局**：`docs/design/` 下除 `tmp/`、`prod/`、`index.md` 以外的目录是旧的按 spec 命名的冻结记录。校验对每个这样的目录只打一条提示（建议删），不读、不算违规。

## 3 frontmatter：机器读的结构

每份对象文件照 `wiki-conventions.md` §3 带 `type` / `tags` / `summary`，再加各自的结构字段。**引用一律写成带引号的 `"[[basename]]"` 字符串**，Obsidian 和脚本读的是同一个东西；`{token}` 形式的 token 引用同样加引号。

**页面** `type: design-page`

```yaml
code: [<页面入口代码路径>]
regions:                          # 区域 → 组件
  - { name: 工具栏, component: "[[NavBar]]" }
```

页面有哪些状态不列——看哪些文件带这个页面前缀，一条事实只存一处。

**状态（节点）** `type: design-state`

```yaml
page: "[[cookbook]]"
entry:                            # 只有入口节点有
  url: /cookbook
  preconditions: { account: 已登录的测试账号, data: 至少 3 份已保存菜谱 }   # 账号 / 数据 / 开关，自由键值
components: ["[[RecipeCard]]"]    # 可选：这一屏要特别说明的组件
motions: ["[[spinner-ring]]"]     # 可选：这一屏常驻的动效
sections:                         # 只有入口节点写，且只在页面比主视口高时写；自上而下，顺序即页面顺序
  - { id: header, locate: { role: banner } }
  - { id: hero, locate: { role: heading, name: 一个价格，没有隐藏项 } }
  - { id: faq, locate: { role: heading, name: 常见问题 } }
  - { id: footer, locate: { role: contentinfo } }
section: mkt-pricing#faq          # 可选：段内交互的状态写它发生在本页哪一段（入口节点不写）
edges:
  - id: search                    # 在本状态内唯一
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[SearchBox]]"
    locate: { role: searchbox, name: 搜索菜谱 }
    action: 输入关键词并回车
    when: 已登录时               # 可选：一句话的条件（同一个操作按环境去不同状态时，拆成几条边各写）
    from: mkt-pricing#hero        # 可选：从本页哪一段出发（有分段的入口状态上，user 边必写）
    section: mkt-pricing#faq      # 可选：落到目标状态（入口状态）的哪一段；页内锚点就是 to 指向自己再加 section
    motion: "[[save-pop]]"        # 可选
  - id: done
    to: "[[cookbook--search-results]]"
    kind: system
    trigger: 搜索请求完成
    how: 放行搜索请求
  - id: fail
    to: "[[cookbook--search-failed]]"
    kind: system
    trigger: 搜索请求失败
    how: 拦截搜索请求并返回 500
    blocked: { missing: 一个能让搜索接口稳定失败的开关, tried: [拦截搜索请求返回 500, 用空关键词搜索] }
async:                            # 这一屏发起了异步动作时必填
  loading: "[[cookbook--search-loading]]"
  failure: "[[cookbook--search-failed]]"
  empty: 不适用
```

- `user` 边必有 `component`、`locate`、`action`；`system` 边必有 `trigger`、`how`；任一边可有 `motion`、`when`。`locate` 写 `role` + `name`；**按角色 + 名字定位不到**的元素（例如原生折叠标题 `<summary>`）才改写成只有 `text` 的 `{ text: <完整文字> }`，两种不混写。分段脚本的测量结果会报出哪些可点元素按角色定位不到（§10）。`when` 是一句话的条件，写法见「建模的取舍」。
- `sections`、`from`、`section` 只在长页面上出现，单屏页面都不写；写法与规则见下面「分段」一节。
- `blocked` 表示这条边在真实应用里走不通：`missing` 写缺什么前置条件，`tried` 列试过哪些用户路径。带 `blocked` 的边不参与「进入方式」的推导，也不算让目标状态可达。
- `async` 三项各是一个状态引用，或字符串「不适用」；引用的状态可以在别的页面（加载失败后页面跳去别处）。

**组件** `type: design-component`：`code`（代码路径）、可选 `tokens`（引用的 `DESIGN.md` 基础件或 token）、`usedBy`。

**动效** `type: design-motion`：`duration`、`easing`（`"{token}"` 引用，或字面值）、`properties`、`iterations`、`reducedMotion`（减少动效下怎么退）、字面值时必填的 `deviates`（一句为什么偏离站内 token）、`usedBy`。

**用户路径** `type: design-journey`：`intent`（一句话意图）、`path`（有序状态列表）：

```yaml
path:
  - "[[cookbook--list]]"
  - { state: "[[cookbook--search-results]]", via: save }   # 与下一个状态之间有多条边时，用 via 指定边 id
  - "[[cookbook--recipe-saved]]"
```

`via` 写在**出发的那一项**上，值是这个状态通往下一项的那条边的 id。

**`prod/index.md` 的设置键**（归档脚本生成表格、原样保留 frontmatter；项目定一次）：`viewport`（如 `1440x900`）、`theme`（`light` / `dark`）、`locale`、`motion`（`default` / `reduce`，不写是 `default`）、`workspaces`（可选：项目有不止一个前端时，组件文件名的工作区前缀列表，如 `[mkt, app]`；声明后每个组件文件名都要以其中一个加 `-` 开头，校验认它）。

**`usedBy` 由归档脚本反向生成，不手写**：它是使用这个组件 / 动效的**页面**列表。页面用组件 = 它的某个 `regions` 写了它，或它的某个状态在 `components` 里列了它，或它的某条边经过它；页面用动效 = 它的某个状态在 `motions` 里列了它，或它的某条边的 `motion` 是它。只有一个页面用也生成。

### 分段

**写在哪**：`sections` 只写在入口状态上；一页的分段只由一个入口状态声明（两个入口都声明，`<页面>#<段>` 就指不到唯一一处）。

**什么时候要写**：页面的滚动高度大于主视口高度，入口状态就要声明分段；不超过一屏的页面不写，照旧一张主视口截图。这一条在拍图时判（要量页高），校验看不到页面。

**每段的 `id`** 写 `<类型>` 或 `<类型>-<限定词>`，限定词按内容起、kebab-case。**同一页同一类型出现多次，每个都要加限定词**（`feature-listen` 和 `feature-write`，不能一个 `feature` 一个 `feature-write`）；只出现一次时建议不加，校验不拦。类型按最长前缀认：`feature-grid` 是类型 `feature-grid`，`feature-grid-pricing` 是它加限定词 `pricing`，所以 `feature` 不能用 `grid` 当限定词。类型取自下面这张闭集表（跨项目通用，不进目标项目的 `DESIGN.md`；校验与反查读的是 `design-archive.mjs` 里的同一份常量）；两类判不准时按「这一段主要在回答什么」定——「为什么信你」归 `trust`，「多少人在用」归 `social-proof`。闭集要扩，改常量、校验的单测和这张表，不在档案里自造。

| 类型 | 是什么 |
|---|---|
| `header` | 页面顶栏：站点标识、主导航、顶部的登录与行动按钮 |
| `hero` | 首屏主视觉：一句主张加一个主行动 |
| `social-proof` | 多少人在用：用户数、客户 logo 墙、评分 |
| `problem` | 用户的痛点：为什么现有做法不够 |
| `feature` | 一项功能的展开说明 |
| `feature-grid` | 多项功能并排的宫格或列表 |
| `demo` | 产品的实际画面、可操作的示例或演示 |
| `how-it-works` | 分步骤说明怎么用 |
| `value-prop` | 价值主张：好处汇总，不绑具体功能 |
| `trust` | 为什么信你：安全、隐私、资质、保证 |
| `testimonials` | 用户的原话与案例 |
| `comparison` | 与别的做法或套餐的对比 |
| `pricing` | 价格与套餐 |
| `stats` | 一组数字 |
| `faq` | 常见问题 |
| `related-content` | 相关文章、延伸阅读 |
| `final-cta` | 页尾前最后一次行动号召 |
| `footer` | 页脚：站点链接、法务、版权 |
| `content` | 兜底：以上都不是的正文（校验给提示：多半该归进某一类，或表里缺一类） |

**怎么定位（`locate`，写法同边的 `locate`，用可访问性树）**：

| 段的样子 | `locate` | 范围 |
|---|---|---|
| 有标题 | `{ role: heading, name: <完整名字> }`，精确匹配 | 从标题所在的顶层分块的上沿起（这个分块里还有别的分段标题时，从标题本身的上沿起），到下一个分段的起点为止 |
| 顶栏、页脚 | `{ role: banner }` / `{ role: contentinfo }` | 这个 landmark 元素自己的框 |
| 没有标题的段（首屏、纯图片带） | `{ position: N }` | 第 N 个顶层分块自己的框；校验给提示：这条定位比较脆，页面加一个分块就会错位 |

**顶层分块** = `<main>` 的直接子元素（没有 `<main>` 时取 `<body>` 去掉 banner / contentinfo 之后的直接子元素），只算可见、高度大于 0 的；**自身不占位置的包装层（`display: contents`，例如 Astro 的岛）不算一块，往里看，用它的子元素**。最后一段的终点：下一个分段的起点；后面没有分段时取页面上第一个 `contentinfo` 的上沿（不论声明没声明），没有就到页底——没声明页脚时，页脚里的链接会落空、被报出来，而不是静默算进最后一段。标题改名导致定位失败，对账判「进入方式过期」，提议改定位。

**引用一个分段写 `<页面>#<段>`**（如 `mkt-pricing#faq`），边的 `from` / `section` 和状态的 `section` 都写全称；`sections` 列表里的 `id` 写短名（它已经在这一页的入口状态里）。**写成普通字符串，不写成 wikilink**：`"[[页面#段]]"` 在 Obsidian 里是「页面文件里名叫『段』的标题」，而校验读不出它指向的是不是声明过的段。分段不是单独的文件，不占 `docs/` 下 basename 的唯一性。

## 4 正文

- **状态文件**只有两节：「这一屏」（描述，加截图 / GIF）和「应看到什么」（可判定的几条，进状态之后拿它核对）。**状态文件不写决定。**
  - **声明了 `sections` 的入口状态**，「这一屏」按段排开：每段一个 `###` 小标题（段 id）、一张切图（`<入口状态 id>@<段 id>.png`）、一两句描述；「应看到什么」照旧几条可判定的话，可以按段写。
- **页面、组件、动效、用户路径文件**的正文有两个固定二级标题：「## 决定」与「## 设计法候选」。没有内容时各写一行「无」——空着分不清是没有还是漏了。
- **「决定」按编号写**，每条：

  ```markdown
  ### 决定 2：对勾用 ease-out-sine 写出来，不用站内默认曲线
  规则一两句。
  - 为什么：（必填）
  - 否掉过：（必填，写被否的做法和理由；确实没有备选写「无」）
  - 来源：[[<spec-slug>]]
  ```

  不写日期；规则改了**原地改写**，不追加新条目；编号不复用。蒸馏成 ADR 之后「来源」改链到 ADR。
- **「设计法候选」**每条的形状以 `design-md.md` §13 为准：一句无日期、无页面名、可照做的规则，下挂「并进」「为什么」「证据」三项。校验只看三项都在。处理候选的是 `dreaming`，处理完即删。

## 5 进入方式从图上推导

- 只有**入口节点**写 `entry`（地址 + 前置条件）；边写怎么触发；每个状态写「应看到什么」。
- 任一状态的进入方式 = **从某个入口节点到它的最短路径**（跳过 `blocked` 的边）：入口地址与前置条件、沿途每条边的定位与操作（或怎么让系统行为发生）、终点的「应看到什么」。推导由查询模块实现。
- **进不去** = 没有这样的路径，但某条入边写了 `blocked`；返回时带上每条 `blocked` 边的「缺什么 + 试过什么」。**既没有路径、入边上也没写 `blocked`，是校验错误**——漏写前置条件本身就是漂移。
- 进不去的状态的后继，同样要满足这条：要么另有路径，要么自己的入边写了 `blocked`。

## 6 校验

```
node scripts/design-archive-check.mjs <仓库根> [--delta <spec-slug>] [--no-used-by] [--workspaces <前缀,前缀>] [--json]
```

退出码 0 = 通过（可以带「提示」），1 = 有违规（逐条指名文件与字段），2 = 用法错误或不是仓库根。`--delta` 把 `tmp/<spec-slug>/delta/` 叠到 `prod/` 上（同 id 的对象以 `delta/` 为准，按 `removed.md` 去掉对象），再判叠完之后的样子。`--no-used-by` 跳过规则 6 里 `usedBy` 那一半：agent 写 `delta/` 时不手写 `usedBy`（归档脚本生成），自查时带上它。`--workspaces mkt,app` 把组件文件名的工作区前缀交给校验（初扫时 `prod/index.md` 还不存在，没处声明；档案里已经声明了，就以参数为准）。

| 规则 | 判什么 |
|---|---|
| 1 可达 | 每个状态能从某个入口节点沿边（不走 `blocked` 边）到达，或它的某条入边带 `blocked` |
| 2 async | 有 `async` 的状态三项写全，各是存在的状态或「不适用」 |
| 3 引用 | 所有 wikilink 能解析；边的 `component` 指向组件、`motion` 指向动效，`to` 指向状态，状态的 `page` 指向页面；`docs/` 下 basename 不重复 |
| 4 用户路径 | `path` 相邻两个状态之间有边；有多条时写了 `via`，且 `via` 是其中一条的 id |
| 5 决定与候选 | 状态文件没有「决定」；其余对象两节都在，每条决定三项齐全，每条候选三项齐全 |
| 6 动效 | 字面值的 `duration` / `easing` 都带 `deviates`；`usedBy` 与反向引用一致（字段缺失视为未生成，照样报出来） |
| 7 分段 | 见下 |
| 0 结构 | 读不出的文件、不认识的 `type`、规则依赖的必填字段（边的 `id` / `to` / `kind`，`user` 边的 `component` / `locate`（`role` + `name`，或只有 `text`）/ `action`，`system` 边的 `trigger` / `how`，`blocked` 的 `missing` / `tried`，入口的 `url` 等）、写了就不能为空的 `when`；`prod/index.md` 声明了 `workspaces` 时，每个组件文件名要带其中一个前缀（声明本身要是小写 kebab-case 前缀的非空列表） |

**规则 7（分段）**，一律点名文件与字段：

- **违规**：类型不在闭集；`id` 写法不对（不是 `<类型>` 或 `<类型>-<限定词>`，kebab-case）；同页重名；同页同类型多次却没都加限定词；`sections` 写在非入口状态上；同页两个入口状态都声明分段；`locate` 不是上表三种形状之一；边的 `from` 不是本页声明过的段；边的 `section` 不是 `to` 所指状态声明过的段（`to` 不是入口状态也算）；状态的 `section` 不是本页声明过的段（入口状态写 `section` 也算）；**有分段的入口状态上，`user` 边没写 `from`**；引用写成 wikilink。
- **提示**（打印、不拦，退出码照旧）：用 `content` 兜底；`position` 定位。landmark 不提示：一页只有一个 banner / contentinfo，不会错位。
- 校验读的是档案文件，看不到页面：「页面比主视口高就要声明分段」和「每个可点元素都落在某一段里」放在拍图那一步判（§10）。

## 7 解析模块

`scripts/design-archive.mjs` 的 `loadArchive(root, { delta })` 读一个仓库根，返回所有对象（`objects`，按 id 索引，带 `kind` / `fm` / `body` / `file`）、规范化过的边（`edges`）、全部 wikilink（`refs`）、`docs/` 的文件表（`files`）、`prod/index.md` 的 frontmatter（`index`）、读不出的文件（`problems`）、旧布局目录（`legacy`）和叠 `delta/` 时的差异清单（`delta.added` / `changed` / `removed`）。同一个文件还导出读图的函数（`statesOfPage` / `outgoingEdges` / `incomingEdges` / `computeUsedBy`）、正文分节与决定、候选的解析（`section` / `parseDecisions` / `parseCandidates`），以及分段的类型表与解析（`SECTION_TYPES` / `parseSectionId` / `parseSectionRef` / `sectionLocate` / `sectionsOfState` / `sectionsOfPage`）。边规范化之后带 `fromSection` / `toSection`（文件里写 `from` / `section`；输出里不叫 `from`，因为边的 `from` 已经是「出发的状态」）。校验、查询模块、MCP 包装、归档脚本都建在这一层上，不各自重读文件。

## 8 查询模块：六个入口

读档案不要自己翻文件，用 `scripts/design-archive-query.mjs`。它建在 §7 的解析模块上，引擎是读文件加文本匹配（没有 embedding、没有模型）；每个入口都能叠上某个需求的 `tmp/<spec-slug>/delta/`，读「改完之后的样子」。返回的是结构化数据，命令行输出 JSON，MCP 包装原样转发它。

```
node scripts/design-archive-query.mjs <仓库根> <入口> <参数> [--delta <spec-slug>]
```

| 入口 | 参数 | 返回什么 |
|---|---|---|
| `page` | 页面名 | `page`（对象）、`regions`（区域 → 组件，带代码路径）、`components` 与 `motions`（页面用到的，各带 `usedBy` 全部页面）、`states`（每个状态的 `entry`、`components`、`motions`、`section`，加 `outgoing` 与 `incoming` 两组边，跨页的边也在内）、`sections`（这一页的分段，没有分段是空列表：每段带全称 `id`（`<页面>#<段>`）、`type`、`qualifier`、`locate`、`locateBy`（`heading` / `landmark` / `position`）、声明它的 `declaredBy` 入口状态、`outgoing` 与 `incoming` 两组边（页内锚点的自环两边都在）、`states`（带这个 `section` 的状态）、`screenshot` 切图路径与 `screenshotExists`）、`journeys`（经过这一页任一状态的用户路径）、`decisions` 与 `candidates`（页面自己的，加它用到的组件、动效和经过它的用户路径的，每条带 `of: { id, kind }`） |
| `state` | 状态名 | `state`（对象，带它的 `section`）、`enter`（进入方式，见下）、`shouldSee`（「应看到什么」原文）、`screen`（「这一屏」）、`screenshots`（正文里内嵌的截图 / GIF 路径） |
| `journey` | 用户路径名 | `journey`（意图）、`start`（第一个状态的进入方式）、`steps`：按顺序每一步 `state`、`page`、`trigger`（从上一步到这一步的那条边；第一步为 `null`）、`shouldSee`；上一项写了 `via` 就按它选边，没写而有多条时取第一条并把全部边 id 列在 `ambiguous`，两状态之间根本没有边标 `noEdge` |
| `diff` | spec 名 | `added` / `removed`（对象：`id`、`kind`、`summary`、`file`）、`changed`（对象加 `fields` 与 `sections`）、`unknownRemoved`（`removed.md` 里列了但 `prod/` 没有的 id）。`fields` 逐字段给 `before` / `after`，状态的边按边 id 展开成 `edges[<id>].<字段>`，入口状态的分段按段 id（文件里的短名）展开成 `sections[<id>].<字段>`（`locate` 当一个整体，一段的定位改了差异里只出现 `sections[<id>].locate`）；`sections` 按 `##` 小节比对，标 `added` / `removed` / `changed`。`delta/` 里与 `prod/` 一字不差的副本不算改动。不接 `--delta` |
| `refs` | 组件名、组件代码路径、动效名；或分段 `<页面>#<段>`；或一类分段 `#<类型>` | 组件 / 动效：`target`、`matchedBy`（`name` / `code`）、`edges`（经过它的边）、`states`（列了它或有这样的边的状态，`via` 说明是 `components` / `motions` / `edges` 哪种）、`journeys`（某一步的边经过它，或某个状态列了它）、`pages`（用它的全部页面，来自反向引用而不是 `usedBy` 字段）。`<页面>#<段>`：`matchedBy: section`，`target`（全称 `id`、`type`、`qualifier`、`locate`、`declaredBy`）、`outgoing`（从这段出发的边）、`incoming`（落到这段的边）、`states`（`section` 是这段的状态）、`journeys`（经过这些边或状态的用户路径）、`pages`。`#<类型>`（如 `#trust`）：`matchedBy: type`，`sections`——所有页面里这一类的段（含带限定词的），每段带 `page` 与全称 `id` |
| `keyword` | 一段文字 | `matches`：名字、summary（用户路径还有 `intent`）、正文（连同 frontmatter 里的文字值）里含有任一个词的对象，不分大小写；按命中位置 `name` > `summary` > `body` 排序，同位置里命中词多的在前。每条带 `hit`、命中的 `terms` 与 `snippet`。整段没有空格、一个都没命中时，把其中的中文长串拆成相邻两字再找一遍（`expanded: true`） |

**边的视图**（页面的 `outgoing` / `incoming`、进入方式的 `steps`、用户路径每一步的 `trigger`、反查的边）都带 `fromSection` / `toSection`（完整的 `<页面>#<段>`，没写就没有这两个键），所以照着进入方式走的人知道先滚到哪一段再点；写了 `when` 的边也带 `when`，同一个操作有几条边时靠它分清是哪种环境。

**进入方式**（`state` 的 `enter`，`journey` 的 `start`，也可单独调 `enterState`）按 §5 推导：

- 进得去：`{ reachable: true, entry: { state, url, preconditions }, steps: [边…] }`。`steps` 里 `user` 边带 `component` / `locate` / `action`，`system` 边带 `trigger` / `how`，都可能带 `motion`；入口节点本身 `steps` 为空。最短路径相同时取 id 较小的入口、先写的边。
- 进不去：`{ reachable: false, verdict: '进不去', blocked: [边 + missing + tried…], undeclared }`。`blocked` 是这个状态的入边和它上游（走到入口能到达的状态为止）所有带 `blocked` 的边；一条都没有时 `undeclared: true`，表示没有路径也没人解释——校验规则 1 会报它。

**MCP 包装**：`scripts/design-archive-mcp.mjs` 把这六个入口暴露成六个只读工具，由插件自己的 `.mcp.json` 里的 `design-archive` 启动（走 stdio，不引入第三方依赖），目标项目零配置。工具名与入口一一对应：`design_page` / `design_state` / `design_journey` / `design_diff` / `design_refs` / `design_keyword`；入参是入口的参数（`name`、`spec` 或 `text`；`design_refs` 的 `name` 也接 `<页面>#<段>` 与 `#<类型>`，`design_page` 的结果带 `sections`），除 `design_diff` 外都可选带 `delta`（需求名）。它只转发，返回的就是命令行打印的那份 JSON，所以两边不会漂开。仓库根取会话工作目录的 git 顶层。名字对不上、不在 git 仓库里、缺参数都返回 MCP 的错误结果（`isError`，原因写在文本里），进程不退出。**不提供任何写工具**：`prod/` 只经归档脚本改。

**错误**：名字对不上时不返回空结果，而是退出码 1、stderr 说清楚：这个名字其实是别的类型的对象（「`NavBar` 是组件，不是页面」），或这一类现有哪些对象；分段对不上时列出这一页现有的段（或类型表、现有分段）。`keyword` 一条都没命中同样退出码 1（模块函数返回空的 `matches`）。用法错误、不是仓库根、`diff` 带了 `--delta` 退出码 2。

## 9 归档：写 `prod/` 的唯一入口

```
node scripts/design-archive-write.mjs <仓库根> <spec-slug> [--dry-run] [--json]
```

退出码 0 = 已归档（`--dry-run` 时是「可以归档」），1 = 拒绝（逐条列出违规或冲突，**什么都没写**），2 = 用法错误或 `tmp/<spec-slug>/` 不存在。顺序：

1. 校验：把 `delta/` 叠在 `prod/` 上跑 §6 的七条。`usedBy` 此时还没重算，所以这一步不判它（既不判与反向引用是否一致，也不判其中的链接是否还能解析——被删的页面会留下过期的链接）；第 3 步生成之后再完整校验一次。
2. `delta/` 下除 `removed.md` 与 `index.md` 外的文件按同路径覆盖进 `prod/`（含各自的 `assets/`）；`removed.md` 列出的对象删掉。组件的整个文件夹随它走；页面或组件的文件夹里没有对象文件了，连 `assets/` 一起删。
3. 重算每个组件、动效的 `usedBy`（只改这一个字段，其余字节不动；集合没变的文件不碰），重新生成 `prod/index.md`：页面、组件、动效、用户路径四张清单，表体取自 frontmatter，index 自己的 frontmatter（主视口 / 主题 / 语言）原样保留。
4. 交互图：`tmp/<spec-slug>/canvas/` 里某个 `flows/` 目录下直接放着的图片，加上 spec 里链接到、位于 `canvas/` 下的图片，挪进 `prod/pages/<page>/assets/flows/`。图属于**文件名里带着状态 id 的那个状态**的页面（约定的写法是 `flow-<n>-<状态 id>.png`；多个状态 id 都在名字里时取最长的）；名字里没有状态 id 的，放进 delta 里第一个页面（没有就取第一个状态的页面），并在输出里说明。`flows/src/` 里的拼图源不挪。目标位置已有内容不同的同名文件，或两张图落到同一个位置，都是冲突，拒绝。然后把 `docs/spec/<spec-slug>/<spec-slug>.md` 里指向旧位置的图片链接改成新路径（链接的写法——相对、仓库根相对、带前导斜杠——保持不变，代码围栏里的不改）。
5. 检查目标仓库：`.gitattributes` 有没有用 Git LFS 管 `docs/design/prod/**/assets/` 下的 png / gif / webm，`.gitignore` 有没有忽略 `docs/design/tmp/`，`prod/index.md` 有没有定主视口 / 主题 / 语言；缺什么在输出里各提示一次，写出要加的行，**不改** `.gitattributes` 与 `.gitignore`。spec 里还有指向 `tmp/` 却不会被归档的链接，同样提示。
6. 清空 `tmp/<spec-slug>/`。

第 2 到第 4 步先排成一份计划，套在 `docs/` 的一份临时副本上（文本文件真实，其余文件建成空占位），对副本跑**完整**校验（含 `usedBy`）；过了才把同一份计划套到仓库上。所以任何一步不过，`prod/`、spec、`tmp/` 都保持原样，`--dry-run` 就是做到这一步为止。没有 `delta/` 目录的需求（只留了画布）照样走第 4、6 步。

### 谁在什么时候跑它

不是随手跑的。`pr-review` 的合并步骤在 `tmp/` 里还有设计差异时，先起 UI 审查者（`agents/ui-reviewer.md`，归档模式）对着实现核过差异、补齐状态文件、备好决定与候选的草稿，在会话里给人看；**人通过后**编排者才跑这个脚本，再提交 `prod/` 并推送，然后重新合并（`skills/pr-review/SKILL.md` §4.1）。UI 审查者只写 `tmp/<spec-slug>/delta/`，自检时只跑 `--dry-run`。

### 合并前钩子

`scripts/merge-gate-hook.mjs` 是插件级 PreToolUse 钩子（挂在 Bash 上，登记在 `hooks/hooks.json`）：命令里含 `gh pr merge`，且当前仓库的 `docs/design/tmp/` 下有任何含文件的需求目录（不算 `research/`：调研页是看完就丢的草稿，从不归档），就以退出码 2 拦下，stderr 点名是哪几个需求，指向上面这条流程并给出归档命令。其余命令、`tmp/` 不存在或为空、不在 git 仓库里时放行。钩子只跑脚本，不起 agent；不设 CI 检查（`tmp/` 不进 PR，CI 看不到）。

## 10 长页面的拍图：分段脚本

声明了 `sections` 的入口状态，**每段单独截一张图**存进档案。能单测的部分（算范围、归属、要拍哪几张）放在 `scripts/design-archive-sections.mjs`，浏览器那一侧是它生成、交给插件自带的无头 Playwright 跑的两段代码：

```
node scripts/design-archive-sections.mjs measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--for <段内状态 id> --section <段 id>] [--viewport <WxH> --theme <light|dark> --motion <default|reduce>]
node scripts/design-archive-sections.mjs measure <仓库根> --state <入口状态 id> --page <页面> --sections-file <分段列表.json> [--for <段内状态 id> --section <段 id>] [设置]
node scripts/design-archive-sections.mjs attribute <测量结果.json>
node scripts/design-archive-sections.mjs shoot <归属结果.json> --out <目录> [--section <段 id,段 id>] [--include '<JSON 定位>']
```

1. **`measure`** 打印一段 `async (page) => …` 的代码。分段取自档案里这个入口状态（`--delta` 时取需求的 delta）；初扫时档案里还没有这个状态，用 `--sections-file`（JSON 列表 `[{ "id": "hero", "locate": { … } }, …]`）从命令行给。视口、主题、动效模式取 `prod/index.md` 的 frontmatter（`--viewport 1440x900` / `--theme` / `--motion` 可覆盖；index.md 缺视口或主题又没给，退出码 2，不猜）。**语言**脚本管不到：浏览器要先按 `locale` 打开页面（代码把实际的 `navigator.language` 写进测量结果的 `env`，核一眼）。
2. **跑 `measure` 的代码**：先用 `browser_navigate` 进到入口状态（前置条件、登录态都在这一步备好），再把代码交给 `browser_run_code_unsafe`（代码长，把它存成文件、用 `filename` 参数传；文件和 `--out` 的目录都要在 Playwright 的工作区根目录里，否则报「outside allowed roots」）。代码做的事：设视口与配色 → **给页面装一个页面时钟并重载一次**（时钟要在页面自己的脚本跑起来之前就在，拍图时才冻得住轮播和计时器；已经有时钟就不重复装）→ 整页按半个视口一步滚一遍（懒加载的岛水合、滚动触发的出现动画走完，固定在屏幕上、滚到某处才淡入的元素在这一遍里被看到出现在哪）→ 等网络空闲 → 等页面高度不再变（最多 3 秒） → 回顶部 → 等字体 → 取顶层分块（`display: contents` 的包装层往里看）、每个标题和每个可点元素的框 → 用 `getByRole(role, { name, exact: true })` 定位每段。**它返回的测量结果 JSON 也留在页面的 `window.__dsMeasure` 里**：代码的返回值只印在工具输出里，存不成文件，用 `browser_evaluate`（函数 `() => window.__dsMeasure`，带 `filename`）把它存成文件。
   - **测量结果里每个标题、每个可点元素都带完整的可访问名字**（`name`，不截断；换行、`<em>` 之类拼起来的）和 `byRole`（`getByRole(role, { name, exact: true })` 找得到，及找到几个）：边的 `locate.name`、分段标题的 `name` 照抄它，不用逐个试。
   - 按角色 + 名字定位不到的可点元素（原生折叠标题 `<summary>` 一类）`byRole: false`，带 `textMatches`（按完整文字找得到几个）；`attribute` 把它们列在 `roleUnresolved`。这类元素的边写 `locate: { text: <完整文字> }`（只在角色定位不到时用）。
3. **`attribute`** 读测量结果，输出每段的范围、每个可点元素归哪一段（照它给边填 `from`）、**落空**列表（不在任何一段里的可点元素）、**定位失败**的段、顺序对不上的段、**重叠**的段；有落空、定位失败、顺序不对或重叠时退出码 1。处置：**写档案之前清零**——补一段（最差补一段 `content`）、改定位或把两段并成一段，重测。归属先看 DOM 包含（banner / contentinfo 里的归顶栏 / 页脚段，没声明就落空），再看元素中心的纵坐标落在哪段范围里。
   - **看不见的不参与归属**：透明度为 0 的可点元素，和固定在屏幕上却整页滚一遍也没出现过的，列在 `hidden`，不算落空；**固定在屏幕上的元素按它第一次真正出现的位置归属**（滚到试用段才淡入的固定目录，归试用段，不归首屏）。
   - **重叠**：两段的范围有共同的行（多半是 `position` 定位的分块里还有另一段的标题），可点元素会被静默归到前一段，所以按失败处理。浮在内容顶上的固定顶栏与内容重叠，不算（它的可点元素靠 DOM 包含归属）。
   - 输出的 `coverage` 列出各段之间、页顶页底的空隙：没有可点元素的空隙不拦（多半是留白；`<main>` 之外、非 landmark 的内容，如 banner 与 main 之间的公告条，补分段也盖不住），写档案的 agent 看一眼，空隙里有要存档的内容就在状态文件的描述里用文字写明。输出的 `headings` 是每个标题的完整名字与所在段。
4. **`shoot`** 读归属结果（`attribute` 的输出存成文件），打印第二段代码。**一段一段单独截**：滚过这一段（懒加载、出现动画）→ 回到这一段的顶 → 等到相隔 300ms 的两张截图一模一样（内容全部出现并稳定，最多等 8 次）→ **冻结页面时钟**（`page.clock.pauseAt`：计时器、`requestAnimationFrame`、`Date` 一起停）→ 截两张，留第二张 → 让时钟继续走。截图用 `fullPage` 加 `clip`（页面坐标，所以比视口高的段整张截下来，超长的段不截断），并用 `animations: 'disabled'`（CSS 动画跳到结束态，无限动画回到起点）。写到 `--out` 目录，文件名 `<入口状态 id>@<段 id>.png`；把它们放进入口状态同目录的 `assets/`（delta 里就是 `delta/` 里对应位置）。代码返回每张的 `settled`（等到了稳定）、`clockFrozen`、`stable`（冻结后两张一样）、`heightDrift`（拍的时候页面高度比测量时多出几像素）：`stable` 不是 `true` 的，说明这一段有自己在动的东西（轮播、计时、开发浮层），**在状态文件里注明「截图是某一刻」**，对账时它也最容易误报；`heightDrift` 不是 0，说明页面自己在变高变矮（打字机文案、慢到的内容），这一段下面的图可能整体错位，重新 `measure` 一遍再拍。`--section` 只拍列出的几段（对账时拍变了的那几段）。
   - **浮层越出所在段**：顶栏的下拉菜单比顶栏高，只拍顶栏会把菜单切掉。先把浮层打开，再拍时带 `--include '{"role":"menu"}'`（或 `{"text": …}`、`{"selector": …}`），截图范围取这一段与浮层的并集。
5. **段内交互的状态**（带 `section` 的）：先进入这个状态（照它的进入方式点出来），再 `measure <仓库根> <入口状态 id> --for <段内状态 id>`（档案里这个状态已经写了 `section` 就够；初扫时还没写，再给 `--section <段 id>`）。这一次**不重载页面**（重载会丢掉刚点出来的状态；页面时钟若是入口那次装的，仍在），测量的是此刻的页面：段的高度会随交互变（FAQ 展开后更高），范围按此刻算。`attribute` 之后 `shoot` 只拍那一段，文件名 `<段内状态 id>.png`。时钟若是此刻才装上的（没经过入口那次重载），页面早先起的计时器冻不住，`stable` 会说出来。
6. **比对**：对账与归档时逐段比，每段一次 `ui-png-compare.mjs <档案里的那张> <新拍的图>`，容差照旧。尺寸不同算容差外（一段变高了，只这一段超出）。哪一段超出，只这一段判后续、只留这一段的新图；整页都在容差内，什么都不写。
7. **几页一起扫、一页一页拍**：浏览器一次只开一个页面，多个页面的测量要排队；每页的 `measure` / `attribute` / `shoot` 之间不穿插别页的。拍图前先关掉开发服务器的调试浮层（框架的开发工具条、错误浮层、热更新提示），不然它们会被拍进每张图，换个环境对账时全是像素差。

**已知限制**：顶层分块按 §3 的定义取（`<main>` 的直接子元素，`display: contents` 的包装层往里看；没有 `<main>` 时是 `<body>` 去掉 banner / contentinfo 后的直接子元素），页面全套在一个无语义的包装元素里时 `position` 定位用处不大，用标题或 landmark 定位；`<main>` 之外、非 landmark 的内容落在段间空隙里，档案里没有它的图；浏览器侧的代码靠 `design-archive-sections-browser.test.mjs`（有 Chromium 才跑）和真的跑一次覆盖；页面时钟冻不住的东西（在页面时钟装上之前就起的计时器、缓存了 `requestAnimationFrame` 的第三方动画库）会让 `stable` 是 `false`；一段高过浏览器单张截图的上限（约 16000px）要拆成两段；可点元素的名字按 `aria-label` / 文字 / `alt` 近似，再用 `getByRole` 核过，核不上的都在 `roleUnresolved` / `byRole: false` 里说出来。
