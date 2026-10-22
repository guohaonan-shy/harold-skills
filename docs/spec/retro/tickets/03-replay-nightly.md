# 03 — 大的规则回放进夜间队列，每晚 01:07 跑

**Blocked by**：02 — 小的规则回放当场跑：改前红、改后绿
**设计冻结**：不涉及 UI

## 要建什么

大的回放（会起插件 agent、开浏览器或调付费服务）不在白天跑：

- 队列在 `~/.idea-loop/replay-queue/`，一个等回放的 PR 一个文件（仓库、PR 号、worktree 路径、用例列表）。执行方遇到大的用例，写好用例后放进队列，交回写「回放在队列里」；PR 等结果出来才进 pr-review。
- runner 加队列模式：开跑前核本机时间，不在 00:00–07:00 就不跑、队列原样留着（app 夜里关着、第二天早上补跑时，挡在这里）；队列空就立即退出；每个 PR 的用例照 02 的方式跑，结果写进那个 PR 的 review loop 文件、发一条推送，跑完的从队列删掉。
- `/idea-loop:setup` 多做三件事：把 runner 装到 `~/.idea-loop/bin/`（固定路径，不随 worktree 变）；建一个桌面 app 的循环计划任务，每晚 01:07，prompt 只跑一条以 runner 路径开头的命令；打印 runner 的允许规则（形如 `Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)`），让人自己加进 `~/.claude/settings.json`——setup 不改权限设置。
- 小回放（02）也改走这个固定路径的 runner，同一条允许规则。

为什么这样：计划任务起的无人值守会话改不了计划任务，所以「不在窗口就挪到下一晚」只能是「不跑、等下一晚」；命令不以允许规则覆盖的前缀开头会被 auto 分类器拦下（spec 1.2 实测）。依据：spec `retro` 的 4.9。

> 人的决定（2026-10-22）：入队时机选 A：执行方只写用例、交回写「回放在队列里」，PR 开出后由编排者入队。

> 人的决定（2026-10-22）：推送改成：队列文件记下 issue 会话的 id，夜间任务跑完把结果发回那个会话，macOS 通知留作兜底。回 03 改。（实测：桌面 app 计划任务起的无人值守会话能用 SendMessage 给本地的 issue 会话发消息，消息到达即唤醒那个会话；runner 是脚本调不到发消息的工具，所以由计划任务会话的 agent 按 runner 打印的结果逐条发。）

## 验收标准

- [x] runner 队列模式的纯函数有单测：09:12 → 不起任何 `claude -p`、队列原样；队列空 → 立即退出；一个 PR 的用例全过 → 结果写进 review loop 文件、队列文件删掉；有不过的 → 写进结果、队列文件删掉（结果交给人，不重跑）
- [x] 结果写进 review loop 文件的格式能被 `review-loop.mjs check` 读（作为一条记录，不打乱已有条目）
- [x] implementer 的说明写清：大的用例放进队列、交回写「回放在队列里」；implement / pr-review 的说明写清：有排队中的回放时 PR 不进 review
- [x] setup 的说明写清三件事（装 runner 到固定路径、建每晚 01:07 的循环计划任务、打印允许规则让人自己加）
- [ ] 在本机实际建一次计划任务：已建（`idea-loop-retro-replay`，`list_scheduled_tasks` 里有，每晚 01:07 加几分钟固定抖动），固定路径的 runner 在本机直接跑过空队列与时间窗外两种情形都立即退出；「立即运行」被 auto 分类器拒绝，允许规则也只能人自己加 ⏭ 延后 → PR 交付验收：请你把 `Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)` 加进 `~/.claude/settings.json`，在计划任务页点一次 Run now（应当立即退出、不花钱），并决定留还是删这个任务
- [x] 全量测试通过

- [ ] 人的决定（2026-10-22）：入队时编排者把 issue 会话的 id 写进队列文件；runner 跑完每个 PR 打印一行带目标会话 id 的结果摘要；setup 建的计划任务 prompt 让那场会话按这些行用 SendMessage 逐条发回对应的 issue 会话；发不出去（会话已归档、找不到）时照旧发 macOS 通知，结果照旧在 review loop 文件里。有单测覆盖「打印的结果行带会话 id」「队列文件缺会话 id 时退回只发通知」；implement / issue-session 的说明写清 issue 会话收到结果后做什么（全过接着走、有不过的停下摆给人）

## 选中的存量回归

- `review-loop.test.mjs`：runner 往 review loop 文件追加结果，确认已有的解析、`check`、归档行为不变
