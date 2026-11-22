# 03 — 没有 CI 时同一个 head 的全量只跑一次，并说清全量在哪跑

**Blocked by**：02（同改 run-a-round 与命令登记表）
**设计冻结**：不涉及 UI

## 要建什么

PR 上没有检查时，implement 的「等 CI」本机跑完全量后记下结果；pr-review 第一轮机械检查读到同一个 head 有「过」的记录就复用，不再跑第二遍。有 CI 的情况不受影响。

- 新命令 `dyna pr full-suite`，两个子命令：
  - `record <head> <退出码> <日志文件>`：把这次本机全量的结果（head、退出码、日志文件路径、时间）写到当前 worktree 的 `.tmp/full-suite/<head>.json`。
  - `show <head>`：打印这个 head 的记录（JSON）；没有记录退出 2。调用方据记录里的退出码决定复用（0）还是重跑（非 0）。
- implement 的 `references/stop-and-resume.md`「等 CI」：PR 上没有检查、本机跑完全量后，用 `dyna pr full-suite record` 记下结果。完成条件不变。
- pr-review 的 `references/run-a-round.md`「机械检查」与 `references/review-standards.md`（PR 上没有检查时本机跑全量那一句）：本机跑全量之前先 `dyna pr full-suite show <当前 head>`，有且退出码 0 就复用，`checks.md` 写 `全量测试 | 复用 <head> 的本机结果`；没有记录、记录是红的、或 head 变了，照旧本机跑并 `record`。
- 仓库 `REVIEW.md`「验证命令」第一句改成：执行方只跑改动涉及的（前两条）；全量在 PR 转 ready 后跑一次（implement 的「等 CI」），之后 review 每轮 head 变了再跑。`implementer` 定义里「全量交给 CI」不动。
- 登记表登记新命令；dyna 版本留 0.0.7，重新存登记表。
- idea-loop `plugin.json` 从集成分支上的当前版本升一个 minor 档（x.y.z → x.(y+1).0），README 同步；理由写进交回（多一个 hook、review 机械检查多一条、同一 head 不重跑全量、retro 落点判法变了）。若分支上已因别的 PR 升过 minor，则不重复升，交回说明。

## 验收标准

- [x] go 命令测试：`record abc1234 0 <日志>` 后 `show abc1234` 打印退出码 0 的记录、退出 0；`show def5678` 退出 2；`record abc1234 1 <日志>` 后 `show abc1234` 打印退出码 1 的记录。记录落在工作目录的 `.tmp/full-suite/`。
- [x] 文档测试钉住：「等 CI」没有检查的分支里有 `dyna pr full-suite record`；`run-a-round.md` 机械检查里有 `dyna pr full-suite show` 和复用写法 `复用 <head> 的本机结果`；`REVIEW.md` 第一句写清全量在「等 CI」和 head 变了的 review 轮跑。
- [x] `review-standards.md` 与 `run-a-round.md`、`stop-and-resume.md` 三处说法一致，不再有「同一 head 跑两次」的路径。
- [x] 登记表含新命令；plugin.json 升了 minor；全量绿（同 01 的命令）。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `dyna/internal/pr` 的测试：同一模块。
- `idea-loop/scripts/implement-*-doc.test.mjs`、`pr-review-*`、`pr-flow-doc.test.mjs`：被改的参考文件。
- `scripts/plugin-version.test.mjs`：版本升档。
