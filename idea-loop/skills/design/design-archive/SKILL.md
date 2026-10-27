---
name: design-archive
description: 设计档案（docs/design/prod/）的结构、校验、查询与归档。写档案对象、查某个页面或状态的现状、跑档案校验或归档时用。
---

目标项目的 `docs/design/prod/` 是一张图，记录**线上现在的样子**：每个页面有哪些状态、状态之间怎么跳、用到哪些组件和动效、当初为什么这样定。读、写、查档案都以这一份为准。

档案只写**源头**：页面、状态、边、组件、动效、用户路径。进入方式、`usedBy`、`prod/index.md` 的清单、截图都是**派生**物，由脚本或查询算出来，不手写。

收的是每个页面、组件、动效的现状与决定；全局、无页面名、可照做的规则属于 `DESIGN.md`（`idea-loop:design-modeling`）。一条内容两边都像时，按 design-modeling 的「准入分层表」落。

## 图的实体

节点是页面状态，边是状态之间的一次触发；组件、动效、用户路径是可引用对象，不进图的拓扑。每个实体一份文件（边除外，它写在出发状态的文件里），文件之间用带引号的 wikilink 引用。

### 页面（`design-page`）

一个页面是一个目录，每个状态一份文件。页面文件挂入口代码 `code`，用 `regions` 记「哪个区域用哪个组件」；它的状态由带这个页面前缀的文件决定，页面文件里不列。

### 状态（`design-state`）：图上唯一的节点

页面在某一刻的完整一屏，已经包含其中每个组件当时的样子。组件自己的状态不单独建模：「播放按钮在下载中」就是「某页 · 题位下载中」这一屏的一部分。状态文件挂所属 `page`、这一屏用到的 `components`、常驻的 `motions`，出边写在 `edges` 里。

- **入口节点**：用户能直接打开的状态，写 `entry`（`url` 加 `preconditions`：账号、数据、开关）。
- 这一屏发起了异步动作的，写 `async`（`loading` / `failure` / `empty`）。
- 正文只有「这一屏」和「应看到什么」两节。

### 边

从一个状态到另一个状态的一次触发，只写在出发状态里，`id` 在本状态内唯一。两类：

- **用户行为**（`kind: user`）：在某个组件上做某个操作。引用这个组件，用 ARIA 角色和名字定位它（`locate`），写出操作（`action`）。
- **系统行为**（`kind: system`）：不经过组件的变化（2 秒后、请求失败、轮询发现完成）。写触发条件（`trigger`）和怎么让它发生（`how`：拦哪个请求、等多久）。

任一边可挂 `motion`（切换时怎么动）和 `when`（一句话的条件：同一个操作按环境去不同状态时，拆成几条边各写）。**跨页跳转也是边**：A 页的某个状态连到 B 页的某个状态。

`blocked`（`missing` 缺什么前置条件，`tried` 试过哪些用户路径）表示这条边在真实应用里走不通；带它的边不参与进入方式的推导，也不算让目标状态可达。

### 分段：长页面入口状态的空间组成

状态是时间维度，分段是空间维度。滚动容器（文档自己在滚就是文档；应用外壳里内容在内层容器滚就是那个容器）的内容比它的可见区高时，入口状态声明 `sections`，每段有 `id`、`locate` 和图；钉在视口里随滚动换内容的段再写 `scrollDriven: true`（只能写 `true`）。

- 分段**不是节点**：往下滚不改状态，可达、进入方式、用户路径都只看状态和边。
- `sections` 只写在入口状态，一页只由一个入口状态声明。
- 边的 `from` 是从本页哪一段出发，`section` 是落到目标状态的哪一段；页内锚点是入口状态的自环加落点段；段内交互（FAQ 展开、切标签）是页面的另一个状态，状态写它在哪一段（`section`）。
- 引用写 `<页面>#<段>` 全称（如 `mkt-pricing#faq`），**写成普通字符串，不写 wikilink**：`"[[页面#段]]"` 在 Obsidian 里指「页面文件里名叫『段』的标题」，校验读不出它是不是声明过的段；分段不占 basename 的唯一性。

### 组件（`design-component`）

一个前端组件是一份组件文件，挂代码路径 `code`。**每个代码组件都单独存**，不论几个页面用；展示类组件同样存档，只是不出现在边上。页面只记哪个区域用哪个组件。`usedBy`（派生）是使用它的页面列表。

档案组件和 `DESIGN.md` 的基础件是两层：基础件（按钮、输入框）的配方在 `DESIGN.md` 的 Components 章；档案组件是代码里的具体组件，用 `tokens` 引用基础件或 token，不重抄配方。

### 动效（`design-motion`）

每个具体动效一份文件，写参数与理由。边引用的是「切换时怎么动」，状态引用的是「这一屏常驻的动」。具体动效只落在档案里，`DESIGN.md` 的 Motion 章只收全局原则。`usedBy`（派生）同组件。

### 用户路径（`design-journey`）

有名字的一串状态（`path`），表达一个关键用户意图（`intent`），可以跨页面。它只表达意图，进入方式从图推导；相邻两状态间有多条边时用 `via` 指定。

## 目录与命名

```
docs/design/
├── tmp/<spec-slug>/{imagine,canvas,delta}/   过程只在本地
└── prod/
    ├── index.md                              生成；frontmatter 里定主视口 / 主题 / 语言 / 动效模式，多前端的项目还有工作区前缀
    ├── pages/<page>/<page>.md                页面
    ├── pages/<page>/<page>--<state>.md       页面状态 = 图上唯一的节点
    ├── components/<Component>/<Component>.md 代码组件
    ├── motions/<motion>.md                   具体动效
    └── journeys/<journey>.md                 用户路径
```

- **状态文件名带页面前缀**（`<page>--<state>`）：wikilink 按 basename 解析，不同页面都有 `loading` 时靠前缀区分。项目有不止一个前端时，**组件文件名一律带工作区前缀**（`mkt-SiteFooter`、`app-SiteFooter`），前缀在 `prod/index.md` 的 `workspaces` 里声明，校验认它。
- **basename 在 `docs/` 下全局唯一**（`idea-loop:wiki-conventions` 的「slug 与链接」），由校验查。
- 素材（状态截图、动效 GIF）走 Git LFS，目标仓库的 `.gitattributes` 管 `docs/design/prod/**/assets/`。
- `tmp/<spec-slug>/` 的生命周期见 `idea-loop:wiki-conventions` 的「目录」。**冻结之后 `canvas/` 是唯一的设计真相**：设计变了由 designer 改画布并记进冻结记录的「冻结后的变更」（`idea-loop:uiux-refine`），不改 `delta/`；`delta/` 只在合并前由 ui-reviewer 的归档模式从最终画布加实现整份写出。没有设计稿的 UI 改动没有画布，实现者在 `delta/` 记「最小差异」，那就是它唯一的设计真相。
- **`delta/` 与 `prod/` 同构**：新增或改动的对象放它改完之后的**全文**（路径与 `prod/` 里相同）；删除的对象 id 列在 `delta/removed.md`，一行 `- [[<id>]]`（后面可跟一句原因）。
- **`prod/` 只由归档脚本在人批过之后写**；agent 只写 `tmp/<spec-slug>/delta/`。
- `docs/design/` 下 `tmp/`、`prod/`、`index.md` 以外的目录是旧布局的冻结记录：校验对每个只打一条建议删的提示，不算违规。

## 进入方式从图上推导

- 只有**入口节点**写 `entry`（地址 + 前置条件）；边写怎么触发；每个状态写「应看到什么」。
- 任一状态的进入方式 = **从某个入口节点到它的最短路径**（跳过 `blocked` 的边）：入口地址与前置条件、沿途每条边的定位与操作（或怎么让系统行为发生）、终点的「应看到什么」。查询的 `state` 入口给出它。
- **进不去** = 没有这样的路径，但某条入边写了 `blocked`；查询返回每条 `blocked` 边的「缺什么 + 试过什么」。**既没有路径、入边上也没写 `blocked`，是校验错误**：漏写前置条件本身就是漂移。
- 进不去的状态的后继，同样要满足这条：要么另有路径，要么自己的入边写了 `blocked`。

## 按需读

| 要做什么 | 读 |
|---|---|
| 写一个对象文件 | [references/writing.md](references/writing.md)：完整的 frontmatter 示例与必填字段、分段的 `id` 与 `locate`、正文、建模的取舍、截图矩阵与 `prod/index.md` 的设置键 |
| 拍档案截图 | [references/sections.md](references/sections.md) |
| 查档案 | MCP 工具 `design_*`（用法以工具的 description 为准）；命令行、退出码与返回字段在 [references/query.md](references/query.md) |
| 校验 | [references/check.md](references/check.md)：命令、退出码、规则表、「写完 `delta/` 的标志」 |
| 归档 | [references/archive-script.md](references/archive-script.md) |
