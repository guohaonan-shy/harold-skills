---
name: Toeflair
description: TOEFL 口语 + 写作练习平台的 C 端 app 设计法。这是 baseline case 用的**最小版**，从真实项目那份 574 行的 DESIGN.md 蒸馏而来，只保留 T1 底线、两个 register、判得动一个 surface 的 token。
colors: electric-blue-137fec, slate-base
typography: Plus Jakarta Sans / Inter / Charter
rounded: 8px
---

## Overview

**Creative North Star: "Calm Base, Crafted Motion"。** 一个 shadcn 式的安静学习工作台。
in-app 平静克制，公共营销页可以更活。强调来自**一种品牌色、动效与层级**，不来自厚边框或硬投影。

**两个 register 是这份文件里最重要的一条规则** *(T1)*：

- **Product register — in-app**（dashboard、练习流、报告、写作、设置）：平静克制，但不是死板。
  shadcn 原语、柔投影、发丝边框、一个强调色。动效在场但安静：滑动指示、highlight reveal、hover lift、内容淡切。
  标准是 *earned familiarity* —— 一个用惯 Linear / Grammarly / Notion 的学生对每个控件一眼就敢按。
- **Marketing register — 公共页**（landing、pricing、题目介绍页）：可以更活、更电影感，但仍在 Electric Blue + slate 之内。

## Colors

- **Electric Blue** `#137fec` —— 唯一被结构性使用的饱和色：主操作、链接、当前选中、focus / selection ring。
  hover / active 加深用 `#0f6fd1`；选中行/卡的淡蓝底 `#eff6fe`（**永远与 ring 同时出现，不单独用**）。
- **Page** `#f6f7f8` · **Surface** `#ffffff` · **Surface muted** `#f8fafc`
- **Foreground** `#0f172a`（Slate 900，系统里唯一的黑）· **Muted foreground** `#64748b`；
  落在 `#f6f7f8` 页底上的次要正文降到 `#475569` 以守住 4.5:1。
- **Border** `#e2e8f0` —— 唯一的分隔线，1px 发丝。
- **反馈色**：Destructive `#dc2626` / Success `#16a34a`，只出现在状态与反馈上，**永不当装饰**。

**The One Voice Rule** *(T1)*。Electric Blue 是唯一结构性使用的响亮颜色。需要区分多个类别时，
区分挂在**小圆点或标签**上，不靠往表面上灌四块饱和色。

**无障碍底线** *(T1)*：正文文字对比度 ≥ 4.5:1，**从真 DOM 的 computed style 读出来**，装饰性标题不豁免。

## Typography

- **Display**（Plus Jakarta Sans, 800, 40–48px, `letter-spacing: -0.5px`）：in-app hero / section hero。
- **Headline**（Inter, 700, 24–28px）· **Title**（Inter, 700, 15–18px）· **Body**（Inter, 400, 15–17px, line-height 1.6，阅读列 65–75ch）
- **Label**（Inter, 700, 11–13px, `letter-spacing: 1–1.2px`, uppercase）：**省着用**——每个 section 上面都顶一个大写 eyebrow 是 slop。
- 任一 surface 上字体家族不超过三个。

**The Sans-Headline Rule** *(T1)*。产品 app UI 里标题一律 sans，份量由布局和字阶承担，不由厚重的衬线 display 承担。
唯一例外是博客正文的 Charter。

## Layout

- 8px 栅格。in-app 内容区最大宽度 1200px，阅读列 65–75ch。
- 卡片内边距 16 / 20 / 24 三档，同一 surface 上只用一档。
- **营销页的 anchor-moment 节奏** *(T2)*：满屏高度的 section 只留给锚点时刻（hero、一个信任证明、收尾 CTA）；
  内容 section 按自然高度流。不要每个 section 都满屏——满屏只有在内容 section 的衬托下才读得出冲击力。

## Elevation & Depth

**一套投影语言：柔和、模糊、近中性。系统里任何地方都没有硬偏移投影** *(T1)*。

- `shadow-xs` `0 1px 2px 0 rgba(15,23,42,0.04)` —— 静置的卡片、列表行
- `shadow-sm` `0 1px 3px 0 rgba(15,23,42,0.06), 0 1px 2px -1px rgba(15,23,42,0.06)` —— 卡片 hover、选中抬起
- `shadow-md` `0 4px 14px -2px rgba(15,23,42,0.10)` —— 下拉、popover、菜单
- `shadow-lg` `0 12px 32px -8px rgba(15,23,42,0.16)` —— modal、sheet

**选中 / focus 的配方** *(T1)*：品牌 ring + 柔性抬起 + 极淡的 `primary/5` 底，**不是硬边框**。

## Shapes

- 圆角：控件 6px、卡片 8px、大面板 12px。胶囊形只给 chip 与状态 pill。
- 状态 pill 一律是「1px 淡色边 + 一个彩色圆点 + 一个文字标签」的柔性形状，**永远不是纯色块，也永远不是只有底色没有标签**。

## Components

- 底座是 shadcn/ui（Radix + Tailwind + CVA）。Aceternity 只作为**被驯化的、有边界的**动效层叠在上面，
  它默认那套渐变 / 光晕 / spotlight **不进 in-app**。
- 动效是聚光灯，不是背景：只标记真实的状态变化（selection、arrival、retry、决定性操作），
  **每屏最多一个明显的 delight moment**；in-app 的环境性循环动效预算是 **0**。

## Do's and Don'ts

### Do

- 默认安静：底座是 shadcn 式的可长时间阅读的界面，clarity 优先于厚重感。
- 字段安静，操作响亮：阅读 / 输入面（报告、写作、题面、长列表）安静，行动与反馈节点由动效和品牌色承重。
- 一致的工艺：一套投影语言、一种品牌蓝、一条动效曲线，到处复用。

### Don't

- **不用退役的墨色行动层** *(T3)*：`#0a0a0a` 墨色边框、硬偏移投影、暖色 `#FFFDF4` 行动底，
  已于 2026-06-23 整体退役。理由：它是 brutalist 身份的残留，与 calm base 直接冲突；
  新工作引入它就等于同时维护两套身份。纯 `#000` 同样不作为文字色。
- **不做无菌 SaaS 后台**：又一个灰扑扑、所有按钮都一样平的管理界面。理由：目标用户在焦虑中备考，
  要的是确定感，一个没有性格的后台既不安心也不推进。
- **不做花哨的 AI 营销页** *(T3)*：紫色渐变、霓虹光晕、glassmorphism、为炫技而炫技的动效。
  理由：它是这个品类最常见的 AI slop signature，会直接把"有工艺感"这条品牌性格抵消掉。
- **不每屏都在喊**：动效和强调绝不铺满整页。理由：restraint 预算一旦破，delight moment 就不再是 moment。

## Case Law

（从空开始。判例来自真实案子，不预填。）
