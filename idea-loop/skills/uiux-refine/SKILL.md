---
name: uiux-refine
description: 设计收敛——方向定了之后由人跑它。起 plugin 自带的 designer agent（最新的 Opus，思考强度 high）从 imagine 交出的交接画布接着做（没有交接画布时退回从方向说明重建）、跑打磨环（每轮新起一个 ui-master agent 当评委，最新的 Fable，思考强度 high），按需接动效段与素材段，再各跑一轮减法与 AI tells；调用它的会话只做编排——designer 每次停下就把画布在内嵌浏览器里摆给人、把人的意见分流后转回同一个 designer。人签字后冻结在项目的 `docs/design/tmp/<spec-slug>/canvas/`（本地、不进 git）、冻结结果写成对设计档案的 `delta/`、交互图写回 spec（状态留在设计中，切完工单才由 to-ticket 翻在飞）；也可以部分冻结、其余回 uiux-imagine。
disable-model-invocation: true
---

# uiux-refine

**收敛，准出一块冻结的画布。** 这份文件是入口，写的是**调用机制**：谁起谁、交接什么、停下之后怎么摆给人、人的意见怎么回去。怎么做设计写在 agent 的定义里，这里不复述。

> 先读一次 `../../references/wiki-conventions.md`（spec / design 层的位置与状态约定；§2 的 `design/tmp/<spec-slug>/` 是这一段的工作区，下文简写 `tmp/…`，指目标项目的 `docs/design/tmp/…`——本地、不进 git）。

## 0 什么时候跑

- spec 状态是 `设计中`，且 `tmp/<spec-slug>/imagine/direction-note.md` 在、过得了 `direction-note-check`（`uiux-imagine` 的准出）。
- **交接画布 `tmp/<spec-slug>/imagine/handoff/index.html` 在**（`uiux-imagine` 的另一半准出）。方向说明在而交接画布不在（旧流程留下的 spec）：**不停**，走退路——designer 从方向说明的文字重建，交回里会明说。起 designer 之前先告诉人一句「这份 spec 没有交接画布，会从方向说明重建」，让人知道这一轮没有选中那一版的画。
- 方向说明找不到就停下告诉人：回 `uiux-imagine` 重写那封信，不凭 spec 或记忆补。没有方向说明只有交接画布也停——画布说不出「为什么」。

它**只能人调**（与 `grill` / `uiux-imagine` 同档）：环的每一次停都停在人身上——方向级 finding、plateau、签字。**不需要 `/clear`**：干活的是新起的 designer，它的上下文里本来就没有发散那一段的变种和半成品；这个会话可以留着 imagine 的讨论。

## 1 三个角色

| 角色 | 是谁 | 模型 | 做什么 |
|---|---|---|---|
| **编排者** | 调用 refine 的这个会话 | 人定，这份文件不规定 | 承接人的消息和 designer 的交回：起服务器、起 designer、在内嵌浏览器里摆结果、分流人的意见（§3–§5） |
| **designer** | `idea-loop:designer`（`agents/designer.md`） | `opus` · high | 重建画布、跑打磨环、动效 / 素材 / 减法 / AI tells、各道 gate、冻结落盘与写回 spec。整个 refine 只有这一个，人的每条意见都回到它 |
| **ui-master** | `idea-loop:ui-master`（`agents/ui-master.md`） | `fable` · high | 评委。designer 每轮新起一个，只看截图、意图那一句和 critic rubric，交出 finding 与分数就结束 |

**模型写在 agent 定义里，不跟着编排者走。** 曾经把执行者换成一个较弱模型，同一个基准从能冻结退成连续三轮 plateau——拆开的是结构，不是模型。评委与执行者用不同的模型，是为了评委不跟执行者共享同一种盲区。

定义里写的是**别名**（`opus` / `fable`），解析成当前这份 Claude Code 映射的最新版本，新模型出来不用改 plugin，升级 Claude Code 就跟上。要临时钉死某个版本，用环境变量覆盖别名映射（如 `ANTHROPIC_DEFAULT_OPUS_MODEL`），不改定义。

## 2 起步

1. **起预览服务器。** 在 `docs/design/tmp/<spec-slug>/canvas/`（没有就建）起一个静态服务器（后台跑），预览地址 `http://127.0.0.1:<port>/<spec-slug>.html`。服务器**归编排者**：人要在这个会话的内嵌浏览器里看画布，它就得活到这次 refine 结束，不跟着 designer 的某一轮走。
2. **起 designer。** 用 Agent 工具起 `idea-loop:designer`，交给它的只有：spec 路径与 `<spec-slug>`、方向说明路径、**交接画布的路径（`tmp/<spec-slug>/imagine/handoff/`；不在就明说「没有」）**、目标项目的 `DESIGN.md` / `PRODUCT.md` 路径、预览地址、人调用时附的话（先按 §4 分流过——跟方向说明矛盾的不交，先问人）。**不转述方向**——方向只住在信里。

designer 从这里开始自己跑（有交接画布就复制成第一版画布，没有就从文字重建），停下时交回；第一次交回会写明它是怎么起的手。

## 3 designer 每次交回，都在内嵌浏览器里摆给人

停在 `pass` / `plateau` / `direction`、动效做完、冻结、部分冻结——每次都一样，**不等人要**：

- 用 `preview_start` 的 `url` 打开 designer 交回的地址，停在本轮改动的那个状态。同一个标签页，后续轮次导航过去，不另开。内嵌浏览器不可用时按 `../../references/design/browser-usage.md` 的退路（先给本地地址，再不行才是截图），并明说。
- 配一份短清单，从 designer 的交回里摘：本轮核心问题、改了什么、评委分与停的原因、要人判的取舍（带 designer 的推荐）。截图、测量、评委回执留在 designer 和 ledger 里，**不搬进这个对话**。
- **交回里有「与人选定冲突」的，排在清单最前、连画布一起摆给人，问「保留 / 改」**：评委的原话、撞上的是方向说明里哪一项人选定的东西、画布停在没动那一项的样子。评委是盲评的，它不知道这一项是人定的；designer 因此没执行，等人判。人答之前不放行下一轮。交回里只写一行「已按人保留排除 N 条」的，是人早先说过保留的，**不再问**，随清单带一句即可。
- **交回里有「建议调研的问题」的**（`pattern` 类 finding designer 凭判断定不了、静态 UI 协议 C 段的具名问题），和这一轮其它要人判的取舍一起摆给人，每条带 designer 的推荐做法——designer 已经按推荐做法改了、没有停下等人。人要查才调 `uiux-research`（落图目录用这份 spec 的 `research/`），不要查就当它是定了的推荐。
- **不替人宣布通过。** 闸门是人的。

## 4 人的意见：按性质分流，再转回同一个 designer

用 SendMessage 接着 designer 的上下文转过去，不重起。转之前先判性质，不按语气：

| note 是什么 | 怎么转 |
|---|---|
| **执行性**（"这条分隔线太重"） | 原话转给 designer，它带着再跑一轮评委 |
| **跟方向说明矛盾，人当场给了新方向**（"失败提示改成贴着按钮的气泡"，不需要看几个变种再选） | 转给 designer，**标明「人的方向修订」**：它先写进方向说明再改。这是人在改方向，不是 refine 在改 |
| **跟方向说明矛盾，人想看几个变种再定** | 回 `uiux-imagine`，**在对应的那一档高度**重开；没签过字的部分照 §5 部分冻结处理 |
| **要查别人怎么做**（「查一下别人的暂停后恢复怎么做」，或点了某条「建议调研的问题」说查） | **不转**。编排者调 `uiux-research`，把 HTML 以文件发给人。designer 全程不参与 |
| **看完调研后说要转哪些** | 取出对应的解构**文字**，加上人的原话转给 designer，开头标「调研结论（文字）」。**不给图、不给图片路径、不给 `index.html` 路径**。人不说转，就不转。designer 把用上的结论记进冻结记录 |
| **签字**（全部 / 一部分） | 全部 → 转给 designer 冻结；一部分 → §5 |
| **回应 designer 交回的「与人选定冲突」**（评委的 finding 要动一项人选定的东西，designer 没执行）——人说**保留** | 转给 designer，**标明「人保留」**并指明是哪一条：它在方向说明与 ledger 里各记「人保留（日期）」、把这条从本轮分数里扣掉并列出；之后同一项评委再提它直接排除，**不会再来问人** |
| 同上——人说**改** | 转给 designer，**标明「人的方向修订」**，走上面第二行同一条路：先写进方向说明（那一项的来源仍记人选定）再改画布 |

「与人选定冲突」不是回推，也不是 plateau：它是评委的意见撞上了人已经定的一项，问的只是这一项留不留，答完环照常往下跑。

**回推只有一个理由：跟方向说明矛盾。** 判据是能不能在方向说明里指出被推翻的那一句——指不出来，就是执行性的，在 refine 里改。refine 不因为「评委不满意」「这样也挺好」回推。**拿不准就问人**：不自己归类成方向性来逃避一轮打磨，也不自己归类成执行性来绕过一次选择。plateau 时 designer 摆出来的取舍题同理：多数是执行层的取舍，人定了就转回去。

**refine 永不自己改方向。** 方向是人在一排真正不同的变种之间选出来的；模型顺一句话拧过去，等于用一个没有备选项的选择替换掉那次选择。人亲口给的方向修订是例外，因为做选择的还是人——但它要落进信里，不只活在这个对话中。

## 5 生命周期

- **冻结**：designer 落冻结记录、写 `tmp/<spec-slug>/delta/`（对设计档案的差异）、写回 spec（§4 冻结摘要、§5.3 交互图）、清 `tmp/<spec-slug>/imagine/`（连同里面的交接画布）与 `canvas/work/`（`canvas/` 其余保留到归档），然后交回。状态**不翻**，留在 `设计中`——翻 `在飞` 是 `to-ticket` 切完工单时的事。编排者**核对**：spec 仍是 `设计中`、§4 冻结摘要五样齐（画布指针 / 矩阵 / mismatch 阈值 / ledger 摘要 / 状态矩阵与数据契约变更）、§5.3 的图都在且能打开、`delta/` 过得了 `design-archive-check.mjs <仓库根> --delta <spec-slug> --no-used-by`（designer 交回里列出的改不动的违规除外）、`tmp/<spec-slug>/imagine/` 与 `canvas/work/` 已清。在内嵌浏览器里打开交互图给人看，关掉预览服务器，告诉人：下一步是人确认同意这份 spec，然后 `/idea-loop:to-ticket` 切工单（它切完把 spec 翻成 `在飞`）。
- **部分冻结、其余回 `uiux-imagine`**：人常常是「这几块可以冻结了，那几块回去重新发散」，照这样做，不逼人二选一。转给 designer 落部分冻结（签过字的进冻结记录，spec 不动、留在 `设计中`，`imagine/` 与 `canvas/work/` 保留，`delta/` 只写签过字的那几块），它交回后就结束了；关掉预览服务器，告诉人去跑 `uiux-imagine` 重开那几块。人跑完第二轮发散再调 refine，起一个**新的** designer，它在已冻结的画布上接着做；这时 `handoff/` 只含重开的那几块，designer 只把这几块接进已冻结的画布。
- **会话结束或重开**：designer 接不回来。下次调 refine 起新的 designer，画布、`tmp/<spec-slug>/canvas/work/ledger.md` 与方向说明就是恢复点（交接画布只在第一版画布出来之前有用，画布落地后以 `tmp/<spec-slug>/canvas/` 里的为准）。

## 不做

- 编排者**不亲手改画布**、不跑评委、不读 ledger 的过程细节进对话；designer 不直接跟人对话。
- 编排者不自己调 Refero，designer 也不调、不起调研 agent：人说要查才调 `uiux-research`（由 uiux-researcher 去查）。
- **不自己改方向**（§4）。不替人宣布签字通过。
- 不读发散那一段的渲染物，也不让 designer 读——**只有交接画布例外**，对比页和落选变种（收工时已清）一件不读。
- 不动 spec 的 scope、不写 ticket。
