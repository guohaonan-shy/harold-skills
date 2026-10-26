# 03 — dreaming：提议表加「retro 候选」一节，人批了开 issue

**Blocked by**：01 — 候选池搬到 records、统一形状，加计数脚本
**设计冻结**：不涉及 UI

## 要建什么

`/idea-loop:dreaming` 跑的时候看当前仓库的候选池（`docs/records/retro-candidates/`），把出现 ≥3 次的摆进提议表；人批了的开成 issue，dreaming 自己不改 skill（依据：人的原话「dreaming没啥问题，需要修改harold-skills那时候再提issue」）。

- **提议段**：dreaming 自己做，不起 agent，跟「漏归档」并列。用 01 的计数脚本列池；只取状态 `在池里`、过门槛的。驳回过的（状态 `驳回`）只在驳回后又有新的「出现」时再进表，「发现」里写上次驳回的理由。目录不存在就跳过这一节。
- **提议表新一节 `retro 候选`**：一行一条候选。「对象」写候选标题和落点；「发现」写次数、出现在哪几场会话、有没有已推翻的和反例（同一类里人选了相反处置的：说得出差别的提成「规则 + 例外」，说不出的写明）；「证据」写各次出现的逐字原话和决定记录链接；「建议处置」闭集：`开 issue：机械检查` · `开 issue：改 skill` · `留在池里` · `驳回`；「选项」照其它节的写法。
- **执行段**：人批了「开 issue」的，照 `idea-loop:spec-status` 的「开一个待验证的 issue」开，落点是插件的开到 harold-skills，落点是目标仓库的开到目标仓库；正文写候选、落点、旧文新文、各次出现的原话。开完把候选文件的状态改成 `已开 issue（<链接>）`。驳回的改成 `驳回（<理由>）`。留在池里的不动。这些改动跟执行段的其它改动同一个只改 `docs/` 的 PR。
- 细节写进 dreaming 的一份新 reference；SKILL.md 只在「自己做、不起 agent」那里加一行指针（主体已超 5000 字，见 #93，不加重）。`proposal-table.md` 里各类行的处置闭集、执行段表格加上这一节。
- `proposal-table-check.mjs` 认 `retro 候选` 这一节和它的处置闭集；这一节的行「证据」格不能空。

## 验收标准

- [x] `proposal-table-check.mjs` 的单元测试：`retro 候选` 一节处置写「改进 skill」→ 非零退出、报处置不在闭集；四种合法处置 → 通过；证据格为空 → 报错
- [x] 新 reference 写明提议段与执行段，SKILL.md 的增量只有一行指针
- [x] `proposal-table.md` 的处置闭集表和执行段表都有 `retro 候选`
- [x] 对 01 搬好的真实池手工走一遍提议段：拿计数脚本的输出，写出一张只含 `retro 候选` 一节的样例表，校验脚本通过（样例表不提交）
- [ ] review 第 1 轮 S1（2026-10-26）：一条候选第二次（及以后）被驳回后，dreaming 认得出最近这次驳回：驳回之后没有新的出现就不再进表；同一天先驳回、后出现的，那次出现算驳回之后的新出现。驳回时间仍从 git 历史取、状态里不加日期；先后按提交顺序比，不按日期比；再驳回时这次的理由写进状态，保证留下一次提交。要有测试或可复跑的复现覆盖「再驳回」和「同日」两种情形

## 选中的存量回归

- `idea-loop/scripts/proposal-table-check.test.mjs`：已有的各节闭集不能被改坏
- `idea-loop/scripts/dreaming-incremental-doc.test.mjs`、`dreaming-source-wave-doc.test.mjs`：它们读 dreaming 的文档原文，改 SKILL.md 时可能碰到它们断言的句子
