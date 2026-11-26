# 改模板、新增版式

版式是 `assets/<名字>.html`，`dyna seo og layouts` 列出它们（下划线开头的文件是共享部分，不算版式）。每个版式是一个自包含的 1200×630 页面，不认识任何项目：颜色、字体、logo、文字都是占位。

## 占位

`{{lang}}` `{{fontLink}}` `{{vars}}`（CSS 变量：`--bg --surface --ink --muted --accent --accent-ink --font`，派生的 `--accent-soft --line`）`{{css}}`（`_shared.css`）`{{js}}`（`_shared.js`）`{{title}}` `{{titleFit}}` `{{kicker}}` `{{sub}}` `{{site}}` `{{brandHtml}}` `{{visual}}`（只有 `split` 用）。模板里不写任何颜色字面量或品牌字样；要新颜色，加成 `{{vars}}` 的派生变量。

## 放得下，靠 `data-fit`

每个文字块写 `data-fit="最大:最小"`（像素），或只写一个数表示不许缩。页面加载后 `_shared.js` 把它从最大缩到最小，直到放进它的父元素；仍放不下的块记在 `<html data-overflow>`，整页 `data-fit` 是 `ok` 或 `overflow`。所以：

- 每个有 `data-fit` 的块，父元素要有确定的大小（定高，或能收缩的 flex 子项加 `min-height:0`）。
- 单行块（kicker、站点）写 `white-space:nowrap; overflow:hidden`，并给 `max-width`。
- 不用 `overflow:hidden` 把长文字悄悄裁掉：裁掉了页面就报不出放不下。

## 改完怎么验

- 加一个版式：只放进 `assets/`，在 `dyna seo og` 代码里的 `TITLE_SIZE` 写它的标题范围（改了 `dyna/` 就照 `DEVELOPMENT.md`「命令行 dyna」升版本）；它的测试会自动按版式名跑长短、中英文标题的矩阵。
- 改任何模板：在 `dyna/` 里跑 `go test ./...`，再跑 `node --test scripts/og-skill-doc.test.mjs scripts/no-project-leak.test.mjs`。
- 颗粒用 canvas 像素噪点，种子固定：同样的输入渲出同样的字节，`md5` 比对才有意义；不要换成 `feTurbulence`（截图里常不渲染）。
- 渲染必须在浏览器里做：`rsvg-convert`、`magick` 这类命令行光栅化工具忽略网页字体和 CSS 新特性，出的字形是错的。
