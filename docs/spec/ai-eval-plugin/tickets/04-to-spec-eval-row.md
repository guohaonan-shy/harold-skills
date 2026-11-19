# 04 — idea-loop to-spec 的 eval 一行指向 ai-eval

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

用 idea-loop 起草 spec 的人，在「测试决策」表里写到 LLM 输出质量那一行时，看到 eval 该怎么定门槛、装了 ai-eval 时该走哪个 skill，而不是只有一句「eval（确定性断言）」。

改 idea-loop to-spec 的「测试决策」表 eval 那一行的「仪器」列，改成这个意思：eval，门槛对线上基线，不写绝对值；装了 `ai-eval` 的项目，跑流水线的改动走 eval-run，多轮对话里的一步走 eval-replay。其余列不动。idea-loop 有文档测试精确断言了这一行的原文（to-spec 按交付物的文档测试），一起改成新的原文；另一份文档测试禁止 to-spec 正文出现 `handoff`、`route`。to-spec 正文离 5000 字上限只剩约 130 字，新句子要短，超了照下面第二格的做法挪。

idea-loop 的 `plugin.json` 版本按 `REVIEW.md` 定档：改了 to-spec 产出的内容，升 minor，从 main 上的当前版本往上升。idea-loop 的 README 若有讲到 to-spec 测试决策的 eval，同步一句。

## 验收标准
- [ ] to-spec 测试决策表 eval 一行的仪器列是上面的意思，提到 eval-run 和 eval-replay，没有出现任何项目名
- [ ] idea-loop 版本比 main 上的高一个 minor
- [ ] idea-loop 防泄漏测试、插件版本测试、全量测试全过
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- `idea-loop/scripts/no-project-leak.test.mjs`：新句子不能带项目名。
- `scripts/plugin-version.test.mjs`：版本必须升。
