# 05 — 一组一份 spec、一个会话从审核做到合并：撤掉实现子会话、两种合并去向和集成 review

**Blocked by**：无——可立即开工（脚本行为由 04 改，这张只写文字；两张不碰同一份文件）
**设计冻结**：不涉及 UI

## 要建什么

人改了方向（2026-10-30）：「无论一个根issue有多少个subissue 我觉得还是一份spec，一个会话，也别搞太复杂了。这样这些问题我觉得可以解决了，精力放在issue在cloud 上的整合吧～」。定下的：一个根一份 spec，`issues:` 写全部子 issue；根和子一起认领、一起翻、spec 完成时一起关；审核、切票、实现、review、合并都在这一个会话里做，不开实现子会话（#153 的压缩碰到问题再重开）；不要集成 review。

把 #172 加进 skill 文字里的子会话结构撤掉，回到「一个会话从审核做到合并」，但保留按组：

- **issue-session**：开场照旧认出一组、对根号整组认领、标题用根号。审核：对这一组调**一次** `issue-verify`，它把全部子 issue 各自复现、写进**一份** spec（`issues:` 列全部子 issue）；没被整合的 issue 照旧一次。实现：回到在本会话里做——已经切过工单就不再切，否则用 Skill 工具调 to-ticket；再用 Skill 工具调 implement、pr-review；人说合并时由 pr-review 合并，然后换阶段。删掉：给子会话的简报、根 / 子会话分工、「根代表一个版本 / 一个页面或模块」两种合并去向、集成分支与集成 review、「规则回放的结果发进子会话」的改写（回放结果回到发进本会话）。收尾：spec 完成时根随子 issue 一起关（脚本做）。
- **issue-verify**：「在根的会话里」一步改成：根的会话对一组调一次，`<号>` 给根号；逐个复现根下每个子 issue，起草一份覆盖全部子 issue 的 spec（验证表每个子 issue 一行），交回这一份 spec 的 slug；认领已由会话整组做过，不重复认领。
- **issue-dispatch**：按根出卡片照旧；汇报里「子会话（不占位）」的说法只剩设计阶段的 imagine 这类会话，不再提实现会话。
- **pr-review 合并步骤说明**：去掉「实现子会话也可以合并」「合并后通知根的会话」，回到合并统一在 issue 会话里做、由它换阶段跑 advance。
- **插件 README**：issue-session、issue-verify、issue-dispatch 几行按上面改；pr-review 那一行讲合并的说法跟「合并前归档」缺口那段对齐（合并都在 issue 会话里）；流程总览里「每段经自己的 PR 进主分支」保持，不再有版本分支的例外。
- **setup 的 issue 追踪模板**：「一个 issue 一个会话」改成「一组（根加子 issue，或一个没被整合的 issue）一个会话」。
- **文字检查**：守着子会话结构的那条检查（「实现开子会话、两种合并去向」）改成守新结构：一组调一次 issue-verify、一份 spec、本会话里切票实现 review 合并、没有子会话简报。

## 验收标准

- [ ] issue-session 写明：整组认领；一组调一次 issue-verify、一份 spec；实现在本会话里做（已经切过工单就不再切、Skill 工具调 to-ticket / implement / pr-review）；没有子会话简报、没有两种合并去向、没有集成 review；规则回放结果发进本会话
- [ ] issue-verify 写明在根的会话里对一组调一次、一份 spec 覆盖全部子 issue、不重复认领
- [ ] pr-review 合并步骤说明里没有实现子会话和「通知根的会话」
- [ ] issue-dispatch 不再提实现会话；README 相关行（issue-session、issue-verify、issue-dispatch、pr-review）与合并缺口段一致，流程总览「每段经自己的 PR 进主分支」没有例外
- [ ] setup 的 issue 追踪模板写「一组一个会话」
- [ ] 守结构的文字检查改成守新结构并通过；issue-session 现有的「已经切过工单就不再切」「Skill 工具调」检查照过；改过的 SKILL.md 主体都在 5000 字以内；全量测试通过

## 选中的存量回归

- `idea-loop/scripts/issue-group-skills.test.mjs`：守的正是要撤的结构，必须改写。
- `idea-loop/scripts/issue-session-implement-doc.test.mjs`：守「已经切过工单就不再切」和编号的两步。
- `idea-loop/scripts/no-project-leak.test.mjs`、`skill-private-references.test.mjs`：改了 skill 文字。
