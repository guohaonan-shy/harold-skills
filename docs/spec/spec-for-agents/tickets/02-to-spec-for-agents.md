# 02 — to-spec 只写给下游 agent，交 spec 时在会话里写「现状 → 目标 → 要你定」

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

调 `idea-loop:to-spec` 写 spec 的 agent 拿到的是只给下游 agent（切工单、探路、实现、review）读的模板：七节中文版（问题陈述、方案、User Stories、实现决策、测试决策、Out of scope、关联），每节一行「给下游什么」。保留：「方案」下的「前端交互」子小节（原先 plan-subsections 参考里讲它的那一行并进模板）、同一行为的其他入口、开头的 `> 需要 grill` 和「实现决策」里的 `### 待定`、「测试决策」的 seam 与「照着谁写」（测试表只写这次碰到的行）、改 agent 文档时的「杠杆诊断」。删掉：开头判词、复现图（问题陈述只写文字现状和复现材料路径）、「根因」小节（并进问题陈述）、方案的时序图、「后端」「前端内部」子小节、User Stories 树（留编号列表）、spec 里照 evidence 写给人看的要求。

第 3 步探代码时照 `idea-loop:evidence` 的「证据是什么」核现状（现状要对，下游照它找代码），不再照它写给人看。第 5 步改成「交 spec」：在会话里写一段「现状 → 目标 → 要你定」，题的写法照 home 固定文案的「要我定的事写成一道题」（`idea-loop:decision-rules` 已在 #280 删掉，Harold 2026-11-25 在 #452 题 18 定题的写法归 home 固定文案），证据照 `idea-loop:evidence`；再列还剩的「需要 grill」「待定」。完成条件写成「会话里有现状、目标、要你定，还剩的标记都点了名」。

同一件事的其他几处跟着改：

- to-spec 的参考：删 figures、issue-verdicts、plan-subsections 三份；agent-docs 参考加一句「frontmatter 写 `changes_agent_docs: true`」（工单 01 的检查靠它）。raw-template、land-on-main 不动。
- `idea-loop:issue-session` 的起草参考（draft-spec）：删「结论行」一节，保留「起草时发现已被做掉就翻 canceled」；自校验去掉「标题下有结论」，复现写进问题陈述的文字，期望行为编号对问题陈述的小节。正文 triage 第 2 步「几句话告诉人」改成指到 to-spec 第 5 步交 spec 的那段话，不复述。夜里 todo 会话自己起草时，这段话写进停下时的最后一段回复。
- home 固定文案（setup 的 home-rules 参考）「其余你自己定」那句里交付物名单的「spec」换成「交 spec 的那段话」。
- evidence 的 description 里「（对话、spec、PR）」换成「（对话、交 spec 的那段话、PR）」。
- 钉着被删参考的文档测试（to-spec 的几份 doc test）改成钉新模板。

#452 同时在改 home-rules（别的段落）和 evidence 的 description：后合的一方在先合的上改，保留「交 spec 的那段话」。插件版本保持 0.2.0（0.2.0 未发布，收尾时父会话写 0.2.0-beta.1）。

## 验收标准

- [x] to-spec 模板是七节中文版，每节一行「给下游什么」；正文和参考里没有判词、复现图、时序图、story 树、「根因」、「后端」「前端内部」子小节的要求；「前端交互」子小节、其他入口、需要 grill / 待定、seam、杠杆诊断都在。
- [x] to-spec 第 5 步要求会话里写现状 → 目标 → 要你定，题的写法指到 home 固定文案「要我定的事写成一道题」，不再指 decision-rules。
- [x] figures、issue-verdicts、plan-subsections 三份参考已删，没有任何文件还链接它们；agent-docs 参考有 `changes_agent_docs: true` 那句。
- [x] draft-spec 参考没有「结论行」；issue-session 正文 triage 第 2 步指到 to-spec 第 5 步。文档测试钉住这两条。
- [x] home-rules 与 evidence description 的名单已换成「交 spec 的那段话」。
- [x] `node --test idea-loop/scripts/*.test.mjs scripts/*.test.mjs` 全过（含改过的 to-spec doc test、no-project-leak）。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/to-spec-by-deliverable-doc.test.mjs`、`to-spec-diagnose-agent-docs-doc.test.mjs`、`to-spec-verify-lines-doc.test.mjs`：钉着 to-spec 现在的写法，被删的参考会让它们红，要改成钉新模板。
- `idea-loop/scripts/no-project-leak.test.mjs`：改到的插件文字不能带项目信息。
- 守 home 固定文案、setup 文案和注入长度的测试（setup 目录相关的 doc test）：改了 home-rules。
