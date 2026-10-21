---
name: design-archive
description: 设计档案（docs/design/prod/）的结构、校验、查询与归档。写档案对象、查某个页面或状态的现状、跑档案校验或归档时用。
---

目标项目的 `docs/design/prod/` 是一张图，记录**线上现在的样子**：每个页面有哪些状态、状态之间怎么跳、用到哪些组件和动效、当初为什么这样定。读、写、查档案都以这一份为准。

## 图的模型

档案收的是**每个页面、组件、动效的现状与决定**；全局、无页面名、可照做的规则属于 `DESIGN.md`（`idea-loop:design-modeling`）。一条内容两边都像时，按 design-modeling 的「准入分层表」落。

- **节点 = 页面状态**：一个页面在某一刻的完整一屏，已经包含其中每个组件当时的样子。组件自己的状态不单独建模——「播放按钮在下载中」就是「某页 · 题位下载中」这一屏的一部分。
- **边 = 从一个状态到另一个状态的一次触发**，两类：
  - **用户行为**（`kind: user`）：在某个组件上做某个操作。边上引用这个组件，用 ARIA 角色和名字定位它（`locate`），写出操作（`action`）。
  - **系统行为**（`kind: system`）：不经过组件的变化（2 秒后、请求失败、轮询发现完成）。边上写触发条件（`trigger`）和怎么让它发生（`how`：拦哪个请求、等多久）。
- **跨页跳转也是边**：A 页的某个状态连到 B 页的某个状态。边只写在状态文件里。
- **分段 = 长页面的入口状态在空间上的组成部分**：状态是时间维度，分段是空间维度。页面的滚动高度大于主视口时，入口状态声明 `sections`，每段有图。分段**不是节点**，不进图的拓扑：往下滚不改状态，可达、进入方式、用户路径都照旧只看状态和边。边写从本页哪一段出发（`from`）、落到目标状态的哪一段（`section`）；页内锚点是入口状态的自环加落点段；段内的交互（FAQ 展开、切标签）仍是页面的另一个状态，状态写它在哪一段（`section`）。写法、校验规则 7 和每段怎么拍，读 [references/sections.md](references/sections.md)。
- **可引用对象**——节点和边用 wikilink 引用，它们本身不进图的拓扑：
  - **组件**：一个前端组件 = 一份组件文件，挂代码路径。**每个代码组件都单独存**，不论几个页面用；页面只记「哪个区域用哪个组件」。展示类组件同样存档，只是不出现在边上。
  - **动效**：每个具体动效一份文件，写参数与理由。边引用的是「切换时怎么动」，节点引用的是「这一屏常驻的动」（加载转圈）。具体动效只落在档案里；`DESIGN.md` 的 Motion 章只收全局原则。
  - **用户路径**：有名字的一串状态，表达一个关键用户意图，可以跨页面。它只表达意图；进入方式从图推导（「进入方式从图上推导」）。
- **档案组件和 `DESIGN.md` 的基础件是两层**：基础件（按钮、输入框）的配方在 `DESIGN.md` 的 Components 章；档案组件是代码里的具体组件，用 `tokens` 字段引用基础件或 token，不重抄配方。

### 建模的取舍

写档案时遇到下面这些情形，照这里定：

- **结构相同的多项只记一个代表**：一段里有几个结构相同的项（场景、FAQ 条目、卡片、目录项），截图、状态、边都只记第一个，其余在状态文件里一句话说明「还有 N 个同样的」。指向这些项的目录一类入口也只留第一条边。
- **入口是加载中**：页面一打开就发请求的，入口状态是「加载中」（拦住那条请求停在这一屏），加载完、加载失败各用一条 `system` 边连出去，`async` 写在加载中的状态上。回到这个页面的边都指向加载中。
- **组件自己的指示状态不建成页面状态**：计时器变色、字数变色、进度条走到哪里这类，写在组件文件里。页面状态只在出现了新一屏时建：默认状态加有内容的状态，然后沿提交 / 退出的流程往后走。
- **公共组件的交互状态只在一个代表页上记**：顶栏菜单、页脚这类多页共用的组件，展开菜单之类的状态只在一个页面上建，组件文件里写在哪一页记了。
- **站外链接、其他语言版本的链接不画成边**：边只连档案里的状态。在页面文件里列一节「站外链接」（链接文字加去向）。
- **同一个文件里没导出的内部组件、不画东西的组件**（布局壳、`<head>` 之类）不单独存，写在所属组件或页面文件里；整页写在一个文件里、没有拆出子组件的，这个文件本身就是那个组件。
- **`async` 的 `failure` 可以指向别的页面的状态**：加载失败后页面跳去别处，failure 就写那一页的状态。
- **边的条件**：同一个操作按环境去不同状态时（麦克风被拒 / 已授权），拆成几条边，各写 `when`（一句话的条件）；去向取决于浏览历史的「返回上一页」，`to` 写走到这一步的那条路径上的目标，`when` 写「从 X 进来时」。

## 目录与分工

```
docs/design/
├── tmp/<spec-slug>/{imagine,canvas,delta}/   过程只在本地；冻结结果经设计 PR 提交，归档时清掉
└── prod/
    ├── index.md                              生成；frontmatter 里定主视口 / 主题 / 语言 / 动效模式，多前端的项目还有工作区前缀
    ├── pages/<page>/<page>.md                页面
    ├── pages/<page>/<page>--<state>.md       页面状态 = 图上唯一的节点
    ├── components/<Component>/<Component>.md 代码组件（每个组件都单独一份）
    ├── motions/<motion>.md                   具体动效
    └── journeys/<journey>.md                 用户路径
```

- 各对象可带同目录的 `assets/`（状态截图、动效 GIF、交互图 `flows/`）。
- **页面是目录，每个状态一份文件。状态文件名带页面前缀**（`<page>--<state>`）：wikilink 按 basename 解析，不同页面都有 `loading` 时靠前缀区分。组件文件用代码组件名；**项目有不止一个前端时，组件文件名一律带工作区前缀**（`mkt-SiteFooter`、`app-SiteFooter`：两个前端各有一个同名的页脚，basename 就撞了），前缀在 `prod/index.md` 的 `workspaces` 里声明，校验认它。
- **basename 在 `docs/` 下全局唯一**（`idea-loop:wiki-conventions` 的「slug 与链接」），由校验查；工单文件与 `index.md` 豁免。
- **`tmp/<spec-slug>/`** 放进行中需求的全部设计过程产物：`imagine/` 方向说明，`canvas/` 画布、冻结记录与完整验收矩阵，`delta/` 对 `prod/` 的差异。目标项目把 `tmp/` 排除出 git；冻结时，签字的画布、冻结记录、交互图和 `delta/` 经设计 PR 用 `git add -f` 提交进主分支，实现从主分支开 worktree 就拿得到。放弃的需求不上线，有价值的结论写回 spec 或 issue。
- **`delta/` 与 `prod/` 同构**：新增或改动的对象放它改完之后的**全文**（路径与 `prod/` 里相同）；删除的对象 id 列在 `delta/removed.md`，一行一条，`- [[<id>]]`（后面可跟一句原因）。归档 = 覆盖 + 删除。
- **`prod/` 只存精简矩阵**：每个状态一张主视口截图（设置写在 `prod/index.md` 的 frontmatter，见下面「`prod/index.md` 的设置键」）。长页面的入口状态改成每段一张图，叫 `<入口状态 id>@<段 id>.png`，放入口状态同目录的 `assets/`；段内交互的状态只拍那一段，截图照旧叫状态自己的名字。每个有动效的边或节点一张 GIF。完整矩阵（主题 × 视口 × 语言 × 动效偏好）只在 `tmp/<spec-slug>/canvas/`，随 `tmp/` 清掉。截图是派生物，随时可重拍。
- **素材走 Git LFS**：目标仓库的 `.gitattributes` 管 `docs/design/prod/**/assets/` 下的 png / gif / webm。
- **写档案只写 `tmp/<spec-slug>/delta/`**；`prod/` 只由归档脚本在人批过之后写（「归档」）。
- `docs/design/` 下 `tmp/`、`prod/`、`index.md` 以外的目录是旧布局的冻结记录：校验对每个只打一条建议删的提示，不算违规。

## frontmatter

每份对象文件照 `idea-loop:wiki-conventions` 的「frontmatter」带 `type` / `tags` / `summary`，再加各自的结构字段。**引用一律写成带引号的 `"[[basename]]"` 字符串**，`{token}` 形式的 token 引用同样加引号。

**页面** `type: design-page`

```yaml
code: [<页面入口代码路径>]
regions:                          # 区域 → 组件
  - { name: 工具栏, component: "[[NavBar]]" }
```

页面的状态由带这个页面前缀的文件决定，页面文件里不列。

**状态（节点）** `type: design-state`

```yaml
page: "[[cookbook]]"
entry:                            # 只有入口节点有
  url: /cookbook
  preconditions: { account: 已登录的测试账号, data: 至少 3 份已保存菜谱 }   # 账号 / 数据 / 开关，自由键值
components: ["[[RecipeCard]]"]    # 可选：这一屏要特别说明的组件
motions: ["[[spinner-ring]]"]     # 可选：这一屏常驻的动效
sections:                         # 只有入口节点写，且只在页面比主视口高时写；自上而下
  - { id: header, locate: { role: banner } }
  - { id: faq, locate: { role: heading, name: 常见问题 } }
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

- `user` 边必有 `component`、`locate`、`action`；`system` 边必有 `trigger`、`how`；任一边可有 `motion`、`when`。`locate` 写 `role` + `name`；按角色 + 名字定位不到的元素（例如原生折叠标题 `<summary>`）才改写成 `{ text: <完整文字> }`，两种不混写。
- `sections`、`from`、`section` 只在长页面上出现，单屏页面都不写。
- `blocked` 表示这条边在真实应用里走不通：`missing` 写缺什么前置条件，`tried` 列试过哪些用户路径。带 `blocked` 的边不参与进入方式的推导，也不算让目标状态可达。
- `async` 三项各是一个状态引用，或字符串「不适用」；引用的状态可以在别的页面。

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

**`prod/index.md` 的设置键**（项目定一次，归档脚本原样保留）：`viewport`（如 `1440x900`）、`theme`（`light` / `dark`）、`locale`、`motion`（`default` 是默认动效、拍之前把整页滚一遍让内容出现，`reduce` 是减少动效；不写是 `default`）、`workspaces`（可选：项目有不止一个前端时，组件文件名的工作区前缀列表，如 `[mkt, app]`）。

**`usedBy` 由归档脚本反向生成，写 `delta/` 时留着不动**：它是使用这个组件 / 动效的**页面**列表。页面用组件 = 它的某个 `regions` 写了它，或它的某个状态在 `components` 里列了它，或它的某条边经过它；页面用动效 = 它的某个状态在 `motions` 里列了它，或它的某条边的 `motion` 是它。只有一个页面用也生成。

## 正文

- **状态文件**只有两节：「这一屏」（描述，加截图 / GIF；有分段的入口状态按段排开）和「应看到什么」（可判定的几条，进状态之后拿它核对）。决定写在页面、组件、动效、用户路径文件里。
- **页面、组件、动效、用户路径文件**的正文有两个固定二级标题：「## 决定」与「## 设计法候选」。没有内容时各写一行「无」：空着分不清是没有还是漏了。
- **「决定」按编号写**，每条：

  ```markdown
  ### 决定 2：对勾用 ease-out-sine 写出来，不用站内默认曲线
  规则一两句。
  - 为什么：（必填）
  - 否掉过：（必填，写被否的做法和理由；确实没有备选写「无」）
  - 来源：[[<spec-slug>]]
  ```

  不写日期；规则改了**原地改写**，编号不复用。蒸馏成 ADR 之后「来源」改链到 ADR。
- **「设计法候选」**每条的形状照 `idea-loop:design-modeling` 的「设计法候选的形态」：一句规则，下挂「并进」「为什么」「证据」三项。校验只看三项都在。

## 进入方式从图上推导

- 只有**入口节点**写 `entry`（地址 + 前置条件）；边写怎么触发；每个状态写「应看到什么」。
- 任一状态的进入方式 = **从某个入口节点到它的最短路径**（跳过 `blocked` 的边）：入口地址与前置条件、沿途每条边的定位与操作（或怎么让系统行为发生）、终点的「应看到什么」。查询的 `state` 入口给出它。
- **进不去** = 没有这样的路径，但某条入边写了 `blocked`；查询返回每条 `blocked` 边的「缺什么 + 试过什么」。**既没有路径、入边上也没写 `blocked`，是校验错误**：漏写前置条件本身就是漂移。
- 进不去的状态的后继，同样要满足这条：要么另有路径，要么自己的入边写了 `blocked`。

## 校验

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-check.mjs" <仓库根> [--delta <spec-slug>] [--no-used-by] [--workspaces <前缀,前缀>] [--json]
```

退出码 0 = 通过（可以带「提示」），1 = 有违规（逐条指名文件与字段），2 = 用法错误或不是仓库根。`--delta` 把 `tmp/<spec-slug>/delta/` 叠到 `prod/` 上（同 id 的对象以 `delta/` 为准，按 `removed.md` 去掉对象），判叠完之后的样子。`--no-used-by` 跳过规则 6 里 `usedBy` 那一半。`--workspaces mkt,app` 把组件文件名的工作区前缀交给校验（初扫时 `prod/index.md` 还不存在，没处声明）。

**写完 `delta/` 的标志**：`--delta <spec-slug> --no-used-by` 退出码 0。

| 规则 | 判什么 |
|---|---|
| 1 可达 | 每个状态能从某个入口节点沿边（不走 `blocked` 边）到达，或它的某条入边带 `blocked` |
| 2 async | 有 `async` 的状态三项写全，各是存在的状态或「不适用」 |
| 3 引用 | 所有 wikilink 能解析；边的 `component` 指向组件、`motion` 指向动效，`to` 指向状态，状态的 `page` 指向页面；`docs/` 下 basename 不重复 |
| 4 用户路径 | `path` 相邻两个状态之间有边；有多条时写了 `via`，且 `via` 是其中一条的 id |
| 5 决定与候选 | 状态文件没有「决定」；其余对象两节都在，每条决定三项齐全，每条候选三项齐全 |
| 6 动效 | 字面值的 `duration` / `easing` 都带 `deviates`；`usedBy` 与反向引用一致（字段缺失视为未生成，照样报出来） |
| 7 分段 | 分段的类型、`id` 写法、定位形状，边的 `from` / `section` 与状态的 `section` 指向声明过的段（逐条见 [references/sections.md](references/sections.md)「校验规则 7」） |
| 0 结构 | 读不出的文件、不认识的 `type`、规则依赖的必填字段（边的 `id` / `to` / `kind`，`user` 边的 `component` / `locate`（`role` + `name`，或只有 `text`）/ `action`，`system` 边的 `trigger` / `how`，`blocked` 的 `missing` / `tried`，入口的 `url` 等）、写了就不能为空的 `when`；`prod/index.md` 声明了 `workspaces` 时，每个组件文件名要带其中一个前缀 |

## 查询模块

读档案用查询，不自己翻文件。六个入口，每个都能用 `--delta <spec-slug>` 叠上某个需求的 `delta/`，读改完之后的样子（`diff` 除外）：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-query.mjs" <仓库根> <入口> <参数> [--delta <spec-slug>]
```

| 入口 | 参数 | 问的是 |
|---|---|---|
| `page` | 页面名 | 这一页的区域、组件、动效、分段、全部状态与进出的边、经过它的用户路径、相关的决定与候选 |
| `state` | 状态名 | 怎么进这个状态、进去之后应看到什么 |
| `journey` | 用户路径名 | 这条路径一步步怎么走、每步应看到什么 |
| `diff` | spec 名 | 这个需求的 `delta/` 相对 `prod/` 新增、改动、删除了什么 |
| `refs` | 组件名、组件代码路径、动效名；或分段 `<页面>#<段>`；或一类分段 `#<类型>` | 谁用了它：边、状态、用户路径、页面；分段给出从这段出发和落到这段的边；一类分段列出所有页面里这一类的段 |
| `keyword` | 一段文字 | 名字、summary、正文里含这些词的对象 |

同样的六个入口也是只读 MCP 工具 `design_page` / `design_state` / `design_journey` / `design_diff` / `design_refs` / `design_keyword`，返回同一份 JSON。

退出码：名字对不上时 1，stderr 说清这个名字其实是别的类型的对象（「`NavBar` 是组件，不是页面」），或这一类现有哪些对象（分段对不上时列出这一页现有的段）；`keyword` 一条都没命中同样是 1。用法错误、不是仓库根、`diff` 带了 `--delta` 是 2。

要读返回的具体字段（进入方式的 `reachable` / `steps` / `blocked`、`diff` 的 `fields` / `sections`、`keyword` 的排序）时，读 [references/query.md](references/query.md)。

## 归档

`prod/` 只经这一个脚本写：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <仓库根> <spec-slug> [--dry-run] [--json]
```

退出码 0 = 已归档（`--dry-run` 时是「可以归档」），1 = 拒绝（逐条列出违规或冲突，**什么都没写**），2 = 用法错误或 `tmp/<spec-slug>/` 不存在。它把 `delta/` 叠上 `prod/` 校验，覆盖与删除对象，重算 `usedBy` 和 `prod/index.md`，把交互图挪进 `prod/` 并改 spec 里的链接，提示目标仓库缺的 Git LFS / `.gitignore` 配置，最后清空 `tmp/<spec-slug>/`；任何一步不过，什么都不动。拒绝原因看不懂、或要核对它挪了什么时，读 [references/archive-script.md](references/archive-script.md)。

不带 `--dry-run` 的归档只在合并前、UI 审查者的归档草稿经人批过之后跑（`idea-loop:pr-review` 的「合并前归档」）；写 `delta/` 的 agent 自检只跑 `--dry-run`。插件的合并前钩子（`merge-gate-hook.mjs`）在这次合并负责的需求还有未归档的 `tmp/` 目录时拦下 `gh pr merge`，并给出归档命令；只有 `research/` 的目录不算。
