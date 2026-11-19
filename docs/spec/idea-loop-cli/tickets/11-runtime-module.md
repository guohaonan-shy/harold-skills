# 11 — runtime 模块：认环境、注入、按能力取做法

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

runtime-detect 收成 `dyna runtime name` 和 `runtime inject <decision-rules|runtime|reference>`（inject 只由 hook 调）。现在 runtime skill 的两份环境参考搬成插件里的命令数据（markdown，每种环境一份、每个能力一节，跟现在同形），browser skill 的三条规矩（给人看、无头、并行时）并进每份数据的「浏览器」一节。desktop-handoff 收成 `runtime handoff`（参数、环境变量、记录位置、成功一行 JSON、失败退出码 1 和 stderr「交出失败」都照旧脚本）。新增 `runtime show <能力>` 取当前环境那一节，不带能力打印能力清单和退路；`--help` 写怎么加一种运行环境。数据从小脚本传进来的插件目录读，改数据只升插件。这一刀不删 runtime、browser 两个 skill（在工单 18）。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [x] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [x] `IDEA_LOOP_RUNTIME=magi dyna runtime show 浏览器` 打印 magi 数据的浏览器一节，含原 browser skill 的三条规矩
- [x] `runtime inject runtime` 的输出与旧脚本注入的内容一致（数据搬家前后对同一环境）
- [x] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `runtime-detect.test.mjs`、`session-start-inject.test.mjs`：行为基准；`desktop-handoff.test.mjs`：handoff 的行为基准
- `runtime-tripwire.test.mjs`：守着 runtime 的引用，确认这一刀不弄坏它
