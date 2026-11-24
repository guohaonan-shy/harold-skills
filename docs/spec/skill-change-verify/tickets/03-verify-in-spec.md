# 03 — 起草 spec 时每处 skill 改动写明怎么验证，仓库方针跟着改

**Blocked by**：01（目标用例的写法要先在；本张的验证是一个目标用例）
**设计冻结**：不涉及 UI

## 要建什么
现在改 skill 的 spec 多数在「测试决策」的「LLM 输出质量」一行写「不涉及」，依据是仓库 `AGENTS.md` §5「跳过 quantitative eval」。做完后：

- 起草 spec 的 skill 在给 agent 读的文档要改时（它的参考文件里「杠杆诊断」那一步），每处改动末尾一行「验证：」，五选一：**检查**（写检查名，先在历史错误上见红）、**回放**（写用例名，出自历史上出错的那一刻）、**目标用例**（写用例名，出自这份 spec 的 User Story / 期望行为）、**不改行为**（只改措辞，写一句为什么行为不变）、**判不了**（写卡在哪）。完成条件改成「每处改动都有验证行，判不了的写卡在哪」。
- spec 模板「测试决策」表「LLM 输出质量」一行，对 skill 改动写「见杠杆诊断各处的验证」。
- retro 第 3 节「验证」三选一里「判不了」的写法跟上面对齐（写卡在哪）；其余不改。
- 仓库 `AGENTS.md` §5 改说法：改 skill 的每处改动都要写明怎么验；回放和目标用例是 skill 改动的验收手段，不再叫「例外」；`uiux-research` 那条基线例外原样留着。

现存实例：本 spec 自己的「杠杆诊断」、`skill-structure-checks` 的「杠杆诊断」就是这样写的。

## 验收标准
- [x] 起草 spec 的参考文件里杠杆诊断一步写清五种验证各写什么、完成条件改锐利；有文档测试钉住五种方式名和完成条件。
- [x] spec 模板「LLM 输出质量」一行对 skill 改动写「见杠杆诊断各处的验证」；有文档测试钉住。
- [x] retro 第 3 节「判不了」写法对齐，其余句子不动。
- [x] `AGENTS.md` §5 说法改完：开头不再是「跳过 quantitative eval」作为默认；回放、目标用例写成 skill 改动的验收手段；`uiux-research` 例外原样在。
- [x] 写一个目标用例（放在回放用例目录下）：来源指向本 spec（`docs/spec/skill-change-verify/skill-change-verify.md`）期望行为 1；输入是在一个改 skill 的需求上让起草 spec 的 skill 起草；题「起草出的 spec 里每处 skill 改动都有一行验证、没有写『不涉及』吗？」。按机械判据判大小；小的当场跑并写结果和花费，大的写「大用例待跑：<用例名>」。（小用例 `to-spec-verify-each-change`，当场跑过：过，$4.11）
- [x] 仓库全部 node 测试和 `cd dyna && go test ./...` 通过。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：起草 spec 的参考文件和模板——目标用例（上面那格）；retro 第 3 节——不改行为（只对齐说法）；`AGENTS.md` §5——不改行为（规矩的说法，行为由各处和检查管）。

## 选中的存量回归
- `to-spec` 相关的文档测试（`scripts/` 下以 to-spec、spec 命名的 `*-doc.test.mjs`）：钉着模板和参考文件的说法。
- `retro` 相关文档测试（`scripts/retro*.test.mjs` 里读 SKILL 文本的）：第 3 节的说法。
- `no-project-leak.test.mjs`：用例和文档里不能出现真实项目名。
