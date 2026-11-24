# claude-desktop

标记：没有

「标记」：只有这个环境的会话里才有值的环境变量，dyna 靠它认环境；桌面端没有。

Claude 桌面 app 里的做法。命令行、IDE 插件按这份判，缺的工具走能力清单的退路（`dyna runtime show` 不带能力就打印）。小节名与能力清单一一对应。

## 定时任务

按时间开一个新会话跑一段 prompt，用定时任务 MCP：

- **列出**：`mcp__scheduled-tasks__list_scheduled_tasks`。没有这个工具（不在桌面 app 里）：走退路，把 prompt 给人，让人在桌面 app 的定时任务里自己建，并告诉人任务 id 该叫什么。
- **创建**：`create_scheduled_task`，参数 `taskId`、`title`、`cronExpression`（本机时间；分钟避开 0 和 30）、`prompt`。
- **更新**：`update_scheduled_task`，已有任务的 prompt 要换时用。
- **读上次成功运行的时间**：`mcp__scheduled-tasks__list_task_runs`，`taskId` 填任务 id，`limit` 取 50，从新到旧找第一条 `status` 是 `succeeded` 的，记下它的 `started_at`。正在跑的那次状态是 `running`，不会被选中。

prompt 里要起一个 skill，直接写斜杠命令，如 `/idea-loop:issue-triage`；只能由人调用的 skill 也这样起。

行为：

- app 关着时到点不跑，下次打开 app 时补跑。
- 定时任务跑出的会话用的是建它的会话的目录：按项目的任务（如每周分拣）在目标仓库的主 checkout 里建；设备级的（`dispatch-home`、`dreaming-home`）在 home 里建。
- 跑完的会话在侧边栏的定时任务里看。
- 定时任务起的会话用 `SendMessage` 发不到别的会话（实测报错）；要给别的会话发消息，用「会话管理」的 `send_message`。

## 会话内循环

在当前会话里每隔一段时间再叫自己一次，用 `CronCreate` / `CronList` / `CronDelete`：

- `CronCreate`：间隔换成 cron（分钟避开 0 和 30），prompt 是要重复的文字。
- `CronList`：本会话里的 loop。
- `CronDelete`：取消一个 loop。

loop 是本会话里的循环定时，7 天后自动删掉。

调度在桌面端不用它，用「定时任务」（见「会话管理」的调度）。

## 会话管理

用会话管理 MCP（`mcp__ccd_session_mgmt__*`）：

- **列会话**：`mcp__ccd_session_mgmt__list_sessions`，`group` 写 section 名，`limit: 100`，列出没归档的会话；section 自带的计数含已归档的，不用它。
- **开一个 issue 会话**：`dyna runtime handoff …`，两种运行环境同一条，命令自己认环境；参数和结果见「调度」的「怎么交出 issue」第 2 步。
- **给别的会话发消息**：`mcp__ccd_session_mgmt__send_message`，`session_id` 填会话 id，`message` 填原文。工具还没加载就先用 ToolSearch 的 `select:mcp__ccd_session_mgmt__send_message` 加载。
- **读一个会话的记录**：`mcp__ccd_session_mgmt__export_transcript`，`session_id: self`，导出一个 zip，解开里面的会话记录文件。
- **本会话 id**：`get_session`（`self`），是 `local_…` 那一串。
- **会话收尾**：`archive_session`，`session_id: self`，`reason` 写「#<号> done」「#<号> 交给调度」「#<号> 先放着」之类；worktree 随归档清掉。
- **分组（侧边栏 section）**：issue 会话按状态待在三个 section 里：triage、in-progress、in-review（名字取 `dyna home dispatch` 返回的 `sections`，不带分类名）。`list_sections` 列，缺的用 `create_section` 建。会话自己归位：`detach_session`（`self`）变成顶层会话（报错说不是被别的会话开出来的，就跳过），按认领后的状态找到对应的 section（triage 会话在 triage；todo 会话在 in-progress，PR 全部转 ready 后移到 in-review），再 `move_sessions`（`self`）移进去；标题不是「<仓库名>#<号> <标题>」的，`set_session_title` 改成这样：调度会话靠它数会话。调度会话列分组、缺的建，不归档任何会话，只在开会话那一步移动它开出的会话。

### 调度（issue-dispatch 的三处）

- **怎么一轮一轮跑**：桌面定时任务，整台设备一个 `dispatch-home`，每 30 分钟一次，每次运行开一个新的调度会话、跑一轮就结束。人敲 `/idea-loop:issue-dispatch`（在哪个目录都行）起：照那个 skill 的「起调度」，用「定时任务」在 home 里建（已有就 `update_scheduled_task`）：id `dispatch-home`，标题 `issue 调度`，`cronExpression` 取 `7,37 * * * *`，prompt `/idea-loop:issue-dispatch`；旧的 `dispatch-<仓库名>` 用 `update_scheduled_task` 带 `enabled: false` 停用（不删）；然后立刻做第一轮。起好后汇报里写下次运行的时间，并提醒人把 `dispatch-home` 的模型选成 Sonnet：建任务的工具没有模型和思考强度的参数，只能人在 app 里建或改任务时手动选。
- **怎么数开着的会话**：`dyna home dispatch` 给出此刻的 `dispatch`、`perRound`、`caps` 和三个 `sections`（triage、in-progress、in-review）；缺的先用 `create_section` 建，再各用 `list_sessions`（`group` 写分组名，`limit: 100`）列出没归档的会话。**只数标题匹配「<仓库名>#<号> …」的会话**，数两样：triage、in-progress 各开着几个，任何仓库名都算（整台设备一个数；in-progress 的全算，不看活动时间；in-review 的不数）；各项目的同号会话按仓库名分开记，**同号只认本项目仓库名**。标题不匹配的是 issue 会话开出的子会话（如设计阶段并行开的 imagine 会话），它们跟 issue 会话待在同一个分组里，但不占位，记下个数。判别用标题，不用会话的 `startedBy`；交出时调度会给新会话改成这个标题，所以下一轮数得到。已知限制：标题被人手动改了就数不到，可能多开一个，接受。
- **怎么交出 issue**：直接开会话，不需要人点，四步，每个 issue 一次，一轮最多 `perRound` 个（算式见 `idea-loop:issue-dispatch`）。人在调度会话里说话的那一轮也走这条路。
  1. **建 worktree**：`<clone>` 是 issue 所在项目的本地 clone（`cloneDir`）。路径是 `<clone 的上一级>/<仓库名>-worktrees/<号>-<slug>`，在 clone 外面，所以 clone 的工作区和分支都不动。`<slug>` 取 issue 标题的几个词，小写、连字符。**triage 会话不建分支**：命令同下面「两处都没有」那条，把 `-b <分支>` 换成 `--detach`；spec 直接提交到 home，要写代码时 todo 会话自己接分支（`idea-loop:issue-session` 的开场第 4 步）。todo 会话的分支名取 `issues show` 给出的 issue 分支（先放着或上次会话留下的），没有就是 `issue/<号>-<slug>`。先查这条分支有没有，有就接上，不新建同名分支（上次会话归档时只清了工作区，分支还在，再 `-b` 新建会报「分支已存在」，这个 issue 每一轮都开不出会话）：
     - 本地有（`git -C <clone> show-ref --verify --quiet refs/heads/<分支>` 成功）：`git -C <clone> worktree add <路径> <分支>`。
     - 只有远端有（`refs/remotes/origin/<分支>`）：`git -C <clone> worktree add --track -b <分支> <路径> origin/<分支>`。
     - 两处都没有：`git -C <clone> worktree add <路径> -b <分支> origin/<基准分支>`，`<基准分支>` 是 `<项目目录>/DEVELOPMENT.md`「分支」节的基准分支（`origin/<基准分支>` 取这一轮对账 `git pull` 之后的）。

     路径已经存在、就是这条分支的 worktree（上一轮建了没交出去）：直接用。
  2. **开会话并交到桌面端**：`dyna runtime handoff --worktree <那个 worktree> --issue <号> --repo <仓库名> --period <dispatch> --cap <能力>… --prompt-file <prompt 文件>`（在沙箱外跑，它要联网；`<dispatch>` 取 `todo` 或 `triage`；`--cap` 每个能力一个；`--prompt-file` 是写好 issue 会话 prompt 的文件，放在 worktree 外）。命令开出会话，并往 `~/.idea-loop/dispatch/<仓库名>.json` 追加一条 `{issue, desktopSessionId, openedAt, period}`。成功：stdout 一行 JSON，`desktopSessionId` 是会话 id；`recorded` 是 `false` 说明记录没写进去，写进汇报（早上汇总会少这一条）。失败：stderr「交出失败：<原因>」，退出码 1，写进汇报，这个 issue 下一轮再试，不在本轮重试。桌面端里：不用 `start_session`；命令先用 `claude -p` 开出会话，再跑 `claude --desktop --resume <id>` 交到桌面，退出码 0 算成功，`desktopSessionId` 是 `local_<id>`；不读 `--cap`、`--prompt-file`，任务在第 4 步发。
  3. **归位**：`set_session_title` 把 `local_<id>` 改成「<仓库名>#<号> <标题>」，再用 `mcp__ccd_sidebar__move_sessions` 移进对应分组（`triage` 进 triage，`todo` 进 in-progress）；这是调度唯一一次移动别的会话。移动被拦（没加允许规则，见「装与设置」）：会话已经开着，但不在分组里，数不到，所以这一轮不再交出别的 issue，汇报里写明并推送，要人加规则。
  4. **发任务**：用会话间消息 `send_message` 把 issue 会话的 prompt（`idea-loop:issue-dispatch` 里写的）发给 `local_<id>`。要在交到桌面端之后才发：`claude -p` 跑着的时候桌面端看不见它、调度数不到它，夜里会超开。

  已知限制：交到桌面端时，桌面端把这个会话打开到前台，白天开 triage 会话会抢人的窗口，接受。

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

### 无头

- 很多页面要登录。isolated 的浏览器每次都没有登录态，每次照目标项目给的测试账号走一遍登录（在项目目录的 `DEVELOPMENT.md` 或代码仓库的 `CLAUDE.md` 里找）。找不到：在跟人对话的会话里问人；你是子代理就停下，在交回里写明缺测试账号。
- 截之前把页面带到要看的那个数据状态，组件处在静止态：截到错的状态或加载中，它就成了错的基准。

### Playwright 的限制

- 它拒绝 `file:` 地址；`file://` 下 ES 模块和 fetch 也会坏。本地文件同样经静态服务器打开。
- 它只能往工作区里写文件：截图先存进工作区，再挪到要放的位置。
- 跑 Playwright 代码的那个工具（`browser_run_code*`，如 `browser_run_code_unsafe`）写不了文件，也没有 `setTimeout`，等待用 `page.waitForTimeout(ms)`。代码的返回值只印在工具输出里；要存成文件，用 `browser_evaluate`（函数 `() => window.<变量>`，带 `filename`）。
- 在页面里跑命令打印的一段 `async (page) => …` 代码（如 `dyna design archive sections`）：入口用 `browser_navigate` 打开，代码交给 `browser_run_code_unsafe` 跑；代码长就存成文件、用 `filename` 参数传，代码文件和输出目录要在 Playwright 的工作区根目录里，否则报「outside allowed roots」。读页面变量存成文件用 `browser_evaluate`，结果 JSON 就在 Playwright 的工作区里；页面里量值同样用它（如 `browser_evaluate(getComputedStyle)`、`__maTimeline.seek(t)`）。
- 慢网络、失败用请求拦截造：慢的在 `page.route` 里先等再 `continue`，失败用 `route.fulfill({ status: 500 })` 或 `route.abort()`。

### 并行时抢锁

一个会话只有一个 MCP 浏览器，几个子代理同时用会点到对方的页面。调用方给了锁目录的，每次用 `mcp__playwright__browser_*` 之前照下面的步骤先抢锁；自己起 chromium 的命令（测量、拼流程图、录动图）不用。

1. 先把不需要浏览器的活做完，再抢：`dyna ui lock acquire <锁目录> --owner <你的名字>`。
2. 拿到后先 `browser_close` 一次，不继承上一个人的标签页和登录态；只访问自己端口上的页面。
3. 用完 `browser_close`，再 `dyna ui lock release <锁目录> --owner <你的名字>`。
4. 等了默认的 30 分钟还没拿到，就停下，在交回里写明卡在锁上。

### 要麦克风的流程

不走 MCP 浏览器（授权后拿到真麦克风），用 `@playwright/cli` 带假麦克风自己走完：读 `${CLAUDE_PLUGIN_ROOT}/runtime/claude-desktop-mic.md`。

## 人的浏览器

用 Claude in Chrome：人自己的 Chrome，带人的登录态，工具是 `mcp__claude-in-chrome__*`。跟「浏览器」里的两个不同：Playwright 每次是干净的、没有登录；内嵌浏览器是 Claude 桌面端自己的面板，也不是人的 Chrome 配置。

- 工具是延迟加载的：一次 `ToolSearch` 用 `select:` 把要用的几个都加载（`tabs_context_mcp`、`tabs_create_mcp`、`navigate`、`read_page`、`find`、`form_input`、`computer`、`tabs_close_mcp`），不一个一个加载。
- 先 `tabs_context_mcp` 看人开着哪些标签页；用 `tabs_create_mcp` 开新标签页干活，不动人已有的标签页，用完 `tabs_close_mcp` 关掉自己开的（要留给人点的那一页除外）。
- 开页面 `navigate`，读页面 `read_page` / `get_page_text`，填表 `form_input`，截图 `computer` 的 `screenshot`。
- 遇到登录页、验证码、支付页：停下，交给人；不替人输密码，不过人机验证。
- 扩展没连上、工具不在：走能力清单的退路。

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
- **Mobbin MCP**（可选，设计调研用，要 Mobbin 付费计划）：由插件自带（`.mcp.json` 的 `mobbin`，远程 http，`https://api.mobbin.com/mcp`），不用 `claude mcp add`。查：`claude mcp list` 里 `plugin:idea-loop:mobbin` 一行，`Connected` 就是好的；写着 `Needs authentication` 的，修法是在 `claude` 里 `/mcp`，选它，走 OAuth 登录 Mobbin。看不到这一行：插件没装或没重载（`/reload-plugins`），或者已经手动配过一个同地址的 Mobbin（`claude mcp list` 里另有一行指向 `https://api.mobbin.com/mcp`，常见的是用户级的 `mobbin`）：Claude Code 只连优先级高的那份，调研员按工具短名取工具，手动配的也能用，只要登录了；`Needs authentication` 的同样 `/mcp` 登录。没连上时只有设计调研受影响。
- **允许规则**：人自己加进 `~/.claude/settings.json` 的 `permissions.allow`；这边只打印规则，不替人改权限设置。
  - 调度要加一条：`mcp__ccd_sidebar__move_sessions`。不加，无人值守时调度移动别的会话会被拦，夜里开出的会话进不了分组，就数不到（`/idea-loop:setup` 照这里打印）。
