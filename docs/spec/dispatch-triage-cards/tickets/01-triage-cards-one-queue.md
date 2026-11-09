# 01 — 调度给 triage 出卡片，所有 issue 一个队列

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 issue 调度每一轮除了给 `todo` 的 issue 出会话卡片，也给没有会话的 `triage` issue 出卡片；人点卡片才开会话，开出的会话照 issue-session 的 triage 会话走（起草 spec、grill、设计、翻 todo）。

上限两个：in-progress、in-review 两个 section 里的 issue 会话加还没点的 todo 卡片，合计不超过 10；triage section 里的 issue 会话加还没点的 triage 卡片，合计不超过 3。一轮最多出 3 张卡片，先 todo 后 triage。triage 候选的顺序跟 todo 一样（指派给本人的在前，按 P0 → P1 → P2 → 没有，同一级里本人的按号、未指派的按在 triage 停留时间久的在前；指派给别人的不派）。magi 运行环境没有卡片，triage 也直接开会话，受同一个上限 3 卡住；magi 没有 section，按会话对应 issue 的状态分两份数。

同时删掉「独立队列」：所有分类的 issue 一个队列、一套三个 section（triage、in-progress、in-review），分类上写的「（独立队列，上限 N）」注不再分队列，但仍从 label 说明里剥掉、不报错。`seo-setup` 不再写这个注。

文字上：issue-dispatch 不再说 triage 由人自己开会话、不再列没有会话的 triage issue 让人手开；issue-session 会话表里 triage 会话由「人或调度卡片」开；issue-triage 批表的 triage 那一行改成调度会出卡片；runtime 两份 reference 的「会话管理」「调度」、issues skill 的命令表与参考、setup 的分类格式参考、seo 的 README 与 seo-setup、idea-loop README 跟着改，`idea-loop/skills/` 与 idea-loop README 里不再出现「独立队列」。

spec：`docs/spec/dispatch-triage-cards/dispatch-triage-cards.md`（「方案」「实现决策」「测试决策」）。

## 验收标准

- [x] `issues candidates <docs> [<上限>] --state=triage` 只返回开着、没有被挡、状态是 triage 的 issue，顺序同 todo，未指派的按 `status:triage` 最后一次加上的时间排；不带 `--state` 仍是 todo；`--state` 给别的值报错。有单元测试。
- [x] `issues queues <docs>` 返回一个对象：`cap` 10、`triageCap` 3、`sections` 为 triage / in-progress / in-review；`--queue` 和按号查队列的用法没有了。有单元测试。
- [x] 分类行带「（独立队列，上限 N）」注时，解析出的分类说明里没有这段注，也不再产生第二个队列。有单元测试。
- [x] issue-dispatch 每一轮的步骤写明：分两份数会话、先交 todo 再交 triage、一轮最多 3 张、还没点的卡片按状态记；第 4 步不再报没有会话的 triage issue。
- [x] runtime 的 claude-desktop 与 magi 两份 reference 的调度做法照上面改（两个上限、section 不带分类名、卡片 background 写派的是 todo 或 triage、magi 按 issue 状态分两份数）。
- [x] 新增的 doc 测试断言：issue-dispatch 不再写「由人自己开会话」、有交出 triage 的一步；issue-triage 的 triage 那一行不再写「人自己开 triage 会话」；`idea-loop/skills/` 与 idea-loop README 里不出现「独立队列」。
- [x] `node --test idea-loop/scripts/*.test.mjs` 全绿（含 no-project-leak）。
- [x] review 第 1 轮 S1：交出 triage 时跳过已有同号会话和还没点的卡片（triage 会话开着时 issue 仍是 triage）；magi 不给已有会话的 triage issue 再开一个。

## 选中的存量回归

- `issues.test.mjs` 里 `candidates` 的几个测试：顺序规则被改成按状态取，最容易回归。
- `issues.test.mjs` 的「a category marked 独立队列 …」与「candidates of the main queue skip own-queue issues」：行为被删，要改写成新期望而不是删了了事。
- `no-project-leak.test.mjs`：改了插件里的文档，防止写进真实项目的名字。
