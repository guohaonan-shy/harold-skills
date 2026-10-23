---
name: uiux-refine
description: 设计收敛：把定下的方向打磨到人签字冻结，冻结结果经设计 PR 合进主分支。
disable-model-invocation: true
---

你是这次 refine 的编排者：起一个 `idea-loop:designer` 出画布，每版请评委 `idea-loop:ui-master` 打分、把意见交回去，评分说停就把画布摆给人，直到人签字、designer 冻结完，再开设计 PR。画布只由 designer 改，签字只由人宣布。

先用 Skill 工具调 `idea-loop:wiki-conventions`，看它的「目录」；再读 [`references/refine-canvas.md`](references/refine-canvas.md)（画布放在哪、版本怎么递增）。下文的 `imagine/`、`canvas/`、`delta/`、`research/` 都在 `${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/` 下：打磨时只在本地，冻结结果经设计 PR 提交。

几个词：**ledger** 是 `canvas/work/ledger.md`，designer 每交付一版落一行的打磨记录；**块的 job** 是方向说明「结构」节给每块写的内容责任，归为状态 / 结果 / 身份 / 氛围之一；**register** 是这块界面属于营销页还是产品内（in-app），记在方向说明里；**AI tells** 是一眼看得出是 AI 生成的套路（紫色渐变、emoji 当图标之类）。

## 开工前

- spec 是 `正式`，「实现决策」里还没有冻结摘要（状态的含义见 `idea-loop:spec-status`）。
- `imagine/direction-note.md` 在，并过得了 `node "${CLAUDE_PLUGIN_ROOT}/scripts/direction-note-check.mjs" "${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/imagine/direction-note.md"`。不在或不过（哪怕交接画布在：画布说不出「为什么」），停下，告诉人跑 `/idea-loop:uiux-imagine` 把方向说明写完。
- 交接画布 `imagine/handoff/index.html` 不在：照常开工，先告诉人「这份 spec 没有交接画布，会从方向说明重建」。

## 起步

1. 在 `canvas/`（没有就建）后台起一个静态服务器，活到这次 refine 结束。
2. 用 Agent 工具起 `idea-loop:designer`，给它：spec 路径与 `<spec-slug>`、方向说明路径、交接画布路径（不在就写「没有」）、目标项目的 `DESIGN.md` / `PRODUCT.md` 路径、画布目录与预览地址，任务是「起手」。人调用时附的话先照「人的回复」分好类：执行性的随第一次「按意见改」交给它，跟方向说明矛盾的先问人。方向只在方向说明里，你不转述。

这一个 designer 活过整个 refine：之后的任务都用 SendMessage 接着它的上下文交，不重起。

## 每一轮

designer 交付一版之后：

1. **请评委**：用 Agent 工具新起一个 `idea-loop:ui-master`，跑完即弃。给它：designer 交付的截图路径、方向说明「意图」节的那句话、这一轮看什么（静态 / 动效 / 减法），以及方向说明里标了「人保留」的项（有才给，告诉它这几处不算差距）。
2. **分拣意见**：评委看不到哪些是人亲手定的，所以由你分。照「碰到人选定项的意见」把每条分成要问人、按人保留不交、交给 designer 三类。
3. **评分**：把评委的 `findings`、`score` 和之前每一轮的分数（`history`，从旧到新）写成 `canvas/work/round-<N>.json`，跑：

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/critic-score.mjs" "${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/canvas/work/round-<N>.json"
   ```

   退出码 `2` 是评委的输出不合格式：作废这一轮，新起一个 ui-master 重评。按它的停止判定走：

   | 停止判定 | 做什么 |
   |---|---|
   | `继续` | 把要交的意见交给 designer，任务「按意见改」 |
   | `瓶颈` | 停下摆给人 |
   | `方向` | 立即停下摆给人：评委认为方向本身有问题，由人判是不是真的跟方向说明矛盾 |
   | `通过` | 静态构图定了，进「定稿之后」 |

## 碰到人选定项的意见

逐条对照方向说明里选中变种的构成清单（每项行末标 `（人选定）` 或 `（模型代填）`），看意见要改变什么，不看措辞，拿不准就当碰到：

| 意见要动的是 | 你做 |
|---|---|
| `（人选定）` 项已写下来的那部分 | 冲突项：不交给 designer，留着问人「保留 / 改」 |
| 方向说明里这一项下已有 `人保留（日期）` 那一行 | 拦下，不交给 designer（[`references/pinned-findings.md`](references/pinned-findings.md)） |
| 其余 | 交给 designer |

这一轮有冲突项时：其余意见照常交给 designer 改完这一版，然后停下，冲突项排在最前问人；人答之前不开下一轮。人说**保留**，你照 `pinned-findings.md` 记下，designer 不用动，之后起评委时把它作为「人保留的项」交给评委，评委再提它就直接拦下，不再问人；人说**改**，交给 designer，标明「人的方向修订」。

## 定稿之后

按顺序走，每一步 designer 交付一版后照「每一轮」评：

1. **动效**：判据见 [`references/motion-stage.md`](references/motion-stage.md) 的「开不开」（有块的 job 是四值之一才开）。开就给 designer 任务「动效」，评委看动效；做完先停下给人看跑起来的样子。不开就跳过。
2. **素材**：判据见 [`references/asset-stage.md`](references/asset-stage.md) 的「闸门」（营销 register、块的 job 是身份或氛围）。开就给 designer 任务「素材单」，素材单摆给人，由人交给生成管线；缺素材不挡后面的步骤。
3. **减法**：评委这一轮看减法，意见交给 designer 改。
4. **清 AI tells**：给 designer 任务「清 AI tells」，改完照常评一次。
5. **签字前检查**：给 designer 任务「签字前检查」，交付后停下，请人签字。

## 每次停下，都摆给人

停在 `瓶颈`、`方向`、有冲突项、动效做完、签字前检查做完、冻结、部分冻结，或 designer 交付「卡住」时，不等人要：

- 照 `idea-loop:browser` 的「给人看」打开最新一版，停在这次改动的那个状态。
- 配一份短清单：为什么停、评委分、本轮核心问题、designer 改了什么、要人判的取舍（带 designer 的推荐）。截图和评委回执留在 `canvas/work/`。
- **冲突项排在最前**：评委原话、撞上的是哪一项人选定的东西、画布停在没动那一项的样子。按人保留排除的，只带一句「已按人保留排除 N 条」。
- **「建议调研的问题」**和要人判的取舍一起摆，每条带 designer 的推荐做法：designer 已经按它改了。人说要查才调 `idea-loop:uiux-research`；不查，就当推荐做法定了。

## 人的回复

先判性质，不按语气：

| 人说的是 | 怎么办 |
|---|---|
| 执行性的（「这条分隔线太重」） | 原话交给 designer，任务「按意见改」，之后照「每一轮」评 |
| 跟方向说明矛盾，人当场给了新方向 | 交给 designer，标明「人的方向修订」，任务「按意见改」 |
| 跟方向说明矛盾，人想看几个变种再定 | 告诉人跑 `/idea-loop:uiux-imagine`，在对应那一档高度重开；没签过字的部分照部分冻结处理 |
| 冲突项的「保留 / 改」 | 照「碰到人选定项的意见」 |
| 要查别人怎么做 | 用 Skill 工具调 `idea-loop:uiux-research`，落图目录用这份 spec 的 `research/`，把调研页以文件发给人 |
| 看完调研，说要转哪些 | 取出对应的文字（来源的场景 / 设计逻辑、页上的通用结论、页尾的决策条目），加人的原话交给 designer，标「调研结论（文字，来自 `research/<问题短名>`）」，提醒它用上了照常记。图和页面路径都不给；人不说转就不转 |
| 签字（全部） | 交给 designer，任务「冻结」，写明签的是哪一版 |
| 签字（一部分），其余回去重新发散 | 交给 designer，任务「部分冻结」，写明哪几块签了、哪几块回推 |

**回推只有一个理由：跟方向说明矛盾。** 判据是能不能在方向说明里指出被推翻的那一句；指不出来，就是执行性的，在 refine 里改。拿不准就问人。refine 里改方向只能是人亲口说的。

## 冻结之后

designer 交付「冻结」后，你核对：

- spec 仍是 `正式`；「实现决策」里的冻结摘要五样齐（画布指针指向签字的那一版；五样见 [`references/freeze.md`](references/freeze.md) 的「改 spec」）。
- 「前端交互」的交互图都在，能打开。
- `delta/` 过得了 `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-check.mjs" "$(git rev-parse --show-toplevel)" --delta <spec-slug> --no-used-by`（designer 列出的改不动的违规除外）。
- `imagine/`、`canvas/work/` 和没签字的画布版本已清。

都过了，在内嵌浏览器里打开交互图给人看，关掉预览服务器，然后开**设计 PR** 把冻结结果合进主分支：实现阶段从最新主分支切分支，拿不到你这里的本地文件。

1. 当前 worktree 应该是从主分支开出的（issue 会话在设计阶段就是）。分支还不叫 `design/<spec-slug>` 的，改名 `git branch -m design/<spec-slug>`；不在这种 worktree 里的，从最新主分支开一个，把下面这些文件带过去再提交。
2. `git add docs/spec/<spec-slug>`，再 `git add -f docs/design/tmp/<spec-slug>/canvas docs/design/tmp/<spec-slug>/delta`（`tmp/` 被排除在 git 之外，要强制加）。`git status --short` 里暂存的只能是这几处，`imagine/`、`research/` 不进。
3. 提交（`design(<spec-slug>): 冻结`，末尾加一行 `Co-Authored-By:`，照这个会话的署名要求写），`git push -u origin design/<spec-slug>`，`gh pr create`。
4. `gh pr checks <号> --watch` 全过就 `gh pr merge <号> --squash --delete-branch`：只改 `docs/` 的 PR 检查过了就合并（`idea-loop:decision-rules` 的「不自动的」）。失败就告诉人。

告诉人：设计已冻结并合进主分支。在 issue 会话里的，会话接着换到实现阶段（`idea-loop:issue-session` 的「换阶段」）；不在的，人用 `/idea-loop:issue-session <号>` 接上，或自己调 `idea-loop:to-ticket` 切工单开工。

**部分冻结**：designer 交付后就结束了。关掉预览服务器，告诉人跑 `/idea-loop:uiux-imagine` 重开回推的那几块；第二轮发散之后再调 refine，起一个**新的** designer，任务「起手」，它会接到已冻结的画布上。

**会话中断或重开**：designer 接不回来。下次调 refine 起一个新的，任务「起手」：画布的最新一版、ledger 与方向说明就是恢复点。
