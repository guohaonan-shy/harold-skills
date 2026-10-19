# 设计档案：`docs/design/prod/` 的结构

目标项目的 `docs/design/prod/` 是一张图，记录**线上现在的样子**：每个页面有哪些状态、状态之间怎么跳、用到哪些组件和动效、当初为什么这样定。这份 reference 回答：图由什么组成、文件怎么放、每份文件的 frontmatter 和正文写什么、怎么校验。读档案、写档案、查档案的 skill 与 agent 都以它为准。

> 与 `DESIGN.md` 的分工：`DESIGN.md` 是**设计系统本身**（全局、无页面名、可照做的规则，见 `design-md.md`）；档案是**每个页面、组件、动效的现状与决定**。一条内容两边都像时，按 `design-md.md` §7 的分层表落。

## 1 图的模型

- **节点 = 页面状态**：一个页面在某一刻的完整一屏，已经包含其中每个组件当时的样子。组件自己的状态不单独建模——「播放按钮在下载中」就是「某页 · 题位下载中」这一屏的一部分。
- **边 = 从一个状态到另一个状态的一次触发**，两类：
  - **用户行为**（`kind: user`）：在某个组件上做某个操作。边上引用这个组件，并用 ARIA 角色和名字定位它（`locate`），写出操作（`action`）。
  - **系统行为**（`kind: system`）：不经过组件的变化（2 秒后、请求失败、轮询发现完成）。边上写触发条件（`trigger`）和怎么让它发生（`how`：拦哪个请求、等多久）。
- **跨页跳转也是边**：A 页的某个状态连到 B 页的某个状态。页面文件不描述跳转，边只写在状态文件里。
- **可引用对象**——节点和边用 wikilink 引用，它们本身不进图的拓扑：
  - **组件**：一个前端组件 = 一份组件文件，挂代码路径。**每个代码组件都单独存**，不论几个页面用；页面只记「哪个区域用哪个组件」。展示类组件同样存档，只是不出现在边上。
  - **动效**：每个具体动效一份文件，写参数与理由。边引用的是「切换时怎么动」，节点引用的是「这一屏常驻的动」（加载转圈）。**具体动效只落在档案里**，不进 `DESIGN.md`；`DESIGN.md` 的 Motion 章只收全局原则。
  - **用户路径**：有名字的一串状态，表达一个关键用户意图，可以跨页面。它只表达意图，**不承担「怎么进状态」**——进入方式从图推导（§5）。
- **组件和 `DESIGN.md` 的基础件是两层**：基础件（按钮、输入框）的配方在 `DESIGN.md` 的 Components 章；档案组件是代码里的具体组件，可以引用基础件的 token（`tokens` 字段），不重抄配方。

## 2 目录与分工

```
docs/design/
├── tmp/<spec-slug>/{imagine,canvas,delta}/   只在本地，不进 git
└── prod/
    ├── index.md                              生成；frontmatter 里定主视口 / 主题 / 语言
    ├── pages/<page>/<page>.md                页面
    ├── pages/<page>/<page>--<state>.md       页面状态 = 图上唯一的节点
    ├── components/<Component>/<Component>.md 代码组件（每个组件都单独一份）
    ├── motions/<motion>.md                   具体动效
    └── journeys/<journey>.md                 用户路径
```

- 各对象可带同目录的 `assets/`（状态截图、动效 GIF、交互图 `flows/`）。
- **页面是目录，每个状态一份文件**：状态若只是页面文件里的一节，页面内的流转在 Obsidian 图上全变成自环。**状态文件名带页面前缀**（`<page>--<state>`），因为 wikilink 按 basename 解析，不同页面都有 `loading` 时靠前缀区分。组件文件用代码组件名。
- **basename 在 `docs/` 下全局唯一**（`wiki-conventions.md` §4），由校验查；工单文件与 `index.md` 豁免。
- **`tmp/` 与 `prod/` 的分工**：`tmp/<spec-slug>/` 放进行中需求的全部设计过程产物（`imagine/` 方向说明、`canvas/` 画布与冻结记录与完整验收矩阵、`delta/` 对 `prod/` 的差异），只在本地，目标项目要把它排除出 git；`prod/` 放线上现在的样子，提交。放弃的需求不上线，有价值的结论写回 spec 或 issue。
- **`delta/` 与 `prod/` 同构**：新增或改动的对象放它改完之后的**全文**（路径与 `prod/` 里相同）；删除的对象 id 列在 `delta/removed.md`，一行一条，`- [[<id>]]`（后面可跟一句原因）。于是归档 = 覆盖 + 删除，需求差异 = 逐个对象比对，都不用解析补丁格式。
- **`prod/` 只存精简矩阵**：每个状态一张主视口截图（主视口、主题、语言写在 `prod/index.md` 的 frontmatter，项目定一次），每个有动效的边或节点一张 GIF。完整矩阵（主题 × 视口 × 语言 × 动效偏好）只在 `tmp/<spec-slug>/canvas/`，随 `tmp/` 清掉。截图是派生物，随时可重拍。
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
edges:
  - id: search                    # 在本状态内唯一
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[SearchBox]]"
    locate: { role: searchbox, name: 搜索菜谱 }
    action: 输入关键词并回车
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

- `user` 边必有 `component`、`locate`（`role` + `name`）、`action`；`system` 边必有 `trigger`、`how`；任一边可有 `motion`。
- `blocked` 表示这条边在真实应用里走不通：`missing` 写缺什么前置条件，`tried` 列试过哪些用户路径。带 `blocked` 的边不参与「进入方式」的推导，也不算让目标状态可达。
- `async` 三项各是一个状态引用，或字符串「不适用」。

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

**`usedBy` 由归档脚本反向生成，不手写**：它是使用这个组件 / 动效的**页面**列表。页面用组件 = 它的某个 `regions` 写了它，或它的某个状态在 `components` 里列了它，或它的某条边经过它；页面用动效 = 它的某个状态在 `motions` 里列了它，或它的某条边的 `motion` 是它。只有一个页面用也生成。

## 4 正文

- **状态文件**只有两节：「这一屏」（描述，加截图 / GIF）和「应看到什么」（可判定的几条，进状态之后拿它核对）。**状态文件不写决定。**
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
node scripts/design-archive-check.mjs <仓库根> [--delta <spec-slug>] [--json]
```

退出码 0 = 通过，1 = 有违规（逐条指名文件与字段），2 = 用法错误或不是仓库根。`--delta` 把 `tmp/<spec-slug>/delta/` 叠到 `prod/` 上（同 id 的对象以 `delta/` 为准，按 `removed.md` 去掉对象），再判叠完之后的样子。

| 规则 | 判什么 |
|---|---|
| 1 可达 | 每个状态能从某个入口节点沿边（不走 `blocked` 边）到达，或它的某条入边带 `blocked` |
| 2 async | 有 `async` 的状态三项写全，各是存在的状态或「不适用」 |
| 3 引用 | 所有 wikilink 能解析；边的 `component` 指向组件、`motion` 指向动效，`to` 指向状态，状态的 `page` 指向页面；`docs/` 下 basename 不重复 |
| 4 用户路径 | `path` 相邻两个状态之间有边；有多条时写了 `via`，且 `via` 是其中一条的 id |
| 5 决定与候选 | 状态文件没有「决定」；其余对象两节都在，每条决定三项齐全，每条候选三项齐全 |
| 6 动效 | 字面值的 `duration` / `easing` 都带 `deviates`；`usedBy` 与反向引用一致（字段缺失视为未生成，照样报出来） |
| 0 结构 | 读不出的文件、不认识的 `type`、规则依赖的必填字段（边的 `id` / `to` / `kind`，`user` 边的 `component` / `locate` / `action`，`system` 边的 `trigger` / `how`，`blocked` 的 `missing` / `tried`，入口的 `url` 等） |

## 7 解析模块

`scripts/design-archive.mjs` 的 `loadArchive(root, { delta })` 读一个仓库根，返回所有对象（`objects`，按 id 索引，带 `kind` / `fm` / `body` / `file`）、规范化过的边（`edges`）、全部 wikilink（`refs`）、`docs/` 的文件表（`files`）、`prod/index.md` 的 frontmatter（`index`）、读不出的文件（`problems`）、旧布局目录（`legacy`）和叠 `delta/` 时的差异清单（`delta.added` / `changed` / `removed`）。同一个文件还导出读图的函数（`statesOfPage` / `outgoingEdges` / `incomingEdges` / `computeUsedBy`）、正文分节与决定、候选的解析（`section` / `parseDecisions` / `parseCandidates`）。校验、查询模块、MCP 包装、归档脚本都建在这一层上，不各自重读文件。
