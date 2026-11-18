# design/ 的两层

`design/` 分两层，生命周期相反：

- **`design/tmp/<spec-slug>/`** 跟着需求走：`/idea-loop:uiux-imagine` 写 `imagine/`，`/idea-loop:uiux-refine` 写 `canvas/`，`delta/` 在 review 之前写，`idea-loop:uiux-research` 写 `research/`（imagine 与 refine 共用这一处，imagine 收工清 `imagine/` 时它还在）。
  - 过程产物只留在本地、不提交，放弃的需求只丢画布，有价值的结论写回 spec 或 issue。
  - 冻结时，签字的画布、冻结记录和交互图 `commit` 到 home（「知识库落地」），代码分支和代码 PR 里没有它们；实现从项目目录里读。冻结之后设计变了，由 designer 改画布、冻结记录记一行，改完再 `commit`。它们留到代码 PR 合并之后的归档：`delta/` 在合并前写好并过归档校验，review 看的就是它；代码 PR 合并成功后归档脚本才把要长期留下的并进 `prod/`、清掉整个 `tmp/<spec-slug>/`，结果 `commit` 到 home。
  - **`research/` 不算设计产物**：从不归档；只做过调研的需求不起 UI 审查，合并也不走归档。用进设计的调研结论已经以文字写在方向说明或冻结记录里，随设计归档。
- **`design/prod/`** 是设计档案，提交，活得比 spec 长。写 `prod/` 只走归档脚本（代码 PR 合并成功后；dreaming 对账的 `档案对象`、`档案状态`、`初扫页面`、`漏归档` 行是例外，它们按建议处置自动执行，不等人批），agent 只写 `tmp/<spec-slug>/delta/`。一个档案对象只在下一个需求归档时被覆盖或删除，所以 spec 删了，`prod/` 里的东西照旧留着。结构见 `idea-loop:design-archive`。

按 `design/<spec-slug>/` 命名的旧目录是旧布局的冻结记录，`design-archive-check.mjs` 对每个只打一条提示（建议删），不读。
