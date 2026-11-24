# 03 — 开 issue 会话写进运行环境说明，删 `dyna runtime handoff`，加记一笔命令

**Blocked by**：02 — 能力清单扩成能力模板，加 `dyna runtime check`
**设计冻结**：不涉及 UI

## 要建什么

现在调度交出一个 issue 时，两份运行环境说明都写同一条 `dyna runtime handoff …`，由 dyna 在代码里认环境、分两支开会话（桌面端先 `claude -p` 建会话再 `claude --desktop --resume <id>` 交到桌面；magi 跑 `magi sessions start`），两支跑完都往 `~/.idea-loop/dispatch/<仓库名>.json` 追加一条 `{issue, desktopSessionId, openedAt, period}`，早上汇总靠它找夜里开出的会话。这张工单做完后，调度会话照当前环境说明里的命令自己开会话，再跑一条跟环境无关的 dyna 命令记一笔：

- **删**：`dyna runtime handoff` 命令和它两支实现、测试（含 magi 那支）。
- **新增 `dyna runtime record --issue <号> --repo <仓库名> --period <todo|triage> --session <会话 id>`**：往记录目录（`--dir`，或环境变量 `IDEA_LOOP_DISPATCH_DIR`，默认 `~/.idea-loop/dispatch`）的 `<仓库名>.json` 追加一条，字段名、`openedAt` 的时间格式（UTC、毫秒、`Z` 结尾）、文件格式（两格缩进的 JSON 数组、原子写入）跟现在 handoff 写的逐字段一致；`desktopSessionId` 就是传入的会话 id。成功打印一行 JSON 退出 0；参数缺或不对、仓库名当不了文件名、已有文件不是数组读不出来（不动它）都退出 1，stderr 说原因。
- **桌面端说明**「会话管理」的「开一个 issue 会话」和「调度 → 怎么交出 issue」第 2 步，照现在 handoff 的两条命令写：先在 worktree 里跑 `claude -p "只回一个字：就绪" --output-format json`，读出 `session_id`；再在 worktree 里跑 `claude --desktop --resume <id>`，退出码 0 算成功，桌面端会话 id 是 `local_<id>`；两条都在沙箱外跑；成功后跑记一笔命令。失败（任一条退出码非 0、读不出 `session_id`）写进汇报，这个 issue 下一轮再试，不在本轮重试；记一笔失败写进汇报（早上汇总会少这一条）。第 3、4 步（改标题归位、发任务）不变。
- **magi 说明**同样两处：`magi sessions start --cwd <worktree> --slug <仓库名>-<号> --cap … "<issue 会话的 prompt>"`，从输出读会话 id，成功后跑记一笔命令；失败处理同上；`--cap` 那段说明保留。
- 两份说明里不再出现 `runtime handoff`；桌面端开场注入仍不超过 10000 字（新写法替换掉原来那段，超了先删重复说法，不改上限）。skill、agent 正文里照旧不出现运行环境专用的命令和工具名（tripwire 不变）。
- 插件里提到 handoff 的文档测试（调度按时段的文档测试、运行环境说明的文档测试）和 README 跟着改：说明里写的是新命令；运行环境说明的文档测试改成跑 `dyna runtime check` 的同一套规则核两份自带说明（或调用它），并核说明里不再出现 `runtime handoff`。
- 改了命令，重存 `registry/0.0.12.json`。

## 验收标准

- [x] Go 单元测试先红后绿：`runtime record` 记 #471（`--repo harold-skills --period todo --session local_abc`）后，记录文件多一条，字段与现在 handoff 写的逐字段一致；已有一条时追加成两条；文件不是数组时退出 1、文件没动。
- [x] `dyna runtime handoff` 不存在了（登记表里没有，`--help` 不列），相关实现和测试文件删掉；`go test ./...` 全绿。
- [x] 两份说明里「开一个 issue 会话」和「怎么交出 issue」第 2 步写的是各自环境的命令加 `dyna runtime record`，`dyna runtime check` 两份都过。
- [x] `node --test` 跑插件的文档测试全绿；仓库里（`docs/raw` 和旧登记表以外）不再有 `runtime handoff`。
- [x] 桌面端 `inject reference` 不超过 10000 字。
- [x] 登记表 0.0.12 已重存。

## 选中的存量回归

- `idea-loop/scripts/dispatch-by-period-doc.test.mjs`：核调度在两份说明里的写法，直接断言了 handoff 那句。
- `idea-loop/scripts/runtime-data-doc.test.mjs`：两份说明的格式与禁用词。
- `idea-loop/skills/engineering/issue-dispatch` 的早上汇总参考里读记录文件的那段：记录格式不能变。
- 扫 skill 里 `dyna <模块> <命令>` 是否存在于登记表的测试：删命令后最容易红。
