# 01 — dyna pr body 改成五节并在写入时检查结构

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
写 PR 描述的会话跑 `dyna pr body set` 时，描述只认五节加 SEO 一节：`problem`（问题）、`outline`（概要）、`evidence`（证据）、`risk`（合并风险）、`your-todo`（要你做的事）、`live-check`（上线自查的网址），按这个顺序排。旧描述里的旧节（`summary` 一句话、`changes`、`verification`、`rollback`、`night-decided`、`night-waiting`、`reference`，以及已有的更老的旧节）下次写入时照现有「旧节折叠」的做法并入或丢弃，不报错（`rollback` 里「顺带开的 issue」清单不再保留：spec 定了顺带开的 issue 不进描述）。

写入时机械检查结构，不满足就退出码非 0、报错写清缺什么：
- 问题、证据两节至少一个视图（图片、代码块或表）；没有就拒写，并在输出里打印 evidence skill 的视图菜单（从插件里 evidence 的 SKILL.md 读出「视图菜单」那一段，不另存副本；读不到时报一句读不到，照样拒写）。
- 概要最多两个视图。
- 证据节「之前」「之后」成对出现；问题节有几件（编号或列表的件数），证据节就有几组，少的必须在证据节的「没验成」一行里提到。
- 合并风险有「门：双向 / 单向」「影响面」两行，「要特别注意的」列表不超过 3 条。
- 要你做的事只有复选框、代码块和末尾「说『合并』即可」。
- 代码叫法：问题、证据、合并风险、要你做的事四节拦提交号、函数名、文件路径、接口地址；放行 skill 名（`idea-loop:xxx`）、斜杠命令、dyna 命令名，以及要你做的事里的代码块。概要放行代码叫法。
- 不设字数线。

`dyna pr candidates submit`：每道要你决定的题，问题里至少一个视图、选项至少两个、有推荐，否则拒收并同样打印视图菜单。

dyna 版本升一档到 0.0.16（集成分支现在 0.0.15），重存命令登记表，插件的 dyna 版本下限提到 0.0.16。代码注释里指向 pr skill 的 `review-report.md`、`review-loop.md` 的，改指向 pr-review skill 下同名文件（工单 02 把它们挪过去）。

## 验收标准
- [ ] 单元测试：新节表顺序；旧节 `summary`/`changes`/`verification`/`rollback`/`night-decided`/`night-waiting`/`reference` 写入时被折叠或丢弃不报错。
- [ ] 单元测试：拿 harold-skills#458 风格的旧描述（有「一句话」「怎么修」、无之前/之后）写入新问题节无视图时被拒，输出里含视图菜单（先见红）。
- [ ] 单元测试：分支上 `idea-loop/evals/pr/rounds/*/description.md` 五份第四轮样本逐节写入全部通过（样本里不合规的地方先核：是样本错还是检查过严，过严就放宽检查，写进交回）；把 tofelair-1136 的「没验成」一行删掉再写证据节，组数对不上被拒。
- [ ] 单元测试：要你做的事里有安装命令代码块通过；同样的文件路径写进合并风险被拒。
- [ ] 单元测试：合并风险缺「门」行、或要特别注意的超过 3 条被拒；概要三个视图被拒。
- [ ] 单元测试：`candidates submit` 问题无视图 / 只一个选项 / 无推荐各被拒。
- [ ] dyna 版本 0.0.16，登记表已存，插件 dyna 版本下限 >=0.0.16，`scripts/dyna-version.test.mjs` 与 dyna 全量 `go test ./...` 绿。

## 选中的存量回归
- dyna 的 pr 包全部测试（body、candidates、cmd、differential）：节表和拒写逻辑都在这里。
- 仓库根 `node --test scripts/` 里守 dyna 版本与登记表的测试。
