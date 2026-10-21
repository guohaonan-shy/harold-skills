---
name: browser
description: Playwright 和内嵌浏览器各是什么、各管什么：后台任务和子代理里用 Playwright，给人预览用内嵌浏览器；连同静态服务和进到对的状态。第一次调浏览器之前读。
---

有两个浏览器，各管一件事：

| | Playwright | 内嵌浏览器 |
|---|---|---|
| 是什么 | 用户级配的 `playwright` MCP，以 `--headless --isolated` 启动，没有窗口，每次打开都是干净的配置 | Claude 桌面端对话旁边的浏览器面板，人和你看的是同一页 |
| 工具 | `mcp__playwright__browser_*`：打开地址、改视口、悬停、点击、截图（带 `target` 只截一个元素）、`browser_evaluate` 量值、读控制台 | `mcp__Claude_Browser__*`：`preview_start` 带 `url` 打开一页，`navigate` 换地址，`read_page` / `get_page_text` 读页面 |
| 负责 | 后台任务和子代理里用：截图、测量、走用户路径、复现问题，结果留在文件里，不干扰人正在看的预览 | 给人预览：把页面摆给人看、让人自己点 |

两边不混：不在内嵌浏览器里跑后台操作（那是人正在看的页面），也不拿 Playwright 的截图代替让人自己点。`mcp__playwright__browser_*` 不在，停下让人跑 `setup`。

## 给人看

用 `preview_start` 的 `url` 打开，之后在同一个标签页里 `navigate`，不另开。内嵌浏览器只在桌面端有，不可用时按这个顺序退，并告诉人退到了哪一步：

1. Terminal没有内嵌浏览器：这种情况下给本地地址 `http://127.0.0.1:<port>/…`，让人在自己的浏览器里开。
2. 人连地址都打不开：截图拼成一张给人。这样看不到动效和交互，要说出来。

## html如需人审，要经过静态服务器

预览用的 HTML 文件如果需要交给人审核，一律需要经过静态服务器代开渲染，可通过：`python3 -m http.server <port>`启动静态服务器后台渲染，交给人看。

## Playwright的注意事项

Playwright MCP 会拒绝 `file:` 地址，`file://` 下 ES 模块和 fetch 也会坏。

Playwright MCP 只能往工作区里写文件：截图先存进工作区，再挪到要放的位置。代码沙箱写不了文件，也没有 `setTimeout`，等待用 `page.waitForTimeout(ms)`。

## 进到对的状态

- 很多页面要登录。isolated 的浏览器每次都没有登录态，每次照目标项目给的测试账号走一遍登录（项目的 `DEVELOPMENT.md` 或 `CLAUDE.md` 里找，找不到就问人），不要假设已经登录。
- 截之前把页面带到要看的那个数据状态。截到错的状态，就是错的基准。
- 组件要处在静止态：抓到加载中，它会被当成基准。
- 慢网络、失败用请求拦截造：慢的在 `page.route` 里先等再 `continue`，失败用 `route.fulfill({ status: 500 })` 或 `route.abort()`。
