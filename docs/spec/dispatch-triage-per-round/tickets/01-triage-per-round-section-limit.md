# 01 — 白天 triage 每轮新开表里的上限个，triage 分组总数不超过分组上限

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

调度（`idea-loop:issue-dispatch`）白天派 `triage` 的一轮，现在算「空位 = 上限 − triage 分组里的会话数」，分组里开着的会话一多就整轮一个不开。改完之后：

- 一轮新开 min(上限, 分组上限 − triage 分组里的会话数) 个，≤ 0 不开。triage 分组里的会话照现在的数法数（只数标题匹配「<仓库名>#<号> …」的，跨项目都算）。
- 「分组上限」是 `ISSUE_TRACKER.md`「调度」表新加的第四列，只在 triage 行有意义：不写、留空就是 10；写了要是正整数；todo 行这一格写了就报错（指出行号，说 todo 不数分组）。第四列之后才是备注。没写「调度」一节的项目用的默认表里，triage 行也带分组上限 10。
- `issues queues` 的输出多一个字段 `sectionLimit`：triage 时段是这一行的分组上限，todo 时段和空档是 null。名字不用 `cap`（文档测试禁止旧的 `cap`）。
- 「一轮最多 3 个」「每轮最多开 3 个」这类写法统一改成一轮最多 `limit` 个：调度正文、桌面端与 magi 两份运行环境参考、插件 README 都有。
- 汇报里派 `triage` 的时段写「这一轮新开几个 / `limit`，triage 分组 N / 分组上限」，替换现在的「占位的会话数 / 上限」。
- 同步改到的说明：桌面端参考的「怎么数开着的会话」「怎么交出 issue」；magi 参考同两条（magi 没有分组，按状态是 triage 的会话数）；setup 的两份 `ISSUE_TRACKER.md` 模板和本仓库根的 `ISSUE_TRACKER.md`：表头加「分组上限」列，说明改成「每轮最多新开几个；triage 分组里的会话总数不超过分组上限」；`issues` skill 的 Linear 参考里提到「调度」表的地方如有上限含义的说法一并对齐；`issues.mjs` 里时段表的注释与报错文案里「上限」的意思同步成「每轮最多新开几个」。
- 夜里 todo 的派法不动（已是每轮固定派 `limit` 个）。

真实例子：2026-11-22 12:10 triage 分组开着 6 个会话，本仓库白天上限 6。现在下一轮开 0 个；改完开 min(6, 10 − 6) = 4 个。

## 验收标准

- [ ] 「调度」表 triage 行只有三列（`09:00–19:00 | triage | 6 |`）时，`issues queues docs --at=10:00` 给出 `limit` 6、`sectionLimit` 10。
- [ ] triage 行第四列写 8 时 `sectionLimit` 是 8；第四列写 0 或非数字报错；todo 行第四列写 5 报错并指出行号；第五列起当备注，不影响解析。
- [ ] todo 时段、空档的 `sectionLimit` 是 null；不写「调度」一节时用的默认表 triage 行分组上限 10，setup 两份模板解析出来仍等于默认表。
- [ ] 文档测试钉住：调度正文、桌面端、magi 参考里不再出现「空位 = `limit` − triage 分组里的会话数」「一轮最多 3 个」「每轮最多开 3 个」「一轮合计最多交出 3 个」，出现 min(`limit`, 分组上限 − …) 的写法；这条测试对着 main 上的文本是红的。
- [ ] 本仓库根 `ISSUE_TRACKER.md` 的「调度」表照新格式写（加「分组上限」列），`issues queues` 读它不报错。
- [ ] README 的 `issue-dispatch` 一行与文件树注释里「at most 3 a round」「3 triage sessions open at most」「`limit` minus the sessions in the triage sidebar section」改成新规则。
- [ ] idea-loop 的 `plugin.json` 升 patch 一档（基于合并时主分支上的版本）。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs` 里 `parsePeriods` / `queues` 的现有用例（表头分隔行、默认表、跨午夜时段、模板解析等于默认表）：第四列从「备注」变成有含义的列，最容易把已有三列表格读坏。
- `idea-loop/scripts/dispatch-by-period-doc.test.mjs` 全部：它钉着调度正文与桌面端参考的段落结构（第 5 步各 bullet、「怎么数开着的会话」不含 2 小时窗口、四步交出），改这几段最容易打断。
- `idea-loop/scripts/no-project-leak.test.mjs`：插件文本里写例子时不能带真实项目名（工单里的真实例子只进 spec/测试说明，不进插件文本）。
