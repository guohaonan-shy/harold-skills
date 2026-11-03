# 01 — issues.mjs 换成四段阶段，加老 label 迁移

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
idea-loop 的 issue 状态脚本只认五种 open 状态：待验证（没有 label）、讨论中、设计中、实现中、审核中，外加搁置；「验证中」「待设计」「待实现」不再存在。`advance` 照传进去的那份知识库（会话分支）推进：正式且碰 UI 未冻结 → 设计中，正式已冻结或「实现中」→ 实现中（已在审核中的留在审核中），完成或不存在 → 关闭。`reconcile` 只关该关的、根跟着子 issue，不再挂状态、也不再报「中字头却没有主分支 spec」。`resume` 按主分支 spec 关掉 / 回设计中或实现中 / 回待验证。`open` 开的 spec issue 当场挂讨论中。侧边栏 section 是四个同名的。删 `queue` 子命令。子 issue 分在两份以上 spec 里的根不再报问题、不动。新增 `migrate <docs> [--apply]`：仓库里还有老 label（验证中 / 待设计 / 待实现）才迁，验证中与审核中 → 讨论中、待设计 → 设计中、待实现 → 实现中，不带 `--apply` 只列清单，带了才改并最后删三个老 label；迁过再跑什么也不做。

## 验收标准
- [ ] `set` 的翻法表照 spec「状态与翻法」：待验证 → 讨论中 / 搁置；讨论中 → 待验证 / 搁置；设计中 → 搁置；实现中 → 审核中 / 搁置；审核中 → 实现中 / 搁置；单元测试覆盖拒绝与允许各至少一例
- [ ] `advancePlan`：正式不碰 UI 的讨论中 → 实现中；正式碰 UI 未冻结 → 设计中；设计中且已冻结 → 实现中；spec 实现中、issue 审核中 → 不动；完成 → 关闭（单元测试）
- [ ] `reconcilePlan`：知识库主分支上没有 spec 列着的实现中 issue 没有动作、没有问题；完成的 spec 关掉 issue；正式的 spec 不挂任何状态（单元测试）
- [ ] 子 issue 分在两份 spec 里的根：`rootPlan` 不报问题、不动；子 issue 全关时根关闭（单元测试）
- [ ] `migratePlan`：有老 label 时按映射给出翻法和要删的 label；没有老 label 时为空（迁过再跑不动新的审核中）（单元测试）
- [ ] `migrate` 命令行：默认只列，`--apply` 才改；`queue` 子命令不存在；`STAGE_SECTIONS` 为讨论中、设计中、实现中、审核中
- [ ] 文件头注释与用法说明换成新流程的说法；全量 `node --test idea-loop/scripts/` 通过

## 选中的存量回归
- `issues.test.mjs`：状态机与对账的现有用例全部要按新状态改写，风险最大
- `seo-scripts.test.mjs` / `seo-issues.test.mjs`：`seo-issues.mjs` 引用了状态名
