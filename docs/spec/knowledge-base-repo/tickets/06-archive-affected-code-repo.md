# 06 — 设计档案「按提交挑状态」读代码仓库的改动

**Blocked by**：无——可立即开工（01、02、03 已落地）
**设计冻结**：不涉及 UI

## 要建什么

设计档案里的页面和组件登记了代码路径（`code` 字段，相对代码仓库根）。「自某个提交以来改过的代码牵到哪些状态」（`design-archive-query.mjs <根> affected <提交>`，MCP 里叫 `design_affected`；dreaming 增量对账靠它挑状态）现在在档案根所在的 git 里跑 `git diff`，也从档案根读代码文件找它直接 import 的东西。档案搬进知识库后，档案根是知识库，代码不在那里：diff 永远是空的、import 也读不到，dreaming 的增量范围会悄悄变成零。

改成：改动和代码文件从**代码仓库**取，档案从知识库取。

- 命令行加 `--code <代码仓库根>`：给了就在它里面 `git diff`、读代码文件；不给时，档案根就是一个有 `docs/` 的普通仓库（老布局、测试夹具）的照旧用档案根；档案根是知识库（根有 `idea-loop.json`）而没给 `--code` 的，报错说要给 `--code`。
- MCP 的 `design_affected`：代码仓库根取会话目录的 git 根（MCP 启动在哪个 checkout，就比对哪个仓库）；会话目录本身就是知识库时报错说「按提交挑状态要在代码仓库里问」。
- dreaming 的增量对账参考（`incremental-scope.md`）里那条命令补上 `--code <代码 worktree 根>`；`<基准提交>` 是代码仓库的提交。
- 多仓库业务里一个 `code` 路径属于哪个仓库不在本工单：只比对给定的那一个代码仓库，写进参考文字作已知限制。

spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md`「同一行为的其他入口」里「设计档案的 MCP 与查询……」一行。

## 验收标准
- [ ] 单元测试：知识库（带 `idea-loop.json` 与 `docs/design/prod/`，页面登记 `code: src/pages/a.tsx`）+ 代码仓库（有 `src/pages/a.tsx`，两个提交间改了它）。`affected <第一个提交> --code <代码仓库>` 交回那个页面的全部状态；import 的一跳也从代码仓库读
- [ ] 单元测试：档案根是知识库、没给 `--code`，退出码非 0，报错说要给 `--code`
- [ ] 单元测试：老布局夹具（仓库根有 `docs/`）不给 `--code`，结果跟改动前一样（现有 `affected` 测试不改断言仍绿）
- [ ] MCP 测试：在配进业务的代码仓库 worktree 里启动，`design_affected` 交回代码改动牵到的状态；在知识库里启动，返回说明要在代码仓库里问的错误
- [ ] 文档：`incremental-scope.md` 的命令带 `--code`，并写了多仓库的已知限制
- [ ] 全量 `node --test '*/scripts/*.test.mjs'` 全绿

## 选中的存量回归
- `design-archive-query.test.mjs`：`affected` 的现有用例
- `design-archive-mcp.test.mjs`：`design_affected` 与 02 改过的 `repoRoot`
- `dreaming-incremental-doc.test.mjs`：守 `incremental-scope.md` 的说法
