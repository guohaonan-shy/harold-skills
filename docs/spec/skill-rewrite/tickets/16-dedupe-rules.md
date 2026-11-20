# 16 — 规矩归属表外的重复收成一处

**Blocked by**：无——可立即开工（01–15 已落地）
**设计冻结**：不涉及 UI

## 要建什么

01–14 号重写时，执行方报出几条同一规矩写在多处、但不在 `writing-for-agents` 归属表里的情况。照 spec「规矩的归属」：表外新发现的由编排者在后面的工单里处理。这张把它们各收成一处，别处只留指针，并把新行补进 `writing-for-agents` 的规矩归属表。改完 agent 读到的规矩不变，只是每条只在一处写全。

要收的（每条：规矩 → 归谁，现在重复在哪）：

1. 评论里的 idea-loop 标记（读最近一条带标记的评论、写评论时自带标记）→ `issues`；现在在 issue-session 主文件、issue-dispatch 的早上汇总参考、issue-session 的起草参考各写一遍。钉着它的文档测试（评论标记那条）改成钉「指向 `issues`」。
2. 暂缓的设计（问人要不要接着做、复制回中间物目录、再从中断与恢复接上）→ `wiki-conventions` 目录表里暂缓设计那一行；现在在 uiux-imagine、uiux-refine 主文件和 refine 的冻结之后参考各写一遍。钉着它的文档测试改成钉一处加指针。
3. SEO 五个方向 agent（backlink-analyst、geo-analyst、keyword-miner、page-optimizer、technical-auditor）开头相同的「输入」段 → seo-scan 交给方向 agent 的提示模板；五份 agent 只留指针。全部 agent 共用的项目目录那句（项目目录措辞的文档测试逐字钉在 16 份 agent 上）不在这条范围，保留。
4. 「第 1 轮 review 把实现期间开的存量 issue 列进『已按规则处理』」→ `pr`（汇报格式）；pr-review 主文件只指过去。
5. 执行方交回前要跑的测试清单（这张写的或改到的单元测试、API 测试、选中的存量回归、typecheck、lint）→ implementer 定义的「做」一步；它的完成标准和 implement 的「快进不了」参考只指过去。
6. issue-triage 主文件与 issue-triager 定义里各一段「Linear 项目」说明 → `issues` 的 Linear 做法；两处只留指针。钉着指针和命令名的 Linear 文档测试照新位置改。
7. `writing-for-agents`：规矩归属表补上面六行，再补两行：dreaming 的收尾规矩（推送三种情况、回滚、中间物清理、幂等）→ dreaming 的提议表参考；ui-reviewer 的发现文件形状 → design-archive 的走查参考。它讲「引用另一个 skill」的那份参考补一句：开场注入的 skill（decision-rules）指自己的参考文件要写插件根的完整路径，因为注入的正文没有 base directory。
8. `wiki-conventions` 的旧平铺布局迁移参考里两处 `git mv` 改成目标型说法（保留文件历史地移动）。

改的文件：issues、issue-session、issue-dispatch、issue-triage、wiki-conventions、uiux-imagine、uiux-refine、seo-scan、pr、pr-review、implement、writing-for-agents 及其参考文件；issue-triager、implementer 与五个 SEO 方向 agent 定义；对应的文档测试。

## 验收标准

- [ ] 上面八条每条做完：规矩只在归属处写全，别处是指针（交回里每条写归属处和改成指针的几处）。
- [ ] 每份改到的 SKILL.md、agent 定义主体不超过 4500 字（量法照仓库 `AGENTS.md`），交回里贴每份的改前、改后字数。
- [ ] 改到的文件里，决策历史的搜索（日期、「人定」「原话」「依据：」）没有新增命中。
- [ ] 改到的文件里，行内的 `gh` / `git` 命令只剩适配层和标了「坑」的行；`dyna-scan` 测试绿。
- [ ] 改到的文件对应的文档测试同步改：守硬规矩的断言跟着内容挪到归属处，并钉住别处的指针。全量测试绿（plugin-version 那条按约定不升版本，红是预期）。
- [ ] 不改任何流程的行为：只改写法和位置。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `comment-marker-doc`、`pending-design-doc`、`project-directory-wording-doc`、`linear-docs`、`issue-session-implement-doc`、`dispatch-by-period-doc`、`pr-review-slim-doc`、`implementer-slim-doc`、`writing-for-agents-rewrite-doc`、`wiki-conventions-skill-doc`、`seo-scan-rewrite-doc`、`session-inject-doc` 测试：都钉着这几条规矩现在的位置。
