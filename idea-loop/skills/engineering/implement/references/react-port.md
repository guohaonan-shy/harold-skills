# React 移植清单：从冻结画布到真组件

目标项目是 React / Tailwind 时，在 [`ui-tickets.md`](ui-tickets.md) 之外再读这份。两桶分类、数据契约、token 归因、按状态归属找组件这些通用规则在那份里；这里只补把冻结画布（`docs/design/tmp/<spec-slug>/canvas/*.html`）翻成 React/TSX 时真正会出错的几处。项目的 `DESIGN.md` 照样适用：Tailwind 翻译悄悄偏离了它的 token，就是回归，不是细节。下面例子里的类名、字段名都是举例。

## 先查先例，再信一个 utility 存在

每条画布 CSS 都要找 Tailwind 对应，但先 grep 代码库确认这个 utility 在这里用过。例：画布的 `-webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;` 换成 `line-clamp-2`，是在 `grep -rn "line-clamp" src/` 确认别处已经在用之后。没有对应 utility 的一次性值用任意值（`text-[15px]`），只有真会复用的才考虑新的全局类。

## 像素值对不上 Tailwind 的刻度，靠截图验

画布能写任意 px，Tailwind 的刻度是离散的（`text-sm`=14px、`text-base`=16px，间距约 4px 一档）。有时正好对上（16px/600 → `text-base font-semibold`），有时只能取最近的一档（`margin-top: 9px` → `mt-2` = 8px）。近似对不对，只能对**真实渲染的 React 页面**重新截图来判断，不能只比两个数字或类名就宣布「和画布一致」。

## 新数据要追到源头

画布里多出来的内容在真实数据流里还不存在时，直接写 JSX 会让之前的每一行都渲染成 `undefined`。判别：画布 `<script>` 里手写的 mock 数据，是不是有一个真实管线里还没有的字段？是，就先把字段追到源头再写 JSX。

例（给一条内容加一行由模型生成的摘要说明）：依次改了后端抽取 schema 加必填字段 → 生成 prompt 加这个字段的语气与长度要求 → 自检 prompt 的清单 → 抽取 prompt 把 markdown 映射进字段 → i18n 重新本地化的闸门和翻译调用 → markdown 清理 → 前端 TypeScript 类型 → 项目里冻结的契约文档，**最后**才是 React JSX。

验证也走真实数据：真跑一遍提交流程，直接查数据库里生成的那一行，确认模型产出的值真落了地、真满足长度与语气要求，然后才拿这一行去截 React 页面。画布的 mock 文字是为好看写的，证明不了真东西能用。

## 命令式 JS 换成 React 的声明式状态

决定打开哪个文件之前，先 grep 相关的 `useState` 看状态归谁（`ui-tickets.md` 的「按状态归属找组件」）：视觉上嵌在某块里的改动，可能属于父组件的 JSX。

画布通常手动重渲染：一个函数改 `textContent`、重建 `innerHTML`，靠 `addEventListener` 委托接线。React 里同样的行为就是 JSX 直接读状态（`{value}`），没有重渲染函数。交互逻辑在之前的 React 版本里已经接对了的话，纯样式移植需要的新 JS / 状态是**零**：只为模仿画布重渲染机制而加的 `useEffect` 或 handler 都不该有。

## 画布有几份副本，就保持同步

项目里同一份画布有不止一份（比如 worktree 里一份、主 checkout 里一份还没提交，由两个本地端口分别提供）时，每次改完 `diff` 一下并同步。从人收藏的那个端口悄悄提供一份过期的副本，是真实出现过的失败。之前同步过，不代表跨会话还同步着。

## 在同样的断点上验真页面，用不会说谎的信号

对**真实渲染的 React 页面**（不是再看一遍画布）重跑画布过过的响应式检查：桌面 1440，移动 390 / 360。截图会把溢出裁掉，优先用这个信号：

```js
document.documentElement.scrollWidth > document.documentElement.clientWidth
```

它抓到过一次真实回归：把两个 flex 子元素包进一个没有 `flex-wrap` / `max-width: 100%` 的容器，桌面截图正常，390px 下溢出了视口。状态驱动的值（比如切换当前 tab）也要确认在交互后真的更新了新移植的元素，不只是首次渲染。

## 完成条件

每条改动的 CSS 规则都分了桶、正确地翻译或复用了；新数据（如果有）追到了真实的契约变更，并用一行新生成的真实数据验过；改动落在真正持有相关状态的组件里，没有多余的 JS；画布副本（如果有多份）重新同步；真页面在 1440 + 390 / 360 下过了 `scrollWidth` / `clientWidth` 检查，并重新截了图。
