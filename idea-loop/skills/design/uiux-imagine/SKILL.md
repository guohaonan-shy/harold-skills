---
name: uiux-imagine
description: 设计发散：从一份碰 UI 的 spec 出几个真正不同的变种，人定下方向后交给 uiux-refine。
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Write(**/DESIGN.md), Edit(**/DESIGN.md), Bash(npx -y @google/design.md@latest:*), Bash(git ls-files:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), AskUserQuestion
---

你是这次 imagine 的编排者：起一个 `idea-loop:uiux-imaginer` 出变种，每交付一轮就把变种板在内嵌浏览器里摆给人，人的回复分好类再交回去，直到人说方向没有要补的了；然后让它写方向说明、导出交接画布，交给 `uiux-refine`。变种板只由 uiux-imaginer 改，方向定没定只由人宣布。

先读 `../../engineering/wiki-conventions/SKILL.md` 的「目录」一节和 [`references/imagine-canvas.md`](references/imagine-canvas.md)（变种板、交接画布放在哪、怎么搭）。下文的目录都在 `${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/` 下，本地、不进 git。

## 开工前

- spec 状态是 `审核中`：人调 imagine 就是「审完了、要设计」。先跑 `spec-status.mjs set <docs> <spec-slug> 设计中`（`../../engineering/spec-status/SKILL.md`）。脚本拒绝（比如 spec 写着不涉及 UI、开头标着需要 grill），停下把原因告诉人，不手改状态。
- 是 `设计中`：已经翻过，直接开工；`imagine/rounds.md` 在就是恢复，见「中断与恢复」。
- 别的状态不跑：`草稿` 人还没审，`在飞` 已经切了工单，还没有 spec 的先 `grill` → `to-spec`。

## 起步

1. 在 `imagine/`（没有就建）后台起一个静态服务器，活到这次 imagine 收工。
2. 用 Agent 工具起 `idea-loop:uiux-imaginer`，给它：spec 路径与 `<spec-slug>`、目标项目的 `DESIGN.md` / `PRODUCT.md` 路径、`imagine/` 目录与预览地址、人调用时附的原话（不改写），任务是「起手」。人在开工前调过 `uiux-research` 的，再带上人要转的那几段调研文字（不带图、不带页面路径）。方向和高度由它定，你不转述。

## 每一轮

uiux-imaginer 交付一轮之后：

1. **摆给人**，不等人要：
   - 先 `curl` 一下预览地址，app 可能在回合结束时停了服务器；不通就重起，换了端口在下一条消息里告诉它。
   - 用 `preview_start` 的 `url` 打开交付里给的 `board.html?variant=…&state=…`，停在本轮改动的那个变种和状态；之后都在同一个标签页里导航。内嵌浏览器不可用时，先给本地地址让人在自己的浏览器里开，再不行才是截图，并告诉人。
   - 配一份短清单，从交付里摘：这一轮有哪几个变种、各自赌什么、改了什么；还开着的问题（带它的推荐）；要人回的那句话；七节进度；要人判的取舍。「建议调研的问题」和取舍一起摆，每条带它的推荐做法：它已经按推荐做法渲染了，人说要查才调 `uiux-research`，不查就当推荐做法定了。截图和抓来的东西不搬进对话。
2. **代办它够不着的事**（交付里写了才做）：
   - 生图要走 `codex exec`：照它给的用途、prompt、文件名生成，放进 `imagine/assets/`，告诉它「图已放好」。
   - 项目没有 `DESIGN.md`，它交了「待写入 DESIGN.md」的草稿：第一份由你写。照 `../../engineering/dreaming/references/design-md.md` 的「新建」与「一次写入怎么走」，把草稿摆给人确认措辞，人确认后才落笔，人改过的以人的为准。草稿缺东西就交回给它补，不自己猜。写完告诉它。
3. **看能不能提议收工**。四条都满足，就在清单最后主动说「方向上没有开着的问题了，可以收工进 refine，你确认吗」：
   - 七节都填得出来，尤其「结构」：块序、每块的内容责任、读者先遇到什么，都能一句话说死；
   - 人最近一轮的话里只剩执行，没有方向了；
   - 每个打开的高度都经过人一次真实的选择，没有被默认掉的；
   - 人说得出落选的理由。

   「看起来挺好看」是对保真度的反应，「不知道还能问什么」是清单没摆够，都不是方向定了。提议之后由人宣布，你不替人宣布。

## 人的回复

先判性质，不按语气。要交给 uiux-imaginer 的，用 SendMessage 接着它的上下文交，不重起；带人的原话，不改写。一条回复里有几类就拆成几个任务一起交。

| 人说的是 | 怎么办 |
|---|---|
| 方向性的、对某个变种的（「更冷、更像工具」「往 B 那边再推一格」「再加一个最保守的」） | 任务「调向」；人点名留下了哪个变种，另起一行写明 |
| 执行层的（「标题小 2px」），方向已定（人点名留下过某一版、之后没改口）且人明说要当场看 | 任务「改在选中的那一版上」 |
| 其余执行层的 | 任务「记进待打磨」：发散时当场改一句，发散就偷偷变成了收敛 |
| 「重探语言」 | 任务「重探语言」 |
| 推翻了 spec 里的某一句（「这块要不要存在」「这功能不该放这里」） | 不交。问人：回 spec / `grill` 重谈，还是留在 imagine 里。回去的话 `imagine/` 原样留着，回来再调 imagine 走恢复 |
| 要查别人怎么做 | 你调 `uiux-research`，落图目录用这份 spec 的 `research/`，把调研页以文件发给人 |
| 看完调研，说要转哪些 | 取出对应的文字（来源的场景 / 设计逻辑、页上的通用结论、页尾的决策条目），加人的原话，随「调向」交，标「调研结论（文字）」。图和页面路径都不给；人不说转就不转 |
| 「方向没有要补的了」，或接受了收工提议 | 进「收工」 |

**回 spec 只有一个理由：推翻了 spec 里的某一句**（要解决的问题、scope、一条 story）。判据是能不能指出被推翻的那一句；指不出来就是设计层的，交给 uiux-imaginer。拿不准就问人。imagine 不改 spec。

## 收工

1. 任务「写方向说明」。它交回草稿和模型代填的那几格，你把这几格原样摆给人确认，一格一句「这是替你定的，依据是 X」；人的确认或改写交回去，任务「按确认改」。
2. 任务「导出交接画布」。它交付后你核对：
   - 自己再跑一次校验：`node "${CLAUDE_PLUGIN_ROOT}/scripts/direction-note-check.mjs" "${CLAUDE_PROJECT_DIR}/docs/design/tmp/<spec-slug>/imagine/direction-note.md"`；
   - 七节都有正文，选中变种的构成清单齐；spec 没被动过（`git status` 里没有它），状态仍是 `设计中`；
   - 在内嵌浏览器里打开 `<预览地址>/handoff/index.html`，换两个 `?state=` 点一点：打得开、状态能切、动效在、素材没缺、页面上没有变种切换和别的变种。

   不过就把问题交回去，它补完再核。
3. 主动问人要不要把变种板再看一遍：清掉之后就看不到了，留着又会让下一段误以为它们是真值。人说看完了，任务「清」；它交付后关掉静态服务器。
4. 告诉人：下一步是 `/idea-loop:uiux-refine`，就在这个会话里调，不用 `/clear`，refine 起的 designer 是新的，上下文里没有这一段的变种。designer 从方向说明和交接画布起手；关于方向的话只住在信里，想补一句方向说明信漏了，先补进信里；执行层的要求可以直接在调 refine 时说。

## 中断与恢复

- 一个 uiux-imaginer 活过整个 imagine，人的每条意见都回到它。会话压缩或重开后接不回来。
- 再调 imagine 时 spec 已是 `设计中`、`imagine/rounds.md` 在：不翻状态，重起服务器，新起一个 uiux-imaginer，任务「接着做」，输入同「起步」。先用一句话告诉人从第几轮接上；人这次附的话就是下一轮的原话。
- `rounds.md` 不在，就是一次新的 imagine，从「起步」开始，并告诉人。
- refine 部分冻结后回来重开几块：`rounds.md` 不在，照新的 imagine 起，任务「起手」时写明这是第二轮发散、哪几块要重开、以 `canvas/` 里的冻结画布为基线。
