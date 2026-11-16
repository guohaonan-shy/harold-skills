# SEO.md 的格式

目标仓库根目录的 `SEO.md` 是 seo 分类所有 skill、agent、脚本读的项目配置。`seo-setup` 照这份模板写；人之后可以直接改。脚本（`scripts/seo-md.mjs`）按下面的格式读它：

- 九个 `## ` 小节（「分析」可选），标题照写，顺序不限；少了的小节当作空。
- 每项一行：`- <键>：<值>`（中文冒号或英文冒号都行）。值里的域名、网址、路径、id 放反引号里。「内容原则」是例外：一行一条原则，写成 `- <原则>（出处：<人的原话、哪个 issue>）`。
- 一个小节到下一个 `## ` 为止；不认识的行忽略，可以写说明文字。
- 人确认过「这一项不要」，就写 `无`：`- 品牌词：无`；竞品这类按行列的节，整节留空写一行 `- 无`。脚本把「无」读成空值，并标成已确认（`confirmed`），和「没写」分得开。

```markdown
# SEO

## 站点
- 域名：`cookbook.example`
- 语言：`en` → `/`；`zh-CN` → `/zh/`
- Search Console：`sc-domain:cookbook.example`
- Bing：`https://cookbook.example/`

## OpenSEO
- 项目：`00000000-0000-4000-8000-000000000000`
- 余额下限：1000
- 套餐额度：每月 10000，每月 1 日重置
- 每周分配：排名追踪 300；扫描 technical 200，pages 300，keywords 600，backlinks 400，geo 200，results 100；起草与验证 400

## 竞品
- `recipebox.example`：RecipeBox，按食材搜菜谱的订阅制 app
- `panfry.example`：PanFry，短视频菜谱

## 重点页面
- `https://cookbook.example/pricing`：头词 `recipe app subscription`
- `https://cookbook.example/blog/weeknight-dinners`：头词 `weeknight dinner ideas`

## 构建与检查
- 产物目录：`apps/site/dist`
- 检查参数：`--title-max=70 --desc-max=160`
- 内容路径：`apps/site/src/content/blog/`；`apps/site/public/images/**`；`apps/site/public/robots.txt`；`apps/site/public/llms.txt`
- 上线等待：30

## 写作
- 文风：`docs/reference/voice.md`
- 失败案例：`docs/reference/writing-failures.md`
- 类型字段：`category`
- 类型映射：`COMPARISON` → 对比与研究；`DATA` → 数据研究；`STORY` → 故事；`HOW-TO` → 教程

## 品牌
- 品牌词：`cookbook`；`cook book`

## 内容原则
- 菜谱页先写成品图和耗时，再写步骤（出处：#12，人的原话「先让人看到成品」）

## 分析
- 工具：PostHog
- 项目：`12345`
- dashboard：`https://analytics.example/project/12345/dashboard/7`
```

## 每节读的人

| 节 | 键 | 谁读 |
|---|---|---|
| 站点 | 域名、语言（语言代码 → URL 前缀，`；` 分隔）、Search Console、Bing | 全部 |
| OpenSEO | 项目（project id）、余额下限（credits）、套餐额度（每月多少、每月几号重置）、每周分配（排名追踪、各方向扫描、起草与验证三份，`；` 分隔；没列的方向或份为 0，只做免费调用）；规则见下一节 | `seo-scan`、`seo-budget.mjs`、issue 会话起草 spec |
| 竞品 | 每行一个：反引号里的域名，冒号后是名字和一句定位（第一个逗号前是名字） | `seo-context.mjs`，页面、关键词、外链、GEO 方向 |
| 重点页面 | 每行一个：反引号里的网址，冒号后可写「头词 `<词>`」 | `seo-context.mjs`、`seo-baseline.mjs`，技术、页面方向 |
| 构建与检查 | 产物目录（相对仓库根）、检查参数（原样传给 `seo-check.mjs`）、内容路径（SEO 改动可以碰的文件：glob 列表，每个放反引号里，`；` 分隔，`*` 不跨目录、`**` 跨目录，写目录路径就含它下面所有文件；`docs/` 和根目录 `SEO.md` 不用写；`.astro`、`.tsx`、`.css` 这类要显式列出才算；没写或写 `无`，只有 `docs/` 和 `SEO.md` 算内容）、上线等待（合并后最多等多少分钟，线上页面还没换成这次的构建就不算上线；写分钟数，没写或写 `无` 按 30） | 检查 hook；内容路径：`seo-content-scope.mjs`（判一个 SEO PR 是不是只改内容）；上线等待：`seo-live-check.mjs`（合并后的上线自查） |
| 写作 | 文风、失败案例（项目文件路径）、类型字段（文章 frontmatter 里记类型的字段名）、类型映射（项目的取值 → 通用类型：对比与研究 / 数据研究 / 故事 / 教程） | `seo-writing`、`seo-brief`、`seo-outreach` |
| 品牌 | 品牌词（站点名的各种写法，每个放反引号里，`；` 分隔；没写或写 `无` 都读成空，蚕食判定不排除任何查询；写 `无` 另外标成已确认） | `page-optimizer`、`keyword-clustering`（判蚕食时排除含品牌词的查询） |
| 内容原则 | 每行一条原则，行尾 `（出处：<人的原话、哪个 issue>）`；没有这一节、节里没有条目或只写 `无`，都读成没有原则 | 起草 SEO spec 的 issue 会话（`draft-spec` 的「输入」与「跟人定要 grill 的」） |
| 分析（可选） | 工具（分析工具的名字）、项目（它那边的项目 id）、dashboard（报告里附的链接）；没有这一节、键没写或写 `无`，都读成没有接分析工具 | `results-analyst`（效果报告里「站内行为」那一段：营销站访问和 CTA 点击；只附链接，不截图） |

内容原则是人对内容说过的话，不是从仓库里推测出来的项目信息（下一节的推测、确认、写入不管它）：内容由项目自己填，插件只定节名和格式，不写任何项目的原则。人以后说的新原则，由说它的那个会话在当时 issue 的 PR 里往这一节追加一行，带上原话和 issue 号。读它的人（起草 SEO spec 的 issue 会话）拿脚本输出里的 `principles` 取用。

方向名固定为 `technical`、`pages`、`keywords`、`backlinks`、`geo`，和「issue 分类」里 `seo` 的子类同名。
## 额度按周算：套餐额度与每周分配

OpenSEO 的套餐额度每月重置、不累积，用不完就作废，所以按周花完它，不给单次扫描设上限：

- `套餐额度：每月 <n>，每月 <日> 日重置`：账期从重置日算起，每 7 天一周（最后一周可能不满 7 天）。另外买的额度不算套餐额度，不要求用完。
- `每周分配：排名追踪 <n>；扫描 <方向> <n>，…；起草与验证 <n>`：只用它们之间的比例。「扫描」里除了五个方向，还认 `results`（效果报告），它在这里只占一个名额，方向本身由别处建。
- 本周预算 = (套餐额度 − 本周开始前本账期已花) ÷ 含本周的剩余周数（向上取整），按每周分配的比例拆成三份：排名追踪、扫描（再按比例分给各方向）、起草与验证。某一项预估超过它那一份本周剩余，这周不跑，进 `skipped` 并推送给人。
- 「已花」从研究日志的「花费」行加总；行里的「份」字段说它记在哪一份，没有「份」的行记在扫描（格式见 `seo-scan` 的研究日志模板）。
- 旧的 `单次额度` 键读到就报错，提示跑 `/idea-loop:seo-setup` 迁移；seo-setup 把它换成上面两项（各方向的数字搬进「扫描」，其余值经人确认）。

## 项目信息从哪来：推测、确认、写入，skill 只读写着的

seo 的 skill 要用的项目信息，因项目而异（竞品、品牌词、业务概述、当前目标、定位），一个来路：`seo-setup` 推测出推荐值，人确认或补充后写进它的存放处，skill 只读写着的。`seo-scan` 开场发现这次要跑的方向缺了，就推测、停下等人确认，写入后再跑；不在运行时推一个值直接拿去用。品牌词是第一个实例。人确认「这一项不要」的，写成 `无`，写在这一项自己的存放处：竞品、品牌词写进 `SEO.md` 对应的节；业务概述、当前目标、定位写进 OpenSEO 项目上下文对应的那一节，内容就是 `无`。缺口检查对两处一视同仁：写着 `无` 就是问过、不要，之后的扫描不再问，读这项信息的 skill 当作没有。

每个方向要用的信息（`scripts/seo-gaps.mjs` 照这张表查缺口）：

| 方向 | 要用的信息 | 存放处 |
|---|---|---|
| technical | 业务概述 `business_overview` | OpenSEO 项目上下文 |
| pages | 竞品；品牌词 | `SEO.md` |
| keywords | 业务概述、当前目标 `current_goal` | OpenSEO 项目上下文 |
| backlinks | 定位 `positioning`；竞品 | 定位在 OpenSEO 项目上下文，竞品在 `SEO.md` |
| geo | 不新增 | — |

给 seo 加一个新参数：定下它的存放处，在这张表加一行，补进 `seo-gaps.mjs`，在 `seo-setup` 里加上推测和提问。「缺」的意思：`SEO.md` 的键没写（写了 `无` 不算缺），或项目上下文的字段为空（写了 `无` 不算缺）。

不写进 SEO.md 的：扫描节奏（插件固定：seo-scan 按研究日志挑方向，`seo-due.mjs`）、issue 标签（插件固定为 `type:seo/<方向>`）、各方向怎么查（在 skill 里）。
