# 01 — SEO.md 加「品牌」一节，蚕食判定排除含品牌词的查询

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

背景：idea-loop 的 seo 分类里，page-optimizer agent（seo-scan 跑 pages 方向时起它）判「自相蚕食」的规则是「同一个查询有两个及以上页面各有 ≥ 20 次展现」。品牌词（比如搜站点名）在 Google 上显示成首页一条结果加一排站点链接，Search Console 给每条站点链接各记一次展现、排名和首页相同，所以品牌词每轮扫描都被报成一条假的蚕食。实例：toeflair.com 的「toeflair」一查询，首页拿全部点击，另有 7 个站点链接排名 1.0–1.1，被报成 9 个页面的蚕食。keyword-clustering skill 被 keywords 方向调用时，也用同一份 query × page 数据判蚕食，有同样的问题。

这一刀做完后：

- 目标仓库根目录的 `SEO.md` 多出第七个小节「品牌」，一行一个键：

  ```markdown
  ## 品牌
  - 品牌词：`toeflair`；`toefl air`
  ```

  多个品牌词用 `；` 分隔、各自放反引号里，和 `SEO.md` 其余小节的写法一致。
- `SEO.md` 的解析脚本把它读成一个品牌词数组；没有这一节、没有「品牌词」键、或值里没有反引号的，读成空数组，不报错（照现有「少了的小节当作空」）。
- `SEO.md` 的格式定义（seo-setup 的参考文档）写上这一节：模板里加上它，「每节读的人」表加一行（品牌｜品牌词｜page-optimizer、keyword-clustering），小节数从六改成七。
- seo-setup 按小节顺序、只问空的，和其余小节一样问品牌词：推荐值取「站点」节的域名去掉后缀（toeflair.com → `toeflair`），出处写「域名」；人可以照推荐、加别的写法或说留空。完成条件里的「六节都在」改成七节。
- page-optimizer 读 `SEO.md` 时也用「品牌」节；判定表里 `cannibalization` 一行加上排除：查询含品牌词的不判蚕食。
- keyword-clustering 第 6 步「找出蚕食风险」和它对 `get_search_console_performance` 的工具说明加上同一条排除，用和 page-optimizer **同一段判定文字**，不各写一版。
- 「含品牌词」的判法：查询和每个品牌词都转小写、去掉空格和连字符后，查询包含任一品牌词即算。品牌词 `toeflair` 时，「toeflair」「Toeflair pricing」「toefl air」「prepex ai vs toeflair」都算，「toefl listen and repeat」不算。
- 没写品牌词（空数组）时**不排除**，蚕食照现在的规则判；不要从域名推一个出来（人定的）。
- 排除只作用于蚕食判定：含品牌词的查询照旧参与 `striking-distance`、`low-ctr`。
- 各 seo skill 里写着「读出六节」的地方改成七节。
- 规则留在 agent 和 skill 的判定文字里，不挪进脚本。

不做：seo-brief 不改；品牌词不用到别的地方（关键词研究、GEO）；不做站点链接形状识别；seo-scan 去重逻辑不改。

## 验收标准

- [x] 解析脚本读一份「品牌」节写了 `toeflair`；`toefl air` 的 `SEO.md`，品牌词数组是这两个词，有单元测试
- [x] 解析脚本读一份没有「品牌」节的 `SEO.md`，品牌词是空数组、不报错，有单元测试
- [x] `SEO.md` 格式定义的模板、「每节读的人」表、小节数都含「品牌」节
- [x] seo-setup 问品牌词：推荐值从域名推、带出处，只在空时问；完成条件写七节
- [x] page-optimizer 的 `cannibalization` 判定和 keyword-clustering 第 6 步含同一段排除文字，写明没填品牌词时不排除、只作用于蚕食
- [x] 插件里不再有「读出六节」这类指 `SEO.md` 六节的说法
- [x] 改动不硬编码 Toeflair：示例用格式定义里现有的 `cookbook.example` 一类示例域名
- [x] 全量测试通过
- [ ] 在 Toeflair 上用改后的插件只跑 seo-scan 的 pages 方向，`SEO.md` 写了品牌词 `toeflair` 时，`pages.json` 里没有 targets 指向「toeflair」查询的 `cannibalization`（⏭ 延后 → 人：要在 Toeflair 仓库跑一次真实扫描）

## 选中的存量回归

- `SEO.md: six sections parse into the shape the scripts read`：这一刀给解析结果加字段，它断言整份解析结果的形状，会受影响，需要随之更新
- `SEO.md: missing sections read as empty, unknown directions and page types are refused`：「品牌」节缺省时为空的行为要和它守的约定一致
- `context: one-way — SEO.md adds, changes and removes; OpenSEO is never read back`：同步脚本读同一份解析结果，加字段不能让同步多写东西
- `no-project-leak`：守着插件里不出现 Toeflair
