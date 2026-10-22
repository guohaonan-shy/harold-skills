---
name: seo-setup
description: 把一个站点接进 seo 分类：写仓库根目录的 SEO.md，同步 OpenSEO 项目上下文，建 SEO 的 issue 分类和队列，配 AI 可见性跟踪和每周扫描。每个站点跑一次，设定变了再跑。
disable-model-invocation: true
---

在目标仓库的主 checkout 根目录跑，人在场。`SEO.md` 已存在就只补缺的小节，人写过的原样保留；仓库里的改动留在工作区，人说提交才提交。写进 OpenSEO 的东西（项目、上下文、跟踪）立刻生效，每一笔先给人看、人确认了才写。

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

- `SEO.md` 在的话跑 `node S/seo-md.mjs SEO.md`，记下哪些小节、哪些键是空的。只问空的。
- `get_project_context`，原样存成 `.tmp/seo-setup/context.json`。它的竞品、重点页面、业务概述就是对应小节的推荐值；`missingSections` 里的几节，第 3 步一起问（问法见 [references/project-context.md](references/project-context.md)）。
- 仓库里找其余小节的推荐值，每个记下出处：
  - **站点**：站点配置里的域名、i18n 路由（语言前缀）、`robots.txt`、`sitemap`。
  - **构建与检查**：营销站的构建命令和产物目录（`package.json`、框架配置）。
  - **写作**：文风、失败案例之类的文档；文章 frontmatter 里记文章类型的字段和它的取值。
- 竞品还空着：先问人。人也说不准，提议用 `find_serp_competitors` 跑几个种子词（花 credits，人同意才跑），名单经人确认才算数。

完成条件：要问的每个键都有推荐值和出处，或写明「探查不到」。

## 3. 逐节问人

按 `SEO.md` 的小节顺序问，只问空的。一次最多三个问题，每个带推荐值和出处，人一句「照推荐」就算确认。

- **OpenSEO**：项目 id 由第 1 步定，不用问。余额下限和各方向单次额度给推荐值；各方向之和超过 2,000 时，预算脚本会按 2,000 截，告诉人这一点。`geo` 的单次额度推荐 0：跟踪的花费在第 7 步单独批，扫描只读结果。
- **竞品**：OpenSEO 里有、`SEO.md` 里没有的，逐个问留不留。第 5 步是单向同步，不留的会从 OpenSEO 删掉。
- **重点页面**：要守的页面，10 到 30 个是常态，每个带头词。
- 项目上下文缺的几节一起问（业务、目标、定位、写作偏好）。

完成条件：每个空键都有人确认过的值，或人明确说留空。

## 4. 写 SEO.md

照 [references/seo-md.md](references/seo-md.md) 写进仓库根目录；已有的文件只往空的小节和空的键里填。

完成条件：`node S/seo-md.mjs SEO.md` 解析成功，六节都在；`git diff SEO.md` 给人看过。

## 5. 同步进 OpenSEO 项目上下文

1. 第 3 步问到的业务、目标、定位、写作偏好，照 [references/project-context.md](references/project-context.md) 写成段落，用 `update_project_context` 写进对应 `section`。已有内容的节，把新答案并进原文，不整段替换。
2. 重新 `get_project_context` 存成 `.tmp/seo-setup/context.json`，跑 `node S/seo-context.mjs SEO.md .tmp/seo-setup/context.json`。
3. `updates` 非空：把 `summary`（加了谁、删了谁）给人看，人确认后原样作为 `update_project_context` 的 `updates` 写入。

完成条件：重新取一次上下文再跑比对脚本，`updates` 是空数组。

## 6. 加 SEO 的 issue 分类

项目的「`## issue 分类`」一节在 `AGENTS.md`；没有 `AGENTS.md`，在有 `## idea-loop` 块的那份 `CLAUDE.md`。这一节不存在，告诉人先跑 `/idea-loop:setup`，这一步记「未做」。存在就补上缺的行，格式照 setup 的模板：父类、子类各一行，名字放反引号里，「：」后接说明，子类缩进两格。

```markdown
- `seo`：搜索可见性的问题：由 seo-scan 定时提出，或人按 SEO 问题提（独立队列，上限 5）
  - `technical`：技术 SEO 与索引：审计问题、索引、sitemap、重点页面相对上次审计的回退
  - `pages`：已有页面优化：排名 5–20 位的词、标题与点击率、自相蚕食、内链缺口
  - `keywords`：关键词挖掘与新内容：新词、聚类、并入已有页还是新开
  - `backlinks`：外链：竞品有、我们没有的引用域，外联候选
  - `geo`：AI 搜索可见性：被 AI 回答提到和引用的情况、schema、llms.txt
```

「（独立队列，上限 5）」让 seo 的 issue 在调度里单独排队、最多同时开 5 个会话，扫描一次提出一批也挤不掉别的 issue（`idea-loop:issue-dispatch`）。`seo` 那行已经在、没有这个括注，补上；人改过上限的，留着人的数。

然后跑 `node S/issues.mjs labels docs`，建出 `type:seo` 和五个 `type:seo/<方向>`。它列出的多余 label 只转告人，删不删归 `/idea-loop:setup`。

完成条件：`git diff` 里这一节多了上面六行；`gh label list --search type:seo` 列出六个 label。

## 7. AI 可见性跟踪

扫描时 geo 方向只读这里建的跟踪，不花钱、不问人，所以付费在这一步由人批一次。

1. `get_ai_visibility_tracker`。已配好且定期检查开着：报给人（提示词数、引擎、频率），这一步完成。
2. 没配好：起一份提示词草稿。来源按顺序：人给的；重点页面的头词改写成用户会问 AI 的问题；人同意花一次模型调用的话用 `generate_ai_visibility_prompts`。提示词的原文经人确认，之后不再改写。
3. `estimate_ai_visibility_cost`，`patch` 带上草稿的提示词和引擎，`scheduleInterval` 用人想要的频率（推荐 `weekly`）。把单次检查和每月的花费报给人。
4. 人批了：`save_ai_visibility_tracker` 存提示词和引擎，再 `set_ai_visibility_schedule`（`enabled: true`，人定的频率）。首次开启会排一次基线检查，读那次的结果，不再另买 `run_ai_visibility_check`。人没批：什么都不存，记下「geo 方向会一直是未采集」。
5. 这次花了 credits（`find_serp_competitors`、`generate_ai_visibility_prompts`），用 `update_project_context` 的 `appendResearchLog` 记一条：查了什么、花了多少，别的 skill 据此不重买。

完成条件：跟踪已开着定期检查，或人明确拒绝且记下了。

## 8. 每周扫描

扫描可以由 Claude 桌面 app 的定时任务每周调一次 `/idea-loop:seo-scan`，不带参数：哪些方向这周该跑，由 seo-scan 自己按研究日志定。定时任务跑出的会话用的是建它的会话的目录，所以这一步必须在本仓库的主 checkout 里做。

1. `mcp__scheduled-tasks__list_scheduled_tasks`。没有这个工具（不在桌面 app 里）：把下面第 4 步的 prompt 给人，让人在桌面 app 的定时任务里自己建，这一步记「未做：不在桌面 app」。
2. 已有 prompt 里含 `/idea-loop:seo-scan` 的任务：报给人（时间、是否开着），这一步完成。
3. 没有：用 AskUserQuestion 问人要不要装，选项「装，每周日 22 点左右（推荐）」「装，换个时间」「不装，我自己手动跑」。选「换个时间」的，再问每周哪天几点。选「不装」：什么都不建，这一步记「人拒绝」。
4. 人要装：`create_scheduled_task`：
   - `taskId`：`seo-scan-<仓库名>`；`title`：`<仓库名> 每周 SEO 扫描`
   - `cronExpression`：人定的时间，分钟避开 0 和 30
   - `prompt`：`用 Skill 工具调 idea-loop:seo-scan，不带参数，照它跑到「交回」。没有人在场：不提问，缺什么照 skill 写的记下来往下走。`
5. 告诉人：app 关着时到点不跑，下次打开 app 时补跑；跑完的结果在侧边栏的定时任务里看。

完成条件：本仓库有一个开着的每周 seo-scan 定时任务，或人拒绝了，或记下了没建的原因。

## 交回

一张表：每一步一行，「完成 / 未做（原因）/ 人拒绝」，加下一步要做的事。再列：

- 仓库里改了哪些文件；`git diff` 给人看过；提交等人说。
- OpenSEO 里写了什么：项目（新建还是已有）、上下文各节、竞品和重点页面的增删、跟踪的提示词数与每月估价。
- 建了哪些 label。
- Search Console 有没有接上：`get_search_console_performance` 返回「未连接」，告诉人到 OpenSEO 项目的集成页去连。pages 方向靠它。
- 接下来：装了定时任务的，它每周自己跑 `/idea-loop:seo-scan`；没装的，人自己按周敲它（不带参数，它会按节奏挑方向）；想马上看一次就手动敲；不知道从哪下手，用 `idea-loop:seo-coach`。
