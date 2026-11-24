# 设计模块

答「接」之后做，人在场，在目标仓库的主 checkout 里。两步，都只补缺的：

1. **设计档案素材走 Git LFS**：`<项目目录>/.gitattributes` 让 `docs/design/prod/**/assets/` 下的 `*.png`、`*.gif`、`*.webm` 走 Git LFS。已有这几条就跳过；写了的跟「写」里的文件一起给人看差异，再 `dyna home commit`。
2. **Mobbin MCP**（可选，设计调研 `idea-loop:uiux-research` 用，要 Mobbin 付费计划）：只读，照『装与设置』里 Mobbin 一条（`dyna runtime show 装与设置`）查有没有连上；没连上的，把修法交给人，不替人登录。

完成条件：`.gitattributes` 里有这三条 LFS 规则，且已 `commit`；Mobbin 有结论（已连上 / 没连上，附修法）。

## 交回

- `.gitattributes` 改没改、提交号。
- Mobbin：已连上，或没连上和修法（留给人）。
- `DESIGN.md` 不在这里建：由 `/idea-loop:uiux-imagine` 或 `/idea-loop:dreaming` 建。
