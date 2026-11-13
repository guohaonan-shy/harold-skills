# 04 — `cover` 读得到 `delta/`：归档和初扫的新状态当场补拍

**Blocked by**：02（`cover` 命令）、03（拍图文档）——两张都已落地，可立即开工
**设计冻结**：不涉及 UI

## 要建什么

`cover` 现在只读 `prod/` 里的状态和边。spec 要求合并前归档、dreaming 初扫这两处拍不分段的长状态时也跑 `cover`，可这两处的新状态、新边都还只在 `delta/` 里（归档写 `docs/design/tmp/<spec-slug>/delta/`，初扫写 `docs/design/tmp/dreaming-<日期>/delta/`）。结果是 `cover` 读不到：状态不在 `prod/` 就退出码 2，状态在但边是新加的就漏掉那些边。spec 要解决的正是新报告页首次进档案时补不上图，所以这条路必须通。

这张工单给 `cover` 加 `--delta <spec-slug>`，读法跟 `measure` 的 `--delta` 一样：`prod/` 叠上那份 `delta/` 一起读，`delta/` 里的状态和边优先。然后把 03 写进文档的三处限制句（拍图手册「比主视口高、不分段的状态」一节末尾、合并前归档、初扫第 7 步）改成带 `--delta` 的命令行：归档带 `--delta <spec-slug>`，初扫带 `--delta dreaming-<日期>`，删掉「不补拍、记未做」的说法。

> 编排者按规则定（2026-11-13）：03 的执行方查到 `cover` 读不到 `delta/`，给了 A（加 `--delta`）、B（等对账补拍）两个选项。按 spec 定 A：spec「方案」写明归档和初扫这两处要跑 `cover`，而这两处的内容只在 `delta/` 里，B 等于这两处不跑；`measure` 已经有 `--delta`，照它的写法加。

## 验收标准

- [ ] 单元（CLI）先红后绿：一个只在 `delta/` 里的不分段状态，`cover <仓库根> <状态 id> --delta <slug> --out <目录>` 退出码 0，打印的代码里带着这个状态的 `user` 边；不带 `--delta` 时照旧退出码 2。
- [ ] 单元（CLI）：状态在 `prod/`、`delta/` 里给它加了一条新 `user` 边，带 `--delta` 时打印的代码里有这条新边。
- [ ] 拍图手册、合并前归档、初扫三处不再写「`cover` 读不到 `delta/`」「不补拍」，换成带 `--delta` 的命令行；现有 doc 测试「每行命令只用自己的选项」通过（`cover` 的选项表里有 `--delta`）。
- [ ] sections 单元测试、doc 测试、no-project-leak 测试全绿；`measure` 的 `--delta` 行为不变。

## 选中的存量回归

- sections 单元测试（`design-archive-sections.test.mjs`）：`cover` 的参数解析与 `measure` 共用读档案的路径。
- sections doc 测试（`design-archive-sections-doc.test.mjs`）：核文档里 `cover` 命令行的选项。
- 防项目信息泄漏测试（`no-project-leak.test.mjs`）。
