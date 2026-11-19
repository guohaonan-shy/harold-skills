# 01 — UI 工单参考里「画布在不在执行方 worktree」统一成一种说法

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

implementer（执行方）做 UI 工单时读 implement skill 的参考「UI 工单：把设计画布落成项目自己的代码」。现在它的「输入」节说冻结画布「提交在这个工作分支上，worktree 里就有」，而「设计档案与最小差异」节说「`tmp/` 不进版本库，你自己的 worktree 里没有它，画布和最小差异都用这个绝对路径读写」，两句矛盾。

事实是：冻结时画布用 `git add -f` 强制提交在需求分支上，执行方的 worktree 对齐到派工时集成分支的起点，所以画布在执行方 worktree 里**有**；最小差异 `delta/` 不提交，只在集成 worktree 里，执行方那里**没有**。

改完，执行方读这份参考只得到一种说法：
- 「设计档案与最小差异」节那句分开说两样：画布冻结时已提交、你的 worktree 里也有一份；`delta/` 和 `tmp/` 下其余没提交的东西只在集成 worktree 里。仍要求画布和最小差异都用派工给的 tmp 绝对路径读写，并写明理由：两样在同一处；读到的画布是集成分支上最新的那份（冻结后设计变更推上集成分支的新版本，不会自动进执行方已开好的 worktree）。
- 「输入」节「worktree 里就有」保留，补半句：读写仍用派工给的 tmp 绝对路径（指向「设计档案与最小差异」）。
- 加一个文档检查守住这两处；idea-loop 的 `plugin.json` 升 patch。

## 验收标准

- [x] 新的文档检查在改动前的参考上失败（报仍说执行方 worktree 里没有），改后通过。
- [x] 参考全文不再出现「你自己的 worktree 里没有它」这类把画布说成不在执行方 worktree 的句子。
- [x] 「设计档案与最小差异」节同时写到：画布已提交、执行方 worktree 里有；`delta/` 只在集成 worktree；画布和最小差异都用 tmp 绝对路径读写；以及理由（同一处、读到集成分支上最新的画布）。
- [x] 「输入」节保留「worktree 里就有」，并指明读写仍用 tmp 绝对路径。
- [x] idea-loop `plugin.json` 的 `version` 从 main 当前版本升一个 patch；全量测试通过。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/design-tmp-worktree-root-doc.test.mjs`：守着 tmp 路径以集成 worktree 为根的写法，这次改的正是同一段。
- `idea-loop/scripts/implementer-slim-doc.test.mjs`：守着从执行方定义挪进这份参考的句子，改句时可能碰到。
- `idea-loop/scripts/plugin-version.test.mjs`：改了插件必须升版本。
