# 02 — 插件删掉 decision-rules，内容各回各处

**Blocked by**：01 — 命令行把固定文案写进 home、开场不再注入 decision-rules
**设计冻结**：不涉及 UI

## 要建什么

装了新插件的会话里不再有 `idea-loop:decision-rules`：开场不再注入它，skill 目录删掉，不留重定向。它的内容各回各处，任何 skill、agent、脚本、测试、README 都不再提这个名字（`evals/`、`docs/` 除外）：

| decision-rules 的节 | 去哪 |
|---|---|
| 核心 | 删 |
| 依据只认三种、照标准做（「已按规则处理」的写法） | `pr-review` 的 review 标准：依据改成四种，加「目标」（spec 原文或用户真实路径里的一句目标，配一句达成、达成一部分、没达成）；节名「已按规则处理」不改。`pr` 的汇报写法指过去 |
| 依据冲突或没有：停下问人 | 删；停不停下看会话已加载的用户规则（`~/.claude/CLAUDE.md`，即 home 的固定文案「只由我做」「停下问我」） |
| 护栏 | 通用五条已在固定文案；SEO 例外回 `pr-review` 的合并一步；「新词只在 grill 里加」回 `glossary` |
| 要人定的写成一道题 | 固定文案「沟通」已有；「范围题怎么推荐」一条进 `pr-review` 的 review 标准 |
| 证据是什么、整体风格、配什么图，加两份参考（UI flow、动图） | 原样搬进新的 `idea-loop:evidence`（productivity 分类下），一字不改，只改路径；description 照 `writing-for-agents`「调用方式」只写路由（模型可调用，写给人看的东西要配证据、截图、流程图、图表、动图时用） |

另外：

- 开场 hook 配置删掉注入 decision-rules 的那一行。
- `pr-review` 的 review 标准删掉「只在兜底路径或罕见异常里出现、不丢东西的边缘情形 → 要你决定」那一行；SKILL 去掉「（含被降级的边缘情形）」。`pr` 的汇报写法删「边缘情形不放这里，是决定题」。
- `issue-session` 的夜间模式里「『依据冲突或没有』里的每一题」改指固定文案的「停下问我」。
- `design-steward` agent 的「依据只认三种」改指 `pr-review` review 标准的依据一节。
- 讲证据、配图的引用改指 `idea-loop:evidence`；讲停不停下的改指会话已加载的用户规则；讲依据和「已按规则处理」的改指 `pr-review` 的 review 标准。
- `setup`：建 home（第 1 步）时 `AGENTS.md` 除了「设备地图」「项目」也写固定文案三节；第 3 步的用户级配置变成四项（第 4 项 `rules`，`--only` 可用 `rules`），plan 里会列出人手写节里跟固定文案重复的段落，删由人自己做，setup 不改人写的字。setup 的 README 同步。
- 仓库根 `AGENTS.md`「调用方式」那条里关于 decision-rules 的话同步；idea-loop 的 `AGENTS.md`、README 同步（skill 清单、开场注入说明）。
- 文档测试：断言旧名、旧节名、「边缘情形 → 要你决定」、开场注入 decision-rules 的，改钉新位置；只为钉 decision-rules 自身写的测试，内容挪到钉 evidence / pr-review 的新位置。
- `plugin.json`：集成分支已是 0.2.0（main 是 0.1.50，本次是 minor：删一个 skill、加一个 skill、改决策行为），不再升；在交回里写一句。

## 验收标准

- [ ] 插件目录里（不含 `evals/`）grep 不到 `decision-rules`、`decision_rules`。
- [ ] `idea-loop:evidence` 的正文和两份参考与原 decision-rules 的「证据是什么」「整体风格」「配什么图」三节、两份参考逐字相同（只有路径变了）。
- [ ] `pr-review` 的 review 标准里依据是四种（含「目标」），有「范围题」推荐法；没有「边缘情形 → 要你决定」那一行；SEO 例外在合并一步。
- [ ] 开场 hook 配置里没有 `runtime inject decision-rules`。
- [ ] setup 的建 home 和用户级配置两步写了固定文案三节和第 4 项。
- [ ] 仓库全部测试（node 测试与 `go test`）全绿。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。（本工单的行为证明由 03 的回放用例承担，这里写「⏭ 延后 → 03」即可。）

## 选中的存量回归

- `idea-loop/scripts/session-start-inject.test.mjs`、`hooks-config.test.mjs`：开场注入与 hook 清单。
- `idea-loop/scripts/decision-evidence-principles-doc.test.mjs`、`decision-rules-who-decides-doc.test.mjs`：钉 decision-rules 的内容，要挪钉。
- `idea-loop/scripts/pr-review-slim-doc.test.mjs`、`pr-by-deliverable-doc.test.mjs`：pr-review、pr 的写法。
- `idea-loop/scripts/setup-home-doc.test.mjs`：setup 建 home 的步骤。
- `idea-loop/scripts/no-project-leak.test.mjs`、`issue-group-skills.test.mjs`：skill 清单与分类目录。
