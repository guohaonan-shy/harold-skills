---
name: cover
description: 文章的列表封面和顶部大图：新文要配图、标题或论点变了要重出时用，人说做封面、重出封面、出头图也用。分享卡用兄弟 skill og。
---

封面是文章列表卡片和横幅上的那张图。它要垫得住叠在上面的白色标题，被不同比例的容器居中裁掉一圈后仍然完整，和站点品牌读成一套。下文 `R` 指本 skill 的 `references/`；项目目录照 `idea-loop:wiki-conventions` 的「项目目录」拿。

人在场 = 人在这个会话里；托管 = 没有人可问。托管时每个要人定的地方照推荐定，依据写「AI 照推荐定：<理由>」。

## 1. 收输入

- 标题、slug、封面主体：调用方给（`seo-brief` 的「配图」一步、`seo-writing` 的改稿循环）；人直接要的，问人。
- 没给封面主体：从文章角度推两三个候选。每个写明它对应论点的哪一点（跟论点无关的好看形状不算主体），并避开图片目录里相邻文章已用的主体。人在场让人挑，托管时挑推荐的。

完成条件：标题、slug、主体都有，主体说得出对应论点的哪一点。

## 2. 取项目的出图配方

1. `dyna seo parse <项目目录>/SEO.md`，取输出 `images` 的 `dir`、`tool`、`coverField`、`designMd`。没有 SEO.md 或没有「配图」节，它们全是空。
2. 找 DESIGN.md：`images.designMd` 指的那份（相对项目目录）；没指定读 `<项目目录>/DESIGN.md`。项目目录里有几份（`find <项目目录> -name DESIGN.md`）又没指定，人在场问读哪份，托管时按默认出图配方。
3. 读它 front matter 的 `colors`、`typography` token，和 Components 章的 `blog-cover` 组件：logo 路径、底色、主体风格、生图提示词骨架。
4. 定每一项的来源：`blog-cover` 在就用它；没有 `blog-cover`、没有 DESIGN.md、没有「配图」节，人在场问人这几项怎么定，托管时用默认出图配方，读 [R/default-recipe.md](references/default-recipe.md)。DESIGN.md 有色板的，默认出图配方的主色取 `colors` 里的主色 token。

完成条件：底色、主体风格、logo、提示词骨架每一项有来源：`blog-cover`、DESIGN.md 的 token，或默认出图配方。

## 3. 出图

版面（所有出图配方都守）：

- 画布 1600×900。列表卡片（16:10）裁掉左右各约 5%，宽横幅（16:7）裁掉上下各约 11%：主体和 logo 放进离四边至少 12% 的内框。叠上去的标题落在画面下方，主体水平居中、竖直放在离顶 12% 到 67% 之间，下面三成留给标题。
- 底色取中暗色调，没有大面积亮块，白色标题叠上去照样读得清。
- 不烤字（生图模型会写错字，图里的字也搜不到）。标题本身就是封面钩子的清单、对比类文章读 [R/headline.md](references/headline.md)。
- 同站相邻文章换主体、换色相，别排成一排一个样。

按 `images.tool` 走两条路：

- **配了生图工具**：把出图配方的提示词骨架填上主体，调这个工具（MCP 工具名直接调，命令照项目写的跑），参数照工具自己的说明。输出不在图片目录就挪进去。图不合要求（主体偏、带了字）改提示词重出，不在像素上修。出图配方有 logo 的，生成的图当背景，照 [R/render.md](references/render.md) 叠 logo。
- **没配**（`无` 或没写）：自己渲 HTML → PNG，照 [R/render.md](references/render.md)，模板是 `R/cover-template.html`。

重出（标题或论点变了）：主体按新论点重推，文件覆盖同名旧图。

完成条件：得到一张 1600×900 的 PNG。

## 4. 放进仓库

- 调用方给了输出目录（`seo-brief` 出图时给 spec 的 `assets/`），PNG 存进那里，不动 frontmatter，这一步到此为止。
- 否则 PNG 存 `<images.dir>/<slug>.png`；每个语言版本的 frontmatter 的 `images.coverField` 写这张图的引用路径，写法照同一篇文章里别的图片。
- `images.dir`、`images.coverField` 没写：人在场问；托管时看同站已有文章里图片引用的目录、frontmatter 里放封面的字段（出处写哪篇），找不到就把 PNG 留在 `.tmp/cover/`、不动 frontmatter，交回里写明。

完成条件：图在调用方给的输出目录；或在 `<images.dir>/<slug>.png`、每个语言版本的 `images.coverField` 都写了引用；走了退路的，PNG 在 `.tmp/cover/`、交回里写明没动 frontmatter。

## 5. 核对

1. 重渲过的图，对着服务器核 md5：`curl -s <图的地址> | md5` 等于 `md5 <磁盘文件>`（静态服务器会一直给旧字节）。
2. 尺寸是 1600×900。
3. 用 `R/crop-check.html` 看图在三种比例里叠白字标题的样子：主体没被裁、标题读得清、logo 在内框里。
4. frontmatter 字段写了，指向的文件在。

完成条件：四项都有结论；没过的回第 3 步，不交。

## 顶部大图

项目的文章页要顶部大图时，同一套做法：存 `<images.dir>/<slug>-hero.png`。「配图」节没有大图字段：人在场问字段名，托管时取同站已有文章 frontmatter 里放大图的字段，找不到就不写 frontmatter，交回里写明。页面在大图上下另外显示标题，图里不烤字。

## 交回

写三件事：出图配方来源（项目的 `blog-cover`，或默认出图配方：此时写一句「项目没配出图配方，用的默认」）、PNG 的路径、写了哪些 frontmatter 字段。

用了默认出图配方，调用方（执行方）把这句写进它自己交回的 `verified`（这一栏进 PR 描述，合并的人在那里看到用了默认）：`封面出图配方 | 默认出图配方 | 项目没配出图配方，用的默认`。
