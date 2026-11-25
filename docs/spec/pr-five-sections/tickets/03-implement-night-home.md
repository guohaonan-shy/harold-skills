# 03 — implement、夜间模式、早上汇总、home 固定文案跟上五节

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
PR 描述不再有 `reference`、「夜里替你定的」「等你定的」三节之后，几个写入方不再写它们；要人定的一道题统一写法。

- **implement**：开工（start-of-run）不再补 PR 描述的 `reference`；停下（stop-and-resume）不再更新 PR 描述里的执行记录（工单表与执行记录留在 review loop 文件）。执行方（implementer agent 定义）对工单所属问题的每一件，在基准分支和本分支各做一遍同一个操作，结果写进交回，供 PR 证据节用。implement 的 SKILL.md 里提到旧节名的地方一起改。
- **issue-session 夜间模式**：去掉写 PR 描述「夜里替你定的」「等你定的」两处；按推荐定的只记进 review loop 文件（原有），停下的事在 issue 上留评论（`dyna issues note`）。
- **issue-dispatch 早上汇总**：「review 结论（取 PR 描述里的审核结论）；『夜里替你定的』一节有几条」改成取 review loop 文件最近一轮的结论和按推荐定的条数。
- **home 固定文案**（setup 的 home-rules）：扩写「要我定的事写成一道题」：一道题 = 问题（短文字 + 最小视图，用什么视图照 `idea-loop:evidence`）· 选项（各带代价、能否撤回）· 推荐和一句理由。扩写前后各量一次 home 固定文案的字数（UTF-8 字符），写进交回。不动别的段落（#451 改的是「已按规则处理」的交付物名单）。

## 验收标准
- [ ] implement、night-mode、morning-summary、implementer 定义里不再出现 `reference` 节、「夜里替你定的」「等你定的」作为 PR 描述节名。
- [ ] implementer 定义写明「对每件问题在基准分支和本分支各做一遍同一个操作，结果写进交回」。
- [ ] home-rules 的「一道题」写了问题（带视图）、选项（代价、能否撤回）、推荐；前后字数写进交回。
- [ ] 守这些文档的测试（issue-session-night-mode、dispatch-by-period、dedupe-rules 等）跟着改到新说法并绿；新增断言钉住上面三格。
- [ ] 插件全量 `node --test` 绿。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- 插件 scripts 下守夜间模式、调度分时段、implement 的 doc test：这次改的就是它们守的文字。
- setup 的 home-rules 相关测试（固定文案的段落与字数）。
