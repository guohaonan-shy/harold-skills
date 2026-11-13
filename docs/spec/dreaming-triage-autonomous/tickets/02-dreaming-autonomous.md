# 02 — dreaming 只问人两类，其余自己执行并合并

**Blocked by**：01 — 提议表校验脚本能拆出问人的那几行
**设计冻结**：不涉及 UI

## 要建什么

改 idea-loop 里 dreaming 这条流程的文字（skill、它的 references、相关的约定 skill、setup 里交代每周对账的那份、仓库根和插件的说明），让下一次每周 dreaming 跑完是这样：

- 提议段照旧汇成完整提议表、过校验；然后用 01 的拆表拿到问人小表。完整表不摆给人，它是执行段的输入和 PR 描述的来源。
- **问人的**只有：`候选`、`DESIGN.md 条目`，`文档` 里的「报警」「问人」，`文档` 里对象是 `GLOSSARY.md` 的行。判据以 01 的脚本为准，文字里只指向它、不再抄一份规则。
- **其余行不问人、不出现在汇报里**，按各自的建议处置直接执行（「批了」就是按建议处置执行，下游 reference 里「只执行批了的行」据此成立）：文档的写 ADR 删 spec、订正、标注被取代、删漏网工单、迁移布局、删除；档案对象、档案状态、初扫页面、漏归档；`缺陷` 开成 backlog issue（「已有 #N」不开）；`retro 候选` 按建议处置执行（开 issue 的开成 backlog issue、驳回的改状态、留在池里不动）。
- 自动那份开一个只改知识库的 PR。dreaming 本地跑目标仓库 `REVIEW.md` 的验证命令、spec 的结构检查、link sweep、有设计档案时档案校验；仓库有 CI 的再等 CI 全绿；全过就按 `DEVELOPMENT.md` 的合并方式自己合并；有一条没过就不合并，PR 留着。
- 问人小表有行才用『推送』通知人，摆法照现在（会话里按节摆，`候选` / `DESIGN.md 条目` 有行时另做审核页）。人不回不挡任何东西；人回了只执行批了的那几行，另开一个知识库 PR，按同样规则合并。
- 推送只在三种情况：有问人的行、PR 没合成、哪一部分没跑成。都没有不推送，「这次无事」也不发。
- 人说「回滚某次 dreaming」：开那个 PR 的 revert PR，同样规则合并。
- 这次的中间物目录在问人的行处理完（或没有问人的行）、且自动那份已合并之后才删。

要改到的地方：dreaming 的 description（删「人批过才执行」）与「流程」「执行段」「写 DESIGN.md 和开 issue 都停在人身上」；提议表 reference 的「放哪、谁看」「执行段」，加一张问人 / 自动的分类说明（指向脚本）；retro 候选、候选蒸馏、全站初扫、档案对账、漏归档几份 reference 里「人批了才…」的句子（`候选` 的两种 issue 仍是人批了才开，`缺陷` 不再是）；wiki-conventions 的「人机分工」（改成按风险分：问人的由人批，其余机械执行，点名 dreaming 只问哪两类）和「`design/prod/` 只走归档脚本（人批过之后）」那句（补 dreaming 对账的例外）；设计档案 skill 与归档脚本说明里同样的「人批过之后」（补同一例外）；setup 的每周对账那份里「提议表在那个会话里等人逐行批」；仓库根 `AGENTS.md` 第 1 条里 dreaming「出口仍停在人身上」和 seo-scan「仍由人分拣」两句；插件 README 里 dreaming 与 issue-triage 两行的描述。几处要一并改到的细节：漏归档的「补归档」原先要人看 UI 审查者的归档草稿、人通过才跑归档脚本，改成草稿过档案校验就归档，不等人；全站初扫「人按页面批」改成整页按建议执行；retro 候选里「只执行人批了的行」改成执行建议处置，「驳回」照现有规则只在候选文件里人说过驳回时才建议，理由取那句话。改这些给 agent 读的文档前用 Skill 工具调 `idea-loop:writing-for-agents`。

不改：`decision-rules` 的护栏；`docs/adr/` 下的 ADR。

## 验收标准

- [ ] dreaming 的 skill 和 references 里，没有一处还要求自动类的行等人批（逐处读改后的文字核对；`grep` 「人批」「逐行批」剩下的每一处都只关于问人那两类、或与 dreaming 无关）
- [ ] skill 主体 < 5000 字（`awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m`），description 只做路由
- [ ] 问人 / 自动的判据在文字里只指向 01 的脚本，没有第二份规则清单与脚本对不上
- [ ] 自己合并的检查清单写的是「目标仓库 `REVIEW.md` 的验证命令」等通用说法，不出现任何项目的命令或名字；全量测试 `node --test '*/scripts/*.test.mjs'` 通过
- [ ] 推送三种情况、回滚、中间物目录何时删，都在文字里写明
- [ ] 根 `AGENTS.md` 与插件 README 的描述跟新流程一致（README 也写了 issue-triage 不再等人批）

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：改了大量插件文字，最容易带进项目名
- `idea-loop/scripts/proposal-table-check.test.mjs`：提议表 reference 的样例表被这里的用例读，改 reference 时样例不能坏
