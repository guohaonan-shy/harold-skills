# 01 — 页面时间从加载前就停住：拍几次都是同一张，点出来的状态不被轮播切走

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

背景：idea-loop 的设计档案给长页面按段拍图（分段脚本：`measure` → `attribute` → `shoot`，脚本打印一段 Playwright 代码，agent 交给无头浏览器跑；写法见 design-archive skill 的「长页面的分段」参考）。现在的拍法是：测量时装一个页面时钟并重载，拍每段前等内容稳定，再临时冻结页面时钟截图。问题有两个：

- 冻结的时刻是「拍到这一段的那一刻」，离页面加载过了多久每次不同（测量和拍图是两次工具调用，中间隔着 agent 的思考时间）。脚本动画、自动轮播每次停在不同的一刻，页面没改，对账却超出 1% 容差、误报「画面变了」。
- 点出来的段内状态（点了第二个功能标签）在测量和拍图滚动页面时，鼠标离开、轮播恢复，拍到的是别的标签。营销站上的标签是 CSS 进度线动画播完（`animationend`）才切换，页面时钟根本管不到；截图时的 `animations: 'disabled'` 还会把进度线直接拨到结尾，当场切走。

这张工单之后：

1. **新子命令「装时间」**：打印一段代码，agent 在 `browser_navigate` 到入口之后、做任何交互之前跑它。代码做的事：设视口与配色 → 浏览器上下文装上页面时钟、停在一个固定的起点（常量）→ 用 Chromium DevTools 协议把文档的 CSS 动画时间线播放速率设成 0（`Animation.enable` 后 `Animation.setPlaybackRate`，新起的动画和过渡也不走）→ 重载 → 按固定步长拨一段让页面起来。返回里说明装好了、起点是多少。
2. **「拨一步」= 两条时间一起拨**：页面时钟往前走 N 毫秒，同时把每个 frame 里每个还没播完的动画的当前时间加 N。动画因此正常播到结尾、正常触发结束事件，只是发生在固定的页面时间。另提供一个子命令打印「拨 N 毫秒」的代码，给 agent 在交互之后等界面变化时用。
3. **`measure`**：已经装过时间的页面不再装、不再重载；没装过的照旧自己装（入口状态重载；`--for` 的段内状态装不上，返回里说「装晚了」）。整页滚一遍、等页面高度不变、回顶这些步骤里原来等真实时间的地方，改成「拨固定步长、再看」，步长和次数是常量，每次运行一样。等网络空闲、等字体照旧等真实时间（它们不归页面时钟管）。`--for` 时开头固定拨一小步让界面画完，之后不再拨。
4. **`shoot`**：不拨时间，不再「冻结 → 截 → 恢复」，截图不带 `animations: 'disabled'`。每张拍完，在时间不拨的前提下隔 500ms 真实时间再截一张比一比：不同就说明有页面时间管不到的东西在动（视频、WebGL、网络推送），这张标 `uncontrolled: true` 并给出两张有差异的区域（一个框）。`stable` 字段去掉，换成 `uncontrolled`；`settled` 留着做诊断。
5. **文档同步**：design-archive skill 的「长页面的分段」参考（拍图一节的步骤、返回字段、已知限制）、ui-reviewer agent 定义（归档模式与对账模式里拍分段的步骤；对账模式里「`stable` 不是 `true` 的段先再拍一次」改成：`uncontrolled` 的段容差外时按「应看到什么」逐条核，都成立判「一致」并在交回里注明这一段没按像素比、为什么）、dreaming 的初扫参考（「`stable` 不是 `true` 注明截图是某一刻」改成 `uncontrolled` 的段在状态文件「这一屏」里写明「这一段有页面时间管不到的动态内容：<是什么>，截图是某一刻」）。所有给 agent 照抄的命令行都要先「装时间」。插件 README 里脚本那几行说明、插件版本号照仓库惯例同步。

原型（spec 目录里引用的 `proto-css.mjs`）的做法，只留决定：

```js
await context.clock.install({ time: T0 });          // T0 固定
await context.clock.pauseAt(T0 + 1000);
await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 });
await page.goto(url);
step(ms) = page.clock.runFor(ms) + 每个 frame 里 document.getAnimations() 未播完的 currentTime += ms
for (每半个视口) { 滚到这里; step(200) }   回顶; step(1000)
// 之后拍图不再 step；截图不带 animations: 'disabled'
```

夹具上验证过：两次运行隔 1 秒和 4.3 秒，脚本动画、计时器轮播、CSS 进度线轮播、点出来的两种标签，图都一样，点出来的标签都拍对。

## 验收标准

- [ ] 浏览器测试（有 Chromium 才跑的那组）的夹具页加三段：iframe 里 `setTimeout` / `requestAnimationFrame` 驱动的循环动画、每 2 秒 `setInterval` 切换且悬停暂停的标签、CSS 进度线播完（`animationend`）切换且悬停暂停的标签
- [ ] 装时间 → 测量 → 拍图跑两遍，两遍中测量与拍图之间隔不同的真实时间（例如 1 秒和 4 秒），这三段两遍的图用 `ui-png-compare` 比都在容差内；改动前同一条测试是红的
- [ ] 装时间之后点两种标签的第二个，`measure --for` 再 `shoot`，期间鼠标移开、页面滚动：两张图里选中的都是第二个标签
- [ ] 夹具加一段页面时间管不到的动态内容（循环播放的 `<video>`，或 Worker 里按真实时间改的像素）：拍图只有这一段 `uncontrolled: true`、带差异区域，其余段 `false`
- [ ] 没先装时间就跑 `measure --for`：返回里说装晚了
- [ ] 文档里出现的每条分段脚本命令行都过得了命令行的选项检查（已有的文档绊线测试，新子命令也要出现在文档里）
- [ ] 全量测试通过；原有测试里断言 `stable` 的改成新语义，其余期望不改
- [ ] 手动：在 TOEFLAIR 营销站开发环境的 /interview 上，装时间 → 测量 → 拍图两次，除被标出的段外两次逐段在容差内；点第二个功能标签拍出来是第二个（做不了就写 `⏭ 延后 → 人验`）

## 选中的存量回归

- 浏览器测试里「the page clock is frozen for the shot」：它断言的「冻结后两张一样、之后时间恢复」正是这张要改的语义，按新语义重写
- 浏览器测试里「one picture per section, each as tall as its range」「a bar pinned to the top of the screen does not cover」「--include widens a section's shot」：拍图代码改了，这几条守住尺寸、遮挡、浮层不回退
- 浏览器测试里「a fixed one belongs to where it showed up」：测量的整页滚动从等真实时间改成拨页面时间，固定目录淡入的归属最容易受影响
- 内层容器滚动（#68 合进来的）相关的浏览器测试：测量与拍图的滚动步骤改了，内层滚动的页面不能回退
- 分段脚本的文档绊线测试：新子命令和改了的命令行都要过
