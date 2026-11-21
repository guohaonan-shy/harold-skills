# 01 — DESIGN.md 能登记共用实现并被实现、对账用上；章节表补 Voice 章

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里管 DESIGN.md 的规则（design-modeling 这个 skill 和它的参考文件，加上插件给人读的 design-modeling 文档）改完后，三类读者各自看到变化：

1. **写 DESIGN.md 的 agent**：Components 章多一种条目「共用实现」。一类界面（组件，或被一组页面共用的整页视图，如整页失败、404、空状态）必须用的那个实现，用官方规范的 `@<路径>` 外部引用指向它，条目写五项：`@` 指针、用在哪、可变的部分、不许自画的部分、拦住违规的项目测试（豁免清单在测试旁，只减不增）。条目不重抄外观配方；被一组页面共用的整页视图以这种条目进 Components（普通页面级结构如首页 hero 仍不进）。条目不进 front matter。路径按官方规定从 DESIGN.md 所在目录解析，不以 `/` 开头、不出目录。检查由项目自己写，满足「名单外自己画就红；先在违规还在的提交上见它红」，插件不提供扫描脚本。例子用通用名字（如「整页加载失败视图」），不出现任何真实项目名。
2. **章节表**：与官方规范顺序一致：Overview、Colors、Typography、Layout、Elevation & Depth、Shapes、Motion、Voice & Content Strategy、Components、Do's and Don'ts，后接扩展的 Responsive Behavior、Known Gaps。Motion 去掉「扩展」标记，章名沿用「Motion」。新增 Voice & Content Strategy 章的写法：语气、大小写、按钮文案、空 / 加载 / 错误状态文案（含错误是否给出下一步）、数字日期单位；术语一条写「项目有 `GLOSSARY.md` 的以它为准、不重抄词表」，没有的才在本章写。新建 DESIGN.md 的参考照新顺序与 Voice 章写，但新建时不主动登记共用实现条目（要人判「必须统一」且要有项目测试，之后走候选）。蒸馏的参考：候选里写「共用实现」的照条目形状落笔；还没有检查的照写条目，并在缺陷节起草「共用实现缺检查」的项目 issue。
3. **实现 UI 工单的执行方**：UI 工单参考里有一节「建一块 UI 前查 DESIGN.md 的共用实现条目，命中就用指定实现；要的变化超出条目『可变』就停下，交人判（加进『可变』还是另起）」。
4. **对账（design-modeling 的对账参考，和 dreaming 里 DESIGN.md 对账的那份参考）**：新增一类发现「共用实现」，三种处置：`@` 指针指向的文件不在了 → 提议表「DESIGN.md 条目」一行交人裁决（改指针 / 删条目）；检查不在项目测试里或从没有过 → 缺陷节起草项目 issue「共用实现缺检查」；豁免清单条数每次报当前数并与上次对账（上一次 dreaming 的提议表）比，变多 → 缺陷节起草项目 issue，变少或持平只报不提。写明官方 lint（`@google/design.md` 0.4.0）现在不报缺失的 `@` 目标，所以对账自己核文件在不在；带 `broken-ref` 的版本发布后改照「官方 lint 的 warning」处理。

插件 `plugin.json` 的 `version` 按仓库 `REVIEW.md`「额外要求」升档：插件还在 0.x，新增能力、老用法照样能用，算 **patch**；从主分支当下的版本往上升。README 若列到章节或这些能力，同步。

## 验收标准

- [x] 新增文档检查 `design-shared-implementations-doc.test.mjs`（照已有的 design-modeling 精简文档检查的写法），先在改前的主分支版本上跑见红，改后全绿。它至少断言下面四格。
- [x] Components 的写法里有「共用实现」条目，含 `@` 指针、用在、可变、不许自画、检查五项，并写明整页共用视图以这种条目进、条目不重抄外观、不进 front matter。
- [x] UI 工单参考里有「查共用实现条目、命中就用、超出可变就停下」。
- [x] 两份对账参考都有「共用实现」一类发现，含指针失效、缺检查、豁免条数与上次比三种处置。
- [x] design-modeling 的 SKILL.md 章节表、章节写法参考、插件的 design-modeling 人读文档三处，都按官方顺序列出 Motion、Voice & Content Strategy、Components、Do's and Don'ts；章节写法参考有 Voice 章，术语一条指向 `GLOSSARY.md`。
- [x] 新建与蒸馏两份参考按「要建什么」第 2 条改到。
- [x] 已有检查不回退：design-modeling 精简文档检查对章节表的断言随之更新、仍过；项目信息泄漏检查过；全量 `node --test idea-loop/scripts/` 绿。
- [x] `plugin.json` 的 `version` 按档升过，交回写明升到哪一版、哪一档。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。
- [x] review 第 1 轮 S1（2026-11-21）：章节写法里「谁来登记」与蒸馏一致：要人判这一类必须统一；新建 DESIGN.md 时不主动登记；蒸馏时还没有项目检查的照写条目，「检查」一项写待补，同时在缺陷节起草「共用实现缺检查」的项目 issue。不再把「已有项目测试」写成任何时候登记的前提。
- [x] review 第 1 轮 S2（2026-11-21）：两份对账参考里豁免条数的比较对象改成「上次定时对账那一刻主分支上（dreaming 增量范围的基准提交）那份豁免清单的条数」：变多起草项目 issue，变少或持平只报不提；找不到基准提交（第一次跑、人说全量）只报当前条数。不再写「与上一次 dreaming 的提议表比」。文档检查随之断言新写法。
- [x] review 第 1 轮 C1（2026-11-21）：UI 工单参考里不直接指向另一个 skill 的参考文件。规则原文：「别的 skill 不读它的 `references/`，要用就调这个 skill，由它指过去。」改成用 Skill 工具调 `idea-loop:design-modeling`、看它 Components 章的共用实现条目。

## 选中的存量回归

- `design-modeling-slim-doc.test.mjs`：断言了 SKILL.md 的章节表，这一刀改章节顺序，最容易被打断。
- `no-project-leak.test.mjs`：新例子要用通用名字，真实项目名混进来它会红。
- `ui-tickets-canvas-location-doc.test.mjs`：同一份 UI 工单参考，加一节可能动到它断言的段落。
- `dreaming-autonomous-doc.test.mjs`、`dreaming-incremental-doc.test.mjs`：读 dreaming 的参考，对账参考加一类发现可能碰到它们的断言。