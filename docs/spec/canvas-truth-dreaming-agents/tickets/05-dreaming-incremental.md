# 05 — dreaming 定时跑，截图对账只对上次以来改过的页面

**Blocked by**：04 — dreaming 拆成编排者加三个专职 agent，加「漏归档」行
**设计冻结**：不涉及 UI

## 要建什么

装了 idea-loop 的项目，dreaming 每周由 Claude 桌面 app 的定时任务自己跑一次，截图对账（ui-reviewer 对账模式的实时波）只对上次以来代码改过的页面和状态做：

- **建定时任务**：`/idea-loop:setup` 多一步，照 seo-setup 建 seo-scan 定时任务的写法：先查桌面 app 里有没有 dreaming 的定时任务；没有就问人要不要装、什么时间，人同意了建一个每周任务，prompt 是 `/idea-loop:dreaming`（cron 分钟避开 0 和 30）；不在桌面 app 里就把 prompt 交给人自建；告诉人 app 关着时到点不跑、下次打开补跑。dreaming 仍是 `disable-model-invocation`。
- **基准点**：dreaming 开跑时取它的定时任务最近一次状态为 succeeded 的执行，用开始时间找 `origin/<基准分支>` 在那一刻的提交。没有定时任务、没有成功的执行：全量。人手敲的那次用同一个基准，不推进基准。
- **挑状态**：档案查询新增一种问法：给一个提交，交回从它到现在受影响的状态清单——改过的文件是某页面登记的代码，这页的状态都算；是某组件登记的代码，用到它的状态都算；被这些页面或组件的代码直接 import 的数据、静态资源、样式改了，也算它们改了。dreaming 只把这些状态交给 ui-reviewer 对账模式的实时波。源码波每次全量。
- **全量**：人调用时明确说「全量」，或没有基准点。提议表开头一行写这次全量还是增量、为什么、对了几个状态。
- **没跑成的批**写在提议表末尾（已有的写法），附一句「下次可说全量补上」。
- **上一张提议表还没批又到点**：照跑，新提议表开头写一行「上一次（日期）的提议表还没处理」，两张表不合并。
- README 里 setup 与 dreaming 的描述跟上。

依据与全貌：spec `docs/spec/canvas-truth-dreaming-agents/canvas-truth-dreaming-agents.md` 的「实现决策」7。

> 人的决定（2026-10-26）：区域组件按 A，别名 import 接受成已知限制，起第 2 轮。

## 验收标准
- [x] setup 写明建 dreaming 每周定时任务的步骤（查有没有、问人、建、不在桌面 app 时交 prompt、app 关着补跑），跟 seo-setup 的写法一致
- [x] 档案查询多一种问法「给一个提交，交回受影响的状态」，三条规则（页面代码、组件代码反查、直接 import）各有单测，先红后绿；命令行与 MCP 两个入口都能用（若 MCP 包装其余问法）
- [x] dreaming 写明基准点怎么从定时任务执行历史取、没有就全量、手敲不推进；只把挑中的状态交给实时波，源码波全量；人说「全量」就全量
- [x] 提议表 reference 写明开头一行（全量还是增量、为什么、几个状态）与「上一张还没处理」的提醒；末尾没跑成的批带「下次可说全量」
- [x] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过

## 选中的存量回归
- `design-archive-query.test.mjs`：新问法加在查询模块里，现有六种问法不能被带坏
- `design-archive-mcp.test.mjs`：MCP 包装要跟查询模块的问法对齐
- `proposal-table-check.test.mjs`：提议表开头多一行说明，校验脚本不能拒收
