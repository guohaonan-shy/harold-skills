---
name: og
description: 文章的 OG 分享卡（1200×630）：做 OG、分享卡、重做 OG。brief 要出图，或文章的标题、论点变了要重出图时用；列表封面用兄弟 skill cover。
---

OG 分享卡是文章被分享、被链接预览时露出的那张图，自带品牌：logo、大标题、一行副标题。版式是插件自带的 HTML 模板，颜色、字体、logo 来自项目的 `DESIGN.md`；项目没配就用中性默认。

下文 `S` 指 `${CLAUDE_PLUGIN_ROOT}/scripts`，`A` 指 `${CLAUDE_PLUGIN_ROOT}/skills/seo/og`。

## 1. 读项目的取值

- 图片目录、OG 字段、DESIGN.md 路径：`node S/seo-md.mjs SEO.md`，取输出的 `images`（`dir`、`ogField`、`designMd`）。没有 SEO.md、没有「配图」节、键是 `无`，都读成空。
- 找 DESIGN.md：`images.designMd` 指定的那份；没指定就 `git ls-files | grep -i 'DESIGN.md$'`，只有一份读它；多份又没指定，人在场就问，托管时当作没有。
- 从 DESIGN.md 取：front matter 的色板和字体 token，按角色对到 params 的 `colors`（`bg` 页面底色、`surface` 表面色、`ink` 正文色、`muted` 次要文字色、`accent` 品牌主色、`accentInk` 主色上的文字色）和 `font.family`（标题字阶的字体）；Components 章的「og-card」组件写了什么就用什么：版式名、`titleSize`、logo 文件路径。它没写的，退回默认。
- `images.dir`、`images.ogField` 没写：人在场就问；托管时看同站已有文章里图片引用的目录、frontmatter 里放分享图的字段（出处写哪篇），找不到就把 PNG 放进 `.tmp/og/`、不动 frontmatter，交回里写明。

完成条件：`colors`、`font`、`logo`、`layout` 各有来源：DESIGN.md、或默认。

## 2. 定卡上的字

| 字段 | 取法 |
|---|---|
| `title` | brief「配图」一节写了大标题就用它；否则取文章 title。放不下时（第 4 步报 overflow）改成论点的一句话版 |
| `kicker` | 文章的类别或类型，一个短标签；没有就省 |
| `sub` | 文章 description 或摘要的一两行；没有就省 |
| `brand` | 没有 logo 时显示的名字：DESIGN.md 的 `name`，没有就取站点名 |
| `site` | `SEO.md`「站点」的域名；没有就省 |

站点有几种语言就每个语言版本各出一张，标题用各自的语言，文件名 `<slug>-og.<语言代码>.png`；只有一种语言用 `<slug>-og.png`。

完成条件：每张卡的字写出来了，来源是 brief、文章或 SEO.md。

## 3. 选版式

`node S/og-render.mjs layouts` 列出版式。「og-card」配方指定了版式就用它；没指定用 `poster`，三种的区别和什么文章用哪种看 [`references/layouts.md`](references/layouts.md)。

完成条件：版式名在 `layouts` 的输出里。

## 4. 渲染

把第 1、2 步取到的值写成 params.json（放临时目录，不进仓库）：

```json
{ "layout": "poster", "title": "…", "kicker": "…", "sub": "…", "brand": "…", "site": "…",
  "logo": "path/to/logo.png", "colors": { "accent": "#…" }, "font": { "family": "…" } }
```

字段全集在 `S/og-render.mjs` 开头的注释。渲染：

```
node S/og-render.mjs render <params.json> <图片目录，或 .tmp/og>/<文件名>.png
```

| 退出码 | 意思 | 怎么办 |
|---|---|---|
| 0 | 写出了，输出里 `fit` 是 `ok`，`defaults` 列出落回默认的项 | 往下走 |
| 2 | params 不合法 | 照 stderr 改 |
| 4 | 文字缩到最小字号还放不下，输出的 `overflow` 说是哪一块 | 缩短那段字，或换一个版式；PNG 已写出但不能用 |
| 1 | 没有可用的浏览器 | 命令已写出 HTML：用 Skill 工具调 `idea-loop:browser`，照它的做法打开 HTML，等 `<html>` 的 `data-fit` 变成 `ok`，截 1200×630 |

完成条件：退出码 0（或 1 的退路里 `data-fit` 是 `ok`），PNG 在图片目录里。

## 5. 看图

用 Read 看这张 PNG：字没有压到图形、logo 看得清、颜色是项目的。再对一眼同项目已有的 OG 图：两张并排像一组。

完成条件：说得出这张图看了什么、哪里对。

## 6. 写进文章，防缓存

- `images.ogField` 的值写成图片的站点路径，形态照同一字段在已有文章里的写法；多语言版本各写各的。
- 重渲同一个文件名后，预览服务在跑就 `node S/og-render.mjs md5 <png> --url <预览里这张图的地址>`：退出码 3 是服务器还给旧图，重启预览或换文件名；没有预览只记下 `md5`。

交回写：版式、哪些取值来自项目、哪些用了默认（`defaults`），默认的写一句「项目没配 OG 配方，用的默认」，图的路径和 `md5`。

完成条件：OG 字段写好；交回里有版式、默认项和 `md5`。

改模板或新增版式，读 [`references/templates.md`](references/templates.md)。
