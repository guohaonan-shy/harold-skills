---
name: browser
description: 两个浏览器（无头的 Playwright、给人看的内嵌浏览器）各管什么、怎么用。截图、测量、复现问题，或把页面摆给人看之前用。
---

有两个浏览器，各管一件事：

| | Playwright | 内嵌浏览器 |
|---|---|---|
| 是什么 | 用户级配的 `playwright` MCP，以 `--headless --isolated` 启动，没有窗口，每次打开都是干净的配置 | Claude 桌面端对话旁边的浏览器面板，人和你看的是同一页 |
| 工具 | `mcp__playwright__browser_*`：打开地址、改视口、悬停、点击、截图（带 `target` 只截一个元素）、`browser_evaluate` 量值、读控制台 | `mcp__Claude_Browser__*`：`preview_start` 带 `url` 打开一页，`navigate` 换地址，`read_page` / `get_page_text` 读页面 |
| 负责 | 后台任务和子代理里的一切操作：截图、测量、走用户路径、复现问题，结果留在文件里 | 只给人预览：把页面摆给人看、让人自己点，截图代替不了这一步 |

`mcp__playwright__browser_*` 不在，停下，告诉人跑 `/idea-loop:setup`（你是子代理就在交回里写明）。

## 给人看

- 本地的 HTML 文件要给人看，先起静态服务器（`python3 -m http.server <port>`，后台跑），服务起好再 `preview_start` 那个地址。
- 用 `preview_start` 的 `url` 打开，之后在同一个标签页里 `navigate`。

内嵌浏览器只在桌面端有。不可用时按这个顺序退，并告诉人退到了哪一步：

1. 给本地地址 `http://127.0.0.1:<port>/…`，让人在自己的浏览器里开（终端里跑的 Claude Code 就是这种情况）。
2. 人连地址都打不开：截图拼成一张给人，并说明这样看不到动效和交互。

## Playwright 的限制

- 它拒绝 `file:` 地址；`file://` 下 ES 模块和 fetch 也会坏。本地文件同样经静态服务器打开。
- 它只能往工作区里写文件：截图先存进工作区，再挪到要放的位置。
- 跑 Playwright 代码的那个工具（`browser_run_code*`）写不了文件，也没有 `setTimeout`，等待用 `page.waitForTimeout(ms)`。

## 进到对的状态

- 很多页面要登录。isolated 的浏览器每次都没有登录态，每次照目标项目给的测试账号走一遍登录（在项目的 `DEVELOPMENT.md` 或 `CLAUDE.md` 里找）。找不到：在跟人对话的会话里问人；你是子代理就停下，在交回里写明缺测试账号。
- 截之前把页面带到要看的那个数据状态，组件处在静止态：截到错的状态或加载中，它就成了错的基准。
- 慢网络、失败用请求拦截造：慢的在 `page.route` 里先等再 `continue`，失败用 `route.fulfill({ status: 500 })` 或 `route.abort()`。

## 并行时抢锁

一个会话只有一个 MCP 浏览器，几个子代理同时用会点到对方的页面。调用方给了锁目录的，每次用 `mcp__playwright__browser_*` 之前先抢锁；自己起 chromium 的脚本（测量、拼流程图、录动图）不用。

1. 先把不需要浏览器的活做完，再抢：`node "${CLAUDE_PLUGIN_ROOT}/scripts/browser-lock.mjs" acquire <锁目录> --owner <你的名字>`。
2. 拿到后先 `browser_close` 一次，不继承上一个人的标签页和登录态；只访问自己端口上的页面。
3. 用完 `browser_close`，再 `node "${CLAUDE_PLUGIN_ROOT}/scripts/browser-lock.mjs" release <锁目录> --owner <你的名字>`。
4. 等了默认的 30 分钟还没拿到，就停下，在交回里写明卡在锁上。
