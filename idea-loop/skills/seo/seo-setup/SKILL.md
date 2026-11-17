---
name: seo-setup
description: 把一个站点接进 seo 分类：写项目目录里的 SEO.md，同步 OpenSEO 项目上下文，建 SEO 的 issue 分类，配 AI 可见性跟踪和每天扫描。每个站点跑一次，设定变了再跑。
disable-model-invocation: true
---

在目标仓库的主 checkout 里跑，人在场。`SEO.md` 在项目目录（`idea-loop:wiki-conventions` 的「项目目录」）里：已存在就只补缺的小节，人写过的原样保留；项目目录里的改动先不提交，人说提交才 `commit` 到 home。写进 OpenSEO 的东西（项目、上下文、跟踪）立刻生效，每一笔先给人看、人确认了才写。

下文 `S` 指 `${CLAUDE_PLUGIN_ROOT}/scripts`，工作文件放 `.tmp/seo-setup/`（不进 git）。`SEO.md` 的格式只有一份定义：[references/seo-md.md](references/seo-md.md)，照它写。

## 1. 连上 OpenSEO，定下项目

1. `whoami`。调不通：告诉人在 `/mcp` 里连上 `openseo`（idea-loop 插件自带这个服务）。人连不上就继续往下走，只做仓库里的事（`SEO.md` 里 OpenSEO 能推的值留给人填，第 5、7 步记「未做：OpenSEO 没连上」）。
2. `list_projects`，按 `SEO.md` 的域名或人说的站点找项目。
3. 对不上唯一一个：
   - 有几个像的，问人用哪个。
   - 一个都没有，问人后 `create_project`（名字、域名只写主机名、市场 `locationCode`/`languageCode`）；返回要 `organizationId` 的，把组织列给人选。

研究类工具不拿来测连通，`whoami` 和 `list_projects` 就够。

完成条件：手上有一个人确认过的项目 id，或者记下了「OpenSEO 没连上」。

## 2. 读现状，备推荐值

- `SEO.md` 的「OpenSEO」写的是旧的「单次额度」：`seo-md.mjs` 读到它会报错，所以先迁移、再跑下一条命令。把它换成「套餐额度」和「每周分配」两项（规则见 [references/seo-md.md](references/seo-md.md) 的「额度按周算」）：各方向的数字照搬进「扫描」，只有旧值是 0 的 `geo`（过去不花钱）不搬，改给推荐值（扫描里其余方向的平均），其余方向照旧照搬；`geo` 的推荐值和其余的值第 3 步给推荐、经人确认才写；人确认新两项后删掉「单次额度」那一行。
- `SEO.md` 在的话跑 `node S/seo-md.mjs <项目目录>/SEO.md`，记下哪些小节、哪些键是空的（输出的 `confirmed` 为 true 的不算空：写了值，或人写了 `无`）。只问空的（「内容原则」不问，见第 4 步）。
- `get_project_context`，原样存成 `.tmp/seo-setup/context.json`。它的竞品、重点页面、业务概述就是对应小节的推荐值；`missingSections` 里的几节，第 3 步一起问（问法见 [references/project-context.md](references/project-context.md)）；写了 `无` 的节不再问。
- 代码仓库里找其余小节的推荐值，每个记下出处：
  - **站点**：站点配置里的域名、i18n 路由（语言前缀）、`robots.txt`、`sitemap`。
  - **构建与检查**：营销站的构建命令和产物目录（`package.json`、框架配置）；内容路径：博客文章、配图、`robots.txt`、`sitemap`、`llms.txt` 所在的目录或文件（站点配置、内容集合的定义、`public/`），出处写它们是在哪找到的。组件、模板、样式不推荐；项目里唯一记 SEO 事件的那个文件，人说算就列进去。
  - **写作**：文风、失败案例之类的文档；文章 frontmatter 里记文章类型的字段和它的取值。
  - **品牌**：「站点」节的域名去掉后缀（`cookbook.example` → `cookbook`），出处写「域名」。
- 竞品还空着：先问人。人也说不准，提议用 `find_serp_competitors` 跑几个种子词（花 credits，人同意才跑），名单经人确认才算数。

完成条件：要问的每个键都有推荐值和出处，或写明「探查不到」。

## 3. 逐节问人

按 `SEO.md` 的小节顺序问，只问空的。一次最多三个问题，每个带推荐值和出处，人一句「照推荐」就算确认。

- **OpenSEO**：项目 id 由第 1 步定，不用问。余额下限、套餐额度（每月多少、重置日是几号：问人，OpenSEO 账户的套餐页看得到）和每周分配给推荐值。每周分配没有历史花费可依时，推荐每周总量 = 套餐额度 ÷ 4.3 取整到百，按 排名追踪 1：扫描 6：起草与验证 3 分，扫描那份在各方向间平分，`geo` 同其他方向（扫描时它在已有跟踪上估价不超过本次额度才发付费检查）；从旧「单次额度」迁来的，各方向的数字照搬进「扫描」，只有旧值是 0 的 `geo` 不搬，给扫描里其余方向的平均作推荐值，和另两份一起让人确认，另两份用这个比例推荐。告诉人：套餐额度按周花完，不再有单次上限；另外买的额度不计入。
- **竞品**：OpenSEO 里有、`SEO.md` 里没有的，逐个问留不留。第 5 步是单向同步，不留的会从 OpenSEO 删掉。
- **重点页面**：要守的页面，10 到 30 个是常态，每个带头词。
- **构建与检查**：内容路径给推荐值，说明它的用处：只改这些路径的 SEO PR（`docs/` 和 `SEO.md` 在项目目录里，不在代码 PR 里）检查全过、两轴没有阻塞项就由 Claude 合并，所以人要确认每一项是内容、不是代码。
- **品牌**：品牌词，查询里含它的不算自相蚕食（站点链接会让品牌词查询看起来像几个页面在抢同一个词）。人可以照推荐、加别的写法（空格、连字符的变体不用加，比较时会去掉）或说留空。推荐值经人确认才写，约定见 [references/seo-md.md](references/seo-md.md) 的「项目信息从哪来」。
- 项目上下文缺的几节一起问（业务、目标、定位、写作偏好）。

完成条件：每个空键都有人确认过的值，或人明确说留空。

## 4. 写 SEO.md

照 [references/seo-md.md](references/seo-md.md) 写进 `<项目目录>/SEO.md`；已有的文件只往空的小节和空的键里填。人说留空的键（竞品这类按行列的节，整节）写成 `无`，写法见格式定义，不留白，扫描才分得出「问过、不要」和「没问过」。「OpenSEO」节按新格式写；有旧的「单次额度」行（第 2 步的迁移），人确认每周分配和套餐额度后把它删掉。新建的 `SEO.md` 带上空的「内容原则」节（只有标题）：内容由项目自己填，不问人、不推测、不写任何原则；已有的文件缺这一节就补上标题。「分析」节可选：人主动说了分析工具（工具名、项目 id、dashboard 链接）才写，不问、不推测；没有就不建这一节，效果报告里那一块写「没有接分析工具」。

完成条件：`node S/seo-md.mjs <项目目录>/SEO.md` 解析成功，八节都在；改动给人看过。

## 5. 同步进 OpenSEO 项目上下文

1. 第 3 步问到的业务、目标、定位、写作偏好，照 [references/project-context.md](references/project-context.md) 写成段落，用 `update_project_context` 写进对应 `section`。已有内容的节，把新答案并进原文，不整段替换。人说不需要的那一节写 `无`，跟 `SEO.md` 的键同一种记法。
2. 重新 `get_project_context` 存成 `.tmp/seo-setup/context.json`，跑 `node S/seo-context.mjs <项目目录>/SEO.md .tmp/seo-setup/context.json`。
3. `updates` 非空：把 `summary`（加了谁、删了谁）给人看，人确认后原样作为 `update_project_context` 的 `updates` 写入。

完成条件：重新取一次上下文再跑比对脚本，`updates` 是空数组。

## 6. 加 SEO 的 issue 分类

项目的分类写在 `<项目目录>/ISSUE_TRACKER.md` 的「分类 label」一节。这一节不存在，告诉人先跑 `/idea-loop:setup`，这一步记「未做」。存在就补上缺的 `seo` 父类和五个方向子类（`technical`、`pages`、`keywords`、`backlinks`、`geo`）的行，要补的原文和格式在 [references/issue-labels.md](references/issue-labels.md)。

然后跑 `node S/issues.mjs labels <项目目录>/docs`，建出 `type:seo` 和五个 `type:seo/<方向>`。它列出的多余 label 只转告人，删不删归 `/idea-loop:setup`。

完成条件：`ISSUE_TRACKER.md` 的这一节多了 [references/issue-labels.md](references/issue-labels.md) 里的六行；`gh label list --search type:seo` 列出六个 label。

## 7. AI 可见性跟踪

扫描时 geo 方向在这里建的跟踪上读结果，估价不超过本次额度也会发付费检查，但不替人建跟踪、不问人，所以建跟踪（长期计划）的付费在这一步由人批一次。步骤（查现有跟踪、起提示词草稿、估价、人批了怎么存、花了 credits 怎么记）在 [references/ai-visibility.md](references/ai-visibility.md)。

完成条件：跟踪已开着定期检查，或人明确拒绝且记下了。

## 8. 每天扫描

`idea-loop:seo-scan` 可以由『定时任务』每天自己调一次（不带参数，今天哪些方向该跑由它按研究日志定：效果报告每 3 天，其余五个方向每 7 天；当天没有到期的只写一行研究日志）。必须在本仓库的主 checkout 里做。步骤（没有能力时的退路、问人的选项、任务的参数、早先装的每周任务怎么改、要告诉人的话）在 [references/daily-scan.md](references/daily-scan.md)。

完成条件：本仓库有一个开着的每天 seo-scan 定时任务，或人拒绝了，或记下了没建的原因。

## 交回

一张表：每一步一行，「完成 / 未做（原因）/ 人拒绝」，加下一步要做的事。再列：

- 项目目录里改了哪些文件（改动给人看过；提交等人说）。
- OpenSEO 里写了什么：项目（新建还是已有）、上下文各节、竞品和重点页面的增删、跟踪的提示词数与每月估价。
- 建了哪些 label。
- Search Console 有没有接上：`get_search_console_performance` 返回「未连接」，告诉人到 OpenSEO 项目的集成页去连。pages 方向靠它。
- 接下来：装了定时任务的，它每天自己跑一次 `/idea-loop:seo-scan`；没装的，人自己隔几天敲一次（不带参数，它会按节奏挑方向）；想马上看一次就手动敲；不知道从哪下手，用 `idea-loop:seo-coach`。
