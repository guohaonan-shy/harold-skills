# 长页面的分段

页面的滚动高度大于主视口时读：入口状态怎么声明分段、边和状态怎么引用分段、校验规则 7 判什么、每段的图怎么拍。单屏页面都不写分段，照旧一张主视口截图。

## 写在哪、什么时候写

- `sections` 只写在入口状态上；一页的分段只由一个入口状态声明（两个入口都声明，`<页面>#<段>` 就指不到唯一一处）。
- 页面的滚动高度大于主视口高度，入口状态就要声明分段。这一条在拍图时判（要量页高），校验看不到页面。

## 每段的 `id`

写 `<类型>` 或 `<类型>-<限定词>`，限定词按内容起、kebab-case。**同一页同一类型出现多次，每个都要加限定词**（`feature-listen` 和 `feature-write`，不能一个 `feature` 一个 `feature-write`）；只出现一次时建议不加，校验不拦。类型按最长前缀认：`feature-grid` 是类型 `feature-grid`，`feature-grid-pricing` 是它加限定词 `pricing`，所以 `feature` 不能用 `grid` 当限定词。

类型取自下面这张闭集表（跨项目通用，不进目标项目的 `DESIGN.md`；校验与反查读的是 `design-archive.mjs` 里的同一份常量 `SECTION_TYPES`）。两类判不准时按「这一段主要在回答什么」定：「为什么信你」归 `trust`，「多少人在用」归 `social-proof`。闭集要扩，改常量、校验的单测和这张表，不在档案里自造。

| 类型 | 是什么 |
|---|---|
| `header` | 页面顶栏：站点标识、主导航、顶部的登录与行动按钮 |
| `hero` | 首屏主视觉：一句主张加一个主行动 |
| `social-proof` | 多少人在用：用户数、客户 logo 墙、评分 |
| `problem` | 用户的痛点：为什么现有做法不够 |
| `feature` | 一项功能的展开说明 |
| `feature-grid` | 多项功能并排的宫格或列表 |
| `demo` | 产品的实际画面、可操作的示例或演示 |
| `how-it-works` | 分步骤说明怎么用 |
| `value-prop` | 价值主张：好处汇总，不绑具体功能 |
| `trust` | 为什么信你：安全、隐私、资质、保证 |
| `testimonials` | 用户的原话与案例 |
| `comparison` | 与别的做法或套餐的对比 |
| `pricing` | 价格与套餐 |
| `stats` | 一组数字 |
| `faq` | 常见问题 |
| `related-content` | 相关文章、延伸阅读 |
| `final-cta` | 页尾前最后一次行动号召 |
| `footer` | 页脚：站点链接、法务、版权 |
| `content` | 兜底：以上都不是的正文（校验给提示：多半该归进某一类，或表里缺一类） |

## 怎么定位

`locate` 的写法同边的 `locate`，用可访问性树：

| 段的样子 | `locate` | 范围 |
|---|---|---|
| 有标题 | `{ role: heading, name: <完整名字> }`，精确匹配 | 从标题所在的顶层分块的上沿起（这个分块里还有别的分段标题时，从标题本身的上沿起），到下一个分段的起点为止 |
| 顶栏、页脚 | `{ role: banner }` / `{ role: contentinfo }` | 这个 landmark 元素自己的框 |
| 没有标题的段（首屏、纯图片带） | `{ position: N }` | 第 N 个顶层分块自己的框；校验给提示：这条定位比较脆，页面加一个分块就会错位 |

**顶层分块** = `<main>` 的直接子元素（没有 `<main>` 时取 `<body>` 去掉 banner / contentinfo 之后的直接子元素），只算可见、高度大于 0 的；自身不占位置的包装层（`display: contents`，例如 Astro 的岛）不算一块，往里看，用它的子元素。

最后一段的终点：下一个分段的起点；后面没有分段时取页面上第一个 `contentinfo` 的上沿（不论声明没声明），没有就到页底。没声明页脚时，页脚里的链接会落空、被报出来，而不是静默算进最后一段。标题改名导致定位失败，对账判「进入方式过期」，提议改定位。

## 引用分段

- 写 `<页面>#<段>`（如 `mkt-pricing#faq`）。边的 `from` / `section` 和状态的 `section` 都写全称；`sections` 列表里的 `id` 写短名（它已经在这一页的入口状态里）。
- **写成普通字符串，不写成 wikilink**：`"[[页面#段]]"` 在 Obsidian 里是「页面文件里名叫『段』的标题」，校验读不出它指向的是不是声明过的段。分段不是单独的文件，不占 `docs/` 下 basename 的唯一性。
- 有分段的入口状态上，每条 `user` 边都写 `from`（分段脚本的归属结果给出每个可点元素在哪一段，照抄）。
- **页内锚点**：入口状态的自环（`to` 指向自己）加 `section` 写落点段，不另建状态。
- **段内交互**（FAQ 展开、切标签）是页面的另一个状态，状态写 `section` 说明它在哪一段，截图只拍那一段。

## 正文

声明了 `sections` 的入口状态，「这一屏」按段排开：每段一个 `###` 小标题（段 id）、这一段的图（`<入口状态 id>@<段 id>.png`）、一两句描述。「应看到什么」照旧几条可判定的话，可以按段写。

## 校验规则 7

一律点名文件与字段：

- **违规**：类型不在闭集；`id` 写法不对（不是 `<类型>` 或 `<类型>-<限定词>`，kebab-case）；同页重名；同页同类型多次却没都加限定词；`sections` 写在非入口状态上；同页两个入口状态都声明分段；`locate` 不是上表三种形状之一；边的 `from` 不是本页声明过的段；边的 `section` 不是 `to` 所指状态声明过的段（`to` 不是入口状态也算）；状态的 `section` 不是本页声明过的段（入口状态写 `section` 也算）；有分段的入口状态上，`user` 边没写 `from`；引用写成 wikilink。
- **提示**（打印、不拦，退出码照旧）：用 `content` 兜底；`position` 定位。landmark 不提示：一页只有一个 banner / contentinfo，不会错位。
- 校验读的是档案文件，看不到页面：「页面比主视口高就要声明分段」和「每个可点元素都落在某一段里」放在拍图那一步判。

## 拍图：分段脚本

每段单独截一张图存进档案，不拍整页长图，也不从长图里切。能单测的部分（算范围、归属、要拍哪几张）在 `design-archive-sections.mjs`，浏览器那一侧是它生成、交给插件自带的无头 Playwright 跑的两段代码：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--for <段内状态 id> --section <段 id>] [--viewport <WxH> --theme <light|dark> --motion <default|reduce>]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" measure <仓库根> --state <入口状态 id> --page <页面> --sections-file <分段列表.json> [--for <段内状态 id> --section <段 id>] [--viewport <WxH> --theme <light|dark> --motion <default|reduce>]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" attribute <测量结果.json>
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" shoot <归属结果.json> --out <目录> [--section <段 id,段 id>] [--include '<JSON 定位>']
```

1. **`measure`** 打印一段 `async (page) => …` 的代码。分段取自档案里这个入口状态（`--delta` 时取需求的 delta）；初扫时档案里还没有这个状态，用 `--sections-file`（JSON 列表 `[{ "id": "hero", "locate": { … } }, …]`）从命令行给。视口、主题、动效模式取 `prod/index.md` 的 frontmatter，`--viewport 1440x900` / `--theme` / `--motion` 可覆盖；index.md 缺视口或主题又没给参数，退出码 2，不猜。**语言**脚本管不到：浏览器要先按 `locale` 打开页面（代码把实际的 `navigator.language` 写进测量结果的 `env`，核一眼）。
2. **跑 `measure` 的代码**：先用 `browser_navigate` 进到入口状态（前置条件、登录态都在这一步备好），再把代码交给 `browser_run_code_unsafe`。代码长，存成文件、用 `filename` 参数传；代码文件和 `--out` 的目录都要在 Playwright 的工作区根目录里，否则报「outside allowed roots」。
   - 代码做的事：设视口与配色 → 给页面装一个页面时钟并重载一次（时钟要在页面自己的脚本跑起来之前就在，拍图时才冻得住轮播和计时器；已经有时钟就不重复装）→ 整页按半个视口一步滚一遍（懒加载的岛水合、滚动触发的出现动画走完，固定在屏幕上、滚到某处才淡入的元素在这一遍里被看到出现在哪）→ 等网络空闲 → 等页面高度不再变（最多 3 秒）→ 回顶部 → 等字体 → 取顶层分块、每个标题和每个可点元素的框 → 用 `getByRole(role, { name, exact: true })` 定位每段。
   - 返回的测量结果 JSON 也留在页面的 `window.__dsMeasure` 里。代码的返回值只印在工具输出里，存不成文件：用 `browser_evaluate`（函数 `() => window.__dsMeasure`，带 `filename`）把它存成文件。
   - 测量结果里每个标题、每个可点元素都带完整的可访问名字（`name`，不截断；换行、`<em>` 之类拼起来的）和 `byRole`（`getByRole(role, { name, exact: true })` 找得到，及找到几个）：边的 `locate.name`、分段标题的 `name` 照抄它，不用逐个试。
   - 按角色 + 名字定位不到的可点元素（原生折叠标题 `<summary>` 一类）`byRole: false`，带 `textMatches`（按完整文字找得到几个）；`attribute` 把它们列在 `roleUnresolved`。这类元素的边写 `locate: { text: <完整文字> }`。
3. **`attribute`** 读测量结果，输出每段的范围、每个可点元素归哪一段（照它给边填 `from`）、**落空**列表（不在任何一段里的可点元素）、**定位失败**的段、顺序对不上的段、**重叠**的段；有落空、定位失败、顺序不对或重叠时退出码 1。**写档案之前清零**：补一段（最差补一段 `content`）、改定位或把两段并成一段，重测。归属先看 DOM 包含（banner / contentinfo 里的归顶栏 / 页脚段，没声明就落空），再看元素中心的纵坐标落在哪段范围里。
   - 看不见的不参与归属：透明度为 0 的可点元素，和固定在屏幕上却整页滚一遍也没出现过的，列在 `hidden`，不算落空。固定在屏幕上的元素按它第一次真正出现的位置归属（滚到试用段才淡入的固定目录，归试用段，不归首屏）。
   - 重叠：两段的范围有共同的行（多半是 `position` 定位的分块里还有另一段的标题），可点元素会被静默归到前一段，所以按失败处理。浮在内容顶上的固定顶栏与内容重叠，不算（它的可点元素靠 DOM 包含归属）。
   - 输出的 `coverage` 列出各段之间、页顶页底的空隙。没有可点元素的空隙不拦（多半是留白；`<main>` 之外、非 landmark 的内容，如 banner 与 main 之间的公告条，补分段也盖不住）：看一眼，空隙里有要存档的内容就在状态文件的描述里用文字写明。输出的 `headings` 是每个标题的完整名字与所在段。
4. **`shoot`** 读归属结果（`attribute` 的输出存成文件），打印第二段代码，一段一段单独截：滚过这一段（懒加载、出现动画）→ 回到这一段的顶 → 等到相隔 300ms 的两张截图一模一样（内容全部出现并稳定，最多等 8 次）→ 冻结页面时钟（`page.clock.pauseAt`：计时器、`requestAnimationFrame`、`Date` 一起停）→ 截两张，留第二张 → 让时钟继续走。截图用 `fullPage` 加 `clip`（页面坐标，比视口高的段整张截下来）和 `animations: 'disabled'`。写到 `--out` 目录，文件名 `<入口状态 id>@<段 id>.png`；放进入口状态同目录的 `assets/`（delta 里就是 `delta/` 里对应位置）。`--section` 只拍列出的几段（对账时拍变了的那几段）。
   - 代码返回每张的 `settled`（等到了稳定）、`clockFrozen`、`stable`（冻结后两张一样）、`heightDrift`（拍的时候页面高度比测量时多出几像素）。`stable` 不是 `true`：这一段有自己在动的东西（轮播、计时、开发浮层），在状态文件里注明「截图是某一刻」，对账时它也最容易误报。`heightDrift` 不是 0：页面自己在变高变矮（打字机文案、慢到的内容），这一段下面的图可能整体错位，重新 `measure` 一遍再拍。
   - 浮层越出所在段（顶栏的下拉菜单比顶栏高）：先把浮层打开，再拍时带 `--include '{"role":"menu"}'`（或 `{"text": …}`、`{"selector": …}`），截图范围取这一段与浮层的并集。
5. **段内交互的状态**（带 `section` 的）：先进入这个状态（照它的进入方式点出来），再 `measure <仓库根> <入口状态 id> --for <段内状态 id>`（档案里这个状态已经写了 `section` 就够；初扫时还没写，再给 `--section <段 id>`）。这一次不重载页面（重载会丢掉刚点出来的状态；页面时钟若是入口那次装的，仍在），段的高度按此刻算（FAQ 展开后更高）。`attribute` 之后 `shoot` 只拍那一段，文件名 `<段内状态 id>.png`。时钟若是此刻才装上的，页面早先起的计时器冻不住，`stable` 会说出来。
6. **比对**：对账与归档时逐段比，每段一次 `ui-png-compare.mjs <档案里的那张> <新拍的图>`，容差照旧。尺寸不同算容差外（一段变高了，只这一段超出）。哪一段超出，只这一段判后续、只留这一段的新图；整页都在容差内，什么都不写。
7. **几页一起扫、一页一页拍**：浏览器一次只开一个页面，多个页面的测量要排队；每页的 `measure` / `attribute` / `shoot` 之间不穿插别页的。拍图前先关掉开发服务器的调试浮层（框架的开发工具条、错误浮层、热更新提示），不然它们会被拍进每张图，换个环境对账时全是像素差。

**已知限制**：

- 页面全套在一个无语义的包装元素里时，`position` 定位用处不大，用标题或 landmark 定位。
- `<main>` 之外、非 landmark 的内容落在段间空隙里，档案里没有它的图。
- 浏览器侧的代码靠 `design-archive-sections-browser.test.mjs`（有 Chromium 才跑）和真的跑一次覆盖。
- 页面时钟冻不住的东西（在页面时钟装上之前就起的计时器、缓存了 `requestAnimationFrame` 的第三方动画库）会让 `stable` 是 `false`。
- 一段高过浏览器单张截图的上限（约 16000px）要拆成两段。
- 可点元素的名字按 `aria-label` / 文字 / `alt` 近似，再用 `getByRole` 核过，核不上的都在 `roleUnresolved` / `byRole: false` 里说出来。
