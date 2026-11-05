# AI 爬虫：查哪个、各管什么

seo-geo 第 3 步查 `robots.txt` 时读。每个爬虫只能支撑它自己那一种结论：查训练爬虫说明不了能不能被 AI 搜索引用，反过来也一样。报告和发现里写出查的是哪个 user-agent、它管的是什么。

## 搜索引用类：挡住了才是问题

| user-agent | 归属 | 管什么 |
|---|---|---|
| `Googlebot` | Google | 普通搜索，也是 AI Overviews、AI Mode 的来源 |
| `Bingbot` | Microsoft | Bing 搜索与 Copilot 的来源 |
| `OAI-SearchBot` | OpenAI | 能不能在 ChatGPT 搜索里被引用 |
| `Claude-SearchBot` | Anthropic | 能不能在 Claude 的搜索里被引用 |
| `PerplexityBot` | Perplexity | Perplexity 的搜索索引 |
| `Applebot` | Apple | Siri、Spotlight、Safari 的搜索 |

## 训练类：放不放是授权取舍，只记现状

| user-agent | 归属 | 管什么 |
|---|---|---|
| `GPTBot` | OpenAI | 模型训练 |
| `ClaudeBot` | Anthropic | 模型训练 |
| `Google-Extended` | Google | Gemini 的训练与 grounding；不影响普通搜索和 AI Overviews 的收录 |
| `Applebot-Extended` | Apple | 生成式模型训练的退出信号；本身不抓取 |
| `CCBot` | Common Crawl | 公开语料，常被拿去训练 |

常被混淆的成对：`OAI-SearchBot` 与 `GPTBot`、`Claude-SearchBot` 与 `ClaudeBot`、`Googlebot` 与 `Google-Extended`、`Applebot` 与 `Applebot-Extended`。挡了训练类、放了搜索类的站点，在对应的 AI 搜索里照样能被引用；挡了 `Google-Extended` 不是「没进 Google 搜索」的证据。

## 用户触发的抓取

`ChatGPT-User`、`Claude-User`、`Perplexity-User`，以及 Google 的用户触发抓取，是在用户提问时替用户去取页面。它们对 `robots.txt` 的态度各家不同，有的不遵守；要真挡，靠服务端的访问控制，`robots.txt` 不是可靠手段。这一类不判成发现。

## 怎么判

- 按 `robots.txt` 的规则：找对应 user-agent 的组，没有就落到 `*` 组；看重点页面的路径是否被 `Disallow`。
- 名单会变：各家的爬虫文档是一手来源，遇到这里没有的 user-agent，查它的官方文档再归类，查不到的写「未归类」，不猜。
