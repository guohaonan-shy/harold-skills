# idea-loop 维护约定

## skill 分类

skill 放在 `skills/<分类>/<slug>/SKILL.md`。四个分类：

- **engineering**：按生产工程的标准，从一个想法走到合并进主干的代码：spec、工单、实现、review。
- **design**：UI 与品牌内容的设计：调研别人怎么做、发散出方向、打磨到冻结，以及设计档案和 `DESIGN.md`。
- **productivity**：不绑定某一段流程的能力和效率工具：追问想法、给 agent 写文档、知识库的约定与维护、决策规则、交付证据。
- **seo**：SEO 的发现、入队和解决用的领域能力：从 OpenSEO 取数据找问题、把问题提成 issue、写内容与外联草稿、发布前检查。产出是 issue、站点内容或检查结果；issue 之后照 engineering 的流程走。外部来源的出处写在 `skills/seo/README.md`。

一个 skill 同时沾两类时，按它服务谁归类：只服务 SEO 的，归 seo；只服务从想法到代码那一条流程的，归 engineering；产出是界面、品牌素材或设计档案的，归 design；几条流程都要用、或只服务人自己的工作方式的，归 productivity。

## 参考资料归谁

plugin 级不设 `references/`，每份参考资料归一个 skill：

- **只服务一个流程的内部细节**，放在那个 skill 自己的 `references/`，只有这个 skill 和它起的 agent 读。别的 skill 也要读，说明它不只服务一个流程：升成 skill，或挪进真正用它的那个 skill。
- **一种独立的能力、多处要用**（`tdd`、`glossary`、`wiki-conventions`、`evidence`、`decision-rules`、`issues`、`design-archive`、`design-modeling`、`design-change-sync`、`browser`、`ui-measure`、`pr`），本身就是一个 skill，不设 `disable-model-invocation`，让别的 skill 和 agent 能取到。

## 登记

`plugin.json` 的 `skills` 按分类目录登记，新 skill 放进已有分类不用改它；新开一个分类要把目录加进去。现有清单以目录本身为准。

## 插件自带的 MCP

插件 `.mcp.json` 里的服务以插件那份为准。写或改用这些服务的 skill、agent 时：

- **白名单只写插件名**：agent 的 `tools`、skill 的 `allowed-tools` 写 `mcp__plugin_idea-loop_<服务>__*`；`scripts/plugin-mcp-names-doc.test.mjs` 守着这一条。
- **开场确认它以插件名加载**：Claude Code 对同一个服务只连一份，项目、用户或本地配置里配了同一个服务（远程比 URL，本地比命令），插件那份就被顶替，工具换成别处起的名字。流程开场看工具清单里有没有插件名那一组；没有就停下，交回时说清删哪份配置：用户级或本地配置 `claude mcp remove <名字>`（`-s <范围>`），项目配置删项目 `.mcp.json` 里那一项。
- **照现成的做**：Mobbin。`uiux-researcher` 的第 0 步「先认 Mobbin 连着没有」是开场确认，`idea-loop:runtime` 的 claude-desktop 参考「装与设置」里 Mobbin 那条写了被同地址配置顶替时删哪份。
- **例外 `design-archive`**：不做开场确认。它的七个查询入口命令行也有，输出同一份 JSON（`design-archive` skill 的 `references/query.md`），工具不在就改用命令行。
