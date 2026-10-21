# idea-loop 维护约定

## skill 分类

skill 放在 `skills/<分类>/<slug>/SKILL.md`。三个分类：

- **engineering**：按生产工程的标准，从一个想法走到合并进主干的代码——spec、工单、实现、review，以及这一路沉淀下来的知识库。
- **design**：UI 与品牌内容的设计——调研别人怎么做、原型、发散出方向、打磨到冻结。
- **productivity**：日常工作的效率工具，不绑定某个产品或某段流程——追问想法、给 agent 写文档。

一个 skill 同时沾两类时，按它的产出归类：产出是代码或知识库里的工程文档，归 engineering；产出是界面或品牌素材，归 design；产出只服务于人自己的工作方式，归 productivity。

## 参考资料归谁

plugin 级不设 `references/`，每份参考资料归一个 skill：

- **只服务一个流程的内部细节**，放在那个 skill 自己的 `references/`，只有这个 skill 和它起的 agent 读。别的 skill 也要读，说明它不只服务一个流程：升成 skill，或挪进真正用它的那个 skill。
- **一种独立的能力、多处要用**（`tdd`、`glossary`、`wiki-conventions`、`evidence`、`decision-rules`、`spec-status`、`design-archive`），本身就是一个 skill，不设 `disable-model-invocation`，让别的 skill 和 agent 能取到。

## 登记

`plugin.json` 的 `skills` 按分类目录登记，新 skill 放进已有分类不用改它；新开一个分类要把目录加进去。现有清单以目录本身为准。
