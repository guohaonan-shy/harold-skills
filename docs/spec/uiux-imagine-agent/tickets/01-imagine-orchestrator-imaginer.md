# 01 — imagine 拆成编排者 + uiux-imaginer

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

人调 `uiux-imagine` 之后，调用它的会话只做编排：起静态服务、起 `idea-loop:uiux-imaginer`、每轮在内嵌浏览器里打开变种板、把人的意见分流后转回**同一个** uiux-imaginer。定高度、出变种、写变种板、截图、调研、生图、摆每轮的 frontier、收工写方向说明并跑校验，全部由 uiux-imaginer 做。人这边的体验不变：只跟会话说话、在内嵌浏览器里看变种板。

要点（决策全文在 spec §2、§4.2–§4.7）：

- 新增 plugin 自带的 agent `idea-loop:uiux-imaginer`，模型在定义里钉 `opus` · high（跟 designer 同一种写法，用别名）。它不跟人对话、不提交、不改 spec 状态、不在 imagine 之外被调用。
- imagine 的 SKILL.md 改成只写调用机制（照 refine 现在的 SKILL.md 的结构：什么时候跑、角色表、起步、每次交回怎么摆给人、意见分流表、生命周期与恢复、不做）；设计的活（高度、起点、三条纪律、调向环、frontier 三样、结束判据、七节、收工）搬进 agent 定义。
- 输入：spec 路径、`DESIGN.md` / `PRODUCT.md` 路径、人的原话（编排者不改写）；第一轮之后加上一轮选中的变种。
- 每轮交回：板地址与切换参数、每个变种一两句构成说明、本轮改动、要人判的取舍与推荐、参考图路径。交回原文同时追加进 imagine 工作目录下一份固定的每轮记录文件，作恢复点。
- 种子：第一批变种照旧每个种子独立派一个子代理（由 uiux-imaginer 派）；方向定下之后不再派。
- 调研：uiux-imaginer 自己起调研 agent，参考图落 imagine 工作目录下的 research 子目录，路径放进交回。
- 生图：项目有可用的生图 MCP 工具时 uiux-imaginer 自己调；只有走 `codex exec` 的交回编排者生成后放进约定目录。
- 静态服务归编排者，活到 imagine 收工；每次打开变种板前先探端口，不通就重起。uiux-imaginer 自己起的服务自己停。
- 意见分流：「改这个变种 / 再推一格」转给 uiux-imaginer；「这个问题本身要重新想」不转，先问人是否回 spec / grill；拿不准问人。
- 恢复：会话压缩或重开后再调 imagine，新起的 uiux-imaginer 读每轮记录和变种板接着做，不从第一轮重来。

## 验收标准

- [ ] 跑两轮 imagine：会话自己的工具调用里没有写变种板、截图、Refero 调用，只有起服务、起 uiux-imaginer、打开变种板、转意见（看会话记录）。 ⏭ 延后 → 05：要跑真会话才看得到，05 的 imagine 那一格有「会话只编排」断言，且 05 在本 spec 里排在后面
- [ ] 第一轮后说「往 B 那边再推一格」：转给的是同一个 uiux-imaginer（SendMessage 接着它的上下文），新板在 B 的基础上改。 ⏭ 延后 → PR 交付验收：编排者的分流只能在真会话里由人看（05 的 eval 不覆盖编排者的转发），SKILL.md §4 已写明用 SendMessage 接着转、不重起
- [ ] 说一句「这块要不要存在都得重想」：编排者不转给 uiux-imaginer，先问人是否回 spec / grill。 ⏭ 延后 → PR 交付验收：同上，SKILL.md §4 分流表第三行与判据已写
- [ ] 每轮交回原文都追加进了每轮记录文件；第二轮后重开会话再调 imagine，新 uiux-imaginer 接着做第三轮。 ⏭ 延后 → 05：05 的 imagine 格断言每轮记录落盘，uiux-imaginer 直跑格断言从记录接着做第三轮
- [ ] 收工：方向说明过方向说明校验脚本、交回编排者核对后 uiux-imaginer 才结束。 ⏭ 延后 → 05：uiux-imaginer 直跑格断言收工时方向说明过校验；定义里的收工顺序（agent 定义 §10、SKILL.md §5）已写
- [x] agent 定义的 frontmatter 钉了模型与思考强度；imagine 的 SKILL.md 里不再有写给执行者的设计步骤。
- [x] plugin 脚本单测套件全绿。

## 选中的存量回归

无 test-cases 库。本仓库真实存在的是：

- **plugin 脚本单测套件**（idea-loop 各脚本旁的 `*.test.mjs`）——方向说明校验脚本是 imagine 收工的闸门，搬家不能让它的调用方式变。
- **baseline eval 的 imagine 那一格**——它的断言（方向说明过校验、不碰 spec、不翻状态、只交出方向说明、语言高度不开）在拆分后必须照旧成立；用 `--grade-only` 对一次跑完的产物重判即可，整跑交给人晚上跑。
