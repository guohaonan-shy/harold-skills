---
name: seo-check
description: 发布前的 SEO 检查：扫站点构建产物，按 Google 与 Bing 两个平台的标准查标题、描述、canonical、hreflang、结构化数据。改了 meta 或结构化数据、新增了路由、要读检查输出、或给 CI 接这个检查时用。写文章用 seo-writing。
---

Google 和 Bing 的标准不对称，有时互相冲突，修好一边不等于两边都好。这个 skill 用一个脚本扫构建产物里的每个 HTML（也就是不跑 JS 的爬虫和 AI 抓取器看到的东西），按路由报出问题，每条标明关心它的平台。

**构建后的检查 hook 会自动跑它**：仓库根目录的 SEO.md 在「构建与检查」写了产物目录、且一条命令更新了这个目录，hook 就按那里的参数跑一次，有 error 交回给你，只有 warn 不打扰。所以手动跑主要在三种时候：改了 meta 或结构化数据想看完整结果（包括 warn）、只想看某几个路由、hook 没触发（还没有 SEO.md，或产物在别的目录）。

## 1. 构建，然后跑

先构建站点，确认产物目录里是这次改动之后的文件。然后：

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/seo-check.mjs <产物目录> [参数]
```

产物目录和参数取 SEO.md「构建与检查」节的「产物目录」「检查参数」，原样照抄。参数：

| 参数 | 作用 |
|---|---|
| `--filter=<路由片段>` | 只报路由里含这个片段的页面，例 `--filter=blog/weeknight-dinners` 同时命中 `/blog/weeknight-dinners` 和 `/zh/blog/weeknight-dinners`。扫描仍是全站，hreflang 互指照样对着全站验；退出码只看被报的路由 |
| `--strict` | warn 也让退出码为 1 |
| `--title-min=` `--title-max=` `--desc-min=` `--desc-max=` | 覆盖标题、描述的宽度阈值；默认值写在脚本里 |

宽度按字宽算：CJK 和全角字记 2，其余记 1，所以同一组阈值对中英文都成立。某个语言版本确实要另一组阈值，按语言前缀用 `--filter` 分开跑两次。

完成条件：脚本跑完，你看到的是这次构建的结果（产物目录的修改时间晚于你的改动）。

## 2. 按路由读输出

输出按路由分组：一行路由，下面是它的各条发现，每条带严重度（error / warn / notice / info）和平台（Google / Bing / Both），最后一行是汇总。

- **每条 warn 都跟着它上面那行路由读。** 只 grep 带 warn 的行会丢掉路由，很容易把别的路由早就有的 warn 认成自己的。只关心自己改的页面时用 `--filter`。
- 你改动的路由以外的问题，不在这次修；在交回里提一句。

| 严重度 | 意思 | 处置 |
|---|---|---|
| error | 会坏掉收录或资格（缺描述、多个 canonical、JSON-LD 解析失败、描述超宽） | 发布前必修；退出码 1 |
| warn | 确实偏薄、偏宽、缺 canonical、hreflang 不互指 | 看平台，能改就改；不阻塞 |
| notice | 小的缺漏：缺 `<html lang>`、hreflang 缺自指或 `x-default`、没有 h1、noindex 页面跳过了面向结果页的检查 | 顺手补上；不阻塞 |
| info | 已知无害：CJK 页面上 Bing 的长度误报、FAQPage / HowTo 在 Google 上已无富结果 | 不改 |

某一条为什么存在、修法是什么、平台的报告和脚本对不上时怎么判：读 [`references/checks.md`](references/checks.md)。

完成条件：本次改动的路由上，每条 error 和 warn 都有一个处置（已修 / 不修及理由）。

## 3. 修到没有 error

修完重新构建、重跑同一条命令，直到改动的路由上没有 error。warn 留着的，在交回里逐条写理由。

不要为了让 Bing 不报「太短」去给中文标题、描述凑字：宽度够了就是够了，凑出来的字在结果页上会被截断。

完成条件：改动的路由上 error 为 0；留下的 warn 每条有理由。

## CI 用同一个脚本

脚本不读 SEO.md，全部配置都走命令行，所以项目的 CI 可以直接调它：构建，然后用和 SEO.md「检查参数」一样的参数跑全站（不加 `--filter`）；error 让 job 失败。要让 warn 也挡合并就加 `--strict`。CI 由项目自己配，这个 skill 不替项目写 workflow。

## 平台规则

两个平台在标题、描述、结构化数据、hreflang、canonical 上各自怎么要求，哪里一样、哪里不同，以及脚本不查、但设计 meta 和结构化数据时要知道的（AI 引用相关的 meta 指令、即时收录通知）：读 [`references/platforms.md`](references/platforms.md)。设计新路由的 head 标签、或平台后台报了脚本没报的东西时读。
