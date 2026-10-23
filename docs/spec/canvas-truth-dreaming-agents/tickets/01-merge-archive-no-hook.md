# 01 — 删合并前钩子，合并前归档从最终画布加实现整份写出档案差异

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里，一个碰 UI 的需求在合并时：人说合并，pr-review 的编排者起 ui-reviewer 的归档模式；ui-reviewer 先核实现（跟现在一样，核不过退回 review），核过之后**整份写出**这个需求的档案差异 `docs/design/tmp/<spec-slug>/delta/`：状态文件的「这一屏」照实现拍、「应看到什么」照最终画布写、边的定位读自真实应用的 DOM；决定与设计法候选取自冻结记录（含将来会有的「冻结后的变更」一节，没有就跳过）与 review loop 里人的批示；长页面照分段脚本写 `sections`。原来冻结时由 uiux-refine 写进 `delta/` 的那些内容（「理由拆进对象」、`sections`），归档模式要能自己写出来，因为下一张工单会让冻结不再写 `delta/`。已经按旧流程冻结、`delta/` 已经存在的需求，归档模式把现有 `delta/` 当草稿接着改，不要求重来。自检照旧（档案校验带 `--no-used-by`、归档脚本 `--dry-run`），草稿给人看、人批了跑归档脚本、提交、合并的步骤不变。

同时删掉合并前钩子：钩子脚本、它的单测、插件 hooks 注册里 Bash PreToolUse 下的这一项。PreToolUse 下的 SEO 检查钩子和写文件之后的钩子都不动。pr-review 的合并 reference、design-archive 讲写入时机的几处、README 里以钩子为前提的句子，改成「归档是 pr-review 合并步骤里的一步」，并写明已知缺口：网页上点合并或在别的会话里合并会绕过归档，由每周 dreaming 兜底，合并统一在 issue 会话里走 pr-review。

依据与全貌：spec `docs/spec/canvas-truth-dreaming-agents/canvas-truth-dreaming-agents.md` 的「实现决策」4、5。

## 验收标准
- [x] 插件 hooks 注册里没有合并前钩子；PreToolUse 下的 SEO 检查钩子、PostToolUse 下的全部钩子都在
- [x] 合并前钩子的脚本与单测文件已删除；原单测里「其余钩子都注册着」这类断言挪进了某个仍存在的钩子的单测，并断言合并前钩子不在
- [x] ui-reviewer 的归档模式写明：核过之后整份写出 `delta/`（这一屏照实现、应看到什么照最终画布、边读自真实 DOM、决定与候选取自冻结记录与人的批示、长页面写 `sections`）；`delta/` 已存在时当草稿接着改
- [x] pr-review 的合并 reference、design-archive、README 里不再有以合并前钩子为前提的句子（搜钩子脚本名与「合并前钩子」无残留，或只剩「已删除 / 已知缺口」的说明）；已知缺口写明
- [x] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过

## 选中的存量回归
- `archive-check-flag.test.mjs`：归档模式的说明里会新写档案校验命令，它保证每条都带 `--no-used-by`
- `seo-check.test.mjs`：同挂在 Bash PreToolUse 上，删合并前钩子那一项时不能连带它
- `design-archive-write.test.mjs`：归档脚本的行为本身不改，确认没被连带
