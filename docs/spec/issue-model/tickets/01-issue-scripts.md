# 01 — issue 脚本换成七个状态，spec 不再有状态

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 issue 脚本照 spec「issue 模型」的「方案」与「后端」一节重写：issue 只有七个状态（backlog、triage、todo、in-progress、in-review、done、canceled），开着的四个各一个 `status:<名>` label，backlog 是开着、没有 `status:*`，done / canceled 只看关闭 reason。spec 文件不再有 `status`：原来读写 spec 状态的脚本删掉，读 spec 内容的函数（frontmatter、`issues:`、开头的存在 / 不存在结论、「需要 grill」「待定」、碰不碰 UI、冻结摘要）挪进新的 spec 读取脚本，它只留 `index`（刷 `docs/spec/index.md`）和 `check`（报旧平铺布局、还带 `status` 行的 spec）两个命令。

issue 脚本的命令：`labels`（建四个 `status:*`、`kind:bug|feature|improvement` 和分类 label，`--prune` 删多余的）、`type`（不变）、`show`（JSON：状态、标题、分类、挂着的 PR 各自的仓库与 draft / ready / merged、覆盖它的 spec）、`check`（只核前提不改）、`set`（核过前提再翻；done、canceled 同时关闭；翻 backlog 必须带 `--comment`，评论带「🤖 idea-loop：」前缀）、`candidates`（开着的 todo、没有开着的 blocked by、最早在前）、`reconcile`（全部 PR 合并却还开着的 → done；PR 都 ready 却还是 in-progress 的 → in-review；旧中文 label、一个 issue 两个 `status:*` 报出来）、`queues`（section 名换成 triage、in-progress、in-review）、`migrate`（默认只列出旧中文 label 会怎么改，`--apply` 才改，对照表照 spec「已在用仓库的旧 label」）、`open`（开出的 issue 带 `status:todo`）。删掉 `advance`、`resume`、`handoff`、`unhandoff`、`drop`、`queue`、`group` 和一切根 issue / 子 issue 的逻辑。

前提：triage → todo 要 issue 的 spec 没有「需要 grill」「待定」、碰 UI 的有冻结摘要（没装设计时 `--skip-design`）；→ done 要它挂着的 PR 全部合并；项目文档（`ISSUE_TRACKER.md`）状态表里写了跳过 triage 的，拒绝 `set triage`。PR 挂 issue 的认法：GitHub 上 PR 正文里 `Refs <owner>/<repo>#<号>`（也认 `#<号>`），仓库列表来自 `ISSUE_TRACKER.md` 的「仓库」一节，没有这一节就只有当前仓库。

分支 `backup/242-issue-model` 上有一份九个状态版本的实现和测试，可以拿来改，但它的 `split`、`block`、父子关闭不要。

## 验收标准
- [x] 翻法表照 spec 第二张表；不在表里的翻法拒绝并列出能翻成什么；done / canceled 之后拒绝再翻
- [x] spec 有「需要 grill」时 `set todo`（从 triage）拒绝并说出那一行；`check` 给出同样结论且不调任何写操作
- [x] 项目文档写了跳过 triage 时 `set triage` 拒绝，backlog 能直接到 todo
- [x] issue 挂着两个仓库的 PR、一个没合并时 `set done` 拒绝并列出没合的；都合并后 `reconcile` 把它翻成 done 并关闭为 completed
- [x] `set backlog` 不带 `--comment` 拒绝；带了就贴一条以「🤖 idea-loop：」开头的评论
- [x] `migrate` 默认不调任何改 issue 的 gh 命令，`--apply` 按对照表换 label，搁置的补评论
- [x] `candidates` 跳过还被开着的 issue 挡着的 todo
- [x] 旧的 spec 状态脚本不存在，引用它的测试改读新的 spec 读取脚本；`node --test` 跑插件的 scripts 全绿

## 选中的存量回归
- `issues.test.mjs`：整个文件按新模型重写，它是这一刀的主测试。
- `seo-issues.test.mjs`：seo 开 issue 的脚本读 issue 脚本导出的东西，换状态后可能断。
- `to-spec-by-deliverable-doc.test.mjs`：读 spec 模板的测试，原来 import 旧 spec 状态脚本。
- `review-loop.test.mjs`、`proposal-table-check.test.mjs`：脚本里提到旧状态名，确认没断。
- [x] review 第 1 轮 S1（2026-11-05）：迁移只解除整合开出的根（正文第一行「由整合定时任务开出」）下的父子关系，并把这些根关成 not planned（带评论）；人自己拆的父子关系不动、不列为要解除
