# claude-desktop

Claude 桌面 app 里的做法。写法是 0.1.10 各流程正文里的原样：工具名、参数、提醒文案、规则都没改。命令行、IDE 插件按这份判，缺的工具走 [`SKILL.md`](../SKILL.md) 的退路。小节名与那里的能力清单一一对应。

## 定时任务

按时间开一个新会话跑一段 prompt，用定时任务 MCP：

- **列出**：`mcp__scheduled-tasks__list_scheduled_tasks`。没有这个工具（不在桌面 app 里）：走退路，把 prompt 给人，让人在桌面 app 的定时任务里自己建，并告诉人任务 id 该叫什么。
- **创建**：`create_scheduled_task`，参数 `taskId`、`title`、`cronExpression`（本机时间；分钟避开 0 和 30）、`prompt`。
- **更新**：`update_scheduled_task`，已有任务的 prompt 要换时用。
- **读上次成功运行的时间**：`mcp__scheduled-tasks__list_task_runs`，`taskId` 填任务 id，`limit` 取 50，从新到旧找第一条 `status` 是 `succeeded` 的，记下它的 `started_at`。正在跑的那次状态是 `running`，不会被选中。

prompt 里要起一个 skill，直接写斜杠命令，如 `/idea-loop:issue-triage`；只能由人调用的 skill 也这样起。

行为：

- app 关着时到点不跑，下次打开 app 时补跑。
- 定时任务跑出的会话用的是建它的会话的目录，所以要在目标仓库的主 checkout 里建。
- 跑完的会话在侧边栏的定时任务里看。
- 定时任务起的会话用 `SendMessage` 发不到别的会话（实测报错）；要给别的会话发消息，用「会话管理」的 `send_message`。

## 会话内循环

在当前会话里每隔一段时间再叫自己一次，用 `CronCreate` / `CronList` / `CronDelete`。loop 是本会话里的一个循环定时，7 天后自动删掉；到期后由一个只触发一次的提醒在这个会话里叫人重起。

起一个 loop：

1. `CronList`：本会话里已有的 loop 和到期提醒（prompt 以「调度 loop 已到期」开头）都用 `CronDelete` 删掉，重起时不留两个。
2. `CronCreate` 循环定时：间隔换成 cron（分钟避开 0 和 30），prompt 是要重复的命令，不带参数。
3. `CronCreate` 到期提醒：`recurring: false`，时间定在现在起 7 天加 10 分钟（loop 那时已经删掉），prompt：「调度 loop 已到期。在会话里说：<仓库名> 的 issue 调度 loop 7 天到期，已经停了，重新敲 /idea-loop:issue-dispatch <间隔> 起一个新的。用 PushNotification 发同一句。」
4. 汇报里写下次运行和到期的时间。

## 会话管理

用会话管理 MCP（`mcp__ccd_session_mgmt__*`）：

- **列会话**：`mcp__ccd_session_mgmt__list_sessions`，`group` 写 section 名，`limit: 100`，列出没归档的会话；section 自带的计数含已归档的，不用它。
- **开一个 issue 会话**：`start_session`，`initiation: own_initiative`，`context: fresh`，`use_worktree: true`（会话要有自己的 worktree 才能从调度会话里脱离出去），标题「<仓库名>#<号> <标题>」，再带 `prompt` 和 `background`。定时触发的轮次不能直接开会话，`start_session` 出的是卡片，人点了卡片会话才开；卡片一周不点会过期。
- **给别的会话发消息**：`mcp__ccd_session_mgmt__send_message`，`session_id` 填会话 id，`message` 填原文。工具还没加载就先用 ToolSearch 的 `select:mcp__ccd_session_mgmt__send_message` 加载。
- **读一个会话的记录**：`mcp__ccd_session_mgmt__export_transcript`，`session_id: self`，导出一个 zip，解开里面的会话记录文件。
- **本会话 id**：`get_session`（`self`），是 `local_…` 那一串。
- **会话收尾**：`archive_session`，`session_id: self`，`reason` 写「#<号> done」「#<号> 交给调度」「#<号> 先放着」之类；worktree 随归档清掉。
- **分组（侧边栏 section）**：issue 会话按状态待在三个 section 里：triage、in-progress、in-review；issue 在独立队列里（`issues queues <docs> <号>` 返回的 `name` 不是 `null`）就用它返回的 `sections`，即前面加了分类名的同名 section（如「seo in-progress」）。`list_sections` 列，缺的用 `create_section` 建。会话自己归位：`detach_session`（`self`）变成顶层会话（报错说不是被别的会话开出来的，就跳过），按认领后的状态找到对应的 section（triage 会话在 triage；todo 会话在 in-progress，PR 全部转 ready 后移到 in-review），再 `move_sessions`（`self`）移进去；标题不是「<仓库名>#<号> <标题>」的，`set_session_title` 改成这样：调度会话靠它数会话。调度会话只用 `list_sections` / `create_section` 和列会话，不移动、不归档任何会话。

### 调度（issue-dispatch 的三处）

- **怎么一轮一轮跑**：常驻调度会话里的会话内循环（步骤见「会话内循环」），`/idea-loop:issue-dispatch <间隔>` 起，之后每到点不带参数调一次，prompt 是 `/idea-loop:issue-dispatch`；7 天到期，由到期提醒叫人重起（提醒的 prompt 里写 `/idea-loop:issue-dispatch <间隔>`）。起好后汇报里写下次运行和到期的时间。
- **怎么数开着的会话**：`issues queues <docs>` 给出每个队列的三个 `sections`（triage、in-progress、in-review；独立队列的 section 名前加分类名）；缺的先用 `create_section` 建，再各用 `list_sessions` 列出没归档的会话。**只数标题匹配「<仓库名>#<号> …」的会话**（任何仓库名都算：section 跨项目共用，总数也跨项目算）；标题不匹配的是 issue 会话开出的子会话（如设计阶段并行开的 imagine 会话），它们跟 issue 会话待在同一个 section 里，但不占位，按队列记下个数。判别用标题，不用会话的 `startedBy`：点调度卡片开出的 issue 会话，`startedBy` 也是调度会话，跟子会话分不出来；issue 会话开场会把自己的标题改成这个格式，所以都能被数到。已知限制：issue 会话被人手动改了标题、不再匹配，就不会被数到，这个队列可能多出一张卡片；只多一个会话，不丢东西，接受。
- **怎么交出 issue**：出卡片，人点了才开。空位 = 队列上限 − 它开着的会话 − 它还没点的卡片（调度出过、issue 还是 todo 的；上一轮汇报里记着）。卡片一周不点会过期：过期的从「还没点的卡片」里去掉，下一轮会重新出。卡片的 `prompt`：`你是 <仓库名>#<号>（<标题>）的 issue 会话，由 issue 调度会话的卡片开出。用 Skill 工具调 idea-loop:issue-session，参数 <号>，按它从开场做起。`卡片的 `background`：这个仓库用 idea-loop 处理 issue，一个 issue 一个会话，会话按状态待在侧边栏的 triage、in-progress、in-review 里（独立队列的 issue 待在加了分类名的同名 section 里），你派的是 todo 的 issue，会话认领后从 spec 做到 PR 合并。

## 浏览器

两个浏览器，各管一件事：

| | Playwright | 内嵌浏览器 |
|---|---|---|
| 是什么 | 用户级配的 `playwright` MCP，以 `--headless --isolated` 启动，没有窗口，每次打开都是干净的配置 | Claude 桌面端对话旁边的浏览器面板，人和你看的是同一页 |
| 工具 | `mcp__playwright__browser_*`：打开地址（`browser_navigate`）、改视口、悬停、点击、截图（`browser_take_screenshot`，带 `target` 只截一个元素）、`browser_evaluate` 量值、读控制台 | `mcp__Claude_Browser__*`：`preview_start` 带 `url` 打开一页，`navigate` 换地址，`read_page` / `get_page_text` 读页面 |
| 负责 | 后台任务和子代理里的一切操作：截图、测量、走用户路径、复现问题，结果留在文件里 | 只给人预览：把页面摆给人看、让人自己点，截图代替不了这一步 |

`mcp__playwright__browser_*` 不在，停下，告诉人跑 `/idea-loop:setup`（你是子代理就在交回里写明）。

### 给人看

- 本地的 HTML 文件要给人看，先起静态服务器（`python3 -m http.server <port>`，后台跑），服务起好再 `preview_start` 那个地址。
- 用 `preview_start` 的 `url` 打开，之后在同一个标签页里 `navigate`。

内嵌浏览器只在桌面端有。不可用时按这个顺序退，并告诉人退到了哪一步：

1. 给本地地址 `http://127.0.0.1:<port>/…`，让人在自己的浏览器里开（终端里跑的 Claude Code 就是这种情况）。
2. 人连地址都打不开：截图拼成一张给人，并说明这样看不到动效和交互。

### Playwright 的限制

- 它拒绝 `file:` 地址；`file://` 下 ES 模块和 fetch 也会坏。本地文件同样经静态服务器打开。
- 它只能往工作区里写文件：截图先存进工作区，再挪到要放的位置。
- 跑 Playwright 代码的那个工具（`browser_run_code*`，如 `browser_run_code_unsafe`）写不了文件，也没有 `setTimeout`，等待用 `page.waitForTimeout(ms)`。代码的返回值只印在工具输出里；要存成文件，用 `browser_evaluate`（函数 `() => window.<变量>`，带 `filename`）。
- 在页面里跑脚本打印的一段 `async (page) => …` 代码（如 design-archive 的 `design-archive-sections.mjs`）：入口用 `browser_navigate` 打开，代码交给 `browser_run_code_unsafe` 跑；代码长就存成文件、用 `filename` 参数传，代码文件和输出目录要在 Playwright 的工作区根目录里，否则报「outside allowed roots」。读页面变量存成文件用 `browser_evaluate`，结果 JSON 就在 Playwright 的工作区里；页面里量值同样用它（如 `browser_evaluate(getComputedStyle)`、`__maTimeline.seek(t)`）。
- 慢网络、失败用请求拦截造：慢的在 `page.route` 里先等再 `continue`，失败用 `route.fulfill({ status: 500 })` 或 `route.abort()`。
- 很多页面要登录，isolated 的浏览器每次都没有登录态，每次照目标项目给的测试账号走一遍登录。

### 并行时抢锁

一个会话只有一个 MCP 浏览器，几个子代理同时用会点到对方的页面。调用方给了锁目录的，每次用 `mcp__playwright__browser_*` 之前先抢锁；自己起 chromium 的脚本（测量、拼流程图、录动图）不用。

1. 先把不需要浏览器的活做完，再抢：`node "${CLAUDE_PLUGIN_ROOT}/scripts/browser-lock.mjs" acquire <锁目录> --owner <你的名字>`。
2. 拿到后先 `browser_close` 一次，不继承上一个人的标签页和登录态；只访问自己端口上的页面。
3. 用完 `browser_close`，再 `node "${CLAUDE_PLUGIN_ROOT}/scripts/browser-lock.mjs" release <锁目录> --owner <你的名字>`。
4. 等了默认的 30 分钟还没拿到，就停下，在交回里写明卡在锁上。

## 向人提问

`AskUserQuestion`：2–4 个选项的单选题。选项装不下的分叉（要人评判的复合信息）不用它，用对话里的 markdown 问。

## 发布审阅页

`Artifact`：发布一页 HTML 给人看。人的批示在会话里回。

## 推送

`PushNotification`：人不在场时发一句话提醒（桌面通知），写明要人做什么。

## 发文件给人

用发送文件的工具：桌面端在侧栏打开，手机上也能看。聊天界面加载不了私有仓库的图片链接，图用它发，不贴链接。

## 调用 MCP

调原生工具。工具还没加载（延迟加载的工具）就先用 ToolSearch 的 `select:<工具名>` 加载。第三方服务（如 Linear）的工具名是那个服务器自己定的，不在这里列。

## 装与设置

告诉人怎么接：

- **MCP**：桌面 app 在设置的 Connectors 里加；命令行 `claude mcp add --scope user …`（如 `claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp`），再在 `claude` 里 `/mcp` 授权。查有没有：`claude mcp get <名字>`。
- **Playwright MCP**（必需）：查 `claude mcp get playwright`，要用户级、参数带 `--headless --isolated`；修法 `claude mcp add --scope user playwright -- npx -y @playwright/mcp --headless --isolated`。
- **Refero MCP**（可选，设计调研用）：查 `claude mcp get refero`，要用户级、http、`https://api.refero.design/mcp`；token 由人自己配，修法 `claude mcp add --scope user --transport http refero https://api.refero.design/mcp --header "Authorization: Bearer <token>"`。
- **允许规则**：人自己加进 `~/.claude/settings.json` 的 `permissions.allow`；这边只打印规则，不替人改权限设置。
