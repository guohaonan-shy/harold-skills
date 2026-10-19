---
name: pr-review
description: 在一个已经 open 的 PR 上跑一轮两轴 review——调用它的会话做编排，起 plugin 自带的 pr-reviewer agent：它自己跑仓库声明的机械检查（只看改动行），并行起两个只读 Codex 进程（gpt-5.6-sol，思考强度 high）分别回答 Spec（代码是否解决了 spec 要解决的问题）与 Standards（代码是否遵守仓库写下来的规则），行为问题逐条复现并做成证据（界面上看得到的必须是截图、截图流程或动图，看不到的用时序图、小表或例子），两轴引文与写法由脚本校验，最后写出这一轮的汇报（写给拍板的人看：标题即用户后果、对用户的影响、要你决定，不出现代码指称），编排者在会话里给人看、逐字记进这个 PR 的本地 review loop 文件。PR 描述不放 review，PR 上也不开 thread。本地 `docs/design/tmp/` 有这份 spec 的需求目录时，每一轮先起 `idea-loop:ui-reviewer` 拿实现走出来的画面对冻结的设计、把发现交给 pr-reviewer 并进 Spec 一节。人在会话里批示「接受 / 修 / 不修 / 进 backlog」，编排者把要修的写回工单、派 implementer 修，下一轮由人触发；人说合并时，`tmp/` 里还有设计差异就先走归档（UI 审查 → 人看草稿 → 归档脚本 → 提交推送），再把整份 review loop 按停下和轮次归档成 PR 评论再合并。implement 全部落地后会自动接它跑第一轮；人要再跑一轮或合并时调它。
---

# PR review

**一次调用跑一轮。** 这份文件是入口，写的是**编排机制**：起谁、交接什么、人批示之后怎么修。一轮 review 具体怎么跑写在 `agents/pr-reviewer.md` 里，问什么、什么算问题写在 `references/review-standards.md` 里，这里不复述。

> 先读一次 `../../references/review-loop.md`（汇报放在哪、人怎么回复、合并时怎么归档）和 `../../references/pr-description.md`（§1、§6 描述的四节，§5 review 汇报的写法）。

## 0 什么时候跑

- **`implement` 全部落地后自动接**：PR 刚转成 open，跑第 1 轮。
- **人触发下一轮**：人调 `/idea-loop:pr-review`，或者在会话里说「再跑一轮」。一般是上一轮的批示修完之后。
- **人说合并**：走 §4。
- 推送、`gh pr create`、某个 skill 跑完，都**不是**触发条件。不装任何自动触发的 hook。

前提：

- PR 是 **open**。还是 draft，说明工单没落地完或还有等决定的事，回 `implement`。
- 当前 worktree 是这个 PR 的集成分支，工作区干净（`git status --short --untracked-files=no` 为空），本地 HEAD 已推送、等于 PR 的 head。
- 能找到 Codex companion（`agents/pr-reviewer.md` §2 的查找办法）。编排者先找一次，找不到就在开跑前告诉人缺什么。不安装，不改 Codex 配置。

## 1 两个角色

| 角色 | 是谁 | 做什么 |
|---|---|---|
| **编排者** | 调用 pr-review 的这个会话 | 起审查者、在会话里给人看汇报并记进 review loop 文件、处理人的批示、把要修的写回工单、派 implementer、回一条汇总、人说合并时归档并合并 |
| **ui-reviewer** | `idea-loop:ui-reviewer`（`agents/ui-reviewer.md`），`sonnet` · high | 本地 `tmp/` 有这份 spec 的需求目录时才起：每轮审查模式写一份发现文件；归档模式核过之后备好草稿并停下。只读代码、只写 `.tmp/` 与 `tmp/<spec-slug>/delta/`，不写 `prod/`，Codex 不参与 |
| **pr-reviewer** | `idea-loop:pr-reviewer`（`agents/pr-reviewer.md`），`sonnet` · xhigh | 一轮一个：机械检查、两个 Codex 进程、核实与画图、校验、写出这一轮的汇报。不碰 PR，不碰 review loop 文件 |

UI 审查者起在 pr-reviewer **之前**，因为子 agent 起不了子 agent，要由编排者把两者串起来；它的发现并进 Spec 一节，由 pr-reviewer 沿用现有的格式与校验。PR 和 review loop 文件都不归审查者：它们只写出这一轮的汇报交回，描述的四节由 `implement` 写、由编排者按人的批示更新。修复不归审查者，归 `idea-loop:implementer`（`agents/implementer.md`）。审查和修复分开，是为了让审查者只读，它的结论不被它自己的修法影响。

## 2 跑一轮

review loop 文件是 `.tmp/review-loop/<PR 号>.md`（`review-loop.md` §1）。

1. 轮次取 `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-loop.mjs" next .tmp/review-loop/<PR 号>.md review`。
2. **有 `tmp/` 才先 UI 审查**：看集成 worktree 的 `docs/design/tmp/` 下有没有这份 spec 的需求目录（`<spec-slug>/` 且里面有文件）。**有**，就在起 pr-reviewer 之前先用 Agent 工具起 `idea-loop:ui-reviewer`（每轮审查模式），只给指针：spec 名、集成 worktree 的绝对路径、分到的端口（挑一个没人在听的）、模式、图的前缀 `r<轮次>-ui-`、这一轮的工作目录 `.tmp/pr-review/<PR 号>/round-<N>/`。等它交回发现文件路径 `ui-findings.json`。没有就跳过这一步，下面不传发现文件。UI 审查标了未完成（服务起不来、页面打不开）的，照实告诉人并记进汇报的「没覆盖到的」，**未完成不等于没问题**，不阻塞这一轮的代码审查。
3. 用 Agent 工具起 `idea-loop:pr-reviewer`，**只给指针**：worktree 路径、`<owner/repo>`、PR 号、基准分支、轮次、spec 路径与工单目录（`docs/spec/<spec-slug>/<spec-slug>.md` 和同一目录下的 `tickets/`）、review loop 文件路径（它从里面读之前几轮人批了「不修」或「进 backlog」的条目）、companion 路径，**以及第 2 步的发现文件路径**（有的话）。它把发现并进汇报的 Spec 一节，格式与校验沿用现有的；PR 描述「之前 → 之后」的「之前」从档案 `prod/` 取（`pr-description.md` §6）。
4. 等它交回，**不提前汇报**。
5. **把这一轮记进 review loop 文件**：把审查者写好的汇报作为新条目原样追加。
6. **在会话里给人看**：按条目贴同样的汇报，每一条的文字后面紧跟着单独发这一条的证据图（`review-loop.md` §2）；再发一条推送通知，一句话说第几轮、Spec 几条、Standards 几条。有未完成的轴或检查，要明说：**未完成不等于没问题**。缺词也念出来（概念 + 推荐叫法），问人要不要开一轮 `grill` 把它们定下来；不写进术语表。

## 3 人批示之后

人在会话里批示（「S1 接受，C1 修，C2 进 backlog」）。先把原话逐字记进这一轮条目的「你的批示」，再逐条处理：

- **修**：先找到它归哪张工单。
  - Spec 条目：它引用的那张工单。
  - Standards 条目：对代码片段所在的行跑 `git blame`，找到引入它的 commit，读 commit 的 `Ticket:` trailer。
  - UI 审查并进来的条目，引的是档案里冻结下来的原文，不是工单：归**改了那个状态或组件的工单**（读各工单的「要建什么」，或对实现那处跑 `git blame` 看 `Ticket:`）。
  - 都找不到（比如代码来自一次不带 trailer 的修复），就问人归哪张。

  在那张工单的验收标准末尾追加 `- [ ] review 第 <N> 轮 <编号>（<日期>）：<应有的行为，或要遵守的规则原文>`，用 `docs(tickets): <NN> — review 第 <N> 轮 <编号>` 提交，然后派一个 `idea-loop:implementer` 做这张工单，派工、核对、落地与回收照 `implement` §3、§4（自己的 worktree、起点 SHA、分到的端口，fast-forward 落地）。它只会去做没勾的那几格，commit 照样带同一个 `Ticket:` trailer。同一张工单上有好几条要修的，一次写完再派一次。多张工单的可以并行派。全部落地后推送。
  条目的位置（文件、行号、提交）在审查者交回的报告和汇报折叠区的「给修复方的位置」里，写进工单时照旧描述行为，不抄路径。
- **接受**（Spec 条目选了「接受，补进 spec 或工单」这一类选项）：代码不动，把那条偏差写进 spec 或工单（例外清单、验收标准、改过的路径），用 `docs(spec): …` 或 `docs(tickets): …` 提交、推送。UI 审查的条目选了「改档案，接受实现」的，改的是 `docs/design/tmp/<spec-slug>/delta/` 里对应的文件（本地、不进 git），不用提交；改完记进「做了什么」。
- **不修**：记下。下一轮不再报它，除非有新证据。
- **进 backlog**：在目标仓库的 `docs/quality-backlog.md` 追加一条（是什么、在哪、为什么这次不修），提交、推送。
- **疑问**：直接回答。
- **批示带出合并前后要做的事**（「S2 接受，上线时手动处理迁移」）：照上面处理之外，要人在上线前做的，追加进 PR 描述 `your-todo` 节的「上线前要注意的」、写明为什么要人来做；Claude 合并后自己做的，追加进 `reference` 节的清理清单（`pr-body.mjs set`，见 `pr-description.md` §1、§6）。
- **要求把汇报改写**（「写成我看得懂的样子」）：照 `pr-description.md` §5 改写，改 review loop 文件里那个条目的汇报部分，在会话里重新贴一遍；改了什么写进下面那条汇总。

全部处理完，在会话里回**一条**汇总，逐点说做了什么、带上提交链接，不要一个点回一条；同样的内容记进这一轮条目的「做了什么」。同时把 PR 描述 `your-todo` 里已经决定的那几项勾上。**下一轮由人触发**，编排者不自己接着跑。

## 4 合并

**只在人在会话里明确说合并时做。** 没有 mergeReady 判定，也没有自动批准：人看过最新一轮的汇报和 PR 描述的「要你做的事」，自己决定。

1. `review-loop.mjs check .tmp/review-loop/<PR 号>.md` 列出还没处理完的条目；PR 描述「要你做的事」还有没勾的。有的话提醒人一句，人仍然说合并就继续。
2. **先看设计档案要不要归档**：集成 worktree 的 `docs/design/tmp/` 下有任何含文件的需求目录（合并前钩子 `merge-gate-hook.mjs` 查的是同一件事，没归档就执行 `gh pr merge` 会被它拦下，提示指向这一节），就走 §4.1 的归档，**走完再继续第 3 步**。没有就直接第 3 步。
3. **归档 review loop**：`review-loop.mjs archive .tmp/review-loop/<PR 号>.md <owner/repo> <PR 号>`，每次停下、每轮 review 各贴成 PR 上的一条评论，引用的本地图同时上传、换成链接（`review-loop.md` §4）。中途失败直接重跑，贴过的不会重复。
4. **合并**：`gh pr merge <PR 号>`，用仓库惯用的合并方式。
5. **收尾**：按 PR 描述「参考」里的清理清单逐项做：删工单（`to-ticket` §7），删这个 PR 的素材分支（`evidence.mjs cleanup <owner/repo> <PR 号>`），删 `.tmp/review-loop/<PR 号>.md`，清掉 `.tmp/implement/<spec-slug>/` 和 `.tmp/pr-review/<PR 号>/`，再加上这个 PR 特有的几项。

### 4.1 合并前归档

目标：把这次 UI 改动在 `tmp/<spec-slug>/delta/` 里的设计差异，经实现核过、经人看过之后，才并进线上档案 `prod/`。**写 `prod/` 只有归档脚本一条路**，人没批过不跑。每个有 `tmp/` 需求目录的 spec 各做一遍，按下面六步：

1. **起 UI 审查（归档模式）**：用 Agent 工具起 `idea-loop:ui-reviewer`，只给指针：spec 名、集成 worktree 的绝对路径、分到的端口、模式「归档」、图的前缀 `r<最近一轮的轮次>-ui-merge-`、草稿存放处 `.tmp/pr-review/<PR 号>/archive/`。
2. **看它核得过不过**：
   - **不通过**（`status: failed`）：什么都没写。把它交回的 `failed.json` 里的条目，按 `pr-description.md` §5 的 Spec 条目格式记成 review loop 的一条新条目（轮次取 `review-loop.mjs next … pause`，标题写「第 N 次停下 · 归档被拦下，核不过」），在会话里给人看，每条的图跟在文字后面。**不合并**，等人批示（修 / 改档案接受实现 / 不修），按 §3 处理；处理完人再说合并，从第 1 步重来。
   - **未完成**（服务起不来、页面打不开）：照实告诉人缺什么，**不合并、不归档**，也不当成通过。
   - **通过**：往下。
3. **在会话里给人看草稿**：把 `draft.md` 作为新条目记进 review loop 文件（`pause` 类，标题写「第 N 次停下 · 归档设计档案，等你过目草稿」），按条目一段一段贴，截图和 GIF 跟在对应那条的文字后面，发推送通知。人要改，就把批示原话（记进「你的批示」）用 SendMessage 转回**同一个** ui-reviewer，它改完交回，再贴一次，直到人说通过。
4. **人通过后跑归档脚本**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <集成 worktree> <spec-slug>`。它先校验再写，退出码 1 就是拒绝（`prod/`、spec 和 `tmp/` 都没动），把它列的违规或冲突回到 review loop 按「归档被拦下」处理，**不合并**。退出码 0 之后，输出里提示的缺失项（`.gitattributes` 没管素材、`.gitignore` 没忽略 `tmp/`、`prod/index.md` 没定视口 / 主题 / 语言）如实告诉人：脚本不改它们，补不补由人定。
5. **提交并推送到 PR 分支**：`git add -A docs/design/prod docs/spec/<spec-slug>`（被改写的 spec 图片链接也在里面），提交信息写「归档 <spec-slug> 的设计差异」，推送。工作区应当干净。
6. **重新执行合并**：回到 §4 的第 3 步往下；`tmp/` 现在已清空，合并前钩子这次放行。

**记一笔**：第 2 步和第 3 步的条目就是这次归档的审查结论与人的批示（原话逐字），第 4 步、第 5 步做了什么写进该条目的「做了什么」。有多个 spec 要归档的，每个各占一条。

## 不做

- 编排者不自己审代码、不自己改代码、不跑审查者的检查。
- 不替人批示；不在人批示之前修任何东西；不自己开下一轮。
- 不在 PR 上和人往来（不开 thread、不在 PR 上等回复），不以人的身份在 PR 上发言。
- 不自己决定合并，不批准 PR。
