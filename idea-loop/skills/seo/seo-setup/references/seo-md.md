# SEO.md 的格式

目标仓库根目录的 `SEO.md` 是 seo 分类所有 skill、agent、脚本读的项目配置。`seo-setup` 照这份模板写；人之后可以直接改。脚本（`scripts/seo-md.mjs`）按下面的格式读它：

- 七个 `## ` 小节，标题照写，顺序不限；少了的小节当作空。
- 每项一行：`- <键>：<值>`（中文冒号或英文冒号都行）。值里的域名、网址、路径、id 放反引号里。
- 一个小节到下一个 `## ` 为止；不认识的行忽略，可以写说明文字。

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
- 单次额度：technical 200，pages 300，keywords 600，backlinks 400，geo 0

## 竞品
- `recipebox.example`：RecipeBox，按食材搜菜谱的订阅制 app
- `panfry.example`：PanFry，短视频菜谱

## 重点页面
- `https://cookbook.example/pricing`：头词 `recipe app subscription`
- `https://cookbook.example/blog/weeknight-dinners`：头词 `weeknight dinner ideas`

## 构建与检查
- 产物目录：`apps/site/dist`
- 检查参数：`--title-max=70 --desc-max=160`

## 写作
- 文风：`docs/reference/voice.md`
- 失败案例：`docs/reference/writing-failures.md`
- 类型字段：`category`
- 类型映射：`COMPARISON` → 对比与研究；`DATA` → 数据研究；`STORY` → 故事；`HOW-TO` → 教程

## 品牌
- 品牌词：`cookbook`；`cook book`
```

## 每节读的人

| 节 | 键 | 谁读 |
|---|---|---|
| 站点 | 域名、语言（语言代码 → URL 前缀，`；` 分隔）、Search Console、Bing | 全部 |
| OpenSEO | 项目（project id）、余额下限（credits）、单次额度（方向名 + 数字，`，` 分隔；没列的方向额度为 0，只做免费调用） | `seo-scan`、`seo-budget.mjs` |
| 竞品 | 每行一个：反引号里的域名，冒号后是名字和一句定位（第一个逗号前是名字） | `seo-context.mjs`，页面、关键词、外链、GEO 方向 |
| 重点页面 | 每行一个：反引号里的网址，冒号后可写「头词 `<词>`」 | `seo-context.mjs`、`seo-baseline.mjs`，技术、页面方向 |
| 构建与检查 | 产物目录（相对仓库根）、检查参数（原样传给 `seo-check.mjs`） | 检查 hook |
| 写作 | 文风、失败案例（项目文件路径）、类型字段（文章 frontmatter 里记类型的字段名）、类型映射（项目的取值 → 通用类型：对比与研究 / 数据研究 / 故事 / 教程） | `seo-writing`、`seo-brief`、`seo-outreach` |
| 品牌 | 品牌词（站点名的各种写法，每个放反引号里，`；` 分隔；没写读成空，蚕食判定不排除任何查询） | `page-optimizer`、`keyword-clustering`（判蚕食时排除含品牌词的查询） |

方向名固定为 `technical`、`pages`、`keywords`、`backlinks`、`geo`，和「issue 分类」里 `seo` 的子类同名。

不写进 SEO.md 的：扫描节奏（插件固定：seo-scan 按研究日志挑方向，`seo-due.mjs`）、issue 标签（插件固定为 `type:seo/<方向>`）、各方向怎么查（在 skill 里）。
