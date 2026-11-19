---
name: uiux-refine
description: 设计收敛：把定下的方向打磨到人签字冻结，冻结结果提交在需求的工作分支上，跟代码一起合进主分支。
disable-model-invocation: true
---

你是这次 refine 的编排者：起一个 `idea-loop:designer` 出画布；每一轮请评委 `idea-loop:ui-master` 提意见、请调研员配参考，拼成一份设计评审报告交给人，人在对话里按编号回决策；人签字，designer 冻结，你再把冻结结果提交在需求的工作分支上。评委是顾问，分数只是参考，停不停由人定。画布只由 designer 改，决策和签字只由人定。

先用 Skill 工具调 `idea-loop:wiki-conventions`，看它的「目录」；再读 [`references/refine-canvas.md`](references/refine-canvas.md)（画布放在哪、版本怎么递增）。worktree 根 = `git rev-parse --show-toplevel`（不取会话的项目目录变量：worktree 会话里它指主 checkout）。下文的 `imagine/`、`canvas/`、`research/` 都在 worktree 根下的 `docs/design/tmp/<spec-slug>/`：打磨时只在本地，冻结结果提交在需求的工作分支上；交给 designer 的目录也用这个前缀写成绝对路径。

几个词：**ledger** 是 `canvas/work/ledger.md`，只记人讨论后定下的决策，由你在人确认后写，designer 和评委只读；**改动集**是 designer 每版交的一份清单，逐条对上决策编号；**块的 job** 是方向说明「结构」节给每块写的内容责任；**register** 是这块界面属于营销页还是产品内（in-app）；**AI tells** 是一眼看得出是 AI 生成的套路（紫色渐变、emoji 当图标之类）。ledger 的格式、每轮的目录、报告怎么发、人怎么按编号回，都在 [`references/ledger-and-report.md`](references/ledger-and-report.md)，开第一轮前读完。

## 开工前

- spec 里没有等人定的（开头的「需要 grill」、「实现决策」里的「待定」），「实现决策」里还没有冻结摘要。
- `imagine/direction-note.md` 在，并过得了 `node "${CLAUDE_PLUGIN_ROOT}/scripts/direction-note-check.mjs" "<worktree 根>/docs/design/tmp/<spec-slug>/imagine/direction-note.md"`。不在或不过，停下，告诉人跑 `/idea-loop:uiux-imagine` 把方向说明写完。
- **暂缓的设计**：主 checkout（`git worktree list` 第一行）的 `docs/design/pending/` 里有没有同一块界面的设计，有就问人要不要接着做。要的话把那个目录复制回当前 worktree 的 `docs/design/tmp/<spec-slug>/`（pending 那份留着），再从 [`references/after-freeze.md`](references/after-freeze.md) 的「会话中断或重开」接上；不要就照常往下。
- 交接画布 `imagine/handoff/index.html` 不在：照常开工，先告诉人「这份 spec 没有交接画布，会从方向说明重建」。

## 起步

1. 在 `canvas/`（没有就建）后台起一个静态服务器，活到这次 refine 结束。
2. 用 Agent 工具起 `idea-loop:designer`，给它：spec 路径与 `<spec-slug>`、方向说明路径、交接画布路径（不在就写「没有」）、目标项目的 `DESIGN.md` / `PRODUCT.md` 路径、画布目录与预览地址、ledger 路径，任务是「起手」，出 `v1`。方向只在方向说明里，你不转述。

这一个 designer 活过整个 refine：之后的任务都用 SendMessage 接着它的上下文交，不重起。

## 每一轮

第一轮没有决策，从第 2 步起（designer 出 v1，第 4 步拿交接画布当上一版）。每一轮的文件放 `canvas/work/round-<N>/`。

1. **人回决策**：人按报告编号回，带上这一轮的意图与思路；没提到的条目算收下，照调研员给的那句新设计意图定。你先拿新决策对一遍 ledger：跟旧决策矛盾的，先摆给人，人定了再往下。人确认后，你把决策写进 ledger。
2. **交给 designer**：决策、意图与思路、ledger 交给它，任务「按决策改」。它交回画布下一版和改动集；交回「卡住」的（两条决策打架、决策跟设计法冲突），把它说的卡在哪摆给人，人定了再接着做，你不替它取舍。
3. **请评委**：新起一个 `idea-loop:ui-master`，跑完即弃。给它这一版各状态的截图（标状态名）、方向说明「意图」节的那句话、人的意图与思路（每条编号）、从 ledger 抽出的「不算差距」清单（讨论后坚持的思路也在里面）。把它的 JSON 存成 `round-<N>/critic.json`，再写 `round-<N>/context.json`（`{ "states": [...], "thoughts": [...] }`），跑：

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/critic-score.mjs" "<worktree 根>/docs/design/tmp/<spec-slug>/canvas/work/round-<N>/critic.json" --context "<worktree 根>/docs/design/tmp/<spec-slug>/canvas/work/round-<N>/context.json"
   ```

   退出码 `2` 是格式不合：作废，新起一个重评。合格只说明格式对，它不判停。
4. **比对两版**：用 Skill 工具调 `idea-loop:ui-measure`，照它的「两版画布对比」比这一版和上一版，带上改动集，输出存成 `round-<N>/canvas-diff.json`。
5. **配参考**：用 Skill 工具调 `idea-loop:uiux-research`，走它的轻用法，每轮自动起，不问人。
6. **拼报告、发出去**：照 `references/ledger-and-report.md` 用报告脚本拼，经「发布审阅页」发出。对话里放报告链接、分数、要特别注意的项（调研员提议推翻 ledger 的、方向性意见、没声明的改动）；每个要特别注意的项可带一两句推荐理由，末尾可附一句「怎么回」（回复格式举例），其余留在报告页。

designer 和评委的上下文里不放参考图，也不放调研：参考只给人看。

## 方向性意见与人的不满

评委判 `direction` 的意见，看人在这次 refine 里有没有对这一块表示过不满意（会话记录或 ledger 里有人的原话）：有，给报告脚本打标记，报告就推荐「回 imagine 重开这一块」，不再推荐保留；没有才推荐保留。人同意重开：照 `references/freeze.md` 的「部分冻结」处理，告诉人跑 `/idea-loop:uiux-imagine`，调用时附上这条意见的原文，由它交给新的 imaginer。

## 人说的其它话

| 人说的是 | 怎么办 |
|---|---|
| 按编号的决策 | 每一轮的第 1 步 |
| 要点到某处动效 | 当作一条决策，designer 照 [`references/design/motion.md`](references/design/motion.md) 做那一处，交评委时配定格帧 |
| 跟方向说明矛盾，人想看几个变种再定 | 告诉人跑 `/idea-loop:uiux-imagine`，在对应那一档高度重开；没签过字的部分照部分冻结处理 |
| 要查别人怎么做（整页调研） | 用 Skill 工具调 `idea-loop:uiux-research`，落图目录用这份 spec 的 `research/`，把调研页以文件发给人 |
| 看完调研，说要转哪些 | 取出对应的文字，加人的原话交给 designer，标「调研结论（文字，来自 `research/<问题短名>`）」；图和页面路径都不给 |
| 静态定了、可以准备签字 | 见下面「签字」 |

**回推只有一个理由：跟方向说明矛盾。** 判据是能不能在方向说明里指出被推翻的那一句；指不出来，就是执行性的，在 refine 里改。

## 签字

没有「通过」「瓶颈」：分数高低、评委判不判「方向」，都不自动停。人说静态定了，往下走两步：

1. **素材单**：判据见 [`references/asset-stage.md`](references/asset-stage.md) 的「闸门」。成立就给 designer 任务「素材单」，摆给人，由人交给生成管线；缺素材不挡后面的步骤。
2. **签字前检查**：给 designer 任务「签字前检查」，交付后停下。把还没解决的方向性意见列给人看一遍（评委判过 `direction`、ledger 里没有对应决策的，原话逐条列出），人仍签才冻结。

签字（全部）交给 designer，任务「冻结」，写明签的是哪一版；签字（一部分）、其余回去重新发散，任务「部分冻结」，写明哪几块签了、哪几块回推。

## 冻结之后

designer 交付「冻结」后，你核对：

- 「实现决策」里的冻结摘要五样齐（画布指针指向签字的那一版；五样见 [`references/freeze.md`](references/freeze.md) 的「改 spec」）。
- 「前端交互」的交互图都在，能打开。
- `canvas/<spec-slug>-design.md` 六节齐，「冻结后的变更」写着「无」。冻结不写 `delta/`：它只在合并前归档时由 ui-reviewer 从最终画布加实现写出。
- `imagine/`、`canvas/work/` 和没签字的画布版本已清。

都过了，照 `idea-loop:browser` 的「给人看」把交互图给人看，关掉预览服务器，然后把冻结结果提交在需求的工作分支上，不开设计 PR：实现在同一个分支上接着做，最后跟代码一个 PR 合进主分支（`idea-loop:wiki-conventions` 的「知识库落地」）。

提交的步骤和之后告诉人的话见 [`references/after-freeze.md`](references/after-freeze.md)。

**冻结之后设计变了、部分冻结、先不做、会话中断或重开**：各自怎么办见 [`references/after-freeze.md`](references/after-freeze.md)。
