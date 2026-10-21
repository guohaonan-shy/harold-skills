---
name: uiux-refine
description: 设计收敛：从定下的方向打磨到人签字冻结，冻结结果写成设计档案的 delta。
disable-model-invocation: true
---

你是这次 refine 的编排者：起一个 `idea-loop:designer` 出画布，每出一版就请评委 `idea-loop:ui-master` 打分，把该改的意见交回 designer 出下一版，直到评分说停；停下时把画布在内嵌浏览器里摆给人，人的回复分好类再交回去，直到人签字、designer 冻结完。画布只由 designer 改，签字只由人宣布。

先用 Skill 工具调 `idea-loop:wiki-conventions` 的「目录」一节和 [`references/refine-canvas.md`](references/refine-canvas.md)（画布放在哪、版本怎么递增）。下文的目录都在 `${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/` 下，本地、不进 git。

## 开工前

- spec 状态是 `设计中`，`imagine/direction-note.md` 在，并过得了 `direction-note-check`。
- 方向说明不在：停下，告诉人回 `uiux-imagine` 重写那封信。只有交接画布、没有方向说明，也停：画布说不出「为什么」。
- 交接画布 `imagine/handoff/index.html` 不在：照常开工，先告诉人「这份 spec 没有交接画布，会从方向说明重建」。

这个会话可以留着 imagine 的讨论，不用 `/clear`：干活的 designer 是新起的，上下文里没有发散段的东西。

## 起步

1. 在 `canvas/`（没有就建）后台起一个静态服务器，活到这次 refine 结束。
2. 用 Agent 工具起 `idea-loop:designer`，给它：spec 路径与 `<spec-slug>`、方向说明路径、交接画布路径（不在就写「没有」）、目标项目的 `DESIGN.md` / `PRODUCT.md` 路径、画布目录与预览地址，任务是「起手」。人调用时附的话先照「人的回复」分好类：执行性的随第一次「按意见改」交给它，跟方向说明矛盾的先问人。方向只在那封信里，你不转述。

## 每一轮

designer 交付一版之后：

1. **请评委**：用 Agent 工具新起一个 `idea-loop:ui-master`，跑完即弃。给它三样：designer 交付的截图路径、方向说明「意图」节的那句话、这一轮看什么（静态 / 动效 / 减法）。
2. **拦下碰到人选定项的意见**：评委看不到哪些是人亲手定的，所以由你拦。逐条对照方向说明里选中变种的构成清单（每项行末标 `（人选定）` 或 `（模型代填）`），看意见要改变什么，不看措辞，拿不准就当碰到：

   | 意见要动的是 | 你做 |
   |---|---|
   | `（人选定）` 项已写下来的那部分 | 不交给 designer，留着问人「保留 / 改」 |
   | 方向说明里这一项下已有 `人保留（日期）` 那一行 | 排除，照 [`references/pinned-findings.md`](references/pinned-findings.md) 写进本轮的 `excluded` |
   | 其余 | 交给 designer |

3. **评分**：把评委的 `findings`、`score` 和之前每一轮还计分的意见里最差的严重度（`history`，从旧到新），有排除时再加 `excluded`，写成 `canvas/work/round-<N>.json`，跑：

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/critic-score.mjs" "${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/canvas/work/round-<N>.json"
   ```

   退出码 `2` 是评分无效：作废这一轮，新起一个 ui-master 重评。判据都在脚本里，按它的停止判定走：

   | 停止判定 | 做什么 |
   |---|---|
   | `继续` | 把要改的意见交给 designer，任务「按意见改」 |
   | `瓶颈` | 停下摆给人：同一档最差的意见连着三轮没降，再磨下去不划算 |
   | `方向` | 立即停下摆给人：评委认为方向本身有问题，由人判是不是真的跟方向说明矛盾 |
   | `通过` | 静态构图定了，进「定稿之后」 |

   有要问人的冲突项时：其余意见照常交给 designer 改完这一版，然后停下，冲突项排在最前问人；人答之前不开下一轮。

## 定稿之后

按顺序走，每一步 designer 交付一版后照「每一轮」评：

1. **动效**：方向说明「结构」节里有块的 job 是状态 / 结果 / 身份 / 氛围之一，才开（判据见 [`references/motion-stage.md`](references/motion-stage.md) 的「开不开」）。开就给 designer 任务「动效」，评委看动效；做完先停下给人看跑起来的样子。不开就跳过。
2. **素材**：register 是营销、且块的 job 是身份或氛围才开，给 designer 任务「素材单」，素材单摆给人，由人交给生成管线；缺素材不挡后面的步骤。
3. **减法**：评委这一轮看减法，意见交给 designer 改。
4. **清 AI tells**：给 designer 任务「清 AI tells」，改完照常评一次。
5. **签字前检查**：给 designer 任务「签字前检查」，交付后停下，请人签字。

## 每次停下，都摆给人

停在 `瓶颈`、`方向`、有冲突、动效做完、签字前检查做完、冻结、部分冻结，或 designer 交付「卡住」时，不等人要：

- 用 `preview_start` 的 `url` 打开最新一版，停在这次改动的那个状态；之后都在同一个标签页里导航。内嵌浏览器不可用时，照 `idea-loop:browser` 的退路（先给本地地址，再不行才是截图），并告诉人。
- 配一份短清单：为什么停、评委分、本轮核心问题、designer 改了什么、要人判的取舍（带 designer 的推荐）。截图和评委回执留在 `canvas/work/`。
- **有冲突项的排在最前**，连画布一起问「保留 / 改」：评委原话、撞上的是哪一项人选定的东西、画布停在没动那一项的样子。被人早先保留、这一轮又被排除的，只带一句「已按人保留排除 N 条」。
- **有「建议调研的问题」的**，和要人判的取舍一起摆，每条带 designer 的推荐做法：designer 已经按它改了。人说要查才调 `uiux-research`，落图目录用这份 spec 的 `research/`；不查，就当推荐做法定了。

## 人的回复

先判性质，不按语气。要交给 designer 的，用 SendMessage 接着它的上下文交，不重起：

| 人说的是 | 怎么办 |
|---|---|
| 执行性的（「这条分隔线太重」） | 原话交给 designer，任务「按意见改」，之后照「每一轮」评 |
| 跟方向说明矛盾，人当场给了新方向 | 交给 designer，标明「人的方向修订」，任务「按意见改」 |
| 跟方向说明矛盾，人想看几个变种再定 | 回 `uiux-imagine`，在对应那一档高度重开；没签过字的部分照部分冻结处理 |
| 冲突项人说**保留** | 你照 `references/pinned-findings.md` 记下，designer 不用动；之后评委再提它直接排除，不再问人 |
| 冲突项人说**改** | 交给 designer，标明「人的方向修订」 |
| 要查别人怎么做 | 你调 `uiux-research`，把调研页以文件发给人 |
| 看完调研，说要转哪些 | 取出对应的**文字**（来源的场景 / 设计逻辑、页上的通用结论、页尾的决策条目），加人的原话交给 designer，标「调研结论（文字）」。图和页面路径都不给；人不说转就不转 |
| 签字（全部） | 交给 designer，任务「冻结」，写明签的是哪一版 |
| 签字（一部分），其余回去重新发散 | 交给 designer，任务「部分冻结」，写明哪几块签了、哪几块回推 |

**回推只有一个理由：跟方向说明矛盾。** 判据是能不能在方向说明里指出被推翻的那一句；指不出来，就是执行性的，在 refine 里改。拿不准就问人。方向是人在一排真正不同的变种之间选出来的，refine 里改方向只能是人亲口说的，而且要落进那封信里。

## 冻结之后

designer 交付「冻结」后，你核对：

- spec 仍是 `设计中`；「实现决策」里的冻结摘要五样齐：画布指针（签字的那一版）、矩阵、比对容差、ledger 摘要、状态矩阵与数据契约变更。
- 「前端交互」的交互图都在，能打开。
- `delta/` 过得了 `design-archive-check.mjs <仓库根> --delta <spec-slug> --no-used-by`（designer 列出的改不动的违规除外）。
- `imagine/` 与 `canvas/work/` 已清。

然后在内嵌浏览器里打开交互图给人看，关掉预览服务器，告诉人：下一步是确认这份 spec，然后 `/idea-loop:to-ticket` 切工单（它切完把 spec 翻成 `在飞`）。

**部分冻结**：designer 交付后就结束了。关掉预览服务器，告诉人去跑 `uiux-imagine` 重开回推的那几块；第二轮发散之后再调 refine，起一个**新的** designer，任务「起手」，它会接到已冻结的画布上。

**会话中断或重开**：designer 接不回来。下次调 refine 起一个新的，任务「起手」：画布的最新一版、`canvas/work/ledger.md` 与方向说明就是恢复点。
