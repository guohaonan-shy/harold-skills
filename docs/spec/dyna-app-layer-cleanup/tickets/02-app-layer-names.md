# 02 — dyna 的输出和注释去掉应用层叫法

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

dyna 的输出、帮助、注释里还写着桌面端的概念。改完以后：

- 调度的时段命令（`dyna home dispatch`）输出里，三个 issue 状态的字段从 `sections` 改名 `states`，值不变（triage、in-progress、in-review）。Go 里对应的变量、注释、帮助改说「调度按状态数会话的三个状态」，不提侧栏、侧边栏、分组。
- `dyna issues queues` 的输出字段同样从 `sections` 改名 `states`，帮助改成「调度按状态数会话的三个状态」。issue 状态那边取这个列表的注释也不再说「每个状态有一个同名的侧栏分组」。
- 调度记录（`dyna runtime record --session <id>`）写出的条目里，会话 id 字段从 `desktopSessionId` 改名 `sessionId`；帮助写「开出的会话的 id，原样写进 sessionId」，不再举桌面端的 id 长什么样。
- 两处注释只写 dyna 自己做的事：worktree 包注释不再说「照运行环境说明」（worktree 放哪是 dyna 自己的规则）；review loop 那处不再说「在桌面端或手机的 Claude 会话里审」。
- 早上汇总的参考文件（issue-dispatch 的 `morning-summary.md` 第 1 步）写明：会话 id 取 `sessionId`，旧记录是 `desktopSessionId`，两个都认。
- 字段直接改名，不同时输出旧名。

## 验收标准

- [ ] `dyna home dispatch` 的 JSON 有 `states`、没有 `sections`，值是三个状态。
- [ ] `dyna issues queues` 的 JSON 有 `states`、没有 `sections`。
- [ ] `dyna runtime record --session local_x …` 写出的条目有 `sessionId: local_x`、没有 `desktopSessionId`。
- [ ] dyna 非测试代码里 `git grep` 不到 `desktopSessionId`、「侧栏」「侧边栏」、`sidebar`；也不到「桌面端或手机」。
- [ ] 早上汇总第 1 步写明新旧两个字段名都认。
- [ ] `cd dyna && go test ./...` 全过（不升版本、不重存登记表，那是 03 的事；登记表检查因此红的，在交回里写明）。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `dyna/internal/home/dispatch_cli_test.go`：断言时段命令的 JSON，字段改名会让它红，要跟着改。
- `dyna/internal/issues` 里 queues 和 `Working` 的测试：同上。
- `dyna/internal/runtime/record_test.go`：断言记录条目的字段名。
- `idea-loop/scripts/dispatch-one-per-device-doc.test.mjs`：读早上汇总和插件里的桌面端说明；这张工单改了早上汇总，要保持绿（桌面端说明那几条断言在 03 处理）。
