# 02 — review 每轮看到这个 PR 让哪几份主文件变长了多少

**Blocked by**：01（同改 dyna 版本与命令登记表）
**设计冻结**：不涉及 UI

## 要建什么

新命令 `dyna pr skill-growth <base-ref>`（放在 pr 模块），pr-review 跑一轮时它的输出原样进 `checks.md`，由 Standards 轴判增长合不合适。

- 对 `<base-ref>...HEAD` 里变了的每份 SKILL.md 和 agent 定义（认法同 01 的 skill-lint 范围：`SKILL.md`、`agents/` 下直接的 `.md`；参考文件不算），输出一行：路径、改前主体字数 → 改后主体字数（差值带正负号），如 `productivity/writing-for-agents/SKILL.md 4497 → 4499（+2）`。新增的改前记 0，删掉的改后记 0，主体字数没变的不列。量法同 skill-lint（复用同一个量主体的函数）。没有变化时打印一行说明。
- 永远退出 0（只报事实，不判对错）；git 出错照常报错。
- 写法参考 `dyna pr diagnostics filter` 等现有 pr 子命令与它们的 `cmd_test.go`。
- pr-review 的 `references/run-a-round.md`「机械检查」的命令清单多一条这条命令，结果原样进 `checks.md`，不加新步骤。
- 登记表登记新命令（调用方：session，pr-review）；dyna 版本留在 01 升到的 0.0.7（同一个 PR 内不重复升），重新存 `dyna/registry/0.0.7.json`。

## 验收标准

- [x] go 命令测试：夹具仓库在基准上把一份 SKILL.md 加了 300 字、新增一份 agent 定义、改了一份参考文件、另有一份 SKILL.md 只改了 frontmatter → 输出两行（SKILL.md +300；agent 定义 0 → N），参考文件和只改 frontmatter 的不列，退出 0；删掉一份 SKILL.md → 改后记 0。
- [x] `run-a-round.md`「机械检查」清单里有 `dyna pr skill-growth`；一份文档测试钉住它。
- [x] 本分支 `dyna pr skill-growth origin/release/idea-loop-0.2.0` 跑得出结果（交回贴输出）。
- [x] 登记表 0.0.7.json 含新命令；全量绿（同 01 的命令）。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `dyna/internal/pr` 的 `cmd_test.go`、`differential_test.go`：同一模块。
- `idea-loop/scripts/pr-review-*` 文档测试：run-a-round 被改。
- `scripts/dyna-scan.test.mjs`：skill 里新写的 dyna 命令要在登记表里。
