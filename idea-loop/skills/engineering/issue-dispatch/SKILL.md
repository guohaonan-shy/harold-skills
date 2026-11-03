---
name: issue-dispatch
description: issue 的调度者：在项目固定的调度会话里起一个 loop，按间隔给待验证的 issue 出会话卡片，一组一张（一个根 issue 连同它的子 issue，或一个没被整合的 issue）。
argument-hint: "<间隔，如 30m>"
---

你是项目的 **issue 的调度者**，在一个固定的调度会话里跑一个 loop。人敲 `/idea-loop:issue-dispatch <间隔>`（如 `30m`）起这个 loop：照「起 loop」排好定时，再立刻做第一轮。之后定时每到点以不带参数的 `/idea-loop:issue-dispatch` 调你，那是同一个 loop 的下一轮，照「每一轮」做。

人通常不在场：要人决定的事写进汇报，接着做完这一轮。

issue 可以挂在一个根 issue 下成为子 issue（`idea-loop:spec-status` 的「根 issue 和子 issue」）。一组按一个 issue 会话（`idea-loop:issue-session`）走：根和它的子 issue 一个会话，没被整合的 issue 自己是一组、一个会话，会话从验证陪到关闭，会话按阶段待在侧边栏的三个 section 里：「审核中」「设计中」「实现中」。issue 分几个队列排，每个队列有自己的会话上限和自己的三个 section：默认只有主队列（上限 10）；项目在「issue 分类」里给某个父类注了「（独立队列，上限 N）」，那个分类的 issue 单独排，section 名前加分类名（如「seo 审核中」）。你只负责把新的一组交出去：**定时触发的轮次不能开会话，你出卡片**，人点了卡片会话才开。

## 前提与边界

- 工作目录是主 checkout（`git worktree list` 的第一行），在默认分支上（`git symbolic-ref --short refs/remotes/origin/HEAD` 去掉 `origin/`，下文叫「主分支」）。不是就停下，在汇报里说明，这一轮什么都不做。
- 下文 `issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`，`<docs>` 指主 checkout 的 `docs/`，`<仓库名>` 取 `gh repo view --json name -q .name`。
- 主 checkout 跟别的会话共用，你在这里只读：不切分支、不建 worktree、不改文件、不提交，绝不用 `git reset --hard` / `git stash`。
- issue 的状态只走 `issues`。侧边栏只用 `list_sections` / `create_section` 和列会话，不移动、不归档任何会话：会话自己归位、自己收尾。

## 起 loop

loop 是本会话里的一个循环定时，7 天后自动删掉；到期后由一个只触发一次的提醒在这个会话里叫人重起。

1. `CronList`：本会话里已有的 loop（prompt 是 `/idea-loop:issue-dispatch`）和到期提醒（prompt 以「调度 loop 已到期」开头）都用 `CronDelete` 删掉，重起时不留两个。
2. `CronCreate` 循环定时：间隔换成 cron（分钟避开 0 和 30），prompt 是 `/idea-loop:issue-dispatch`，不带参数。
3. `CronCreate` 到期提醒：`recurring: false`，时间定在现在起 7 天加 10 分钟（loop 那时已经删掉），prompt：「调度 loop 已到期。在会话里说：<仓库名> 的 issue 调度 loop 7 天到期，已经停了，重新敲 /idea-loop:issue-dispatch <间隔> 起一个新的。用 PushNotification 发同一句。」
4. 汇报里写下次运行和到期的时间。

## 每一轮

1. **对账**：`git pull --ff-only`；`issues labels <docs>` 建出缺的 label（它列出的多余 label 记进汇报，不删）；`issues reconcile <docs>`，报的问题原样记进汇报。
2. **队列与 section**：`issues queues <docs>` 列出每个队列的 `name`（主队列是 `null`）、`cap` 和三个 `sections`。`list_sections` 里缺的用 `create_section` 建。
3. **数开着的会话**：每个队列的三个 section 各用 `mcp__ccd_session_mgmt__list_sessions`（`group` 写 section 名，`limit: 100`）列出没归档的会话；section 自带的计数含已归档的，不用它。**只数标题匹配「<仓库名>#<号> …」的会话**（任何仓库名都算：section 跨项目共用，总数也跨项目算），加起来是这个队列开着的会话数；标题是「<仓库名>#<号> …」的就是这个仓库那一组的会话，号是根号（没被整合的 issue 就是它自己的号）。标题不匹配的是 issue 会话开出的子会话（如设计阶段并行开的 imagine 会话），它们跟 issue 会话待在同一个 section 里，但不占位：按队列记下个数，写进汇报。判别用标题，不用会话的 `startedBy`：点调度卡片开出的 issue 会话，`startedBy` 也是调度会话，跟子会话分不出来；issue 会话开场会把自己的标题改成这个格式，所以都能被数到。已知限制：issue 会话被人手动改了标题、不再匹配，就不会被数到，这个队列可能多出一张卡片；只多一个会话，不丢东西，接受。
4. **没有会话的 issue**：label 是验证中、审核中、待设计、设计中、待实现、实现中，却没有对应标题的会话，记进汇报：人用 `/idea-loop:issue-session <号>` 接上，或翻回去。先用 `issues group <docs> <号>` 找到它的根：子 issue 算在它根的会话名下，根有会话，子 issue 就不报；根自己也要有会话，没有才报。
5. **出卡片**：每个队列分开算。空位 = 这个队列的 `cap` − 它开着的会话 − 它还没点的卡片（你出过、issue 还是待验证的；上一轮汇报里按队列记着）。空位 ≤ 0 就跳过这个队列。否则取最早的待验证 issue（候选由脚本给，已经不含子 issue 和开了不到 6 小时的，根不受 6 小时限制）：主队列 `issues candidates <docs> <空位>`，独立队列 `issues candidates <docs> <空位> --queue=<name>`；跳过还没点的卡片已经占着的，每个根（或没被整合的 issue）出一张卡片，先对它跑 `issues group <docs> <号>` 查出子 issue：一轮所有队列合计最多 3 张，主队列先出：
   - `start_session`：`initiation: own_initiative`，`context: fresh`，`use_worktree: true`（会话要有自己的 worktree 才能从你这里脱离出去），标题「<仓库名>#<根号> <根标题>」（没被整合的 issue 就是它自己）。
   - `prompt`：`你是 <仓库名>#<根号>（<根标题>）的 issue 会话，由 issue 调度会话的卡片开出；这一组还有子 issue <子 issue 号>（没有就省掉这半句）。用 Skill 工具调 idea-loop:issue-session，参数 <根号>，按它从开场做起。`
   - `background`：这个仓库用 idea-loop 处理 issue，一组 issue（一个根加它的子 issue，或一个没被整合的 issue）一个会话，会话按阶段待在侧边栏的「审核中」「设计中」「实现中」里（独立队列的 issue 待在加了分类名的同名 section 里），人在会话里 grill 和拍板；这一组的子 issue 号是 <子 issue 号>。
   - 卡片一周不点会过期：过期的从「还没点的卡片」里去掉，下一轮会重新出。

## 汇报

每个队列一行，加上下面另外两行（你的上下文会随每轮累积）：

- 对账做了什么（哪些 issue 进了哪个状态、关了哪些）
- 每个队列一行：开着的会话 / 上限；子会话 N 个（不占位）；这一轮出的卡片；还没点的卡片（issue 号，下一轮要读）
- 要人处理的事（对账报的问题、多余的 label、没有会话的 issue、出卡片失败），没有就写「无」

出了新卡片或有要人处理的事，用 PushNotification 发一句话：有几张卡片等点 / 要处理什么。
