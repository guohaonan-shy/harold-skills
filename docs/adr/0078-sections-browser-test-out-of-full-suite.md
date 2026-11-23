---
type: adr
status: 生效
tags: [idea-loop, design-archive, testing, sections-browser-test]
summary: 设计档案的真浏览器测试默认跳过、设环境变量才跑，每例 120 秒超时，REVIEW.md 另给单独命令
related: ["[[192]]", "[[2026-11-16-sections-browser-test-slow]]"]
---

# ADR-0078 — 设计档案浏览器测试移出全量套件

> 由 spec `sections-browser-test-out-of-full-suite` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`REVIEW.md` 的全量测试命令 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` 会带上 `idea-loop/scripts/design-archive-sections-browser.test.mjs`：设计档案分段截图脚本的浏览器测试，每个用例真开 Chromium、截图、按真实时间等待（模拟「agent 在两步之间想了多久」）。issue #192 说全量测试在 darwin 本机「3 分钟以上无输出」，kill 之后 9 个用例记为失败。

2026-11-16 对着 main `a032e45`（darwin，node 22）实测：这份文件 55 例单跑全过，用时 5 分 49 秒，CPU 只占 14%，时间几乎都在等，最慢一例 46 秒；其余 92 个测试文件合跑 1256 例用时 53 秒。所以全量的总时长由这一份文件决定，其余文件 1 分钟内跑完后长时间没有新输出；被 kill 时还没跑完的用例记成失败，不是用例本身坏了。11-13 分拣时单跑 45 例用时 3 分 47 秒，两天加了 10 个 `cover` 用例，时长还会随用例继续涨。另外这份文件的用例和启动浏览器的 `before` 都没有超时，浏览器真卡住时测试会一直挂着，不会失败。issue 原先猜「找到浏览器但启动卡住」，实测启动正常。

## 2 决策（how）

人在 [[192]] 选了「移出全量 + 加超时」（推荐项）。具体手段按「改动最少、不碰别的检查」定：

- **环境变量开关**：浏览器测试只在 `IDEA_LOOP_BROWSER_TESTS=1` 时跑，没设整份 skip，skip 原因写「设 `IDEA_LOOP_BROWSER_TESTS=1` 单独跑，见 REVIEW.md」；设了但本机找不到 Playwright 或 Chromium，照旧 skip。全量命令本身不改。
- **超时**：每个浏览器用例 120 秒（实测最慢一例 46 秒的约 2.5 倍），启动浏览器的 `before` 60 秒；卡住的那一例失败，其余照跑、文件照样结束。
- **`REVIEW.md` 验证命令表加一行**单独命令和什么时候跑：改了 `design-archive-sections.mjs`、它引入的 `ui-png-compare.mjs` 或这份测试本身时跑，约 6 分钟，放后台。
- 取舍（没做）：不改文件名让通配不再匹配，因为 `issue-model-tripwire.test.mjs` 这类地方按 `.test.mjs` 后缀认测试文件，改名会漏认；不给慢用例瘦身（缩短模拟等待会削弱「等多久拍出来都一样」的验证）；不给全量命令加总超时。
- 版本：只动测试、脚本注释和 README，不改行为，升 patch。

## 3 结果（result）

- `idea-loop/scripts/design-archive-sections-browser.test.mjs`：`OPT_IN = 'IDEA_LOOP_BROWSER_TESTS'`、`CASE_TIMEOUT_MS = 120_000`、`LAUNCH_TIMEOUT_MS = 60_000`，`browserTest` 包装统一带超时与 skip。
- `REVIEW.md` 验证命令表有「设计档案浏览器测试」一行；`idea-loop/README.md` 讲测试命令（单独命令一段）和文件清单（注明约 6 分钟、默认跳过）两处同步。
- 合并：PR #406（设计档案浏览器测试移出全量套件）；issue #192 已关闭。决定记录见 [[192]]，复现过程见 [[2026-11-16-sections-browser-test-slow]]。
- 这份测试没有再单独写测试守护开关本身：开关和超时的验证是实测（不设变量跑全量应当 55 例 skipped；临时把一例超时调到 1 秒应当只那一例失败）。
