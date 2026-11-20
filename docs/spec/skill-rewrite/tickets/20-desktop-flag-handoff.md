# 20 — 桌面端交出改用官方的 `claude --desktop --resume`，不再用 expect 模拟敲 `/desktop`

**Blocked by**：无——可立即开工（01–19 已落地）
**设计冻结**：不涉及 UI

## 要建什么

> 人的决定（2026-11-20）：「claude启动会话那个命令可以如你所说，更换下」

`dyna runtime handoff` 在桌面端分两步：先 `claude -p` 建会话、读出 id；再在 `expect` 提供的终端里 `claude --resume <id>` 接回、等它安静、敲 `/desktop`，从屏幕上认「Opening in Claude Desktop」判成败。官方命令行现在有 `claude --desktop`（「Open in the Claude Desktop app instead of the terminal (with --continue or --resume <id> to pick the session)」，claude 2.1.327 `--help`；文档 code.claude.com 的 CLI reference）。这张把第二步换成 `claude --desktop --resume <id>`：

- 第一步 `claude -p` 建会话、读 id 照旧。
- 第二步直接跑 `claude --desktop --resume <id>`（在同一个 worktree 目录里），按它的退出码和输出判成败；不再需要 `expect`、等安静、读屏幕。超时照旧有上限，超了连子进程一起结束。
- 输出格式、调度记录、失败时「交出失败：<原因>」都不变；magi 那一支不动。
- 只为 expect 那条路存在的参数（如等安静的毫秒数）和说明删掉；`runtime/claude-desktop.md` 里讲 expect、依赖系统自带 expect、「交互那步停在信任确认」的几句照新做法改写。这份说明开场注入，离注入上限只剩约 100 字，这次要让它变短。
- 删掉不再用的 expect 脚本与相应测试，改成对新第二步的测试（假的 claude 可执行文件）。
- dyna 版本沿用还没发布的 0.0.5，参数有变重新生成 0.0.5 的登记表。不发布。

## 验收标准

- [ ] 桌面端 `dyna runtime handoff` 第二步调 `claude --desktop --resume <id>`，cwd 是 `--worktree`；成功打印的 JSON、追加的调度记录与改前同形：Go 测试用假 claude 验证。
- [ ] `claude --desktop` 失败（退出非零、超时）时退出 1、stderr「交出失败：…」带原因，不写调度记录：Go 测试覆盖。
- [ ] 源码、说明、登记表 0.0.5 里不再有 `expect` 这条路（历史登记表 0.0.1–0.0.4 不动）；`runtime/claude-desktop.md` 开场注入的长度比改前短，交回里贴改前改后字数。
- [ ] magi 那一支的测试原样全绿。
- [ ] `cd dyna && go vet ./... && gofmt -l . && go test ./...` 全绿；node 全量测试除 plugin-version（预期红）外全绿；`dyna-scan`、`dyna-version`、`session-start-inject` 绿。
- [ ] 人验：在本机真跑一次，确认 `claude --desktop --resume <id>` 能把 `claude -p` 建出的会话交到桌面端侧边栏（⏭ 延后 → PR 交付验收：执行方不在真机上开桌面端会话，由人验）。

## 选中的存量回归

- `dyna/internal/runtime` 的 handoff 测试与 magi 交出测试。
- `session-start-inject`、`runtime-data-doc`、`dispatch-by-period-doc` 测试。
