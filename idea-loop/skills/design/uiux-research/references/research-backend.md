# 调研页契约

查什么、走 Refero 哪一层、截图从哪来、页面长什么样、校验管什么。

## 查什么

**具名问题**是一句话、关于一个决定、手上的工作从产品自己的真值里定不下来的问题。「这块该是什么感觉」不是；「产品怎么确认退出一个进行中的会话，确认放在哪」是。

调研只答 **UX 问题**：一个 UX 模式、一条跨屏的用户流程、某类页面通常怎么搭、一段文案的语气。视觉风格（品味、审美流派、配色或字体气质）归 `DESIGN.md` 和发散段的随机种子。所以只用 Refero 的两层：

| 具名问题问的是 | 层 | Refero 调用 |
|---|---|---|
| 一个具体的 UI 模式：某个组件或屏怎么组织、写了什么 | **Screens** | `refero_search_screens`（加 `refero_get_screen`、`refero_get_similar_screens`） |
| 一条多步流程：用户怎么穿过几个相连的屏完成一件事 | **Flows** | `refero_search_flows`（加 `refero_get_flow`） |

按问题选层，不按工作的高度选。flow 搜出来稀疏，就搜相关的 screens，手工排出顺序。

只用这两层的调用：styles 层（`refero_search_styles` / `refero_get_style`）答的是视觉风格；`refero_get_screen_image` 把图作为没有地址的图片块交回，存不了盘。

### 截图从哪来

- **流程行里显示的图**：搜索结果里每个屏都带 `thumbnail_url`（`images.refero.design/…_thumb.jpg`，约 500–800px 宽），flow 详情的每一步也带同一字段。用 `curl` 下载。
- **点开放大的图**：同一地址去掉 `_thumb` 再试一次（`curl -fsS`）。iOS 截图（`…/screenshots/<id>/mobile/<uuid>_thumb.jpg`）这样能拿到约 1125px 宽的大图；web 截图（`…/screenshots/<site>/desktop/<uuid>_thumb.jpg`，缩略图本身已约 800px 宽）返回 403，`_large`、`_full`、`.png`、`.webp` 这些后缀也都是 403，不用试。返回 200 就用它；不是 200，放大图就是缩略图本身的一份拷贝，链接从不断。

### 静态截图答不了的

关于**时间或行为**的问题（某个状态什么时候出现、弹窗打开时某个东西停不停、一个动画怎么缓动），静态截图通常答不了。只答截图答得了的部分，答不了的照实写两处：通用结论里一行（「没有参考能说明 X 何时发生」），页尾决策块里一条（列出说得出的选项）。不另设「答不了」的块，也不拿只是看着相关的参考凑数：一句照实的「没有参考能回答」好过一个自信的错答。

## 文件放哪

调用方给你一个落图目录，两种形状之一，都只在本地、不进 git，随 `docs/design/tmp/` 的生命周期删：

- 有 spec：`docs/design/tmp/<spec-slug>/research/<问题短名>/`
- 没有 spec：`docs/design/tmp/research/<问题短名>/`

里面是 `index.html` 和下载到 `shots/` 下的截图：每一步一张流程行里显示的 `shots/<来源>-<n>.jpg`，一张点开放大的 `shots/<来源>-<n>-full.jpg`（没有更清楚的地址时，它是前一张的拷贝）。页面只用相对路径引用它们，所以在落图目录起静态服务器就能打开，整个目录挪走也不断。

## 页面结构

页面按这个顺序读：人先看到问了什么，再看这些产品的共识，再看证据，最后才被问要决定什么。

1. 研究问题：标题、人的原话、上下文
2. 通用结论
3. 每个来源一节：一条 flow、场景、设计逻辑
4. 要我们决策的问题：最后一块，它之后没有别的块

`research-check.mjs` 只守这个骨架（见「校验管什么」）。下面「每块写什么」是要照着写的描述，不是校验会判失败的规则。页面用具名问题的语言写。

## 每块写什么

**研究问题。** 页面的 `<h1>` 是交给你的具名问题，**原样**，不改写成更好听的问法；标题恰为「研究问题」的那一块里，放**人的原话**，原样；再放交给你的**产品上下文**（哪个产品、哪块界面、`DESIGN.md` 指针、平台），也原样。人靠这几样判断这页有没有答到点上，改写过的问题会藏住错位。

**通用结论（`general`）。** 在你摆出的来源之间都成立的结论，一个短列表，最要紧的在前。静态截图答不了的部分在这里占一行。人最先读、也可能只读这一块，它要能脱离来源单独成立。只写结论：哪些来源没放进来、图的顺序是谁排的、怎么搜的这类过程说明，都不上页面。

**每个来源。** 按你给同事看的顺序排。一个标题，然后是 **flow**：这个来源的截图横排成一行，按用户遇到的顺序，每张下面一行写这一步在做什么。**每张截图都能点开放大**，放大的是你能拿到的最清楚的那张。旁边两段：

- **场景**：哪个产品、什么用户、这个页面在什么时刻出现、要完成什么。模式离开它服务的时刻就没有意义。
- **设计逻辑**：用了什么模式或流程、它解决了什么问题、所以 UI 长成这样。这是能迁移的部分，只和它的场景一起才站得住。

来源对我们意味着什么，不在每个来源下重复，只在最后一块出现一次。不能呈现目标状态的来源不上页面。

**要我们决策的问题（`decisions`）。** 拿产品上下文去读通用结论和各来源，列出对我们这块界面还没定的事。一条一个决定：问题、选项、每个选项出自哪个来源、结合上下文对我们这块界面意味着什么。来源对不上，那个分歧**就是**一条，把几个做法都摆出来，不取中间值（参考是某个具体主张的证据，不是一张选票）。你不替人选：不写「所以选 B」。没有要定的，写一行说明。它放最后：人读完证据再决定；它之后不再有别的块。

## 标记约定

`research-check.mjs` 按这些属性查形状，属性原样保留；其余（CSS、标题措辞）由你定。

```html
<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>调研：退出确认</title>
<style>
  body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px 16px;color:#1a1a1a;background:#fff}
  @media (prefers-color-scheme:dark){body{color:#e8e8e8;background:#161616}}
  ol[data-part=flow]{display:flex;gap:16px;overflow-x:auto;list-style:none;padding:0}
  ol[data-part=flow] li{flex:0 0 220px}
  ol[data-part=flow] img{width:100%;border:1px solid #8884;border-radius:8px;cursor:zoom-in}
  section[data-source]{border-top:1px solid #8884;margin-top:32px;padding-top:16px}
  dialog#zoom{max-width:96vw;max-height:96vh;border:0;padding:0;background:transparent}
  dialog#zoom::backdrop{background:#000c}
  dialog#zoom img{display:block;max-width:96vw;max-height:96vh;cursor:zoom-out}
</style></head><body>
<h1 data-part="question">具名问题，原样</h1>
<section data-part="brief">
  <div data-part="human-words"><h3>研究问题</h3><p>…人的原话，原样…</p></div>
  <div data-part="context"><h3>交给调研 agent 的上下文</h3><p>…原样…</p></div>
</section>
<section data-part="conclusion">
  <div data-part="general"><h2>这些产品的通用结论</h2><ul><li>…</li></ul></div>
</section>

<section data-source>
  <h2 data-part="source-title">产品名 · 这一组在做什么</h2>
  <ol data-part="flow">
    <li><a data-part="zoom" href="shots/acme-1-full.jpg"><img src="shots/acme-1.jpg" alt="第 1 步"></a><p>这一步在做什么</p></li>
    <li><a data-part="zoom" href="shots/acme-2-full.jpg"><img src="shots/acme-2.jpg" alt="第 2 步"></a><p>这一步在做什么</p></li>
  </ol>
  <div data-part="scene"><h3>场景</h3><p>…</p></div>
  <div data-part="logic"><h3>设计逻辑</h3><p>…</p></div>
</section>
<!-- more <section data-source>… -->

<section data-part="decisions-block">
  <div data-part="decisions"><h2>要我们决策的问题</h2><ol><li>…问题、选项、各自出处、对我们这块界面意味着什么…</li></ol></div>
</section>

<dialog id="zoom"><img alt=""></dialog>
<script>
  const dlg = document.getElementById('zoom');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-part=zoom]');
    if (!a || !dlg.showModal) return;          // no dialog support: the link just opens the picture
    e.preventDefault();
    dlg.querySelector('img').src = a.getAttribute('href');
    dlg.showModal();
  });
  dlg.addEventListener('click', () => dlg.close());
</script>
</body></html>
```

一个来源都没有的页面，只有在一个 `<section data-part="no-source">` 写清搜了什么、为什么没有能呈现目标状态的来源时才合法。

## 校验管什么

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/research-check.mjs" <落图目录>/index.html
```

它查：

- **骨架与顺序**：标题、「研究问题」块（人的原话）和上下文在结论之前；结论（`general`，非空）在第一个来源之前；每个来源（或 `no-source` 说明）在 `decisions` 之前；`decisions` 非空、不在 `conclusion` 里面，且是**页面最后一块**，之后只能跟放大用的 `<dialog>` 和它的 `<script>`。
- **每个来源**：一个标题，一条 flow，每一步都有包在 `<a data-part="zoom">` 里的截图和一行字，`scene` 与 `logic` 非空。
- **地址**：页面上每个 `<img>`（flow 里的或别处的：结论、来源的两段、决策块）和每个放大的 `href`，都是**相对落图目录**的路径且文件存在。不用远程地址（会过期）、不用 `data:` URI、不用 `..`。唯一的例外是放大 `<dialog>` 里那个空的 `<img alt="">`（`<dialog>` 里的 `<img>` 都跳过），它的地址由脚本在点击时设。
- **两个已撤掉的块**：出现 `cannot-answer` 或 `for-us` 就失败。

它不查的，靠人读页面把关：「研究问题」块之前多出来的块（前言、横幅）；决策块之后不可见的多余元素（检查放行 `<dialog>`、`<template>`、`<script>`、`<style>`、`<noscript>`，只拦可见的块，比如页脚、段落）；每块里写了什么（结论里多一段、来源里第三段、截图不放 `shots/`）。照上面「每块写什么」写。
