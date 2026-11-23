# magi

magi（管理 Claude Code / Codex 会话的工具）里的做法。magi 的能力是 shell 命令 `magi …`，不是 MCP 工具；命令的准确写法以 `magi help <主题>` 为准。**子 agent 看不到 magi 的说明**：派它们时把要用的命令原样写进 prompt。小节名与能力清单一一对应。

## 定时任务

按时间开一个新会话跑一段 prompt，用 `magi cron`：

- **创建**：`magi cron create <id> --expr "<5 段 cron>" --action create_session --cwd <工作目录> --prompt …`。表达式按人在 magi 设的时区（`magi cron show` 的 when 一行会显示），分钟避开 0 和 30（跟桌面端一样）。创建者自己的任务最短每 5 分钟跑一次。
- **列出**：`magi cron list`。
- **读上次运行**：`magi cron list` / `magi cron show <id>` 里的上次运行时间。不带每次的成败：流程要「上次成功运行」的，magi 给不出，当作没有（流程按没有基准处理，如 dreaming 的截图对账做全量；项目没有设计档案时 dreaming 本来就不做截图对账）。
- **改、停、删**：`magi cron edit <id> [--expr …] [--enable|--disable] [--prompt …]`，`magi cron delete <id>`。

行为：到点开出一个新会话，目录是 `--cwd`，所以 `--cwd` 填目标仓库的主 checkout（按项目的任务，如每周分拣）；设备级的任务（`dispatch-home`、`dreaming-home`）填 home。

任务 id 的命名照各流程自己定的（如 `triage-<仓库名>`、设备级的 `dispatch-home`）。

**prompt 写法**：magi 发给会话的「/命令」不会被当成命令执行，所以 prompt 写成「用 Skill 工具调 idea-loop:<skill>」，如 `用 Skill 工具调 idea-loop:issue-triage`。只能由人调用的 skill（`disable-model-invocation: true`）不能这样起，走退路：把 prompt 和要它做的事交给人。

## 会话内循环

在当前会话里每隔一段时间再叫自己一次，用 `magi wake`：

- `magi wake every <间隔 | "<5 段 cron>"> "<文本>" [--until <日期> | --until never]`：到点时文本作为新的一轮回到本会话。不加 `--until` 7 天后结束，最长 30 天或 `never`。
- `magi wake list`：本会话的定时。
- `magi wake cancel <id>`：取消。

调度在 magi 里不用它，用「定时任务」（见「会话管理」的调度）。

## 会话管理

用 `magi sessions`：

- **列会话**：`magi sessions list`。
- **开一个 issue 会话**：`dyna runtime handoff …`，两种运行环境同一条，命令自己认环境；参数和结果见「调度」的「怎么交出 issue」第 2 步。
- **给别的会话发消息**：`magi sessions send <会话> <文本 | ->`。
- **读一个会话的记录**：`magi sessions show <会话> -o <文件>`，`-o` 写出整份。
- **会话收尾**：`magi sessions stop <会话>`，对自己可用，会话停掉自己。会话不能归档自己（`magi sessions archive` 只收它开出的 helper）；停掉的会话由人在 magi 或 Dawn 里归档。
- **分组：没有**。magi 本期不维护状态分组，要分组的步骤直接跳过（不算未做）。

### 调度（issue-dispatch 的三处）

- **怎么一轮一轮跑**：`magi cron`（「定时任务」）每轮新开一个调度会话来跑 `idea-loop:issue-dispatch`，整台设备一个，id `dispatch-home`，每 30 分钟一次（表达式 `7,37 * * * *`），工作目录（`--cwd`）是 home，人要换间隔就 `magi cron edit`；跑完一轮 `magi sessions stop` 停掉自己，不用常驻会话。人手敲 `/idea-loop:issue-dispatch`（不带间隔，在哪个目录都行）：照那个 skill 的「起调度」，用「定时任务」建（已有就 `magi cron edit`）这个任务，prompt 是 `用 Skill 工具调 idea-loop:issue-dispatch`；旧的 `dispatch-<仓库名>` 任务用 `magi cron edit <id> --disable` 停用（不删）；再立刻做第一轮。
- **怎么数开着的会话**：`magi sessions list` 里 slug 前缀是 `<仓库名>-<号>`、状态不是 stopped / exited / dead、也没归档的。不是这个前缀的会话（如 issue 会话开出的子会话）不占位，记下个数。magi 没有分组，按会话对应 issue 的状态数：用 slug 里的仓库名（对上 `repo` 斜杠后那段）在 `dyna home projects` 里找到那个项目的 `<docs>`，再用号读 issue 的状态（GitHub 项目跑 `issues show <docs> <号>`；Linear 项目 `issues show` 不读状态，照 `idea-loop:issues` 的 Linear 做法用 `get_issue` 读、对着 `ISSUE_TRACKER.md` 的状态表换算）。数两样：状态是 triage 的会话数、状态是 in-progress 的会话数，任何仓库名都算，整台设备一个数，不看活动时间（in-review 不数）；各项目的同号会话按仓库名分开记，**同号只认本项目仓库名**，别的项目的 #N 不挡本项目的 #N。
- **怎么交出 issue**：先给会话建 worktree，再开会话，直接开，不等人。这一轮能开几个照 `idea-loop:issue-dispatch` 的「每一轮」第 4 步算（`dyna home dispatch` 的 `perRound` 和 `caps`、上一条数到的各状态会话数），只派 `dispatch` 那一种（`triage` 或 `todo`），先跳过本项目已有同号会话的（triage 会话开着时 issue 仍是 triage，todo 会话认领前 issue 仍是 todo），再取够个数。一轮最多开 `perRound` 个。派 `todo` 的时段，prompt 句尾加「夜间模式。」。开出后调度记录（`~/.idea-loop/dispatch/<仓库名>.json`，早上汇总读它）由命令追加。triage 会话开场起草 spec、自校验，碰到要人定的就推送一句话停下等人（`idea-loop:issue-session`「跟人定要 grill 的」）。
  1. **建 worktree**（桌面端 `start_session` 的 `use_worktree` 对应的做法；会话不再开在 clone，多个会话不互相踩）：`<clone>` 是这个 issue 所在项目的本地 clone（`dyna home projects` 的 `cloneDir`）。路径是 `<clone 的上一级>/<仓库名>-worktrees/<号>-<slug>`，在 clone 外面（它的同级），所以 clone 的工作区和分支都不动，调度对 clone 只快进拉取、建 worktree 的前提不变。`<slug>` 取 issue 标题的几个词，小写、连字符。`<基准分支>` 是 `<项目目录>/DEVELOPMENT.md`「分支」节的基准分支（`origin/<基准分支>` 取这一轮对账 `git pull` 之后的）。**triage 会话不建分支**：`git -C <clone> worktree add --detach <路径> origin/<基准分支>`，spec 直接提交到 home，要写代码时 todo 会话自己接分支（`idea-loop:issue-session` 的开场第 4 步）。其余会话的分支名取 `issues show` 给出的 issue 分支（先放着或上次会话留下的），没有就是 `issue/<号>-<slug>`。先查这条分支有没有，有就接上，不新建同名分支（先放着的 issue 分支还在，再 `-b` 新建会报「分支已存在」，这个 issue 每一轮都开不出会话）：
     - 本地有（`git -C <clone> show-ref --verify --quiet refs/heads/<分支>` 成功）：`git -C <clone> worktree add <路径> <分支>`。
     - 只有远端有（`refs/remotes/origin/<分支>`）：`git -C <clone> worktree add --track -b <分支> <路径> origin/<分支>`。
     - 两处都没有：`git -C <clone> worktree add <路径> -b <分支> origin/<基准分支>`。

     路径已经存在、就是这条分支的 worktree（上一轮建了没开起来）：直接用。
  2. **开会话**：`dyna runtime handoff --worktree <那个 worktree> --issue <号> --repo <仓库名> --period <dispatch> --cap <能力>… --prompt-file <prompt 文件>`（在沙箱外跑，它要联网；`<dispatch>` 取 `todo` 或 `triage`；`--cap` 每个能力一个；`--prompt-file` 是写好 issue 会话 prompt 的文件，放在 worktree 外）。命令开出会话，并往 `~/.idea-loop/dispatch/<仓库名>.json` 追加一条 `{issue, desktopSessionId, openedAt, period}`。成功：stdout 一行 JSON，`desktopSessionId` 是会话 id；`recorded` 是 `false` 说明记录没写进去，写进汇报（早上汇总会少这一条）。失败：stderr「交出失败：<原因>」，退出码 1，写进汇报，这个 issue 下一轮再试，不在本轮重试。magi 里：命令在 worktree 里跑 `magi sessions start --cwd <那个 worktree> --slug <仓库名>-<号> --cap … <prompt 文件的内容>`，直接开，不等人点；`desktopSessionId` 填的是 magi 的会话 id；缺 `--prompt-file`（或 `--worktree`、`--issue`、`--repo`、`--period`）直接交出失败。
  3. **worktree 准备**不由调度做：issue 会话开场照 `<项目目录>/DEVELOPMENT.md` 的「worktree 准备」做。

  **`--cap` 的能力名**：会话只拿到 `--cap` 列出的能力（不给就只有 magi），而且不会比开它的会话多。调度开会话给 `magi`、issue 平台的 MCP 服务器名、`browser` 三项（`--cap magi --cap <MCP 服务器名> --cap browser`）。`magi`（会话要用 `magi sessions stop` 收尾、`magi mcp call`、`magi artifact`）、`browser`（`magi browser`）、issue 平台在 magi 里托管的 MCP 服务器名，取 `magi mcp list` 里的名字，原样照写（Linear 项目是 `linear`）。GitHub 项目用 `gh`，没有这一项。调度会话自己没有的能力给不出；`start` 因此被拒，就是「交出失败」，在汇报里写缺哪个，不重试。

issue 会话认领后照常翻状态，不挪分组；做完（PR 合并或 issue 取消）后 `magi sessions stop` 停掉自己。

**worktree 的清理**：issue 会话做完、停掉自己之前，先回收自己的 worktree：`git -C <clone> worktree remove <worktree>`，再 `git -C <clone> branch -D <分支>`（分支已合并或 issue 已取消才删）。同一个目录可能有两个路径（例如主目录挂在两个名字下），git 记下的是建它时的那个，换个路径删会报「does not point back」：先 `git -C <worktree> status --porcelain` 确认没有未提交的改动，再删掉这个目录、`git -C <clone> worktree prune`。建和删用同一个 clone 路径（`git -C` 后面写的那个），就碰不到这个问题。

## 浏览器

用 `magi browser`：每个会话自带一个匿名浏览器，无头测量用它。

- 开页面、读页面：`magi browser open <地址>`，`snapshot`（元素树，给出 `@bN` 引用），`get url|title|text|box`。
- 操作：`click`、`fill`、`type`、`key`、`scroll`、`select`、`wait`。
- 看：`screenshot [-o 文件.png]`，`network`（已完成的请求，看不到头和体），`emulate --tab <tN> --color-scheme dark|light`、`--device phone|tablet`（手机视口与深色）。
- **不能执行任意 JS**：量值用元素盒子（`get box`）与截图。需要在页面里跑一段 JS 的流程，在 magi 里走能力清单的退路（把要做的事交给人，记「未做：运行环境 magi 没有『浏览器』的执行任意 JS」）：design-archive 拍档案截图与测量（命令打印的是一段 `async (page) => …` 代码）、uiux-imagine 在线上 UI 上取 `outerHTML` 与整页 CSS、uiux-refine 里 `__maTimeline.seek(t)` 与 `getComputedStyle` 的验证。自起 chromium 的命令（测量、拼流程图、录动图）不受影响，照旧。
- **子 agent 各自开窗口**：先 `magi browser window new`，之后每条命令都带 `--tab <tN>`，不碰别的 agent 的标签页。所以不需要锁目录。
- **造慢网络、失败的请求：没有**。`network` 只读已完成的请求，不能拦截。需要这种状态的格走退路，交给人。
- **把一页摆给人看：没有**。匿名浏览器只有本会话看得到，人看不到。退路：截一张图，经「发文件给人」发出，并附上页面的 URL，让人自己打开；说明这样看不到动效和交互。
- 人的输入优先于你的：命令报 `human_active` 时，约 10 秒后再试。

### 给人看

只给人预览：把页面摆给人看、让人自己点，截图代替不了这一步。

- 本地的 HTML 文件要给人看，先起静态服务器（`python3 -m http.server <port>`，后台跑），服务起好再把那个地址给人。
- 「把一页摆给人看」在 magi 里没有（见上）：走那里写的退路（截图经「发文件给人」发出，附上 URL），并告诉人退到了这一步。

### 无头

后台任务和子代理里的一切操作都走 `magi browser`：开页面、量、截图、走用户路径、复现问题，结果留在文件里。

- 本地文件同样经静态服务器打开：`file:` 地址在有的浏览器里被拒，`file://` 下 ES 模块和 fetch 也会坏。
- 这份参考没有记下 magi 对截图位置的限制：`screenshot -o` 直接存到要放的位置。
- 很多页面要登录。匿名浏览器每次都没有登录态，每次照目标项目给的测试账号走一遍登录（在项目目录的 `DEVELOPMENT.md` 或代码仓库的 `CLAUDE.md` 里找）。找不到：在跟人对话的会话里问人；你是子代理就停下，在交回里写明缺测试账号。
- 截之前把页面带到要看的那个数据状态，组件处在静止态：截到错的状态或加载中，它就成了错的基准。
- 要造慢网络、失败的请求：没有（见上），这一格走退路。

### 并行时抢锁

每个子 agent 先 `magi browser window new` 开自己的窗口，之后每条命令都带 `--tab <tN>`，不碰别的 agent 的标签页，所以不需要抢锁；自己起 chromium 的命令（测量、拼流程图、录动图）同样不用。

## 人的浏览器

**没有**。`magi browser` 是每个会话自带的匿名浏览器，不带人的登录态，也不是人在用的那个窗口（见「浏览器」）。走能力清单的退路：把要填的内容和网址交给人。

## 向人提问

没有专门的工具：在对话里用编号选项问，等人回。

## 发布审阅页

`magi artifact push <文件或目录>`，打印页面的网址（目录当静态站点，根下要有 `index.html`）。收回人的批示：页面里 `<script src="/artifacts/sdk.js"></script>`，调 `magi.reply({text, data})`，批示作为一条用户消息回到发布它的会话。同一页重发用 `--id <ID>`。网址知道就能打开，页面里不放密钥。

## 推送

`PushNotification`，同桌面端。

## 发文件给人

`magi artifact push <文件>`，把打印出来的链接贴进对话。链接知道就能打开，不发密钥和不能公开的内容。

## 调用 MCP

magi 托管的优先：

1. `magi mcp list` 看有没有这个服务器。
2. 有：第一次先读 `magi mcp info <服务器>`，需要时 `magi mcp tools <服务器> [<工具>]` 看参数，然后 `magi mcp call <服务器> <工具> key=value…`。参数名跟原生工具一样；值是 JSON 的写成 `key:=json`。
3. 没有：再看会话里有没有原生工具。

## 装与设置

告诉人怎么接：

- **MCP**：人在 magi 网页的 Integrations → MCP servers 里加（Linear、Mobbin 等；查有没有：`magi mcp list`）。
- **Mobbin MCP**（可选，设计调研用，要 Mobbin 付费计划）：magi 里的 MCP 都在上面那个入口加：人加一个名为 `mobbin`、地址 `https://api.mobbin.com/mcp`、走 OAuth 登录的服务器；起调研员的会话用 `magi mcp call mobbin …` 调它。`magi mcp list` 里没有 `mobbin`，设计调研就停下，只有它受影响。
- **Playwright MCP**：不用装，浏览器是 `magi browser`。
- **插件**：在 magi 会话里 `/plugin`。
- **允许规则、设置**：人自己改 `$CLAUDE_CONFIG_DIR/settings.json`；这边只打印规则，不替人改权限设置。
