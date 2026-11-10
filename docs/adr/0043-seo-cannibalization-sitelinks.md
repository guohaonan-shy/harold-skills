---
type: adr
status: 生效
tags: [seo, seo-cannibalization-sitelinks]
summary: SEO.md 新开「品牌」节，蚕食判定排除含品牌词的查询，不再把站点链接报成蚕食
related: ["[[2026-10-27-brand-terms-cannibalization]]"]
---

# ADR-0043 — 品牌词由人写进 SEO.md，蚕食判定据此排除品牌查询

> 由 spec `seo-cannibalization-sitelinks` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

seo 的 pages 方向（`page-optimizer`）有一条 `cannibalization` 判定：同一个查询有两个及以上页面各有 ≥ 20 次展现，就报「自相蚕食」。判定只数每个页面各有多少展现，不看这些展现是不是同一条搜索结果里一起出的。

品牌词是个导航型查询：Google 把首页和一排站点链接放在一条结果里，每条站点链接各记一次展现、排名和首页一样。2026-10-27 拿一个真实站点近 28 天的 Search Console 数据照规则判了一遍，品牌词那个查询报出 9 个页面的蚕食，其中 7 个是站点链接，首页拿走了全部点击。这条误报每轮扫描都会回来：`seo-scan` 建 issue 时只跟开着的 issue 去重，上一条关成 not planned 后，下一轮会再开一条，占 seo 队列的名额。

## 2 决策（how）

选项有三个：A 排除品牌词（品牌名从域名推）；B 认「首页加站点链接」的形状；C 两个都做。起草时推荐 A。人改了方案形状：品牌词不由插件推，而是由人在 `SEO.md` 里自己设定。取舍：

- **放哪**：`SEO.md` 新开「品牌」一节（键「品牌词」，多个值用 `；` 分隔、各放反引号里），不塞进「站点」节。`SEO.md` 因此从六节变七节。
- **没写就不排除**：不从域名推。老项目重跑一次 `seo-setup`（只补空小节）才生效。理由是误排除一个品牌查询只少报一条蚕食，而插件自己猜的参数不可控。
- **怎么判「含品牌词」**：查询和每个品牌词都转小写、去掉空格和连字符，查询包含任一品牌词就算品牌查询。包含而不是相等，是为了接住「品牌 + 功能」「X vs 品牌」这类同样会出站点链接或自家结果的查询。
- **只作用于蚕食**：`striking-distance`、`low-ctr` 照旧包含品牌词查询，品牌词排名掉出前 5 或点击率异常仍是该看的信号。
- **两处同一条文字**：`page-optimizer` 的判定表和 `keyword-clustering` 第 6 步（它被 keywords 方向调用时同样会让品牌词过线）写成同一条规则。判定仍留在 agent 与 skill 的文字里，不挪进脚本，那是结构性改动。
- **不做**：站点链接形状识别（不带品牌名的导航型查询没有实例）；品牌词用于别处（关键词去品牌、GEO 查品牌提及）；`seo-scan` 去重时也看已关闭的 issue（管所有发现，另起）。

## 3 结果（result）

- `SEO.md` 格式定义（`seo-setup` 的 `references/seo-md.md`）有「品牌」一节，「每节读的人」表里读者是 `page-optimizer` 与 `keyword-clustering`；读 `SEO.md` 的各 seo skill 写「读出七节」。
- 解析脚本 `scripts/seo-md.mjs` 把它读成品牌词数组；缺节、缺键、值里没有反引号都读成空数组不报错。测试在 `scripts/seo-scripts.test.mjs`。
- `agents/page-optimizer.md` 的 `cannibalization` 一行和 `skills/seo/keyword-clustering/SKILL.md` 第 6 步各有同一段「蚕食判定排除品牌查询」，含例子。
- `seo-setup` 第 3 步按小节顺序问品牌，推荐值取域名去掉后缀，出处写「域名」，人确认才写。
- 合并在 PR #141（实现）和 #139（spec），issue #81 已 COMPLETED 关闭。

后续 `seo-params-from-seo-md`（ADR-0044）把「品牌词由人确认写入」推广成所有 seo 项目信息的通用约定，并加了「无」的写法；本条的排除逻辑不变。
