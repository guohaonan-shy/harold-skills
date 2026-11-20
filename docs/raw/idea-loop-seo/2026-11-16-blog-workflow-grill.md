---
type: raw
source_type: conversation
captured: 2026-11-16
title: 博客 workflow 拆分的 grill（#163）
tags: [idea-loop-seo, split-blog-publisher]
related: ["[[split-blog-publisher]]"]
---

harold-skills #163 的 triage 会话。U 是人的原话，逐字保留；A 是 AI 的结论，取证过程略去。

## A1

起草时核对：Toeflair 的封面、OG 已经是独立 skill，在 Toeflair 仓库自带的项目级插件 `.claude/plugins/content-creator/`（与 harold-skills 的 `content-creator` 同名不同物），方法与 Toeflair 取值缠在一起；写正文的通用规则在 `blog-publisher` 和 idea-loop `seo-writing` 各一份。提了两题：封面 / OG 放哪个插件（推荐 harold-skills `content-creator`），应用层 blog-publisher 归谁（推荐项目薄壳）。

## U1

Q1 其实我在想能不能和现在的seo-brief接上

Q2 我可以倾向于放到idea-loop的seo下面

## A2

理解为封面、OG 跟 `seo-brief` 一起放进 idea-loop seo 组，配图在 brief 时跟角度一起定。推荐：brief 加「配图」一节；新增编排 skill `seo-publish`；项目取值扩 `SEO.md`。

## U2

Q1 我觉的这里是写blog这个workflow，如何从seo-brief -> blog-writing -> publishing 这块怎么传起来，生图其实我觉得可以放在brief内，然后就是writing loop

Q2 SEO-brief 是否可以直接讲这个workflow串起来（选题、结构、编写原文、修改），针对这个workflow以及skill 结构我们讨论下

## A3

画了三段的 workflow 图（brief 含配图 → 写作循环 → 发布）。现状：`seo-issues.mjs` 第 106 行已把内容类 issue 接成 triage 用 `seo-brief`、实现用 `seo-writing`。推荐 `seo-brief` 分「issue 里」「直接调」两种入口；`cover` / `og` 单独做成 skill（写作循环要重出图，私有参考别的 skill 读不了）；写作循环的骨架进插件；PR 由调用方开。

## U3

Q1 我们现在大概率是在issue里面的，但是我正在做 harold-skills#291 SEO 改动从扫描到上线要停下等人四次,扫出的 issue 在 backlog 一放好几天,上线后效果也没人看，预期是可以从开始到结束

## A4

#291（分支 `issue/291-seo-autopilot`，实现中）定了：不要 UI 设计的 SEO issue 直接 todo、待定题 AI 照推荐定、内容路径内的 PR 自动合并并上线自查。所以博客 workflow 就是一个内容类 SEO issue 在一个 todo 会话里走完，不另做直接调用入口；人停的点改成「人在场才停」。推荐：`cover` / `og` 单独做；托管时写作循环 lint 干净且评委无 local 问题即完，最多三轮，评委报 premise 翻回 triage；项目取值扩 `SEO.md`。

## U4

Q1 你倾向于放在 #291之后再合并实现是吗？

Q2 我觉的这两个可以单独做成skill，我甚至觉得og的skill可以再优化、美观一些，现在这个太简单了

Q3  现在这个plugin内的lint都是在toeflair这个项目里面的，哪些是可以比较作为通用blog的内容来使用的？

Q4 我想把项目依赖的内容升级成通用的写作相关的lint以及品牌设计的skill

写作这个workflow（即写出完整blog这块）是什么样的，我在考虑是否要引用最近比较火的Gemini-carbon作为写手

## A5

- 是，#291 合并后开工：两边都改 `draft-spec.md` 的 SEO 分支和 `SEO.md` 格式。
- OG 模板单开一张工单，出 2–3 种版式给人挑。
- 对着 Toeflair `origin/main` 逐条分类：`voice-lint` 21 条判错规则里通用 3、通用但阈值或词表要配 15、Toeflair 专属 3（`cta.buttonHref`、RESEARCH 类禁句、自家题库总数）；`seo-lint` 16 条全通用，idea-loop 的 `seo-check.mjs` 已覆盖；评委 13 个维度通用 11、要配 2，专属的只有按类别调分数线。
- 通用写作 lint 做成 idea-loop 的脚本，阈值和词表默认值可由 `SEO.md`「写作」节改；品牌取值推荐扩 Toeflair 已有的 `DESIGN.md`（token + Components 章写封面、OG 配方），不新建品牌 skill。
- Gemini 4 Carbon：Google 官方文档（2026-11-16 读）定位 coding、金融、法律、安全、科学，没写写作；不遵守长度目标；长输出要几分钟；只开放给部分地区验证过的企业客户。推荐写手用 Claude，跨模型评委留成项目可选的一席。

## U5

没问题，就按照推荐和思路开始写spec吧啊

## 本轮决议

| 议题 | 决议 |
|---|---|
| 博客 workflow 在哪跑 | 一个内容类 SEO issue 在 #291 的 todo 会话里走完；不另做直接调用入口 |
| 人停的点 | 人在场（人接手 issue）才停；托管时照推荐定并记进 spec |
| 配图放哪一段 | brief 里出图；写作循环里标题或论点改了重出 |
| `cover` / `og` | 单独做成 idea-loop seo 组的两个 skill；Toeflair 的 `hero` 并进 `cover` 作分支 |
| OG 模板 | 重新设计，单开工单出 2–3 种版式给人挑 |
| 写作循环 | 进 `seo-writing`：通用写作 lint → 冷读评委（local 自动改，premise 翻回 triage）→ 最多三轮 |
| 写作 lint | 通用 18 条做成插件脚本，阈值和词表可配；Toeflair 3 条专属留项目 |
| 品牌取值 | 扩 `DESIGN.md`（token + Components 章的封面、OG 配方），不新建品牌 skill |
| 写手 | Claude；跨模型评委留成项目可选的一席 |
| 顺序 | #291 合并后开工 |
