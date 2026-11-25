---
type: raw
source_type: conversation
captured: 2026-11-19
title: DESIGN.md 登记共用实现、补 Voice 章（#366 triage 讨论）
tags: [design-md, design-shared-implementations]
related: ["[[0064-design-shared-implementations]]"]
---

U 是 Harold 的原话，A 是 AI 的结论（只留结论与发现，取证过程略去）。

## A1

#366 的问题：有些界面该全站共用一个实现，现在没有东西拦住页面照着样子再画一套。真实例子是 Toeflair 的整页失败页：写作、报告用共用组件，Interview、Listen & Repeat 一直手写「出错了」版式，直到 Tofelair PR #1010 才换掉。DESIGN.md 的 Components 只写组件长什么样，对账也只核数值。

issue 列的三件要定的事里，两件按现有规则已定：名单写正文不写 front matter（front matter 只放数值）；豁免清单放检查旁不进 DESIGN.md（已知缺陷、迁移计划不进）。要人定的是检查由谁写：推荐项目各自写测试（跟项目 CI 跑，拦得住人），不推荐插件给通用脚本（项目 CI 跑不到）。

## U1

这个issue想解决什么问题？

## A2

（解释了问题：失败页的例子、为什么现在发现不了、要的三件改动。）

## U2

首先，我比较好奇，失败页其实类似于营销页的404页面，这种整个站点可能共享的路径页面，是否要写入design.md，你先调研下github，x上的一些内容。然后我们再来讨论

## A3

结论：失败页、404 这类全站共用的页面该进 DESIGN.md，但写成「必须用哪个共用实现」的指针，不是又一份外观配方；再由 lint 和项目测试拦。

- 官方规范（google-labs-code/design.md `docs/spec.md`，2026-11-19 读 main）：Components 收「component atoms」；错误文案归「Voice & Content Strategy」章；Components 可以用 `` `@<路径>` `` 外部引用指向真实实现（含 JSX 源码），`broken-ref` 规则核目标在不在。这两样 2026-11-17/18 才进 main（PR #180、#183），npm 上的 `@google/design.md` 还是 0.4.0（2026-07-27），实测 0.4.0 的 lint 不报缺失的 `@` 目标。
- VoltAgent/awesome-design-md 84 份样本：0 份写错误页或 404 页；14 份提到 error，全是错误色或输入框报错态；0 份用 `@` 引用。样本取自公开营销站，抓不到登录后的失败页。
- 成熟设计系统把错误页写成模板或模式：USWDS 的 404 在 Templates 下，GOV.UK 是 Page not found pages 模式，Ant Design 有 Exception 页，Carbon 有 Full-page error。
- Atlassian 的 DESIGN.md 实测：只给重新实现的配方，agent 更会重画组件而不是用现有的；他们生产上用 MCP / skill 教 agent import 现有组件，配 lint 规则强制。
- X：在人的 Chrome 里搜了三组词，没有相关讨论。
- 顺带发现：插件的章节表没有 Voice & Content Strategy，比官方少一章。

## U3

没问题，Voice & Content Strategy也在这个issue里面一起解决

## 本轮决议

| 议题 | 决议 |
|---|---|
| 失败页、404 这类共用页面进不进 DESIGN.md | 进，写成 Components 里的共用实现条目：`@` 指针 + 可变 / 不许自画的部分 + 检查 |
| 检查由谁写 | 项目各自写测试，跟项目 CI 跑（U3 认可 A3 的方向） |
| 名单放哪 | DESIGN.md 正文 Components 章（规则已定） |
| 豁免清单放哪 | 检查旁边，不进 DESIGN.md（规则已定） |
| Voice & Content Strategy | 补进插件的章节表，在本 issue 一起做（U3） |
