# 拍档案截图

拍档案里状态的截图时读。

**先看运行环境能不能做**：下面每一步都靠在页面里执行任意 JS（脚本打印的是一段 `async (page) => …` 代码）。用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的『浏览器』：它写不能执行任意 JS（如 magi）的，整串步骤走 `idea-loop:runtime` 的退路，不拍：把要拍的状态清单（状态 id、入口、视口与主题）交给人，汇报里记「未做：运行环境 <名> 没有『浏览器』的执行任意 JS」。

五种情形各一串步骤，每步以完成条件收尾；输出里要处理的东西汇在「看到什么 → 做什么」。分段怎么声明（`id`、`locate`）见 [writing.md](writing.md) 的「分段 `sections`」，校验规则 7 见 [check.md](check.md)。

**情形怎么选**：状态所在页面不比主视口高 → 单屏状态；页面比主视口高，状态又不分段（加载完的报告页：入口是加载中，加载完是另一个状态，不能声明 `sections`）→ 比主视口高、不分段的状态；入口状态的滚动容器内容比它的可见区高（要声明分段）→ 长页面的入口状态；这个状态带 `section`（FAQ 展开、切标签）→ 段内交互的状态；所在段声明了 `scrollDriven` 且是第 2 步起 → 滚动驱动的段。

## 命令

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" time <仓库根> [设置]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" step <毫秒数>
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" screen <仓库根> <状态 id> --out <目录> [设置]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" cover <仓库根> <状态 id> [--delta <spec-slug>] --out <目录> [设置]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--for <段内状态 id> --section <段 id>] [设置]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" measure <仓库根> --state <入口状态 id> --page <页面> --sections-file <分段列表.json> [--for <段内状态 id> --section <段 id>] [设置]
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" attribute <测量结果.json>
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" shoot <归属结果.json> --out <目录> [--section <段 id,段 id>] [--include '<JSON 定位>']
node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-sections.mjs" pinned <仓库根> <状态 id> --out <目录> [设置]
```

`[设置]` 是 `--viewport <WxH> --theme <light|dark> --motion <default|reduce>`。除 `step` 和 `attribute` 外，每个子命令都打印一段 `async (page) => …` 的代码，交给『浏览器』里执行代码的那一项跑（做法见『浏览器』）；`attribute` 打印 JSON。

## 共用的规矩

- **一个标签页装一次时间**：用『浏览器』打开入口之后、做任何交互之前先跑 `time` 打印的代码；换标签页，或去另一个入口页，再装一次。页面时间从此停住，只有 `step` 会让它走：点击、输入、滚动都不动它，所以点出来的状态不会被轮播切走。点完要等界面变化（加载、提示出现、动画播完），用小步（`step 200`）拨，拨到这一屏的「应看到什么」成立为止，别多拨：每多一步，轮播就可能多走一格。页面时钟停在 2026-01-01，按「今天」「本周」算出来的内容固定显示那一天。
- **代码文件与 `--out` 目录要放在『浏览器』允许写文件的位置**（做法见『浏览器』）。代码长，存成文件传给它。
- **视口、主题、动效模式**取 `prod/index.md` 的 frontmatter，`[设置]` 的参数可覆盖；`prod/index.md` 缺视口或主题又没给参数，退出码 2，不猜。**语言**脚本管不到：浏览器先按 `locale` 打开页面（测量结果的 `env` 里是实际的 `navigator.language`，核一眼）。
- **不给截图带 `animations: 'disabled'`，不往页面注入关动画与过渡的样式**：它们会把有限次的 CSS 动画拨到结尾、当场触发结束事件，轮播就切走了。
- 拍之前**关掉开发服务器的调试浮层**（框架的开发工具条、错误浮层、热更新提示），否则它们被拍进每张图，换个环境对账时全是像素差。
- **几页一起扫时一页一页拍**：浏览器一次只开一个页面；每页的 `measure` / `attribute` / `shoot` 之间不穿插别页的。
- 图放进状态所在对象同目录的 `assets/`（`delta/` 里就是 `delta/` 里对应的位置）。

## 单屏状态

图叫 `<状态 id>.png`，尺寸等于主视口。

1. 装时间。完成：返回 `installed: true`。
2. 按状态的进入方式走到这个状态；要等界面变化用 `step` 拨小步。要停在瞬态（加载中）的，先拦住那条请求，再拨小步让这一屏画完。完成：「应看到什么」成立。
3. 跑 `screen` 打印的代码，不用先 `measure` / `attribute`。完成：返回 `shots` 里一张，`heightDrift` 为 0（不为 0 按下表）。

不知道页面高不高时，在这一屏上再跑一次 `cover`：返回的 `shot` 为空就是单屏状态，没有补拍图要拍；不为空按下一节。

## 比主视口高、不分段的状态

主视口图 `<状态 id>.png` 之外，首屏以下会连出边的组件按屏补拍：每屏一张图，叫 `<状态 id>@<这一屏第一条边的 id>.png`，几条边的组件在同一屏就共用这一张。主视口里放得下的组件不补拍。`cover` 读的是档案里这个状态的 `user` 边（`component` 对应的 `locate`），所以边要先写好。

1. 装时间。完成：返回 `installed: true`。
2. 按状态的进入方式走到这个状态，要等界面变化用 `step` 拨小步（同「单屏状态」第 2 步）。完成：「应看到什么」成立。
3. 跑 `screen` 拍主视口图。完成：`shots` 里一张。
4. 就在这一屏上跑 `cover`，`--out` 与 `screen` 同一个目录。它不重载页面、不拨页面时间，所以第 2 步走到的状态不会丢。完成：返回的 `unlocated` 为空，`shots` 每张的 `uncontrolled` 照下表处理。
   - `unlocated` 非空（`exit` 为 1）：多半是边的 `locate` 写错了，或组件改名了、页面上同名的有好几个。在页面的可访问性快照里找到现在的名字，改边的 `locate`，再跑 `cover`。
5. 按返回的 `shot`（`{ 边 id: 图名 }`）给每条边写上 `shot`；`shot` 里没有的边组件在主视口图里，不写。图放进 `assets/`。完成：`shot` 里的每条边都写好了，`design-archive-check.mjs` 退出码 0（规则 8，命令见 [check.md](check.md)）。

状态或它的边还只在 `delta/` 里（合并前归档、初扫的草稿）时，`cover` 带 `--delta <spec-slug>`：`prod/` 叠上 `docs/design/tmp/<spec-slug>/delta/` 一起读，`delta/` 里的状态和边优先，写法同 `measure` 的 `--delta`。不带它只读 `prod/`，状态不在 `prod/` 里时退出码 2。

## 长页面的入口状态

每段单独截一张，不拍整页长图，也不从长图里切；比视口高的段整张截下来。图叫 `<入口状态 id>@<段 id>.png`。

1. 装时间。完成：返回 `installed: true`。
2. 用『浏览器』打开入口状态（前置条件、登录态都在这一步备好），跑 `measure` 打印的代码。分段取自档案里这个入口状态（`--delta` 时取需求的 delta）；初扫时档案里还没有这个状态，用第二种形式，`--sections-file` 是 JSON 列表 `[{ "id": "hero", "locate": { … } }, …]`。完成：返回的 `clock` 是 `present`。
3. 存测量结果：代码的返回值只印在工具输出里，存不成文件；用『浏览器』里读页面变量的那一项，读 `window.__dsMeasure` 存成文件。边的 `locate.name`、分段标题的 `name` 照抄测量结果里每个标题、可点元素的完整名字（`name`），不用逐个试。完成：测量结果 JSON 在『浏览器』允许写的位置里。
4. `attribute <测量结果.json>`，输出存成文件。它给出每段的范围、每个可点元素归哪一段（照它给边填 `from`）、每个标题的完整名字与所在段（`headings`）。**写档案之前清零**：退出码 1 就照下表清零、重测。完成：退出码 0。
5. `shoot <归属结果.json> --out <目录>`（`shoot` 不收没通过的归属结果）。完成：每段一张图，`uncontrolled`、`heightDrift`、`note` 照下表处理；放进 `assets/`。
   - `--section` 只拍列出的几段，对账时用来只拍变了的那几段。
   - 浮层越出所在段（顶栏的下拉菜单比顶栏高）：先把浮层打开，再拍时带 `--include '{"role":"menu"}'`（或 `{"text": …}`、`{"selector": …}`）。
   - 内层容器在滚的页面（`scroller.kind` 是 `element`）：容器里的段只截容器的可见宽度，外壳顶栏、侧栏不进这些段的图；容器里吸顶的东西（表头）每屏都会出现。

## 段内交互的状态

图叫 `<段内状态 id>.png`，只拍那一段。

1. 页面时间要是 `time` 装好的。点出这个状态（照它的进入方式；要等界面变化用 `step`）。完成：「应看到什么」成立。
2. `measure <仓库根> <入口状态 id> --for <段内状态 id>`（档案里这个状态已写 `section` 就够；初扫时还没写，再给 `--section <段 id>`），存结果同上。**这一次不重载页面**（重载会丢掉刚点出来的状态），段的高度按此刻算（FAQ 展开后更高）。完成：返回的 `clock` 是 `present`。
3. `attribute`，清零同上。完成：退出码 0。
4. `shoot <归属结果.json> --out <目录>`。完成：一张图，放进 `assets/`。

## 滚动驱动的段

有的段钉在视口里随滚动换内容：每滚一次滚轮换一张卡片的原因段，按滚动位置逐条点亮批注的演示段。整段范围里只有第 1 步那一屏画在页面上，其余是留给滚动的空白，照常整段拍只得到「第 1 步加一大片空白」，后面几步档案里没有图。这类段每一步建成一个状态。

1. **检出**：长页面入口的 `attribute` 因为 `undeclaredScrollDriven` 退出码 1，该段列在里面（`scrollDriven` 逐段给出依据）。完成：`undeclaredScrollDriven` 里列出了要声明的段。
2. **声明**：这一段在分段声明里加 `scrollDriven: true`。完成：重测，`undeclaredScrollDriven` 空。
3. **建状态和边**：第 2 步起每一步一个状态，写 `section: <页面>#<段>`；结构相同的步骤只记第一个。边按页面怎么驱动它写：
   - 滚轮一下换一张：`user` 边，`action` 写「在钉住的这一段上向下滚一次滚轮」，`component` 与 `locate` 指这一段的组件和它的标题；
   - 按滚动位置切换：`system` 边，`trigger` 写「页面滚到这一段的第 n 步」，`how` 写滚到这一段的百分之几。
   
   段是照标题切的：介绍和钉住的内容在一个顶层分块里时，让钉住的内容有自己的标题定位（它的标题所在的位置就是这一段的起点），别把整块算成一段。完成：每个会变的步骤都有状态和边，`design-archive-check.mjs` 退出码 0（命令见 [check.md](check.md)）。
4. **第 1 步**：照长页面的 `shoot` 拍。声明了 `scrollDriven` 的段它只截钉住的那一屏（图高等于视口高，从 `scrollDriven[].pinTop` 起）；拍这一段前它会把页面重载回起点，点出来的状态会丢。完成：这一段的返回带 `scrollDriven: true`，图高等于视口高。
5. **后面每一步**：把页面带到这一步（滚到那个位置、转一下滚轮；要等界面变化用 `step`），跑 `pinned`。它不滚动、不拨页面时间，直接截当前视口，图叫 `<状态 id>.png`；返回形状同 `shoot`（带 `settled`、`uncontrolled`、`diffBox`，另有此刻的 `scrollY`）。别拿它拍单屏状态：`pinned` 拍的是页面此刻停在哪就是哪，单屏状态用 `screen`。完成：这一步的「应看到什么」成立，`shots` 里一张，`uncontrolled` 照下表处理；放进 `assets/`。

## 看到什么 → 做什么

`attribute` 退出码 1 的各个列表，写档案之前都要清零：

| 看到什么 | 做什么 |
|---|---|
| `orphans`（落空）：可点元素不在任何一段里 | 补一段（最差补一段 `content`）、改定位，或把两段并成一段，重测。banner / contentinfo 里的可点元素按 DOM 包含归顶栏 / 页脚段，没声明这两段就落空 |
| `notFound`（定位失败）：段找不到 | 在页面的可访问性快照里找到现在的标题，改 `locate`，重测（多半是标题改名了） |
| `outOfOrder`（顺序不对）：段在页面上的先后跟 `sections` 的顺序对不上 | 把 `sections` 按页面从上到下排，或改定位，重测 |
| `overlaps`（重叠）：两段的范围有共同的行 | 多半是 `position` 定位的分块里还有另一段的标题；改定位或并成一段，重测。浮在内容顶上的固定顶栏不算重叠 |
| `undeclaredScrollDriven` | 照「滚动驱动的段」补声明和段内状态，重测 |

其余输出：

| 看到什么 | 做什么 |
|---|---|
| `declaredNotDetected` | 只提示：钉住的方式测量认不出来时，按声明拍 |
| `coverage` 的 `gaps`（各段之间、页顶页底的空隙）里有要存档的内容（`<main>` 之外、非 landmark 的内容补分段也盖不住） | 在状态文件的描述里用文字写明 |
| `byRole: false` 的元素，`attribute` 列在 `roleUnresolved`（原生折叠标题 `<summary>` 一类） | 它的边写 `locate: { text: <完整文字> }` |
| `scroller.others` 不空 | 页面上还有第二个窗格自己在滚，它超出可见区的内容拍不到；在状态文件的描述里用文字写明 |
| `uncontrolled: true`（带 `diffBox`：两张有差异的像素的外接框，图自己的像素坐标） | 这一段里有页面时间管不到的东西在动（视频、WebGL、Worker 里按真实时间算的内容、网络推送）。状态文件「这一屏」里写明「这一段有页面时间管不到的动态内容：<是什么，看 `diffBox`>，截图是某一刻」；对账按「应看到什么」逐条核，不按像素判 |
| `heightDrift` 不是 0 | 页面自己在变高变矮（打字机文案、慢到的内容），图可能整体错位。长页面：重新 `measure` 再拍；单屏状态：页面其实比主视口高，不分段的照「比主视口高、不分段的状态」补拍；入口状态是营销页那种结构化长页面的，才改成声明分段 |
| `clock` 是「装晚了」 | 页面时间没装过，早先起的计时器和 CSS 动画在真实时间里走，图可能拍到别的状态。从入口重来：重新打开入口、`time`、再点出这个状态 |
| 一张图的返回带 `note`（这一段伸进了滚动容器） | 不是图拍坏了：这一段要在容器顶切成两段，见下 |

## 已知限制

碰到时换做法：

- **一段不要跨过滚动容器的顶边**（外壳顶栏在容器外，不随容器滚）：在容器顶切成两段，容器外一段、容器里一段。
- **长文章侧边随滚动变的阅读进度或「当前章节」标签**会让那一段被认成滚动驱动：声明之后这一段只拍钉住的那一屏，段里其余内容档案里没有图（没有「这一段不是滚动驱动」的声明）。在状态文件「这一屏」里用文字写明整段的内容。
- **一段高过约 16000px**（浏览器单张截图的上限）：拆成两段。
- 两个窗格各自滚动的页面只认可见面积最大的一个（另一个见上表 `scroller.others`）；横向滚动不管。
