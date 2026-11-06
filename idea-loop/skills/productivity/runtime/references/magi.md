# magi

magi（管理 Claude Code / Codex 会话的工具）里的做法。magi 的能力是 shell 命令 `magi …`，不是 MCP 工具；命令的准确写法以 `magi help <主题>` 为准。**子 agent 看不到 magi 的说明**：派它们时把要用的命令原样写进 prompt。小节名与 [`SKILL.md`](../SKILL.md) 的能力清单一一对应。

## 定时任务

按时间开一个新会话跑一段 prompt，用 `magi cron`：

- **创建**：`magi cron create <id> --expr "<5 段 cron>" --action create_session --cwd <主 checkout> --prompt …`。表达式按 UTC，分钟避开 0 和 30（跟桌面端一样）。创建者自己的任务最短每 5 分钟跑一次。
- **列出**：`magi cron list`。
- **读上次运行**：`magi cron list` / `magi cron show <id>` 里的上次运行。
- **改、停、删**：`magi cron edit <id> [--expr …] [--enable|--disable] [--prompt …]`，`magi cron delete <id>`。

任务 id 的命名照各流程自己定的（如 `triage-<仓库名>`、`dispatch-<仓库名>`）。

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
- **开一个 issue 会话**：`magi sessions start --cwd <主 checkout> --slug <前缀> <prompt>`。直接开，不等人点；打印 `<slug> <id>`。
- **给别的会话发消息**：`magi sessions send <会话> <文本 | ->`。
- **读一个会话的记录**：`magi sessions show <会话> -o <文件>`，`-o` 写出整份。
- **会话收尾**：`magi sessions archive <会话>`。
- **分组：没有**。magi 本期不维护状态分组，要分组的步骤直接跳过（不算未做）。

### 调度（issue-dispatch 的三处）

- **怎么一轮一轮跑**：`magi cron`（「定时任务」）每轮新开一个调度会话来跑 `idea-loop:issue-dispatch`，id `dispatch-<仓库名>`，间隔由人定；跑完一轮 `magi sessions archive` 归档自己。没有 7 天到期，也不用常驻会话。
- **怎么数开着的会话**：`magi sessions list` 里未归档、slug 前缀是 `<仓库名>-<号>` 的。
- **怎么交出 issue**：`magi sessions start --cwd <主 checkout> --slug <仓库名>-<号> <prompt>`，直接开，不等人。没有「还没点的卡片」，空位 = 队列上限 − 开着的会话。上限照旧：主队列 10，每轮最多开 3 个。

issue 会话认领后照常翻状态，不挪分组；做完（PR 合并或 issue 取消）后 `magi sessions archive` 归档自己。

## 浏览器

用 `magi browser`：每个会话自带一个匿名浏览器，无头测量和把一页摆给人看两种用途都用它。

- 开页面、读页面：`magi browser open <地址>`，`snapshot`（元素树，给出 `@bN` 引用），`get url|title|text|box`。
- 操作：`click`、`fill`、`type`、`key`、`scroll`、`select`、`wait`。
- 看：`screenshot [-o 文件.png]`，`network`（已完成的请求，看不到头和体），`emulate --tab <tN> --color-scheme dark|light`、`--device phone|tablet`（手机视口与深色）。
- **不能执行任意 JS**：量值用元素盒子（`get box`）与截图。
- **子 agent 各自开窗口**：先 `magi browser window new`，之后每条命令都带 `--tab <tN>`，不碰别的 agent 的标签页。所以不需要锁目录。
- 人的输入优先于你的：命令报 `human_active` 时，约 10 秒后再试。

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

- **MCP**：人在 magi 网页的 Integrations → MCP servers 里加。
- **插件**：在 magi 会话里 `/plugin`。
- **允许规则、设置**：人自己改 `$CLAUDE_CONFIG_DIR/settings.json`；这边只打印规则，不替人改权限设置。
