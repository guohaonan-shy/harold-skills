# to-ticket-triage-stop

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle to-ticket-triage-stop --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：理论上spec冻结之后，issue的状态不是应该进入todo，等待下一次调度吗？怎么直接走到了ticket拆分

**是/否题**：会话没有写出工单文件，而是因为这个 issue 还在 triage 而停下，并指回「交给调度」（推送分支、翻 todo、之后由 todo 会话切工单）？

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：`570e135`，spec `design-tmp-worktree-root` 刚进主分支（状态「正式」，不碰 UI，还没有工单），同 `to-ticket-no-nod`。真实事件发生在别的项目里，那个项目的仓库状态拿不到；这道题看的是 to-ticket 在 triage 状态的 issue 会话里切不切票，不依赖那份 spec 的内容。选不碰 UI 的 spec，是为了让改前的 to-ticket 不会因为「设计没冻结」而停下，停不停只由 issue 状态决定。
- **prompt**：真实事件里是设计冻结提交后会话直接去切票；原 prompt 逐字不在仓库里。这里写成人当时的处境（issue 是 triage 状态、分支名、spec 已提交），再加一句顺着实现走的话「接下来开工实现吧，先把它切成工单」，加回放必须的补充：人不在场、禁止推送和 gh 写操作、不起 agent、不调 implement、最后说明停在哪。issue 号 101 是虚构的，免得会话去查一个会变的真实 issue。**没有提前写「该交给调度」**。
- **缺的**：真实事件里 issue 状态由 issue-session 的开场读出；回放里没有真的 issue，状态靠 prompt 告知。
- **改前预计答「否」**：改前的 to-ticket 只核「没有待定」「设计已冻结」，不看 issue 状态，会把工单切出来；改后的 to-ticket 在 issue 会话里看到 issue 还在 triage 就停下，指回交给调度。
- **判定依据**：看交回的最后一段回复和工作区：`docs/spec/design-tmp-worktree-root/tickets/` 下有没有新工单文件，回复里说的是不是 issue 还在 triage、该推送分支翻 todo。

## prompt 改写记录

- 2026-11-16（#287 工单 07）：这个用例最初写成「`/idea-loop:uiux-refine` 冻结提交后，会话下一步做什么」，在 `cb0b4c2`（spec `ui-state-archive`）上跑了三次，改前的插件每次都读 `issue-session`、看出这是 triage 会话、选了交给调度（三次都是「用例没抓住问题」）：新起的会话不会像真实事件里那个跑了很久的编排会话一样掉进切票。改成直接调 `to-ticket`、人说「开工实现」，看 to-ticket 自己拦不拦。
- 2026-11-16（#287 工单 07，第二版 prompt）：改成直接调 `to-ticket`、人说「开工实现」后又跑了一次，改前的 to-ticket 同样在读了 `issue-session` 之后以 triage 为由停下，指回交给调度（「用例没抓住问题」第四次）。**这个用例至今没在改前判出「否」**：新起的会话读得到 `issue-session`，自己会看出该交给调度；真实事件里掉进切票的是跑了很久的编排会话，一次小用例复现不出。留着它守「改后不退化」，不当作「规则让 skill 变了」的证据。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
