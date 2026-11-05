# idea-loop 维护约定

这份约定也管从 idea-loop 拆出去的 `design/`、`seo/` 两个插件（它们没有自己的 AGENTS.md）。

## 三个插件

- **idea-loop**（必装）：从一个想法走到合并进主干的代码，和几条流程都要用的共用能力。
- **design**（可选，依赖 idea-loop）：UI 与品牌内容的设计：调研别人怎么做、发散出方向、打磨到冻结、逐格量实现，以及设计档案和 `DESIGN.md`。
- **seo**（可选，依赖 idea-loop）：SEO 的发现、入队和解决：从 OpenSEO 取数据找问题、把问题提成 issue、写内容与外联草稿、发布前检查。issue 之后照 idea-loop 的流程走。外部来源的出处写在 `seo/README.md`。

一个 skill 归哪个插件，按它服务谁：只服务 SEO 的归 seo；产出是界面、品牌素材、设计档案，或要对着冻结画布量的，归 design；其余归 idea-loop。

插件之间只按名字调（`design:<名>`）。idea-loop 调 design 的每一处都写明 design 没装时怎么跳过；seo、design 依赖 idea-loop，调它不用判断。要读另一个插件里的文件，由调用方把绝对路径放进指针，不写 `${CLAUDE_PLUGIN_ROOT}` 拼别的插件的路径（它只指自己的插件）。

## idea-loop 的 skill 分类

skill 放在 `skills/<分类>/<slug>/SKILL.md`。两个分类：

- **engineering**：按生产工程的标准，从一个想法走到合并进主干的代码：spec、工单、实现、review。
- **productivity**：不绑定某一段流程的能力和效率工具：追问想法、给 agent 写文档、知识库的约定与维护、决策规则、交付证据。

只服务从想法到代码那一条流程的，归 engineering；几条流程都要用、或只服务人自己的工作方式的，归 productivity。design、seo 只有一类，skill 直接放 `skills/<slug>/`。

## 参考资料归谁

plugin 级不设 `references/`，每份参考资料归一个 skill：

- **只服务一个流程的内部细节**，放在那个 skill 自己的 `references/`，只有这个 skill 和它起的 agent 读。别的 skill 也要读，说明它不只服务一个流程：升成 skill，或挪进真正用它的那个 skill。
- **一种独立的能力、多处要用**（idea-loop 的 `tdd`、`glossary`、`wiki-conventions`、`evidence`、`decision-rules`、`spec-status`、`browser`、`pr`；design 的 `design-archive`、`design-modeling`、`design-change-sync`、`ui-measure`），本身就是一个 skill，不设 `disable-model-invocation`，让别的 skill 和 agent 能取到。

## 登记

idea-loop 的 `plugin.json` 的 `skills` 按分类目录登记，新 skill 放进已有分类不用改它；新开一个分类要把目录加进去。design、seo 登记 `./skills/`。现有清单以目录本身为准。
