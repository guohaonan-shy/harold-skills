# 19 — 开 issue 会话统一成 `dyna runtime handoff`，桌面端与 magi 同一条命令

**Blocked by**：无——可立即开工（01–18 已落地）
**设计冻结**：不涉及 UI

## 要建什么

> 人的决定（2026-11-20）：「cmux你暂时不用管，开会话我觉得先统一是没问题的，剩下的部分我建议就放入对应的runtime.md在开局注入」

调度交出一个 issue 时要开一个会话。现在两种工作环境各写各的：桌面端调 `dyna runtime handoff`（`claude -p` 建会话，再接回敲 `/desktop` 交到桌面端，往调度记录追加一条）；magi 在工作环境说明里手写 `magi sessions start --cwd … --slug … --cap … <prompt>`，再自己往调度记录追加一条。这张让调度在两种环境里都只写同一条 `dyna runtime handoff`，环境差别收进命令里：

- 命令自己认当前工作环境（跟 `dyna runtime name` 同一套判法）。
- 桌面端：行为照旧，一字不改（不带 prompt 开出、交到桌面端；发任务仍由调用方在归位之后用会话间消息发，避免交出途中调度数不到它而超开）。
- magi：命令里跑 `magi sessions start`：目录取 `--worktree`，slug 取 `<仓库名>-<号>`，能力从新参数 `--cap`（可重复）来，prompt 从新参数 `--prompt-file` 读；成功后照桌面端同一格式追加调度记录（会话 id 填 magi 的 id）。magi 下缺 `--prompt-file` 就报错退出、说缺什么。
- 两种环境成功时 stdout 都是同一形状的一行 JSON（会话 id、记录写进没有）；失败都是退出 1、stderr「交出失败：<原因>」。
- 工作环境说明：`runtime/magi.md`「会话管理」的「开一个 issue 会话」和调度「怎么交出 issue」的「开会话」一步改成调这条命令（`--cap` 的能力名那段说明留在 magi.md）；`runtime/claude-desktop.md` 对应一步改成跟 magi 同一句，桌面端特有的归位、发任务两步照旧。侧边栏分组、定时任务、会话收尾这些按环境不同、dyna 包不了的，照旧留在各自的说明里，开场注入。
- dyna 的版本号沿用这个 PR 里还没发布的 0.0.5；参数有变，重新生成 0.0.5 的登记表。不发布。

## 验收标准

- [ ] magi 下 `dyna runtime handoff --worktree <目录> --issue <号> --repo <仓库名> --period <时段> --cap <能力>… --prompt-file <文件>` 调到 `magi sessions start`，参数对得上，成功打印与桌面端同形的 JSON 并追加调度记录：Go 单元测试用假的 `magi` 可执行文件验证（本机没有 magi）。
- [ ] magi 下缺 `--prompt-file`、`magi sessions start` 失败（例如能力被拒）：退出 1，stderr「交出失败：…」写明原因：Go 测试覆盖。
- [ ] 桌面端行为不变：现有 handoff 测试全绿，不改它们的断言。
- [ ] `runtime/magi.md`、`runtime/claude-desktop.md` 开会话那一步都写同一条 `dyna runtime handoff`；`dyna runtime show 会话管理` 在两种环境下打印出来的那一步一致：文档测试钉住。
- [ ] `cd dyna && go vet ./... && gofmt -l . && go test ./...` 全绿；node 全量测试除 plugin-version（预期红）外全绿；`dyna-scan`、`dyna-version` 绿。

## 选中的存量回归

- `dyna/internal/runtime` 的 handoff 测试：桌面端交出的整条路径。
- `runtime-data-doc`、`dispatch-by-period-doc`、`session-inject-doc` 测试：调度与工作环境说明的措辞。
