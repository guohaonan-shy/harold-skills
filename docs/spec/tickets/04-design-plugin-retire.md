# 04 — design 独立 plugin 退役，内容并入 idea-loop

**Blocked by**：02 — 访谈到切票这一段接上闸门；03 — UI 实现环
**设计冻结**：不涉及 UI

## 要建什么

`design` 不再是一个独立可安装的 plugin。它的内容整体住进 `idea-loop`，marketplace 里的条目移除，`idea-loop` 不再声明对它的依赖，**不留别名、兼容层或过渡期双份安装**。

前两张已经把最后两处跨 plugin 调用点拆掉了（访谈侧改调 prototype、实现侧改调 UI 实现环），所以这一张是一次干净的搬家加删除：

- 设计侧的 references 整体进 `idea-loop` plugin 级 references 下的一个 design 子目录；
- 原来的静态 UI 与动效两个 skill **降级为其中按需加载的 protocol**，跟已有的 surface / module / component protocol 同一模式——它们的内容还在，但不再是入口；
- 写 DESIGN.md 的那份 skill 里，八节固定格式与「T1 要短」的规则作为 reference 保留在同一个子目录里，等发散那一段来取用（本张不写那个 skill）；
- lint hook、lint 脚本及其单测随迁，hook 的触发面不变（仍只对 preview 目录的写入触发）；
- 浏览器自动化的 MCP 声明随迁；
- 设计总入口、写 DESIGN.md 的 skill、port 校验的 skill 三者与 wireframe-candidates workflow 一并退役——它们的内容此前已被安置到别处（分别是发散那一段、上面那份 reference、上一张的实现标准与结构分歧审计纪律）。

搬完之后，全仓不应该还能搜到任何指向 design plugin 的调用或残留目录。

## 验收标准

- [x] marketplace 不再有 design 条目；`idea-loop` 的 plugin 声明里不再有对它的依赖；不存在别名、兼容层或双份安装
- [x] 设计侧 references 整体进 `idea-loop` plugin 级 references 的 design 子目录，内容无损
- [x] 静态 UI 与动效两份内容降级为按需加载的 protocol，与现有的 surface / module / component protocol 同一模式；它们不再作为 skill 出现
- [x] 八节 DESIGN.md 格式与「T1 五到八条」的规则作为 reference 保留在同一子目录，可被后续 skill 取用
- [x] lint hook、lint 脚本、lint 单测随迁；hook 仍只对 preview 目录的 HTML 写入触发，单测仍绿
- [x] 浏览器自动化的 MCP 声明随迁到 `idea-loop`
- [x] 设计总入口、写 DESIGN.md 的 skill、port 校验的 skill、wireframe-candidates workflow 全部退役，原 plugin 目录整体消失
- [x] 全仓搜索确认：没有任何跨 plugin 的设计调用、没有指向已退役 skill 的引用、没有残留目录
- [x] 迁移后的 references 内部互相引用的名字仍然指得到（搬家最容易断的就是这层）
- [x] 仓库根 CLAUDE.md 的 plugin 清单、`idea-loop` README 与 plugin 描述同步更新

## 选中的存量回归

本仓库**无 test-cases 库**。真实存在的套件三套：lint 规则单测、视觉比对函数单测、以及 lint hook 本身的实跑。

本张是全仓风险最高的一刀，三处都要验：

- **lint 单测**——脚本换了位置，导入关系最容易断。
- **lint hook 实跑**——hook 声明从一个 plugin 换到另一个，插件根路径的解析方式变了；要真的往一个 preview 目录写一次 HTML，确认它仍会报。
- **比对函数单测**——与 lint 脚本共用同一条运行命令，搬家后命令要仍能跑到全部。
