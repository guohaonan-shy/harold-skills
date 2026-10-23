# 冻结

designer 收到人的签字（全部或一部分）时从头读到「不提交，输出」，部分冻结读「部分冻结」；接手一份已经冻结过一部分的 spec 时读「部分冻结后重开」。冻结之后的设计变更不在这里：照 `idea-loop:design-change`。

## 在 `docs/design/tmp/<spec-slug>/` 落齐

```
docs/design/tmp/<spec-slug>/
├── imagine/                    方向说明与发散的临时件（冻结时清）
├── canvas/
│   ├── v<N>.html                  静态画布的各个版本（见 [refine-canvas.md](refine-canvas.md)）
│   ├── motion-v<N>.html           动效画布的各个版本（开了动效才有）
│   ├── <spec-slug>-design.md      冻结记录
│   ├── assets/                    矩阵每格截图（按格名，完整矩阵只在这里）、定格帧或 GIF、素材段的生成素材、画布引用的素材
│   ├── flows/                     「改 spec」写回 spec 的交互图（PNG，文件名 flow-<n>-<page>--<state>.png），拼图输入在 flows/src/
│   └── work/                      打磨过程的临时件：ledger、每轮评分 JSON、评委截图（冻结时清）
```

冻结不写 `delta/`：之后的需求周期里，「设计长什么样」只看 `canvas/`，它是唯一的设计真相。对设计档案的差异 `delta/` 只在合并前由 `idea-loop:ui-reviewer` 的归档模式从最终画布加实现整份写出。

记录叫 `<spec-slug>-design.md` 而不是 `<spec-slug>.md`：wiki-link 按文件名解析，后者会跟 `docs/spec/<spec-slug>/<spec-slug>.md` 撞名。frontmatter 按 `idea-loop:wiki-conventions` 的「frontmatter」，`type: design`。

这个目录被排除在 git 之外，打磨时只在本地。冻结后，`canvas/` 由编排者经设计 PR 强制提交进主分支，实现从主分支开 worktree 就拿得到；它留到实现 PR 合并前的归档（归档模式从最终画布加实现写出 `delta/`，归档脚本把要长期留下的东西——状态、动效、决定、候选——并进 `prod/` 后清掉 `tmp/<spec-slug>/`）。

冻结记录正文六节，短：

- **意图**：取自方向说明，逐字一致。
- **冻结了什么**：画布路径、矩阵每格、mismatch 阈值；有动效就加每条动效的理由与 token、restraint 结算、帧证据；有素材就每个素材一行。
- **打磨轨迹**：ledger 全文搬进来；素材单在里面；人转来并用上了的调研结论也记在这里，场景 / 设计逻辑 / 对我们 / 不能回答什么一起记，文字，不带图。
- **设计法候选**：签字时从画布里提炼出的、可能成为设计法的规律（Distill-back），每条一行：规则全文 + 它将挂在哪个档案对象上（页面、组件、动效或用户路径的名字，不加链接：对象文件要到合并前归档才写出）；没有就一行「无」。
- **签字**：人的原话，静态与动效两次各记一次；人的方向修订；被分流回发散那一段的 note。
- **冻结后的变更**：冻结之后每次设计变更记一行（行格式在 `idea-loop:design-change` 的「过了之后」，由那时的编排者记）。冻结时这一节写一行「无」。

落完清掉 `tmp/<spec-slug>/imagine/`（交接画布 `handoff/` 在里面，一起删）、`tmp/<spec-slug>/canvas/work/`（ledger 已经在记录里），以及没签字的画布版本：静态和动效各只留签字的那一版。`canvas/` 其余全部保留，它们要进 git。

## 改 spec

两处：「实现决策」写入**冻结摘要**，「前端交互」的文字**换成交互图**。spec 里如果还留着旧流程的「设计方向」小节，删掉，免得下游同时看到两份真值。

冻结摘要固定五样，`idea-loop:to-ticket` 原样誊写：

- **画布指针**：`docs/design/tmp/<spec-slug>/canvas/` 里画布 HTML 的路径（写路径，不写 wikilink）。跑过动效段的，同一条指针把动效 preview 与帧证据一并带上。
- **矩阵**：每格的 viewport × 主题 × 语言 × 状态，标「人看」的格照标。
- **mismatch 阈值**：沿用 `idea-loop:ui-measure` 的「默认容差」；按格覆盖的写覆盖值和理由。
- **一行 ledger 摘要**。
- **状态矩阵与数据契约变更**：画布上有、项目现在渲染不出来的字段逐条列出。

**「前端交互」的交互图**：用 Skill 工具调 `idea-loop:evidence`，照它 spec 图里的「交互图（screen flow）」，一个场景一张，截图取自冻结画布，规格照它的「两类共用的」，用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow-compose.mjs"` 拼，PNG 落 `docs/design/tmp/<spec-slug>/canvas/flows/`，替换掉冻结前那几行文字和「待补图」标记。

- **每一步带 `state`**，填这一格对应的状态名（画布 `?state=<名字>` 的名字，与冻结摘要的状态矩阵同名）。**不带** `--archive` / `--delta`：冻结不写 `delta/`，档案里还没有这些状态，脚本核不了；对回档案状态由合并前的归档做。
- **文件名**：`flow-<n>-<page>--<state>.png`，`<page>--<state>` 是这张图第一格的状态名，归档脚本靠它判断这张图属于哪个页面（图旁边的 `.states.json` 记着每一格的状态）。名字对不上第一格的状态，拼图脚本退出码 2。
- 改动的位置画红色光圈，图下一两句补截图里看不出来的规则。

这一步不做，冻结设计跟 spec 两头脱节。

## 不提交，输出

spec 的状态不翻，冻结后仍是 `正式`。提交和设计 PR 归编排者：它核对冻结结果之后开。

写完「改 spec」就停下输出：「要看哪里」列交互图的路径；画布里碰到的、spec 没写入口的新页面，列进「要人判的取舍」。

## 部分冻结

人说「这几块可以冻结了，那几块回去重新发散」时：

1. 把签过字的状态记进冻结记录，签字节注明「第一段 · 已签」和人的原话；矩阵截图照落；ledger 到此为止的部分搬进记录。
2. spec 不动：不写冻结摘要，也不开设计 PR——`idea-loop:to-ticket` 只认整份冻结。
3. 回推的那几块记进冻结记录的签字节（分流回 `/idea-loop:uiux-imagine` 的 note）。`tmp/<spec-slug>/imagine/`（含 `handoff/`，第二轮发散会改写它）与 `tmp/<spec-slug>/canvas/work/` **保留**。
4. 停下输出，然后你就结束了。下一个 designer 从「部分冻结后重开」接上。

## 部分冻结后重开

这份 spec 已经冻结过一部分时，签过字的部分原样不动。第二轮 imagine 交出的 `handoff/` **只含重开的那几块**（方向说明开头一行写明是哪几块）：只把这几块接进已冻结的画布——复制出这几块的标记与样式，换掉或补进画布里对应的位置，其余一字不动。

接完做一次回归：已签字的状态在相同 viewport 下，截图与接之前一致；结果记进 ledger。没有 `handoff/`（第二轮前的旧流程）就按方向说明重建重开的那几块。
