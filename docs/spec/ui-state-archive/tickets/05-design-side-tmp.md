# 05 — 设计侧产物搬进 docs/design/tmp/，冻结时写 delta

**Blocked by**：01 — 设计档案的结构说明与校验
**设计冻结**：不涉及 UI

## 要建什么

让一次 imagine → refine 的全部过程产物都住在目标项目的 `docs/design/tmp/<spec-slug>/`（本地、不进 PR），冻结时额外把结果写成对 `prod/` 的差异，归档时才进 `prod/`。

- **uiux-imagine**：工作区与方向说明从 worktree 根的 `.tmp/uiux-imagine/<spec-slug>/` 搬到 `docs/design/tmp/<spec-slug>/imagine/`；方向说明校验脚本及其测试跟着改路径。开工拿线上基线时，先用档案的「页面」查询入口（插件的档案查询 MCP 工具；02/03 还没落地时，说明里写「有就用」）。
- **uiux-refine / designer**：预览服务器、画布、冻结记录、完整验收矩阵、交互图从 `docs/design/<spec-slug>/` 搬到 `docs/design/tmp/<spec-slug>/canvas/`；原来冻结后清 `.tmp/uiux-refine/` 与 `.tmp/uiux-imagine/` 的步骤改成清 `tmp/<spec-slug>/imagine/`（canvas 保留到归档）。冻结时 designer **额外**写 `tmp/<spec-slug>/delta/`：按插件档案结构 reference，把冻结的状态与边写成状态文件、新动效写成动效文件、碰到的组件写成组件文件；冻结记录里的理由与被否的做法拆成对应对象的「决定」（来源写这份 spec 的 wikilink），Distill-back 写成对应对象的「设计法候选」。动效段签字后的新动效**只进动效文件与候选**，不写 `DESIGN.md`。spec §4 冻结摘要里的画布指针改成指向 `docs/design/tmp/<spec-slug>/canvas/` 的路径（目标不进 git，不写 wikilink）。冻结记录正文的节列表里补上「设计法候选」一节。
- **design-lint 钩子**：监视路径改到 `docs/design/tmp/<spec-slug>/canvas/` 下的画布。
- **交互图拼图脚本**：每一格的输入可带一个状态 id（档案里的状态名），输出时保留这份对应，让交互图的每一格能对回 `delta/` 里的状态；不带时行为不变。spec 图示规范里交互图「放哪」一节跟着改。
- **wiki 约定**：目录一节把 `design/<spec-slug>/` 换成 `design/tmp/` 与 `design/prod/` 两层；type 闭集加入五种档案对象类型；`docs/design/index.md` 的契约改成 `prod/index.md` 由归档脚本生成。
- **其余 design reference 里**写着 `docs/design/<spec-slug>/` 的地方一并改成新路径。
- **evals**：`prototype` / `uiux-imagine` / `uiux-refine` baseline 断言里的产物路径跟着改；不在本工单里重跑 baseline，交接时写明重跑命令留给人。

不要在新写的文字里提已删掉的旧 DESIGN.md 建模 skill 的名字（有绊线测试扫）。

## 验收标准
- [ ] 插件里不再有写到 `.tmp/uiux-imagine/`、`.tmp/uiux-refine/` 或 `docs/design/<spec-slug>/` 的指示（evals 的历史存档除外）
- [ ] 方向说明校验、design-lint 钩子、拼图脚本的测试按新路径与状态 id 输入更新并全绿；拼图脚本不带状态 id 时输出与改动前一致
- [ ] designer 的冻结步骤写明 delta 的写法，且与档案结构 reference 一致（对象类型、决定与候选的形状）
- [ ] wiki 约定的目录、type 闭集、index 契约已更新
- [ ] evals 断言路径已改，交接里给出重跑命令
- [ ] 全量 node 测试套件全绿

## 选中的存量回归
无 test-cases 库。跑全量 `*/scripts/*.test.mjs`；重点是方向说明校验、design-lint 钩子、拼图脚本、无遗留入口绊线、不泄露项目名这几组。
