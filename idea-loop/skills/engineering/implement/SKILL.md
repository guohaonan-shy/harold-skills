---
name: implement
description: 把一份已切好工单的 spec 实现完。spec 进了「实现中」、要开工时用。
---

**把一份已经切好工单的 spec 做完。** 调用这个 skill 的会话是**编排者**：派工、核对、落地、回收、停下时把要人拍板的事交给人（决定题只由人答，PR 上不以人的身份发言）。一张工单怎么做归 `idea-loop:implementer`：实现代码、验证、合并冲突都是它的，编排者不进它的 worktree 改东西，它的日志也留在它那里。

开工先用 Skill 工具调 `idea-loop:wiki-conventions`（看它的「中间产物」；下文 `.tmp/…` 都指集成分支 worktree 的 `.tmp/`）、`idea-loop:pr`（停下汇报、PR 描述的七节）和 `idea-loop:decision-rules`（执行方交回的「按现有做法定的」、本次修的存量、为无关存量开 issue、停下汇报的决定题都按它）。

## 前提

- 人调 `/idea-loop:implement <spec-slug>`，或调用方要求做完一份 spec。一份 spec 的工单全部做完才算完：要求只做其中几张的，说明 spec 该调整（拆成两份，或把不做的部分移出去），停下告诉人，不开工。
- **当前 worktree 就是集成分支**：一份 spec 一条分支、一个 PR，这个 skill 不建、不切它。工作区不干净或当前就是基准分支，停下告诉人。
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" check <docs>` 不报旧布局，spec 是「实现中」，`tickets/` 下有工单。否则停：旧布局照它提示的迁移，没切票先跑 `idea-loop:to-ticket`。
- 每张工单第一次派出时是新上下文，人不用在工单之间 `/clear`；卡住的工单在人做完决定后，可能被叫回原执行方（见「人回复后」）。

scope 和工单都按 spec 与 `idea-loop:to-ticket` 定下的来：编排者不改 scope、不删工单（删工单在合并前，归 `idea-loop:pr-review`），也不合并 PR。

## 账本

不另建状态文件：

- **已落地**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/ticket-ledger.mjs" landed <base>` 列出的 commit（message 里有一行 `Ticket: <NN>-<slug>` 的）。用这个脚本，不用 git 的 trailer 读法：环境会在 message 末尾另起一段追加署名，按 trailer 读会读空。
- **等决定**：`.tmp/implement/<spec-slug>/pending.md`，每条记工单号、问题、选项、推荐、半成品的 worktree 和分支、原执行方的 agent id（起它时 Agent 工具返回的那个；会话压缩或重启后靠它找回）。丢了就从 review loop 文件还原（停下汇报里有批示和「做了什么」的就算已决定）。
- **已按规则处理**：`.tmp/implement/<spec-slug>/handled.md`。每落地一张就把它交回的「按现有做法定的」、标「存量本次修」的 `found`、为无关存量开的 issue 记进来（工单号 + 做了什么 + 依据，开了 issue 的带链接）。执行方回收后这些内容就找不回来了，所以落地时立刻记；写进停下汇报后清空。
- 同目录还有 `evidence/`（素材）、`notes/`（explorer 笔记）、`browser.lock`（MCP 浏览器锁）。在跑的执行方只记在会话里。

**可派的工单**：没落地、不在等决定、不在跑、`Blocked by` 全已落地的工单。等决定的工单的下游因此也不派。会话断了：重算可派的工单；`git worktree list` 里 pending 没记着的执行方 worktree 照「回收」收掉后重派。

## 派工

同时最多 **3** 个执行方（人可另定，说串行就是 1）。有空位、有可派的工单，就按编号补派，不等一批做完。

**第一次派工、可派的有两张以上**：先用 Agent 工具起 `idea-loop:explorer`，给一句目的（验证命令、准备命令、测试写法、各工单现状在哪）、这批工单路径、spec 路径、笔记目录 `.tmp/implement/<spec-slug>/notes/` 的绝对路径，等它交回。

每派一张：挑一个没人在听、也没分出去的端口；记下 `git rev-parse HEAD` 作起点 SHA；用 Agent 工具起 `idea-loop:implementer`，`isolation: "worktree"`、`run_in_background: true`，记下它返回的 agent id，**只给指针，不转述工单**：

- 工单与 spec 的仓库内路径
- 起点 SHA、集成分支名、分到的端口
- 集成分支 worktree 的绝对路径
- tmp 绝对路径：集成 worktree 里 `docs/design/tmp/<spec-slug>/` 的绝对路径（还不存在也照给）
- 已落地的提交列表
- 有的话：「人的决定已写进工单」、上次的半成品分支

一次处理一个交回：核对 → 落地 → 回收 → 补派。

## 核对与落地

只核能机械判断的；套件执行方交回前跑过，下一张和 pr-review 还会跑，这里不重跑：

| 交回 | 核对 |
|---|---|
| `landed` | 比集成分支只多一个 commit（`git rev-list --count HEAD..<commit>` 为 1），`ticket-ledger.mjs of <commit>` 输出的正是这张工单；`git show <commit>:<工单>` 里每格 `[x]` 或 `⏭ 延后 → <接手方>`；延后给后续工单的，那张有「继承自」格；延后给 PR 交付验收的，`human_verify` 有素材且文件在它的证据目录 |
| `blocked` | 半成品已提交在它的分支上，worktree 干净 |
| `failed` | 不核，直接进「卡住一张，别的接着做」 |

不过就 SendMessage 退回同一个执行方说清哪条，第二次还不过按 `failed`。

`by_existing_practice` 每条必须带至少一处现存实例，没有的不收：退回执行方，要么补实例，要么改按「行为没定」停（`idea-loop:decision-rules` 的「依据不成立：交给人」）。

**落地**：`git merge --ff-only <commit>`。ff 不了（期间别的先落地了）就退回它：合入最新提交、重新压成一个、重跑全量套件，不算失败。落地后照「回收」收掉它的 worktree，再分拣它的交回：

| 交回字段 | 去哪 |
|---|---|
| `human_verify` | 下次停下汇报的交付验收 |
| `verified` | PR 描述 |
| `by_existing_practice`、标「存量本次修」的 `found` | handled |
| 标「spec 缺口」的 `found` | pending，当决定题 |
| 其余 `found`（跟这次无关的存量） | 开 issue，见下 |

**跟这次无关的存量问题自动开 issue**（`idea-loop:decision-rules` 的「自己定的四条」第 2 条）：逐条照 `idea-loop:spec-status` 的「开一个待验证的 issue」开（为什么不做：它跟这张工单无关）。把「做了什么 + 依据（它跟这张工单无关）+ issue 链接」记进 handled，下次停下汇报和第 1 轮 review 汇报的「已按规则处理」都带它。开不成的也记进 handled，让人在停下汇报里看到。

## 卡住一张，别的接着做

`blocked` / `failed`：连同它的 agent id 和全部下游记进 pending；拷出素材、停它的服务、强制释放浏览器锁，**worktree 和分支留着**；发一条推送通知说哪张卡在哪；回到「派工」。

## 没活了就停下

没有在跑的、可派的也空了才停（只剩等决定的及其下游，或全部落地）。

1. 还没有 PR：推送，`gh pr create --draft --base <base>`（标题用 spec 标题，带署名行），用 `pr-body.mjs set` 写 `summary` 和 `reference`（`idea-loop:pr`）。
   - **有 `回放在队列里`**（落地的交回里 `verified` 写了）：PR 开出来后，把这些用例放进夜间队列：`node ~/.idea-loop/bin/retro-replay.mjs --enqueue --slug <owner/repo> --pr <PR 号> --worktree <集成 worktree 绝对路径> --cases <用例,用例> --session <本会话 id>`（本会话 id 用 `get_session`（`self`）取，是 `local_…` 那一串；同一个 PR 再加用例就再跑一次，会并进它的文件）。夜里的任务跑完，会把结果用会话间消息发回这个会话，没带 `--session` 就只有 macOS 通知。停下汇报里写明哪些用例在队列、几点以后有结果。
2. 照 `idea-loop:pr` 的「停下汇报」写：handled 的每一条进「已按规则处理」，新落地工单的人验素材进交付验收，pending 的每一条写成决定题。轮次取 `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-loop.mjs" next .tmp/review-loop/<PR 号>.md pause`，追加成新条目，素材写本地路径；然后清空 handled。
3. 更新 `reference` 的执行记录，推送。
4. **先看有没有要人定的事**：pending 不空（有等决定的事）。人验素材不算：它们照第 2 步列进交付验收（不勾），实现中途不停，最后收进 `idea-loop:pr-review` 交的审核报告，人在 PR 上一起看。
   - **有**：照 `idea-loop:pr` 的「review loop」在会话里按条目贴汇报，每项文字后紧跟它的素材；再发一条推送通知。停下等人，见下面「人回复后」。
   - **都没有**：不停，不等回复。第 2 步写进文件的条目就是留痕：已按规则处理照样列（人想推翻哪条，之后随时说，照「人回复后」的推翻处理），交付验收照常列（有人验素材的不勾，写明「留到审核报告看」；没有的写一行「无需人看」），条目末尾直接记一节「做了什么」（逐点：这次落地了什么、按规则处理了什么，带提交链接），不写「你的批示」。会话里只说一句落地了几张、已按规则处理几件，不发推送通知，然后往下走下面「全部落地」那一步（有排队中的回放时，那一步自己会让 PR 留在 draft）。依据：`idea-loop:decision-rules` 的「不自动的」只列了人验素材和决定题，没有「放行一份无事的汇报」；人验素材仍由人判，只是挪到审核报告里判（人定于 2026-10-30：「人验素材收进最终审核报告，实现中途不停」）；`review-loop.mjs check` 对没有「需要你决定」的条目，记了「做了什么」就算处理完。

**人回复后**：原话逐字记进那个条目的「你的批示」，逐点处理，会话里只回**一条**汇总（带提交链接），同样记进「做了什么」：

- **决定**：决定里有设计变更（人接受了实现者做不下去时给的改法，或人自己改了主意）的，先走下面的「设计变更」，过了再写工单，`> 人的决定` 里指向新画布的版本。工单 `要建什么` 末尾加 `> 人的决定（<日期>）：<原文>`，验收格随之增删，提交 `docs(tickets): <NN> — 人的决定`，从 pending 删掉（先取下它的 agent id 和 worktree）。工单回到可派，按下面的「重派」；它落地后旧 worktree 和分支一并回收。
- **推翻**「已按规则处理」里按现有做法定的、或本次修的存量那条：当作一条人的决定。那条所属的工单，`要建什么` 末尾加 `> 人的决定（<日期>）：推翻「<那条做了什么>」：<原文>`，验收末尾追加 `- [ ] 人推翻（<日期>）：<人要的样子>`，提交 `docs(tickets): <NN> — 人的决定`；工单回到可派重派（同一 trailer，带上「人的决定已写进工单」）。
- **推翻**开了 issue 的那条：不回工单、不派执行方。在那个 issue 上留一条说明并关掉（`--reason "not planned"`）；人要别的处理（比如这次就修），要修的按上一条写回所属工单。
- **人验对**（人中途主动看了，或在审核报告里看了）：在文件里勾上。**不对**：验收末尾追加 `- [ ] 人验反馈（<日期>）：<原话>`，提交，工单回到可派重派（同一 trailer，素材同名覆盖）。
- **疑问**：直接答；要改方案的，说明要回 `idea-loop:grill`。
- **要求改写汇报**（「写成我看得懂的样子」）：改文件里那个条目的汇报部分，在会话里重贴，改了什么写进汇总。

**重派**（决定、设计变更、推翻写进工单并提交之后，工单要重新做时）：

- **先叫回原执行方。** 这张工单卡住时 pending 记了 agent id、它的 worktree 还在，就用 SendMessage 叫它回来，占一个执行方的位置。消息只给指针：「人的决定已写进工单 `<路径>`，提交 `<SHA>`」，加上要它先合进来的集成分支最新提交。它照常交回，核对、落地、回收照上面做。
- **叫不回就新起。** SendMessage 报错（id 找不到、会话重启过）或没记 id：照「派工」新起一个，带上半成品分支。
- **已经落地的工单照旧新起。** 人验反馈、review 里的修、推翻已落地的工单，那时执行方的 worktree 已经回收（「回收」的时机不改），不叫回，新起。

回到「派工」。下次停下追加新条目，不改旧的。

**全部落地、pending 清空、`review-loop.mjs check` 没有未处理的 `pause`、没有排队中的回放**（`~/.idea-loop/replay-queue/` 里没有这个 PR 的文件 `<owner>__<repo>-<PR 号>.json`；有就是夜里的结果还没出，PR 留在 draft，告诉人等结果，不进 review；结果发回来时，见 `idea-loop:issue-session` 的「规则回放的结果」）：照 `idea-loop:pr` 的「PR 描述的节」写齐描述（之前 → 之后专门拍：基准分支用 `git worktree add .tmp/implement/<spec-slug>/base <基准分支>` 另起一份，拍完删），`gh pr ready`，然后用 Skill 工具调 `idea-loop:pr-review` 跑第一轮。提一句交付验收还有几项没勾。

## 设计变更：人接受了跟画布不同的设计

PR 开出前，人接受了一处跟冻结画布不同的设计（停下汇报里接受了实现者给的改法，或人自己改主意）：用 Skill 工具调 `idea-loop:design-change-sync` 照它做。与 `idea-loop:pr-review` 的差别：提交推送到**集成分支**；给 designer 的相关截图用执行方的素材，或人给的；评委判 `瓶颈` / `方向` 就写进 pending 当决定题，带评委意见与新旧两版截图；代码跟新画布不一致的（来源不是「接受实现」），照它写的追加设计变更那一格，提交 `docs(tickets): <NN> — 设计变更`，工单回到可派重派，已落地的工单按 `idea-loop:pr-review` 的「回工单」再派。

## 回收

只在工单落地（fast-forward 进集成分支）之后做。目标仓库 `DEVELOPMENT.md` 的「清理」写了命令就先跑它，然后：

1. 停掉这个 worktree 端口上的服务（`lsof -tiTCP:<端口> -sTCP:LISTEN` 找进程）。
2. 它还持有浏览器锁就释放：`node "${CLAUDE_PLUGIN_ROOT}/scripts/browser-lock.mjs" release .tmp/implement/<spec-slug>/browser.lock --force`。
3. 把它 `.tmp/implement/<spec-slug>/evidence/` 下的素材拷进集成分支 worktree 的同名目录。
4. `git worktree remove --force <路径>`（Claude 加的锁先 `git worktree unlock`），再 `git branch -D <它的分支>`。

卡住或失败的工单不回收：worktree 和分支留着，半成品在它的分支上，等人做完决定由下一个执行方接着用。素材照样先拷出来，停下汇报要用。
