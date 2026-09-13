# 01 — prototype：一次性取证原型

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

`idea-loop` 多一个 skill：就一个**能用一句话说清**的问题，产出一个双击即开的一次性原型，和一份留在 raw 桶里的裁决记录。模型可以在 `grill` 会话内调它，人也可以直接调。

两个分支，按问题的性质选：

- **逻辑 / 状态模型** —— 用来回答"这个状态机该长什么样"这类文字定不了的问题。单文件 HTML，带标签的状态面板每次交互后重渲染，一排自由操作按钮，外加分 tab 的引导 walkthrough，标注一律用领域语言，好让非技术同事也能自己点出"这不该可能"。
- **UI 结构** —— 至少两个**结构上根本不同**的变体（不是配色微调），浮动工具栏加 URL 参数切换，真实数据密度，全程灰盒、不做视觉决定。

约束照搬：没有测试、没有抽象、没有持久化、一次坐下来做完。它是证据，不是代码。

跑过 prototype 的 feature，后续的设计发散从下一层高度开始，不重做结构——这条要在 skill 里写明，否则下游会把结构重开一遍。

## 验收标准

- [x] `idea-loop` 下有名为 `prototype` 的 skill，模型可调用（不设 `disable-model-invocation`），人也能直接调
- [x] 问题一句话显示在原型页面顶部；一次只回答一个问题
- [x] 逻辑 / 状态模型分支：带标签的状态面板每次交互后重渲染、自由操作按钮、分 tab 的引导 walkthrough、领域语言标注，底层纯逻辑与 DOM 分离
- [x] UI 结构分支：至少两个结构上根本不同的变体，浮动工具栏加 URL 参数切换，真实数据密度，灰盒，不做视觉决定
- [x] 结构变体做过分歧审计：塌缩成同一个的变体如实报告真实选项数，不凑数（纪律借自现有的 wireframe-candidates workflow，在它退役之前把这条搬过来）
- [x] 约束写进 SKILL.md：没有测试、没有抽象、没有持久化、一次坐下来做完
- [x] 产物落 raw 桶：HTML 进该桶的 assets 子目录，配一份 `source_type: prototype` 的 raw md，记问题一句话、变体清单、裁决和理由；这份 raw 由 prototype 自己写，不留给下游
- [x] SKILL.md 点明与 Claude Code 内置 `/design` 的关系：不作替代，理由是它不接问题只接 brief、没有状态与交互、输出带视觉而非灰盒、产物不可重跑；顺手用 Artifact 发布给人点是分发渠道，不是替代
- [x] SKILL.md 写明：跑过 prototype 的 feature，下游从下一层高度开始，不重做结构
- [x] frontmatter description 按仓库约定写成 pushy 形态，中英文触发词都列
- [x] `idea-loop` README 的 skill 表和「模型可调用」那栏加上它
- [x] SKILL.md 主体 < 5000 字

## 选中的存量回归

本仓库**无 test-cases 库**。真实存在的套件只有一套：design 插件里 lint 规则的 node 单测。本张不碰它，无需跑。

风险面在 skill 的 frontmatter 与现有 skill 冲突（触发词过宽会抢走 `grill` 的场景），开工时人工读一遍两份 description 即可。
