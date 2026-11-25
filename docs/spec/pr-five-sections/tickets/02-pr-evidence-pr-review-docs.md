# 02 — pr、evidence、pr-review 三个 skill 照五节改写

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
写 PR 描述的会话照 `idea-loop:pr` 只写五节；挑视图时调 `idea-loop:evidence` 查视图菜单；`idea-loop:pr-review` 交报告时按五节写各节，自己的汇报格式和 review loop 文件归它自己。

- **pr**：SKILL.md 的 description 只讲 PR 描述；正文节表换成 `problem`、`outline`、`evidence`、`risk`、`your-todo`、`live-check`（谁写、什么时候写）；「Review 汇报」「在会话里给人看」「review loop 文件」三节挪走；开 draft PR 那步只写 `Refs` 行和问题节起头（不再写 `summary` / `reference`）；写描述的命令是 `dyna pr body set`，写入时结构检查会拒写（说一句）。参考文件 description.md 用分支上已有的草稿收尾（不重写）；delivery-evidence.md 留，「之前 → 之后」改成「同一个操作在基准分支和本分支各做一遍」。
- **evidence**：SKILL.md 用分支上已有草稿（开头 show-me 那句、视图菜单、怎么摆）收尾；节名「证据是什么」保留（别的 skill 引用它）；视图菜单那一段要有一个稳定的小节标题「视图菜单」（dyna 拒写时从这里读出打印）；description 改成「帮人看懂……有哪些视图可挑……」的路由写法，保留「交 spec 的那段话」这个说法。原「证据的几种形态」表的守卫测试改成守视图菜单。
- **pr-review**：pr 的 review-report.md 挪进 pr-review 的参考文件：结论一句、已按规则处理、S / C 编号、合并风险一项、要你看的、折叠区内容、编号只在本次有效留下；一道题的形状删掉，改成一句「照 home 固定文案『要我定的事写成一道题』写」。review-loop.md 整份挪进 pr-review 的参考文件。交报告（deliver）按五节写：问题、概要取自 spec 与落地结果，证据取自执行方在两边各做一遍的复现，合并风险对着整个 PR 判，要你做的事收人验素材和合并后的事；删 `verification`、`changes`、`rollback` 的写法。other-directives 里「上线前要注意的」追加进 `your-todo` 的合并后一类。run-a-round 指向挪过来的汇报格式。merge、seo-auto-merge 读 `your-todo`、`live-check` 不变。
- **所有指向旧路径的地方**一起改：仓库里引用 pr 的 review-report.md / review-loop.md、或引用「Review 汇报」一节的（设计档案 skill 的 review-walkthrough、uiux-refine 的 freeze、issue-triager 等 agent 定义、插件 README 的文件树与说明），改指到 pr-review 下的新位置；dyna 代码注释归工单 01。

## 验收标准
- [ ] pr 的 SKILL.md 和参考里没有 `summary`、`changes`、`verification`、`rollback`、`night-decided`、`night-waiting`、`reference` 作为节名；没有「Review 汇报」「review loop 文件」两节；pr-review 的参考里有汇报格式和 review loop 两份。
- [ ] `git grep` 插件内对 pr 下 review-report.md / review-loop.md 的引用为 0（docs/raw、docs/adr 历史除外）。
- [ ] 守这些文档的测试（pr-flow、pr-by-deliverable、pr-review-slim、decision-evidence-principles、evidence 形态表那条等）跟着改到新结构并绿；新增一条文档测试钉住：pr 里没有 review 汇报三节而 pr-review 里有、evidence 有「视图菜单」小节。
- [ ] 插件全量 `node --test` 绿。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- 插件 scripts 下守 pr / pr-review / evidence 文档的那几条 doc test：这次改动正是它们守的文字。
- 仓库根 `scripts/root-agents-annotated-samples.test.mjs`：evidence 组样本的停点引用 evidence 的节名。
