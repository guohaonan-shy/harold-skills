---
type: adr
status: 生效
tags: [idea-loop, design, design-md, shared-implementations]
summary: DESIGN.md 的 Components 能登记「这类界面必须用的共用实现」并配项目自己的检查，对账核它；章节表补官方 Voice 章
related: ["[[366]]", "[[2026-11-19-design-shared-implementations]]", "[[2026-10-19-design-md-standard]]", "[[0013-design-md-write-entry]]"]
---

# ADR-0064 — DESIGN.md 登记共用实现，补 Voice 章

> 由 spec `design-shared-implementations` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`DESIGN.md` 是项目的设计规范文件（官方格式 `google-labs-code/design.md`），其中 Components 章原来只收「组件长什么样」的配方，写不出「这类界面必须用哪一个现成实现」，结果该共用的界面被页面各自手写。issue #366 的真实例子（项目侧）：整页加载失败页，写作、报告用共用失败页组件，Interview、Listen & Repeat 的做题页一直手写自己的「出错了」版式（感叹号、大白容器、没有重试），直到人看交付截图说「这个设计算作ai slop」，才在项目 PR 里（2026-11-17 合并）换成共用组件。

插件这边拦不住（2026-11-19 对着 origin/main `fcb2069` 核）：

- `design-modeling` 的 `references/chapters.md` 把 Components 限定为组件原子的配方，明确排除页面级结构，整页失败视图这种被一组页面共用的视图进不来。
- 对账只拿 `DESIGN.md` 的数值量代码，页面没用共用实现、手写一份差不多的，对不出来。
- 实现 UI 工单的参考 `ui-tickets.md` 只要求复用项目已有的类，没有「这块界面有指定实现就用它」。
- 外部旁证：Atlassian 实测 `DESIGN.md` 只给重新实现的配方，agent 更倾向重画组件，他们靠「告诉 agent 怎么 import 现有组件」加 lint 规则强制。

另一处：官方规范 2026-11-17 起加了 Voice & Content Strategy 章（管界面文案，含空、加载、错误状态说什么、错误是否给出下一步），Motion 也进了正式顺序；插件章节表是之前照抄的，没有 Voice 章，Motion 标成「扩展」排在最后，失败页的文案规则无处可写。

## 2 决策（how）

- **Components 章新增「共用实现」条目**：一类界面（组件，或被一组页面共用的整页视图，如整页失败、404、空状态）必须用的那个实现。五项：`@<路径>` 指针（官方外部引用写法）、用在哪、可变（允许按场景变的部分）、不许自画、检查。条目不重抄外观配方（外观由实现本身承载，token 照旧在 front matter），条目不进 front matter（它不是数值）。
- **检查由项目自己写，放在项目测试里跟 CI 跑，插件不提供扫描脚本**：插件目录不在项目仓库里，项目 CI 跑不到；「像不像失败视图」是项目自己的写法。要求两条：名单外自己画就红；先在违规还在的提交上见它红。豁免清单放在检查旁边，不进 `DESIGN.md`，只减不增。
- **谁来登记**：要人判「必须统一」。新建 `DESIGN.md` 时不主动登记；之后经 dreaming 蒸馏候选进，候选进来时还没有检查的，条目照写、「检查」写「待补」，同时在缺陷节起草「共用实现缺检查」的项目 issue。
- **实现前先查**：`implement/references/ui-tickets.md` 加一节「建一块 UI 前查共用实现」，命中就用指定实现，要的变化超出「可变」就停下交人（加进「可变」还是另起）。
- **对账加一类发现「共用实现」**：`@` 指针失效 → `DESIGN.md 条目` 行，交人裁决；检查不在或从没有 → `缺陷` 行；豁免清单条数每次报，与基准提交（上次定时对账那一刻主分支）比，变多起草 issue，变少或持平只报。指针由对账自己核文件在不在：官方 lint `@google/design.md` 0.4.0 对缺失的 `@` 目标不报，带 `broken-ref` 的版本发布后改由它报。（原写与「上一次 dreaming 的提议表」比，review 第 1 轮发现提议表处理完即删、持平不进表，比不出来，改为基准提交。）
- **章节表照官方顺序**：Overview、Colors、Typography、Layout、Elevation & Depth、Shapes、Motion、Voice & Content Strategy、Components、Do's and Don'ts，后接扩展的 Responsive Behavior、Known Gaps。Motion 不再标「扩展」。Voice 章的术语一条只指向项目的 `GLOSSARY.md`，不重抄词表。
- 没做：不提供通用源码扫描脚本；不给已有项目批量回补条目（靠之后的 retro 候选与蒸馏逐条进）；`pr-reviewer` 不重复判（违规由项目测试在 CI 里拦）；等官方 lint 带 `broken-ref` 之后再收掉对账自己核指针那一步。
- 对旧决定：[[0013-design-md-write-entry]] §2 里「8 节加 Responsive Behavior / Motion / Known Gaps 三个扩展章」的说法，Motion 现在是官方顺序里的正式章，另多一章 Voice。
- 项目侧落地（失败页条目与源码扫描测试）不在本仓库，在 Tofelair#1017。

## 3 结果（result）

- `idea-loop/skills/design/design-modeling/SKILL.md` 章节表含 Voice & Content Strategy、Motion 去掉「扩展」；`references/chapters.md` 有 Voice 章和「共用实现条目」一节；`references/reconcile.md` 有「共用实现」一类；`references/distill.md`、`references/new.md` 照上面的登记规则写。
- `idea-loop/skills/productivity/dreaming/references/design-md-reconcile.md`（三种处置：指针失效、缺检查、豁免条数）；`idea-loop/skills/engineering/implement/references/ui-tickets.md`「建一块 UI 前查共用实现」；`idea-loop/docs/design-modeling.md` 章节列表同步。
- 守护：`idea-loop/scripts/design-shared-implementations-doc.test.mjs`（十余条：条目形状、整页共用视图进条目、对账三种处置、章节顺序、Voice 章、`SKILL.md` 主体 < 5000 字等）。
- 合并：PR #445（DESIGN.md 登记共用实现，补 Voice 章）；PR #448 补决定记录；issue #366 已关闭。决定记录见 [[366]]，调研见 [[2026-11-19-design-shared-implementations]]，`DESIGN.md` 写入标准见 [[2026-10-19-design-md-standard]]。
