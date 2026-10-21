# 冻结

designer 收到人的签字（全部或一部分）时从头读到「状态不翻，输出」，部分冻结读「部分冻结」；接手一份已经冻结过一部分的 spec 时读「部分冻结后重开」。

## 在 `docs/design/tmp/<spec-slug>/` 落齐

```
docs/design/tmp/<spec-slug>/
├── imagine/                    方向说明与发散的临时件（冻结时清）
├── canvas/
│   ├── v<N>.html                  静态画布的各个版本（见 refine-canvas.md）
│   ├── motion-v<N>.html           动效画布的各个版本（开了动效才有）
│   ├── <spec-slug>-design.md      冻结记录
│   ├── assets/                    矩阵每格截图（按格名，完整矩阵只在这里）、定格帧或 GIF、素材段的生成素材、画布引用的素材
│   ├── flows/                     「改 spec」写回 spec 的交互图（PNG，文件名 flow-<n>-<page>--<state>.png），拼图输入在 flows/src/
│   └── work/                      打磨过程的临时件：ledger、每轮评分 JSON、评委截图（冻结时清）
└── delta/                      「写 delta」写的对设计档案的差异
```

记录叫 `<spec-slug>-design.md` 而不是 `<spec-slug>.md`：wiki-link 按文件名解析，后者会跟 `docs/spec/<spec-slug>/<spec-slug>.md` 撞名。frontmatter 按 wiki-conventions 的「frontmatter」一节，`type: design`。

这个目录只在本地，不进 git，也不跟 spec 一起删：画布和冻结记录留到归档（归档脚本把要长期留下的东西——状态、动效、决定、候选——并进 `prod/` 后才清掉 `tmp/<spec-slug>/`）。

冻结记录正文五节，短：

- **意图**：取自方向说明，逐字一致。
- **冻结了什么**：画布路径、矩阵每格、mismatch 阈值；有动效就加每条动效的理由与 token、restraint 结算、帧证据；有素材就每个素材一行。
- **打磨轨迹**：ledger 全文搬进来；素材单在里面；人转来并用上了的调研结论也记在这里，场景 / 设计逻辑 / 对我们 / 不能回答什么一起记，文字，不带图。
- **设计法候选**：Distill-back 的汇总，每条一行：规则 + 它挂在哪个档案对象上 `[[...]]`，原件在对象文件里；没有就一行「无」。
- **签字**：人的原话，静态与动效两次各记一次；人的方向修订；被分流回发散那一段的 note。

落完清掉 `tmp/<spec-slug>/imagine/`（交接画布 `handoff/` 在里面，一起删）与 `tmp/<spec-slug>/canvas/work/`（ledger 已经在记录里）。`canvas/` 其余全部保留。

## 写 delta：把冻结结果写成对 `prod/` 的差异

放进 `tmp/<spec-slug>/delta/`。`prod/` 只有归档脚本（人批过之后）写，你只写 `delta/`。结构、字段、正文分节全以 [`../../../engineering/design-archive/SKILL.md`](../../../engineering/design-archive/SKILL.md) 为准，这里只列这一步怎么做：

1. **先看档案里这块 UI 现在有什么。** `docs/design/prod/` 在就读：档案的「页面」查询入口（插件的档案查询 MCP 工具）有就用，没有就直接读目录。`prod/` 不存在（项目还没建档案）就当整块都是新增。
2. **和冻结画布对，新增或改动的对象各放一份改完之后的全文**，路径与 `prod/` 里相同；没动的对象不放。
   - **状态** `delta/pages/<page>/<page>--<state>.md`：画布 `?state=<名字>` 的名字就是 `<state>`（与冻结摘要的状态矩阵同名）。frontmatter：`page`，入口节点的 `entry`，可选的 `components` / `motions`，`edges`，发起了异步动作的写全 `async`。正文只有「这一屏」（取自冻结画布，附矩阵截图）与「应看到什么」（可判定的几条）。决定写在页面、组件、动效、用户路径文件里，状态文件里没有。
   - **边**：`user` 边的 `locate`（`role` + `name`）从画布真 DOM 的可访问树读；`system` 边写 `trigger` 与 `how`（实现之后怎么在真应用里让它发生：拦哪个请求、等多久）。写不出 `how`、或在真应用里走不通的边带 `blocked`（`missing` + `tried`）。
   - **入口**：新页面的地址与前置条件取自 spec；spec 没写的，在输出里列「入口待补」。
   - **页面** `delta/pages/<page>/<page>.md`（新页面，或区域 / 代码变了）、**组件** `delta/components/<Component>/<Component>.md`（画布碰到的每个代码组件，`code` 取自 spec 或项目里同名组件）、**动效** `delta/motions/<motion>.md`（签过字的每条新动效：`duration` / `easing` 引用 token，字面值要写 `deviates`；`properties`、`iterations`、`reducedMotion`）、**用户路径**（spec 写了关键用户意图才写）。
   - **删除**的对象 id 列进 `delta/removed.md`，一行 `- [[<id>]] —— 原因`。
   - `usedBy` 由归档脚本生成。
3. **理由拆进对象。** 冻结记录里（ledger、签字节）每条设计决定，放进它所属对象正文的「## 决定」，格式按 design-archive 的「正文」一节：`### 决定 N：…`，下挂 `为什么` / `否掉过`（被否的做法和理由，确实没有写「无」）/ `来源`（写 `[[<spec-slug>]]`）。对象是已有的，原有的决定全文带过去，新决定接着编号，规则变了原地改写。Distill-back 的候选写进它出自的对象的「## 设计法候选」（`../../design-modeling/SKILL.md`「设计法候选的形态」）。页面、组件、动效、用户路径文件两节都要有，没有内容写「无」。
4. **自查**，跑到退出码 0：

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-check.mjs" "$(git rev-parse --show-toplevel)" --delta <spec-slug> --no-used-by
   ```

   逐条违规改掉；改不动的（比如缺入口）在输出里列出来。

## 改 spec

两处：「实现决策」写入**冻结摘要**，「前端交互」的文字**换成交互图**。spec 里如果还留着旧流程的「设计方向」小节，删掉，免得下游同时看到两份真值。

冻结摘要固定五样，`to-ticket` 原样誊写：

- **画布指针**：`docs/design/tmp/<spec-slug>/canvas/` 里画布 HTML 的路径（写路径，不写 wikilink：目标不进 git）。跑过动效段的，同一条指针把动效 preview 与帧证据一并带上。
- **矩阵**：每格的 viewport × 主题 × 语言 × 状态，标「人看」的格照标。
- **mismatch 阈值**：沿用 [`ui-implementation-standard.md`](ui-implementation-standard.md)「默认容差」；按格覆盖的写覆盖值和理由。
- **一行 ledger 摘要**。
- **状态矩阵与数据契约变更**：画布上有、项目现在渲染不出来的字段逐条列出。

**「前端交互」的交互图**：照 evidence skill（`../../../engineering/evidence/SKILL.md`）的 spec 图里「交互图（screen flow）」，一个场景一张，截图取自冻结画布（手机宽度、主语言、动画定格、2 倍像素密度、每一步只截那个组件），用 `scripts/flow-compose.mjs` 拼，PNG 落 `docs/design/tmp/<spec-slug>/canvas/flows/`，替换掉冻结前那几行文字和「待补图」标记。

- **每一步带 `state`**，填这一格对应的状态名（就是「写 delta」里那个状态文件的名字），拼的时候加 `--archive "$(git rev-parse --show-toplevel)" --delta <spec-slug>` 让脚本核对每个 id 都真有这个状态。
- **文件名**：`flow-<n>-<page>--<state>.png`，`<page>--<state>` 是这张图第一格的状态名，归档脚本靠它判断这张图属于哪个页面（图旁边的 `.states.json` 记着每一格的状态）。名字对不上第一格的状态，拼图脚本退出码 2。
- 改动的位置画红色光圈，图下一两句补截图里看不出来的规则。

这一步不做，冻结设计跟 spec 两头脱节。

## 状态不翻，输出

spec 的 `status` 留在 **`设计中`**。`to-ticket` 认的闸门是「`设计中` **且**「实现决策」里有冻结摘要」，它切完工单才把 spec 翻成 `在飞`（`../../../engineering/spec-status/SKILL.md`）。

写完「改 spec」就停下输出：「要看哪里」列交互图的路径；「写 delta」里改不动的违规和「入口待补」写进「要人判的取舍」。

## 部分冻结

人说「这几块可以冻结了，那几块回去重新发散」时：

1. 把签过字的状态记进冻结记录，签字节注明「第一段 · 已签」和人的原话；矩阵截图照落；ledger 到此为止的部分搬进记录。`delta/` 只写签过字的那几块（照「写 delta」）。
2. spec 不动：状态留在 `设计中`，不写冻结摘要——`to-ticket` 只认整份冻结。
3. 回推的那几块记进冻结记录的签字节（分流回 `uiux-imagine` 的 note）。`tmp/<spec-slug>/imagine/`（含 `handoff/`，第二轮发散会改写它）与 `tmp/<spec-slug>/canvas/work/` **保留**。
4. 停下输出，然后你就结束了。下一个 designer 从「部分冻结后重开」接上。

## 部分冻结后重开

这份 spec 已经冻结过一部分时，签过字的部分原样不动。第二轮 imagine 交出的 `handoff/` **只含重开的那几块**（方向说明开头一行写明是哪几块）：只把这几块接进已冻结的画布——复制出这几块的标记与样式，换掉或补进画布里对应的位置，其余一字不动。

接完做一次回归：已签字的状态在相同 viewport 下，截图与接之前一致；结果记进 ledger。没有 `handoff/`（第二轮前的旧流程）就按方向说明重建重开的那几块。
