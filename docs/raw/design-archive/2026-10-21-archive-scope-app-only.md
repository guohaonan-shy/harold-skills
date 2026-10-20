---
type: raw
source_type: conversation
captured: 2026-10-21
title: 讨论 —— 设计档案的重跑先只覆盖 app，不碰营销站
tags: [design-archive, dreaming, design-archive-scope]
related: ["[[design-archive-scope]]"]
---

> 格式约定：`## U<n>` 是交给这场会话的原话，逐字保留；`## A<n>` 只保留结论与发现，取证过程/工具调用/中间推演略去。外部产物留链接不复制正文。末尾一张「本轮决议」表。
>
> 这场没有 grill：任务由「设计档案分段」那条线的主会话交过来，里面转述了 Harold 2026-10-21 的决定。U1 是那段任务原文。

## U1

来源：PR guohaonan-shy/harold-skills#63（设计档案给长页面加可引用的分段，覆盖 issue #61）在 TOFEL-demo 营销站上试跑了五轮，切线、漏段这类按结构推的问题都能修稳，但营销页上会动的东西（脚本驱动的首屏演示、轮播、进场计数、滚动驱动段）每轮都冒出新的不稳定来源，成本太高。Harold 2026-10-21 决定：关掉 PR #63（spec design-archive-sections 已翻 parked，#61 挂 status:parked），dreaming 的设计档案重跑先只用在 app 部分，营销部分以后另开会话单独处理。相关的拍不稳问题记在 issue #64（原生折叠 summary 定位不到）和 #65（拍不稳的段怎么稳定取证）。

让 idea-loop 的 dreaming 在「设计档案」那部分（全站初扫与每周档案对账，即重新驱动页面状态、拍图比对）只覆盖目标项目的 app 页面，不碰营销站页面。

- 插件里不能写死某个项目（仓库有「不泄漏项目名」的绊线测试）。做法应是插件读目标项目自己声明的范围——比如目标仓库 AGENTS.md / CLAUDE.md 里一句设计档案覆盖哪些路由或哪个前端应用，或 docs/design/prod/index.md frontmatter 里的一个键——没有声明时行为照旧。先看 idea-loop/skills/dreaming/ 的 SKILL.md 与 references/initial-scan.md、references/archive-reconcile.md（「从路由表列出页面清单」「代码里有路由、档案里没有对应页面」两处是范围的入口），以及 idea-loop/references/design-archive.md，选改动最小的声明方式。
- TOFEL-demo 那边要加的那一句声明（只扫 app，即 toeflair-app/frontend 下的 app，不扫 toeflair-app/frontend/marketing），写进它自己的仓库，单独提交或开 PR，别和插件改动混在一起。

## A1

- **范围的入口不止两处。** 初扫的「从路由表列出页面清单」和对账源码波的「代码里有路由、档案里没有对应页面」决定**发现**哪些页面；另有两处会把范围外的页面带回来：初扫的跨页边（A 页链到 B 页、B 页没扫，就记进 `未扫` 等下次补——B 永远不在范围里，`未扫` 就永远消不掉），和对账的实时波（对 `prod/` 里**每个**状态重新驱动，不管它是谁归档进来的）。
- **声明放在目标仓库的 `AGENTS.md` / `CLAUDE.md`，不放 `prod/index.md`。** 初扫正是 `prod/` 为空的时候，`index.md` 还没有（它由归档脚本在首次归档时生成，主视口 / 主题 / 语言三个键也是首次归档之后才补）；而路由表的位置本来就从 `AGENTS.md` 读（「读项目的路由文件，或 `AGENTS.md` 指的位置」），worktree 准备命令也是同一种「读目标仓库声明」的做法。
- **判一个页面在不在范围里，用源码波现成的匹配**：入口状态的 `entry.url` 对声明范围内的路由表（`:param` 当通配）。不需要新脚本、不改校验。
- TOFEL-demo 现状（2026-10-21 查，main `d649bbb2`）：`docs/design/` 只有旧布局的冻结记录目录，没有 `prod/`，下次 dreaming 跑的是全站初扫。app 的路由表在 SPA 的入口组件里；营销页（`/`、`/pricing`、四个题型介绍页、`/blog`）由 Astro 站出，nginx 不把它们交给 SPA。SPA 路由表里另有 `/legal/:type`（生产上由 Astro 出）、开发专用的 `/dev/*`、`/__design/*` 和兜底重定向 `*`。

## 本轮决议

| 议题 | 决议 |
|---|---|
| 范围由谁定 | 目标仓库自己在 `AGENTS.md` / `CLAUDE.md` 声明；插件只读，没声明行为照旧 |
| 声明放哪 | `AGENTS.md` / `CLAUDE.md` 一句，不放 `prod/index.md`（初扫时它还不存在） |
| 范围管到哪 | dreaming 设计档案那一步的全部四个入口：初扫的页面清单、初扫的跨页边、对账源码波的补扫、对账实时波；`pr-review` 的归档不管 |
| TOFEL-demo 的声明 | 在它自己的仓库单独提交 / 开 PR，不与插件改动混 |
