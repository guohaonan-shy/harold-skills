---
type: adr
status: 生效
tags: [idea-loop, design-archive, sections, scroll-driven]
summary: 设计档案只把整段钉住（宽高都≥半屏）认成滚动驱动，窄侧栏照普通长图拍；滚动驱动段每一步一张图
related: ["[[128]]", "[[0005-design-archive-unstable-sections]]", "[[2026-11-13-scroll-driven-whole-pin-grill]]"]
---

# ADR-0077 — 设计档案：滚动驱动只认整段钉住，每一步一张图

> 由 spec `scroll-driven-whole-pin` 蒸馏而来，该 spec 已删除。
> 在 [[0005-design-archive-unstable-sections]] 的「滚动驱动」两条上改，拍法（第 1 步 `shoot`、后面每步 `pinned`）不变。

## 1 背景（why）

分段拍图的脚本 `design-archive-sections.mjs` 要认出「滚动驱动的段」：整段钉在视口里、滚动拿去换内容的段（例如滚一下换一张卡片的传送带），这类段要声明 `scrollDriven: true`，并每步拍一张。人定的判据（2026-11-13）：档案里每一段的图，要包含这一段用户能看到的全部内容。两处不成立：

- **窄钉子让普通文章被认成滚动驱动**（issue #128，分拣在测试夹具上复现，2026-11-10，主分支 6202c21）：一篇三章、约 2770px 高的文章，左边一个 200px 宽、写「Reading: Chapter N」的钉住侧栏。侧栏被认成钉住元素，整段判为滚动驱动，`attribute` 退出码 1；声明之后只拍钉住的一屏，约 1870px 正文档案里没有图。根因是钉住采样里「不到半屏的钉住元素，只要钉住期间可见文字随滚动变了就算」这条，是 #65 review 按当时 spec 补上的（`docs/raw/decisions/65.md` 题 4），没有真实实例，分不清「这一段在换内容」还是「只是报告读到哪了」。
- **滚动驱动的段只有前两步有图**：一个营销站 Listen & Repeat 介绍页的三步传送带（LISTEN、HOLD、DELIVER），档案里第 3 步没有图，状态文件写「结构相同，没有单独建状态」。根因是 `shooting.md` 第 3 步照搬了 `writing.md` 对 FAQ、卡片的「结构相同的多项只记一个」；传送带每步插图和文字都不同，是内容本身，不是重复项。

## 2 决策（how）

- **检出只认整段钉住**：钉住元素宽和高都 ≥ 半屏才算（沿用已有的大钉子信号和阈值，已被滚轮接管的传送带、按滚动位置点亮的批注演示两类真实段覆盖）。删掉窄钉子按文字变化认定的整条路径，连同「滚回原处核对文字」那一步；窄钉子不再进测量的 `pins`。
- **滚动驱动的段每一步一张钉住视口图**：第 1 步是入口状态里这一段的图，第 2 步起每步一个段内状态；`shooting.md` 去掉「结构相同的步骤只记第一个」，`writing.md`「建模的取舍」加一句例外，滚动驱动段的步骤不算重复项；`initial-scan.md` 与 README 的说法同步。
- **两条已知限制删掉**：窄侧栏会让整段被认成滚动驱动（#128）；窄栏滚一下换一张检不出（#127 review 记下的）。
- 没做：不加「不是滚动驱动」的声明（issue 原设想；检出收窄后误判面没了，人说「分章节这块不是很需要复杂的逻辑」）；不把各步拼成一张图（人选每步一张，「右边的符合我的预期」）；不另定新阈值；校验规则 7（`scrollDriven` 只能写 `true`）不动。
- 未做：那个营销站档案里 L&R `problem` 段没声明 `scrollDriven`（拍成带空白的长图）和 DELIVER 补图，是它自己的档案数据，下次对账时按新规则重拍。
- 过程中改过一处（PR #394 review 第 1 轮 S1，夜间按推荐定）：「每一步都有一个段内状态」与「拍法不变」矛盾，改准为「第 1 步是入口状态的这一段，第 2 步起每步一个状态」。

## 3 结果（result）

- `idea-loop/scripts/design-archive-sections.mjs`：钉住采样只收宽高都 ≥ 半屏的钉子（注释写明窄栏不算）；`attribute` 的 `declaredNotDetected` 照旧，以前给窄侧栏声明过的段会得到这条提示，删掉声明重拍即可。
- 文档：`idea-loop/skills/design/design-archive/references/shooting.md`「滚动驱动的段」每一步建状态、每步一张图，「已知限制」没有窄侧栏那条；`references/writing.md`「建模的取舍」有滚动驱动段的例外；`idea-loop/skills/productivity/dreaming/references/initial-scan.md` 与 `idea-loop/README.md` 同步。
- 守护：`idea-loop/scripts/design-archive-sections-browser.test.mjs`（真 Chromium：三章长文章加 200px 窄侧栏 `attribute` 退出码 0 且拍成整段长图；窄文字栏未声明退出码 0、声明只得到 `declaredNotDetected`；整段钉住的用例照旧检出）、`idea-loop/scripts/design-archive-sections-doc.test.mjs`（shooting、writing、README 的说法）。
- 合并：PR #394（设计档案：滚动驱动只认整段钉住，每一步一张图）；PR #396 补了决定记录；issue #128 已关闭。决定记录见 [[128]]，讨论见 [[2026-11-13-scroll-driven-whole-pin-grill]]。
