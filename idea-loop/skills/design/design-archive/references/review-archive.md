# UI 审查：归档模式

`idea-loop:ui-reviewer` 以「归档」模式被起时读（合并前归档，或 dreaming 的补归档）。输入、写的范围、起服务、抢锁、逐个状态进去这些共用的步骤在它自己的定义里；这里是归档模式独有的：核过之后整份写出 `delta/`、写草稿给人看。

最终画布（`canvas/` 里签字、冻结后改过的那一版）是设计的唯一真相：这一档案差异 `delta/` 不是冻结时留下的，是你在合并前对着画布和实现**整份写出**的。

**第一步：核。** 照你定义里的「共用的步骤」走一遍，判通过与否。

**清单与进入方式**，看 `delta/` 在不在：

- **不在**（冻结不再写 `delta/` 之后的需求）：状态清单取冻结记录 `canvas/<spec-slug>-design.md` 的状态矩阵里每一格的状态名（画布 `?state=` 的名字就是状态名），加上「冻结后的变更」一节里新增的格，记录里没有这一节就跳过。进入方式：`prod/` 里已有的状态照 `query <集成 worktree> state <状态名>`；`prod/` 里没有的新状态，从 spec 写的入口和 `prod/` 里已有的边出发，在真实应用里自己找路，找不到记「进不去」，附上试过什么。每走通一跳都记下：出发状态、操作的元素（`role` + `name`，读自真实 DOM 的可访问树）、到的状态；第二步写 `edges` 用它们。`check` 这一步不跑（还没有 `delta/`），放到第二步自检。
- **在**（已按旧流程冻结、`delta/` 已经提交的需求）：照定义里「共用的步骤」第 2、5、6 步用 `query … diff` 与 `query … state … --delta` 取清单与进入方式，`check … --delta … --no-used-by` 在这里就跑；它是第二步的草稿，不要求重来。

**通过的条件**：

- 任何要核的状态进不去而档案又没解释、任何边走不通、任何冻结画布比对不过、`delta/` 已存在时 `check … --delta … --no-used-by` 有违规，**都不通过**。
- 只剩标了「人看」的格、没有失败，算通过。
- 不通过：`delta/` 不动，不拍精简矩阵。把失败写成 `.tmp/pr-review/<PR 号>/archive/failed.json`（形状同每轮走查的发现文件，每条带取自实现的截图；`check` 的违规逐条写进去），交回 `status: failed`，一句话说最要紧的是什么。

**第二步：通过之后整份写出**，都写在 `docs/design/tmp/<spec-slug>/delta/` 里，与 `prod/` 同构。档案里只写你在实现上核过的东西。`delta/` 已经存在时当草稿接着改：对着最终画布和实现把不对的改对、缺的补上，别人写的对的部分保留，不推倒重来。

1. **写结构**：每个新增或改动的对象放一份改完之后的全文，没动的不放；路径与 `prod/` 里相同。
   - **状态** `delta/pages/<page>/<page>--<state>.md`：frontmatter 写 `page`，入口状态的 `entry`（地址与前置条件取自 spec；spec 没写的列进交回的「入口待补」和草稿的「待你定」），可选的 `components` / `motions`，`edges`，发起了异步动作的写全 `async`。
   - **边**：`user` 边的 `locate`（`role` + `name`）取自第一步记下的真实 DOM；`system` 边写 `trigger` 与 `how`（在真应用里怎么让它发生：拦哪个请求、等多久，照你核的时候实际做的）。走不通的边带 `blocked`（`missing` + `tried`）。
   - **页面** `delta/pages/<page>/<page>.md`（新页面，或区域、代码变了）、**组件** `delta/components/<Component>/<Component>.md`（画布碰到的每个代码组件，`code` 取自 spec 或项目里同名组件）、**动效** `delta/motions/<motion>.md`（签过字的每条新动效：`duration` / `easing` 引用 token，字面值要写 `deviates`；`properties`、`iterations`、`reducedMotion`）、**用户路径**（spec 写了关键用户意图才写）。
   - **删除**的对象 id 列进 `delta/removed.md`，一行 `- [[<id>]] —— 原因`；`usedBy` 由归档脚本生成，不写。
   - **长页面**（滚动容器的内容比它的可见区高）的入口状态照 `idea-loop:design-archive` 的「图的实体」「写对象文件」写 `sections` 与边的 `from`；下面第 2 步按它拍图。
2. **重拍精简矩阵**：每个新增或改动的状态拍一张主视口截图（主视口、主题、语言、动效模式取 `prod/index.md` 的 frontmatter；没定就取画布矩阵的默认格并在交回里说明），放进它所在对象的 `assets/`。拍之前关掉开发服务器的调试浮层（框架的开发工具条、错误浮层），不然它们进每张图。
   - **长页面的入口状态**（滚动容器的内容比它的可见区高）**按段拍**，照 `idea-loop:design-archive` 的「拍档案截图」的「长页面的入口状态」：没声明分段的先在 `delta/` 的状态文件里补上；`measure` 带 `--delta <spec-slug>`；`prod/index.md` 还没定视口或主题时，`time`、`measure` 带 `--viewport` 与 `--theme`，值取画布矩阵的默认格。`attribute` 给出每条 `user` 边的 `from`，和哪些元素要写 `{ text }` 定位。**只放改了的段**：逐段用 `ui-png-compare.mjs` 比 `prod/` 里的那一段，容差内的段不放进 `delta/`。段内交互的状态照「段内交互的状态」只拍那一段；`attribute` 因为 `undeclaredScrollDriven` 退出码 1 的段，照「滚动驱动的段」补 `scrollDriven: true`、建段内状态、用 `pinned` 拍。`uncontrolled`、`heightDrift` 一类输出照该参考的「看到什么 → 做什么」处理。
   - **单屏状态**（页面不比主视口高，不分段）照 `idea-loop:design-archive` 的「拍档案截图」的「单屏状态」：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" screen <仓库根> <状态 id> --out <目录>`（`prod/index.md` 还没定视口或主题时带 `--viewport` 与 `--theme`，值取画布矩阵的默认格），图叫 `<状态 id>.png`，放进它所在对象的 `assets/`。
   - 每个有动效的边或节点录一张 GIF（`idea-loop:evidence` 的动图），一个 GIF 只讲一件事，放进对应动效的 `assets/`。图取自实现。用户感觉不到的动效、没有动效的状态不录。
3. **补齐状态文件**：「这一屏」照实现拍的图写这一屏是什么样（内嵌刚拍的截图或 GIF；有分段的入口状态按段排开，每段一个 `###` 小标题、这一段的图、一两句描述），「应看到什么」照最终画布写成几条可判定的话。决定不写在状态文件里。
4. **决定与候选**：页面、组件、动效、用户路径文件的「决定」「设计法候选」两节都在，没有内容写「无」。素材取自冻结记录（意图、打磨轨迹、签字、设计法候选汇总、「冻结后的变更」一节，记录里没有这一节就跳过）、工单、和 review loop 文件 `.tmp/review-loop/<PR 号>.md` 里人的批示（「你的批示」，原话）：决定写为什么、否掉过、来源；候选按 `idea-loop:design-modeling` 的「设计法候选的形态」。对象是已有的，原有的决定全文带过去，新决定接着编号，规则变了原地改写。**拿不准的留在草稿的「待你定」里**，不替人编。
5. **自检**：`check <集成 worktree> --delta <spec-slug> --no-used-by` 与 `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <集成 worktree> <spec-slug> --dry-run` 都通过。归档脚本你只跑 `--dry-run`。自己写出来的违规自己改到过；改不动的（比如 spec 没写入口又找不到）按「不通过」处理，写进 `failed.json` 交回 `status: failed`。

**第三步：写草稿给人看**，存成 `.tmp/pr-review/<PR 号>/archive/draft.md`。读的人是拍板的人：

- 开头一句结论：这次要归档几个页面、几个状态、几条边，实现核过了什么。
- 逐个对象用话说**档案会变成什么样**：新增 / 改动 / 删除了什么，附它的截图或 GIF（本地路径）；字段级差异取自 `query … diff`。
- 要写进对象文件的**决定与候选**逐条列出原文，标明哪些是设计阶段已有的、哪些是你补的；「待你定」单列。
- 文件路径与字段名放在末尾折叠区。

**第四步：停下交回。** 转回来的批示要改，就改 `delta/` 里的文件和草稿，重新自检，再交回。
