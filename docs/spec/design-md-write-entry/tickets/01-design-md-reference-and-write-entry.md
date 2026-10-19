# 01 — DESIGN.md 写入标准成 reference，写入口收拢到 uiux-imagine 与 dreaming

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里，判断「什么能进项目的 `DESIGN.md`、怎么写、一次写入怎么走」只有一份 plugin 级 reference 可读；能写 `DESIGN.md` 的只剩 `uiux-imagine`（项目开工时还没有 `DESIGN.md`）和 `dreaming` 两处，其余所有原来写它或调 `design-modeling` 的地方都改成写一条「设计法候选」。`design-modeling` 这个 skill 不再存在。

依据全在 spec [[design-md-write-entry]]：

- reference 的每一节写什么、`design-modeling` 原有内容怎么处置：spec §4.1 的表。正文照 [[2026-10-19-design-md-standard]]（Harold 已认可的定稿标准）写，压缩但保留每条判别句和好例 / 坏例；`design-modeling` 原 SKILL.md 里的准入分层表、写入流程、新建、蒸馏、对账按表里「来源」一列改写后并入。格式仍只认官方 `@google/design.md` spec、运行时现读，reference 不复述它。
- reference 里写清「单条蒸馏」的步骤（人手动调一次 `dreaming` 只处理一条口述规则：读 reference → 起草 → 人确认 → 落笔 → lint），`dreaming` 的 SKILL.md 本工单**不改**（spec §4.6、§4.9）。
- 设计法候选的形态：spec §4.5（一句话规则 / 并进哪章 / 为什么 / 证据；没有写「无」；没有三段式和去向行）。候选暂时仍写在冻结记录的「设计法候选」一节。
- `uiux-imagine`：spec §4.3——开工时没有 `DESIGN.md` 就由它读 reference、自己起草第一份、等人确认措辞后落笔（有线上 UI 照「新建」第一种来源去量，没有就接选定的语言）；已有 `DESIGN.md` 时「重探语言」只产出候选。它的工具权限要能写 `DESIGN.md`。
- designer 与设计 protocol：spec §4.4——动效段签字后的新模式、收尾 Distill-back 都只写候选，不写 `DESIGN.md`；「T2 判例」改叫「T2 默认做法」；动效 reference 里的「先例库白名单」改为读项目 `DESIGN.md` 的 Motion 章，没有时用插件内置的默认白名单；「建议经 `design-modeling` 建一份」换成「建议跑 `uiux-imagine`（没有线上 UI）或 `dreaming`（有线上 UI）」。
- 实现标准里「交给 `design-modeling` 由人判断」改成「停下交人判断，要进的写成候选」。
- `DESIGN.md` lint hook 的行为不变，只改注释里对 `design-modeling` 的引用；绊线测试（不出现项目名那条）的注释同理。
- 删掉 `design-modeling` 的 skill 目录；它旧的设计稿留作历史。README 与仓库 `CLAUDE.md`：spec §4.7（skill 数 11 → 10，删 skill 表那行和「模型可调」里的它与那段理由，目录树、「搬过来的东西」表里 DESIGN.md spec 的去处改指 reference，旧设计稿标「已被取代，保留作历史」）。不升插件版本号。
- 新增一条绊线测试：插件的 skill、agent、reference、hook、脚本里不再出现 `design-modeling`（插件 `docs/` 下的历史设计稿与 `evals/` 不扫），照现有「不出现项目名」那条绊线测试的写法。

不碰：`dreaming` 的 SKILL.md、档案与 dreaming 那两份 spec 的目录、eval case 里那份最小 `DESIGN.md`、Toeflair 仓库。reference 不点名任何具体项目（现有绊线测试会扫）。

## 验收标准

- [ ] plugin 级 reference 存在，spec §4.1 表里每一行在它里面都有对应一节；定稿标准的 11 章（8 节 + 3 个扩展章）每章都有「定义 / 写什么 / 不写什么」；「明确不进的内容」、维护原则（整改优先于追加）、front matter 强制规则（影响渲染的属性必须进 token）、候选形态、单条蒸馏步骤、「谁写谁读」都在。
- [ ] `design-modeling` 的 skill 目录已删；新绊线测试绿，且在任一 skill 里临时加一行 `design-modeling` 时变红（贴出红的那次输出）。
- [ ] 插件的 skill、agent、reference 里搜「写 / 改 / 追加 / 落笔 `DESIGN.md`」的指令，只出现在 `uiux-imagine`（没有 `DESIGN.md` 时）和 reference 的「谁写」一节（指向 `dreaming`）；designer、静态 / 动效 / 组件 protocol、实现标准都指向候选。列出搜索命令和结果。
- [ ] 插件里不再有「带日期进动效先例库」「追加带日期的 T2 判例」「`## Case Law` 追加判例」这类指令（eval 的存档与插件 `docs/` 的历史设计稿除外）。列出搜索结果。
- [ ] `uiux-imagine` 的工具权限允许写 `DESIGN.md`，且仍是 `disable-model-invocation`。
- [ ] README 与仓库 `CLAUDE.md` 里 idea-loop 的 skill 数是 10，没有把 `design-modeling` 写成现存 skill 的地方；插件版本号没变。
- [ ] 每个改过的 SKILL.md 主体仍在 5000 字以内。
- [ ] 插件的全量 `node --test` 套件全绿。

## 选中的存量回归

无 test-cases 库。这个仓库真实存在的套件是 idea-loop 脚本旁的 `node --test` 单测，跟这一刀有关的：

- 「不出现项目名」绊线测试——新 reference 和改写的 protocol 最容易把起源项目的名字、色值带进来。
- `DESIGN.md` lint hook 的单测——只改注释，行为必须不变。
- 方向说明校验脚本的单测——`uiux-imagine` 的收工步骤在同一个文件里被改到，确认没碰坏它引用的校验命令。
