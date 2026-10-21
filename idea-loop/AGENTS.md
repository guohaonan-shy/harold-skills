# idea-loop 维护约定

## skill 分类

skill 放在 `skills/<分类>/<slug>/SKILL.md`，分类看这个 skill 产出什么：

- **engineering**：产出落在目标仓库的代码或 `docs/` 上——spec、工单、实现、review、知识库维护。
- **design**：产出是界面设计——调研页、原型、变种板、冻结画布。
- **productivity**：不绑定某个目标仓库，任何对话都能用——追问、写给 agent 的文档。

拿不准时问：换一个没有代码的项目，这个 skill 还用得上吗？用得上是 productivity；用得上但只在做界面时用是 design；其余是 engineering。

## 参考资料归谁

plugin 级不设 `references/`，每份参考资料归一个 skill：

- **只服务一个流程的内部细节**，放在那个 skill 自己的 `references/`，别处用路径指过去。
- **一种独立的能力、多处要用**（`tdd`、`glossary`、`wiki-conventions`、`evidence`），本身就是一个 skill，不设 `disable-model-invocation`，让别的 skill 和 agent 能取到。

## 登记

`plugin.json` 的 `skills` 按分类目录登记，新 skill 放进已有分类不用改它；新开一个分类要把目录加进去。现有清单以目录本身为准。
