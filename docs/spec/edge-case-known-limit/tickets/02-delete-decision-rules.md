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

> 人的决定（2026-11-23）：D1「我倾向于A」——重复段落由会话对照 plan 输出列给人、人自己删，保持现状。D3「A」——issue 会话里讨论中冒出的范围题（并进当前 PR 还是另开）也照 pr-review review 标准里的范围题推荐法推荐：在 issue-session「边界」那一句指过去，不转述、不动固定文案；用新插件重跑回放用例 `scope-question-recommend` 确认推荐并进。

## 验收标准

- [x] 插件目录里（不含 `evals/`）grep 不到 `decision-rules`、`decision_rules`。
- [x] `idea-loop:evidence` 的正文和两份参考与原 decision-rules 的「证据是什么」「整体风格」「配什么图」三节、两份参考逐字相同（只有路径变了）。
- [x] `pr-review` 的 review 标准里依据是四种（含「目标」），有「范围题」推荐法；没有「边缘情形 → 要你决定」那一行；SEO 例外在合并一步。
- [x] 开场 hook 配置里没有 `runtime inject decision-rules`。
- [x] setup 的建 home 和用户级配置两步写了固定文案三节和第 4 项。
- [x] 仓库全部测试（node 测试与 `go test`）全绿。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。（本工单的行为证明由 03 的回放用例承担，这里写「⏭ 延后 → 03」即可。） 已由 03 的四个回放用例证明（见 03 的验收）。
- [x] 人的决定（2026-11-23）：issue-session「边界」里范围题那句指向 pr-review review 标准的范围题推荐法；回放用例 `scope-question-recommend` 用新插件跑过，改后答「是」（判定带出处，写进它的 annotations.md）。issue-session「边界」那一句已改、有文档测试钉住（`decision-evidence-principles-doc.test.mjs` 最后一条）；回放跑了三次（1 过、1 改前就答是、1 无结论），判定与出处写进了 `annotations.md`「新插件重跑」；三次改后会话都没调到 issue-session，这个用例测不到那一句 人的决定（2026-11-23，D4）：「D4 A」——接受只靠文档测试，用例输入改成走 issue 会话另开 #478。
- [x] review 第 1 轮 S1（2026-11-23）：起草 spec 时判断「哪些事写成待定题」也照用户规则的「思考与决策」（落在「停下问我」的才写成待定题），不再按「只认三种依据、冲突或没有就写成选项」；to-spec 和 issue-session 起草 spec 的自查都改。依据：spec「同一行为的其他入口」把 to-spec 起草列为纳入。 已改 to-spec「实现决策」与 draft-spec 自查第 6 条，`decision-evidence-principles-doc.test.mjs` 最后一条钉住（旧文本上见红）。
- [x] review 第 1 轮 S2（2026-11-23）：setup 列重复段落时，会话对照的是插件里固定文案的正文（那份参考资料），不是 `home config plan` 改后一栏（那里只有三个标题）。依据：人的批示「D1 我倾向于A」。 已改 `home.md` 第 3 步第 5 条指向 `home-rules.md`，`setup-home-doc.test.mjs` 新增一条钉住（旧文本上见红）。
- [x] review 第 1 轮 C2（2026-11-23）：issue 会话「边界」里范围题那句、PR 汇报写法里取依据那句，指向审查标准时写从插件根目录起的完整位置，照字面找得到；给 agent 写文档的写法说明里「别的 skill 不读一个 skill 的内部参考」记一条例外：PR review 的审查标准可以被 issue 会话和 PR 汇报写法直接读（理由：调审查那个 skill 会开跑一轮 review）。人的批示「C2 A」。 已改两处句子写 `${CLAUDE_PLUGIN_ROOT}/skills/engineering/pr-review/references/review-standards.md`，`SKILL-MECHANICS.md`「引用另一个 skill」记了例外；`decision-evidence-principles-doc.test.mjs`、`writing-for-agents-rewrite-doc.test.mjs` 新增两条（旧文本上见红），`skill-private-references.test.mjs` 只对这一份路径、只对 issue-session 与 pr 放行。

## 选中的存量回归

- `idea-loop/scripts/session-start-inject.test.mjs`、`hooks-config.test.mjs`：开场注入与 hook 清单。
- `idea-loop/scripts/decision-evidence-principles-doc.test.mjs`、`decision-rules-who-decides-doc.test.mjs`：钉 decision-rules 的内容，要挪钉。
- `idea-loop/scripts/pr-review-slim-doc.test.mjs`、`pr-by-deliverable-doc.test.mjs`：pr-review、pr 的写法。
- `idea-loop/scripts/setup-home-doc.test.mjs`：setup 建 home 的步骤。
- `idea-loop/scripts/no-project-leak.test.mjs`、`issue-group-skills.test.mjs`：skill 清单与分类目录。
