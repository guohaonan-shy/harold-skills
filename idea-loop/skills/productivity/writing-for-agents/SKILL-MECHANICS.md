# Skill 机制

[`writing-for-agents`](SKILL.md) 里 skill 特有的那个分支：文档是 skill 时有什么不同（frontmatter、调用方式的选择、路由 skill）。除此之外怎么写，都是 `SKILL.md` 里的通用参考。

## 调用方式

两种选择，在两种负担之间做交换：

- **模型可调用**的 skill 保留 `description`，agent 能自己触发它，别的 skill 也能调到它。你仍然可以手动输入它的名字：模型可调用总是*包含*人的调用；description 只会多加一条 agent 发现它的途径，从不拿走人的那条。description 是这个 skill 顶层的上下文指针，被迫一直常驻：用永久的上下文负担换可发现性。一个内容全是参考的模型可调用 skill，也是共享参考的一个家：别的 skill 可以调用它，于是几个 skill 都需要的参考就住在一处。做法：不写 `disable-model-invocation`，写一条面向模型、带着触发分支的 description（`SKILL.md` 里写指针的规则全部适用）。
- **只能由人调用**的 skill 把 description 从 agent 那里拿走：只有人输入它的名字才能调用，别的 skill 都调不到。上下文负担为零，但它花的是认知负担：你就是那个必须记得它存在的索引。做法：设 `disable-model-invocation: true`；`description` 变成给人看的：一行摘要，去掉触发词列表。

只有当 agent 必须自己找到这个 skill、或别的 skill 必须调到它时，才选模型可调用。如果它只会被手动触发，就做成只能由人调用，不付上下文负担。

两个只能由人调用的 skill 都需要的共享参考，哪个都住不进去：没有 description，谁也触发不了谁。把它推到 skill 体系之外的普通文件里：任何 skill 都能指向的外部参考。

## 引用另一个 skill

- 要 agent 当场用上另一个 skill：写「用 Skill 工具调 `<插件>:<名字>`」，只要其中一节就加上节名（「看它的『目录』」）。不写文件路径：目录一挪路径就断，名字不变。
- 那个 skill 只能由人调用：Skill 工具调不到它，写「告诉人跑 `/<插件>:<名字>`」。
- 只是顺口提到：写名字就行。
- skill 读自己 `references/` 下的文件，照旧写相对路径。别的 skill 不读它的 `references/`，要用就调这个 skill，由它指过去。
- skill 起的 subagent 读这个 skill 的 `references/`：agent 定义里写插件根下的完整路径（如 `${CLAUDE_PLUGIN_ROOT}/…/references/<文件>`），因为 agent 的位置和 skill 目录不在一处，写相对路径找不到。这只开给起它的那个 skill 的参考：别的 agent 和别的 skill 照旧调这个 skill、给节名。
- subagent 的 `tools` 是白名单时，要用别的 skill 就把 `Skill` 加进去，不然调不到。

## 按调用方式拆

拆分的调用方式这一刀（顺序那一刀在 `SKILL.md`）：当你有一个应该独立触发它的、不同的引导词（一个你在提示里真的会用的触发词），或者别的 skill 必须调到它时，拆出一个模型可调用的 skill。新的常驻 description 要付上下文负担，所以那条独立的触达途径得值这个价。

## 路由 skill

只能由人调用的 skill 多到记不住时，堆起来的认知负担用一个**路由 skill** 来治：一个只能由人调用的 skill，点名其他几个、各自什么时候用，于是人只需要记住一个 skill，而不是很多个。它只能提示，不能触发它们：只能由人调用的 skill 没有 description，除了人谁也调不到。
