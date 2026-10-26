# 02 — `retro` 标记：候选里排除，按 plugin 凑一次 retro 整合

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

retro 开出的 issue 要带一个保留 label `retro`，分类照常按 plugin 打（`type:<plugin>`，可带子类）。带 `retro` 的 issue 不走「一个 issue 一张会话卡片」，而是每天凑成一次「retro 整合」：同一个 plugin 里由 retro 开出、还没处理的至多 5 个 issue，交给一个整合会话处理。这张工单只做 idea-loop 的 issue 脚本这一侧：

1. **候选里排除**：列待验证 issue 给调度出卡片的那个命令（`candidates`，主队列和独立队列都一样）不再列带 `retro` 的 issue。
2. **凑一次 retro 整合**：新加一个命令，读 open 的、带 `retro`、还没有 `status:*` 的 issue，按 `type:<父类>` 分组，取最早开的那个 retro issue 所在的父类，返回这个父类里最早开的至多 5 个（号码与标题，JSON）。不满 5 个也返回。没有父类分类的 retro issue 不凑进去，单列出来让调度报给人。命令名实现时定，写进脚本的用法说明。
3. **建 label 与保留**：建 label 的那个命令把 `retro` 也建出来；`retro` 不被当成多余的 label 列出。本仓库根目录 `AGENTS.md` 的「issue 分类」一节「保留的 label」写上 `retro`；`setup` skill 给目标仓库写「issue 分类」一节时，「保留的 label」里也写上 `retro`（它的 reference 模板一并改）。

## 验收标准

- [x] 单测：一组假 issue（带 / 不带 `retro`、不同 `type:*`、不同号码），候选命令只列不带 `retro` 的；先看到它红再改绿
- [x] 单测：凑整合的命令在「idea-loop 有 7 个、excalidrawer 有 2 个，最早的是 idea-loop 的」时返回 idea-loop 最早的 5 个；在只有 excalidrawer 2 个时返回那 2 个；带 `status:*` 的 retro issue 不算；没有分类的 retro issue 单列
- [x] 单测：建 label 时含 `retro`，`retro` 不在多余 label 里
- [x] 本仓库 `AGENTS.md` 的「保留的 label」写上 `retro`；`setup` 的「issue 分类」模板写上 `retro`
- [x] 脚本已有的全部单测仍过

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs` 全部：候选、队列、建 label 都在这个文件里，这次改的就是它们的过滤条件
