# 06 — implement 记最小差异、按档案进状态

**Blocked by**：01 — 设计档案的结构说明与校验；02 — 档案查询模块：六个入口 + 命令行
**设计冻结**：不涉及 UI

## 要建什么

让没走设计流程的 UI 改动也进档案，并让 implementer 写测试时能直接照档案进状态。

- **编排者（implement）**：派 UI 工单时，把集成 worktree 里 `docs/design/tmp/<spec-slug>/` 的**绝对路径**交给 implementer（`tmp/` 不进 git，implementer 自己的 worktree 里没有它）。
- **implementer**：冻结画布从这个绝对路径的 `canvas/` 下读；工单是 UI 改动但没有设计稿时，在这个路径的 `delta/` 下按插件档案结构 reference 记**最小差异**——只写本工单碰到的状态、边、组件文件（文件已存在就在上面改，不覆盖别人写的部分），状态文件补齐「这一屏」与「应看到什么」。要进某个状态复现或写测试时，先用档案的「单个状态」查询入口拿进入方式。
- 两处说明都写明：写 `prod/` 不归 implementer，归档在合并前由 pr-review 做。

## 验收标准
- [ ] implement 的派工说明里有「交给 implementer 的 tmp 绝对路径」这一项
- [ ] implementer 的说明里写明读冻结画布的位置、最小差异的写法与范围、进状态先查档案
- [ ] 两处都不让 implementer 写 `prod/`
- [ ] 全量 node 测试套件全绿

## 选中的存量回归
无 test-cases 库。跑全量 `*/scripts/*.test.mjs`。
