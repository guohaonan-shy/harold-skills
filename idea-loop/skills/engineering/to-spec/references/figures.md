# spec 里的图：画在哪一节、放在哪

spec 也给人读：人读不出一段文字描述的问题长什么样，也没法在脑子里把散在「实现决策」各小节的决策拼成一条链。图怎么做（UI 标注、UI flow、excalidrawer 图表）照 `idea-loop:evidence`；这里只写 spec 的哪一节要图、放在哪。下文「raw 目录」指这场讨论的 `docs/raw/<topic>/`，图放在它的 `assets/` 里；从 GitHub issue 起草、没有对话的 spec 没有 raw 目录，图放这份 spec 自己目录下的 `assets/`。

| spec 的哪里 | 要的图 | 谁做 |
|---|---|---|
| 问题陈述 | 复现证据，每个问题一张，图在文字之前 | `idea-loop:grill` 或 `idea-loop:issue-triager` 复现时截图，这里排版 |
| User Stories | 每个场景一棵 story 树 | 这里 |
| 方案 · 开头，以及后端 / 前端内部子小节 | 时序图 | 这里 |
| 方案 · 前端交互子小节 | UI flow | 冻结前写文字；冻结时 `/idea-loop:uiux-refine` 补图 |

**定稿后 `docs/` 里只留 PNG。** excalidrawer 的 `.excalidraw` 源文件和 sugar JSON 还在改的时候放在 worktree 的 `.tmp/to-spec/<spec-slug>/` 下（`idea-loop:wiki-conventions` 的「中间产物」）：在那里渲染，PNG 定了再复制进 `docs/`。定稿之后要改图，就重新画一张。

## 问题的复现证据

- 证据图从 raw 目录的 `assets/` 取（复现的那一方放在那里，文件名 `problem-<n>-<slug>.png`），这里只排版。
- 根因单独一节，放在全部证据之后，写法照 spec 模板的「根因」。

## User Stories 的树

- 按**场景**分组，每个场景一棵从左到右展开的树（场景 → 它的几条 story），用 `excalidrawer:tree`。
- **story 编号在每个场景内从 1 开始**，图和图下的文字一致。别处引用写「场景名 + 编号」（如「播放器 3」），不写全局编号。
- 放 raw 目录的 `assets/tree-user-stories-<n>-<场景 slug>.png`。

## 时序图

- **方案开头**：一张图让读者先看清前后端或模块之间谁和谁说话、按什么顺序；参与方按这份 spec 的实际取。后端、前端内部两个子小节是它的展开，涉及哪个就把那一段画细。
- **本 spec 新增或改动的消息用红色**，响应用虚线。后端图下几行列接口变化；前端内部图下写读路径、写路径各一句，以及每层的生命周期。
- 放 raw 目录的 `assets/sequence-<slug>.png`。

## 前端交互

设计冻结之前，「前端交互」先用文字列出交互变化（每个场景一行：触发 → 变化），小节开头标「待补图：`/idea-loop:uiux-refine` 冻结时按冻结画布补交互图，替换本节文字」。冻结时的 UI flow 放哪，见 uiux-refine 的冻结步骤。
