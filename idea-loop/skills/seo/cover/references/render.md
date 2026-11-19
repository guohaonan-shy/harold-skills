# 把 HTML 渲成 PNG

`cover` 没配生图工具、或配方要叠 logo 时读这份。用 Skill 工具调 `idea-loop:browser`，照它的无头做法开浏览器。

1. 工作目录：新建一个临时目录，放进 `R/cover-template.html`（改名 `cover.html`）、`R/crop-check.html`，以及配方的 logo 文件、生图工具出的背景图。
2. 改 `cover.html` 里 `<g id="motif">` 的内容，写成这篇文章的母题（配方是生图工具出背景的，删掉它）。
3. 在这个目录起静态服务器：`python3 -m http.server <端口>`，后台跑。本地 `file:` 地址在有的浏览器里被拒。
4. 打开 `http://127.0.0.1:<端口>/cover.html?base=<底色>&accent=<主色>`，底色和主色里的 `#` 写成 `%23`；有 logo 加 `&logo=<文件名>`，有生成的背景图加 `&bg=<文件名>`，整句标题加 `&headline=<标题>`（照 [headline.md](headline.md)）。视口设成 1600×900，等页面标题变成 `cover-ready`（字体加载完）。
5. 只截 `#cover` 这一个元素，存成 `<slug>.png`，再挪到图片目录。截图存放的位置有限制的，先存进允许的位置再挪，限制照『浏览器』（`idea-loop:runtime`）。
6. 字一律在浏览器里渲：命令行的栅格化工具（`rsvg-convert`、`magick`）不认网页字体，渲出来的字形是错的。
7. 颗粒用模板里的 canvas：SVG 的 `feTurbulence` 在截图里常不出现；1600 宽的图上颗粒保持 1:1、低透明度，调大了像电视雪花。

核对时把静态服务器指向同一个目录，打开 `crop-check.html?img=<slug>.png&title=<标题>`。服务器起得早、图重渲过的，浏览器和 `curl` 看到的可能是旧字节，用 SKILL.md 第 5 步的 md5 核对，别信眼睛。
