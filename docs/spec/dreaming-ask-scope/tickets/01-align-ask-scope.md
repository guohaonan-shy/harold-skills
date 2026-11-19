# 01 — dreaming 问人范围的两处说法跟脚本判定对齐

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

读 dreaming 说明的人或 agent，看到「哪些行要等人批」的说法，跟提议表校验脚本拆问人小表时的实际判定一致。

现状：脚本把五类行拆给人——所有「候选」行、所有「DESIGN.md 条目」行、处置是「删除」的「暂缓设计」行、处置是「报警」或「问人」的「文档」行（文档里的冲突）、对象是 GLOSSARY.md 的「文档」行。但：

- 每周对账的设置说明（setup skill 的每周 dreaming 参考文件）开头写「只有 DESIGN.md 和文档里的冲突两类才摆在会话里等人批」，漏了三类。
- dreaming skill 主文件开头的概述列举（`DESIGN.md`、文档里的冲突、要删的暂缓设计）漏了 GLOSSARY.md 和候选行。
- dreaming 的文档 tripwire 测试用断言钉着这两处的旧原文。

改法（spec 已定）：dreaming 主文件开头的列举补全成五类，用跟插件 README、仓库根 AGENTS.md 一样的说法和顺序（`DESIGN.md`、文档里的冲突、`GLOSSARY.md`、要删的暂缓设计，另加所有 `候选` 行）；每周对账的说明不再自带列举，改成指向 `idea-loop:dreaming` 开头那一处。README、根 AGENTS.md、ADR 不改。插件版本升 patch。

## 验收标准

- [x] tripwire 测试先改成新说法并见红：dreaming 主文件开头的列举含五类（`DESIGN.md`、文档里的冲突、`GLOSSARY.md`、要删的暂缓设计、`候选`）；每周对账说明不含「两类」、指向 `idea-loop:dreaming`
- [x] 改文字后该测试与全量测试变绿
- [x] 每周对账说明里不再有问人范围的列举
- [x] 插件 README 若描述这两处文件的内容需同步，已同步；插件 `plugin.json` 版本按 patch 升
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。
- [x] review 第 1 轮 S1（2026-11-20）：守 dreaming 开头列举的测试从提议表校验脚本的拆表判定推出问人的类别再去对列举，不把五个词写死；把脚本改成多拆一类（例如所有档案对象行也问人）而列举不变时，这条测试必须变红
- [x] review 第 1 轮 S2（2026-11-20）：dreaming 提议表参考里「问人的行和自动的行」一节那句只列三类的「大意」，改成指向 `idea-loop:dreaming` 开头的列举，不再自带列举；测试守住这一节不再出现只列几类的大意

## 选中的存量回归

- `dreaming-autonomous-doc.test.mjs`：直接断言这两处原文，改文字最先碰它。
- `plugin-version.test.mjs`：改了插件目录就必须升版本。
- `no-project-leak.test.mjs`：插件文字里不能出现项目信息。
