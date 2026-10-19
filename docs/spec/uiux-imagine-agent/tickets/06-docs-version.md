# 06 — README / CLAUDE.md 同步，plugin 升版本

**Blocked by**：01、02、03、04
**设计冻结**：不涉及 UI

## 要建什么

把 imagine / refine 的新形状同步进对外描述，让下一个读仓库的人看到的是现在的样子：

- idea-loop 的 README 与仓库根 `CLAUDE.md` 里对 `uiux-imagine` / `uiux-refine` 的描述：imagine 改成「会话编排 + `idea-loop:uiux-imaginer` 执行」；refine 的 designer「从 imagine 交出的交接画布接着做（没有交接画布时退回从方向说明重建）」，不再是「只从方向说明重建画布」；评委碰到人选定的项由 designer 摆给人判。
- 仓库根 `CLAUDE.md` 里列 plugin 自带 agent 的地方加上 `uiux-imaginer`，写明它是 `uiux-imagine` 的执行者、模型 `opus` · high。
- plugin 版本从 0.0.24 升到 0.0.25（marketplace 里若也写了版本，一起改）。
- ADR 0002 的修订**不在这张**：ADR 由 `dreaming` 对账时写，实现里不手写。

## 验收标准

- [ ] README 与 `CLAUDE.md` 里不再出现「designer 只从方向说明重建画布」这类与新形状矛盾的说法；新增 agent 的名字、职责、模型写对。
- [ ] plugin 版本是 0.0.25，marketplace 与 plugin 自己的清单一致。
- [ ] 没有手写或改动 ADR。

## 选中的存量回归

无 test-cases 库。本仓库真实存在的是：

- **baseline eval 的 repo 静态检查那一格**（全仓无跨 plugin 的 skill 调用）——改文档不能引入跨 plugin 的调用写法。
