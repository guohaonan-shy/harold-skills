# 01 — 设计档案的结构说明与校验

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

目标项目的 `docs/design/prod/` 是一张图，这张工单让它**有一份插件级的结构说明，并且能被一条命令校验**。之后的查询、归档、MCP 都建在这一层的解析结果上，所以解析要做成可复用的模块（读一个仓库根，返回所有对象和边），校验是它上面的一层。

### 档案长什么样（写进 plugin 级新 reference，并按它实现解析）

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

各对象可带同目录 `assets/`。每份对象文件带 wiki 约定的 `type` / `tags` / `summary`，加下面的结构字段。引用一律写成 `"[[basename]]"` 字符串。

- **页面** `type: design-page`：`code`（页面入口代码路径列表）、`regions`（每项 `name` + `component` 引用）。页面有哪些状态不列，看文件名前缀。
- **状态** `type: design-state`：`page`（引用）；入口节点才有 `entry`（`url` + `preconditions`，前置条件是账号 / 数据 / 开关之类的自由键值）；可选 `components`、`motions`（这一屏常驻的动效）；`edges` 列表，每条有 `id`（在本状态内唯一）、`to`（目标状态）、`kind`（`user` 或 `system`）；`user` 边有 `component`、`locate`（`role` + `name`）、`action`；`system` 边有 `trigger`、`how`；任一边可有 `motion`、`blocked`（`missing` + `tried` 列表）；发起异步动作的状态有 `async`（`loading` / `failure` / `empty`，各是一个状态引用或字符串「不适用」）。
- **组件** `type: design-component`：`code`（代码路径）、可选 `tokens`、`usedBy`（生成，不手写）。
- **动效** `type: design-motion`：`duration`、`easing`（`{token}` 形式的引用或字面值）、`properties`、`iterations`、`reducedMotion`、字面值时必填 `deviates`、`usedBy`（生成）。
- **用户路径** `type: design-journey`：`intent`（一句话意图）、`path`（有序状态列表；相邻两状态间有多条边时那一项写成 `state` + `via: <边 id>`）。

正文：状态文件只有「这一屏」与「应看到什么」两节，不得有「决定」。页面 / 组件 / 动效 / 用户路径文件正文有「## 决定」与「## 设计法候选」两节。「决定」下每条是 `### 决定 N：<标题>`，一两句规则，再带「为什么」「否掉过」「来源」三项（「否掉过」可写「无」）；编号不复用。「设计法候选」每条的形状以插件已有的 DESIGN.md 写入标准 reference 里「设计法候选的形态」一节为准（规则一句 + 并进 / 为什么 / 证据，没有候选写一行「无」），本工单只校验三项都在。

reference 里还要写：节点和边是什么、跨页跳转也是状态之间的边、组件和 `DESIGN.md` 基础件是两层、动效只落在档案里、进入方式从入口节点沿边推导（推导本身在 02 实现）、`tmp/` 与 `prod/` 的分工、`delta/` 与 `prod/` 同构（改动对象放全文，删除的对象 id 列在 `delta/removed.md`）、`prod/` 只存精简矩阵（每状态一张主视口截图、每个动效一张 GIF）、素材走 Git LFS、写 `prod/` 只有归档脚本一条路。

### 校验命令

对一个仓库根（可选叠加某个需求的 `delta/`）跑，逐条报出违规（指名文件与字段），全部通过时退出码 0、有违规非 0：

1. 每个状态能从某个入口节点沿边（不走 `blocked` 边）到达，或者它的某条入边带 `blocked`。都不满足的点名。
2. 有 `async` 的状态三项写全，各是存在的状态或「不适用」。
3. 所有 wikilink 能解析；边的 `component` 指向组件、`motion` 指向动效；`docs/` 下 basename 不重复。
4. 用户路径相邻两状态之间有边；多条时写了 `via` 且 `via` 存在。
5. 状态文件没有「决定」；其余对象每条决定三项齐全；每条候选并进 / 为什么 / 证据齐全。
6. 动效字面值都带 `deviates`；`usedBy` 与反向引用一致（字段缺失视为未生成，报出来）。

`docs/design/` 下除 `tmp/`、`prod/`、`index.md` 以外的目录（旧的按 spec 命名的冻结记录）只打一条提示「旧布局，建议删」，不算违规、不读。

## 验收标准
- [ ] 插件级档案结构 reference 存在，覆盖上面列出的全部内容
- [ ] 解析模块对夹具仓库返回全部对象、边与引用，供后续工单复用
- [ ] 六条规则每条都有一个会红的夹具测试，且合规夹具全绿
- [ ] 叠加 `delta/` 校验时，以 `delta/` 里的对象覆盖、按 `removed.md` 去掉对象之后再判
- [ ] 旧布局目录只出提示、退出码不受影响
- [ ] 全量 `node --test '*/scripts/*.test.mjs'` 全绿

## 选中的存量回归
无 test-cases 库。跑仓库全量 node 测试套件（`*/scripts/*.test.mjs`）；尤其「插件不泄露项目名」那条——夹具和 reference 里不得出现真实项目的页面或组件名。
