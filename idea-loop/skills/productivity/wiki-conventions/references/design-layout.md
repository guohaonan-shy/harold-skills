# 设计目录两层的生命周期

`docs/design/` 分两层，生命周期相反。SKILL.md「目录」那张表只写了两层的名字，设计类调用方（uiux-imagine、uiux-refine、uiux-research、design-archive、归档与对账）读这一份。

## `design/tmp/<spec-slug>/`：跟着需求走

四个子目录各有一个写它的 skill：

- `imagine/`：发散段的变种板、方向说明、交接画布。`idea-loop:uiux-imagine` 写，内部结构归它。
- `canvas/`：收敛段的画布各版本、冻结记录（`canvas/<spec-slug>-design.md`，frontmatter 的 `type: design`，随 `tmp/` 清掉）、交互图；冻结后唯一的设计真相。`idea-loop:uiux-refine` 写，内部结构归它。
- `delta/`：对 `prod/` 的差异。合并前归档时从最终画布加实现写出（没有设计稿的改动由实现者记最小差异），结构见 `idea-loop:design-archive`。
- `research/<问题短名>/`：`idea-loop:uiux-research` 的调研页与参考截图；没有 spec 时放 `tmp/research/<问题短名>/`。imagine 与 refine 共用 `tmp/` 这一处，imagine 收工清 `imagine/` 时它还在。

生命周期：

- 过程产物只在本地（见 SKILL.md「中间产物」的「本地忽略」），放弃的需求只丢画布，有价值的结论写回 spec 或 issue。
- 冻结时，签字的画布、冻结记录和交互图提交在需求的工作分支上（`git add -f`），实现在同一个分支上接着做，跟代码一起合进主分支（SKILL.md「知识库落地」）。冻结之后设计变了，由 designer 改画布、冻结记录记一行，随实现分支提交。它们留到实现 PR 合并前的归档：`delta/` 此时才写出，归档脚本把要长期留下的并进 `prod/`，清掉整个 `tmp/<spec-slug>/`，这些删除跟着同一个 PR 进主分支。
- **`research/` 不算设计产物**：从不归档；只做过调研的需求不起 UI 审查，合并也不走归档。用进设计的调研结论已经以文字写在方向说明或冻结记录里，随设计归档。

## `design/prod/`：设计档案

提交，活得比 spec 长。一个档案对象只在下一个需求归档时被覆盖或删除，所以 spec 删了，`prod/` 里的东西照旧留着。谁能写它、怎么写、旧布局目录怎么处理，以 `idea-loop:design-archive` 的「目录与命名」为准，这里不重复。
