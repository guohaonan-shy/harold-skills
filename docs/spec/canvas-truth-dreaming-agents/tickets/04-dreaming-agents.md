# 04 — dreaming 拆成编排者加三个专职 agent，加「漏归档」行

**Blocked by**：01 — 删合并前钩子，合并前归档从最终画布加实现整份写出档案差异
**设计冻结**：不涉及 UI

## 要建什么

人调 `/idea-loop:dreaming` 得到的东西不变：一张提议表，逐行批，批过的执行成一个只改文档的 PR。变的是表怎么来：

- dreaming 只做：起环境（从 `origin/<基准分支>` 切 worktree）、派工、汇提议表并过校验脚本、做审核页、等人批、执行段。提议段里每个 agent 只读，只写自己那段的中间物。三个 agent 互不依赖，同一条消息里并行起：
  - **UI 档案对账**：不新建，复用 ui-reviewer 的对账模式（sonnet · high）；`prod/` 为空时的全站初扫留在 dreaming 现有写法里。
  - **spec → ADR**（新 agent，sonnet · high）：原「知识库对账」：判 spec 上线没有、起草 ADR、标被取代的旧 ADR 小节、找出已合并却还留着的工单；次要检查 `docs/domain/`、参考手册、`GLOSSARY.md`、`REVIEW.md` 的过期。交回提议表「文档」一节的行。
  - **设计规范维护**（新 agent，opus · high）：候选蒸馏 + `DESIGN.md` 对账 + token，对 `DESIGN.md` 的一切修改出自它，量 token 的机械活可在内部再派 sonnet。交回「候选」「DESIGN.md 条目」两节的行。
- **漏归档**（dreaming 自己机械地查，不起 agent）：`origin/<基准分支>` 上 `docs/design/tmp/<spec-slug>/` 里还有设计产物（`research/` 之外），而这份 spec 已是「完成」或已经没有 spec 目录。提议表多一类行 `漏归档`，处置闭集「补归档 · 丢弃」：补归档是在 dreaming 的 worktree 里对它跑一次 ui-reviewer 归档模式、人看草稿、归档脚本并进 `prod/`，跟执行段其余改动同一个 PR；丢弃是删掉 `tmp/<spec-slug>/`。
- 扫描范围：`GLOSSARY.md` 与 `REVIEW.md` 纳入；`CLAUDE.md` 与 `AGENTS.md` 拿掉。
- 「只跑一部分」「单条蒸馏」照旧：只起对应的那个 agent；单条蒸馏交给设计规范维护 agent。执行段不拆，写 `DESIGN.md` 的措辞仍要人确认才落笔。
- 新 agent 的定义照 writing-for-agents（description 写职业身份与交付，不写谁起它），模型与思考强度钉在定义里。

依据与全貌：spec `docs/spec/canvas-truth-dreaming-agents/canvas-truth-dreaming-agents.md` 的「实现决策」6。

> 人的决定（2026-10-26）：review 第 2 轮 S2 选 A——spec 目录已删的漏归档需求，补归档时新页面入口没有来源，接受成已知限制。

## 验收标准
- [x] 新增两个 agent 定义：spec → ADR（sonnet · high）、设计规范维护（opus · high），各写明输入、只读、交回的行
- [x] dreaming 的 SKILL 写明只编排、三个 agent 并行起、漏归档由它自己查；扫描范围含 `GLOSSARY.md`、`REVIEW.md`，不含 `CLAUDE.md`、`AGENTS.md`
- [x] 提议表 reference 多一类行 `漏归档`，处置闭集「补归档 · 丢弃」，执行段写明两种处置怎么做
- [x] 提议表校验脚本认 `漏归档` 行：处置「补归档」通过；处置写成闭集外的（如「归档」）被拒并说出闭集——有单测，先红后绿
- [x] README 的 agent 清单与 dreaming 描述跟上
- [x] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过
- [x] review 第 1 轮 S3（2026-10-23）：设计档案对账的源码波（不开浏览器：对象的代码路径在不在、组件有没有被引用、路由里有没有档案没收录的页面、入口地址在不在路由里）也交给 ui-reviewer 的对账模式，dreaming 只汇它交回的「档案对象」行；全站初扫仍留在 dreaming。人的原话：「我倾向于选择B」

## 选中的存量回归
- `proposal-table-check.test.mjs`：现有行类型与闭集的断言，新加行类型不能破坏它们
- `no-project-leak.test.mjs`：新 agent 定义里不能写死某个目标项目
- `glossary-check.test.mjs`：`GLOSSARY.md` 纳入对账，确认术语表检查本身没被连带
