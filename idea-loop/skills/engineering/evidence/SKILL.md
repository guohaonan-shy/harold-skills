---
name: evidence
description: 要人判断的行为怎么做成一眼能判断的素材：截图、截图流程、动图、时序图。做人验素材或给 review 配图时用。
---

# 交付证据——人验素材与 review 配图

人审一次交付，要判断的是「它做出来的样子和走法对不对」。一段文字描述让人没法判断，让人自己起服务、搭场景去看，又往往会一直拖着不看。所以凡是要人判断的，都做成**一眼能判断的素材**交给人，并跟着 PR 交付。

`implement` 的执行方（`agents/implementer.md`）做人验素材时读这份文件，`pr-review` 的审查者（`agents/pr-reviewer.md`）给 spec 问题配图时也读它。两边用的是同一套做法。

## 1 它不是知识库的一部分

按**合并之后还有没有用**分：

| | 例子 | 去处 |
|---|---|---|
| **知识库** | raw 讨论的复现截图、spec 的图（`../to-spec/references/spec-figures.md`）、冻结画布与它的交互图 | git，`docs/` 下 |
| **交付证据**（本文件） | 工单的人验流程图与动图、review 给问题配的图 | **不进代码分支、不进 `docs/`**，放在每个 PR 一条的素材分支上，合并即删 |

交付证据只服务于「这次交付对不对」，人的结论会以文字写回工单和 spec，图本身用完即弃。真遇到值得长期保留的一张（比如某个关键动效的定稿），就显式复制进 `docs/` 对应的位置，这属于少数情况，不是默认做法。

**不写进 `docs/raw/<topic>/assets/`，也不写进工单。** 工单在 git 里，引用一张不在 git 里的图，链接一定会坏。

## 2 放哪、怎么上传、什么时候删

- **做的时候**：`<worktree 根>/.tmp/implement/<spec-slug>/evidence/`（工单素材）或 `.tmp/pr-review/<PR 号>/evidence/`（review 配图），约定见 `../wiki-conventions/SKILL.md` §2.1。截图原图、帧序列、拼图用的 JSON 都在这里。
- **上传**：每个 PR 一条**素材分支** `idea-loop-evidence-pr-<N>`：孤儿分支，跟代码没有共同历史，从不合并。脚本用 gh 当前登录的账号、经 GitHub 的 git 数据接口直接写，不碰本地工作区（bot 的 GitHub App 仍然不需要 Contents 写权限）；分支里没有 `.github/workflows`，推上去不会触发 CI。私有仓库里只有协作者看得见。

  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" publish <owner/repo> <PR 号> <文件>...
  ```

  输出每个文件名对应的地址，形如 `https://github.com/<owner>/<repo>/blob/idea-loop-evidence-pr-<N>/<文件名>?raw=true`，PR 描述里的之前 → 之后对照、合并时归档进 PR 的汇报，都用它做图片地址：`![图说](<地址>)`。过程中的汇报不用上传：图写本地路径，在会话里用发送文件的工具发给人（聊天界面加载不了私有仓库的图），归档时由 `review-loop.mjs archive` 统一上传、换成地址（`../pr-review/references/review-loop.md` §4）。文件名必须以归属开头：工单素材用 `tNN-`（`t03-flow-sentence-failed.png`），review 第 N 轮的图用 `rN-`（`r2-spec-1-quota.png`）。分支里的文件是平铺的，不带归属就会互相覆盖，脚本会拒收。同名再传会替换原文件，地址不变，所以重录一张动图不用改已经贴出去的地址。单个文件不超过 10MB。
- **点开能看大图**：GitHub 会给评论里的每张图包一层指向图片地址本身的链接。`blob/…?raw=true` 跳到 `raw.githubusercontent.com`，返回的是 `image/png`，浏览器直接显示原图、能放大。0.0.15 及以前用的 draft release 附件做不到：附件地址返回 `content-disposition: attachment`，点图就变成下载。宽的流程图、时序图在评论里会被缩小，所以这一点不能省。
- **删除**：PR 合并或关闭后跑 `evidence.mjs cleanup <owner/repo> <PR 号>`，时机与 `to-ticket` §7 删工单相同。它删掉素材分支，顺带删掉旧版留下的同名 draft release。漏网的由 `dreaming` 扫：PR 已经 MERGED 或 CLOSED，`idea-loop-evidence-pr-<N>` 分支（或旧版的 release）却还在。

## 3 三种形态，按要人判断的东西选

| 要人判断的 | 形态 | 怎么做 |
|---|---|---|
| **流程**：用户这样走，界面这样变，对不对 | 流程图：真实截图 + 光圈（点击处）+ 箭头上的触发条件 + 每帧下一句状态 | `scripts/flow-compose.mjs`，构图规则同 `../to-spec/references/spec-figures.md` 的「交互图」 |
| **动效**：动起来是什么样 | 动图 | §4 |
| **静态样式**：悬停、按下、窄屏 | 并排截图（静止 / 悬停，或宽 / 窄） | 也用 `flow-compose.mjs`：一行，`connected: false`，`label` 写「同一元素 · 静止 / 悬停」 |

review 给 spec 问题做证据、PR 描述拍「之前 → 之后」时，**界面上看得到的一律用上面三种截图**，表格和时序图只作补充；界面上看不到的，按「最快能让人看懂」选（`../pr-review/references/pr-description.md` §5「证据」、§6）：后端的先后与等待多半用 excalidrawer `sequence`（main 和本分支并排），也可以是一张小表或一行例子。PR 描述的对照图文件名以 `pr-` 开头。

### 和 spec 的图有一处不同：截图取自实现

`../to-spec/references/spec-figures.md`「交互图」里的设计图取自冻结画布，因为当时还没有实现。交付证据要判断的是**实现**，所以截图一律取自实现本身：本地起的真实页面，或开发状态页（dev harness）上挂着的真实组件。**不取画布，也不重画。** 节奏靠网络拦截控制：慢下载用 `page.route` 先等再 `continue`，失败用 `route.fulfill({ status: 500 })` 或 `route.abort()`。

其余沿用 spec 的规则：只截那个组件（连同它弹出的浮层），2 倍像素密度，用 spec 的主语言，手机宽度默认 390。

### 叠加层要说明

录制时为了让人看懂而叠上去的东西，比如**光圈或蓝点（鼠标位置）、角落的秒表（从某个事件开始计时）**，都不属于产品。这些要在这一组素材的开头用一句话说明，避免人把它们当成要验收的 UI。

## 4 动图

1. **录**：Playwright 打开页面，注入一个叠加层（鼠标位置点，需要计时就加一个秒表），然后按步骤操作。录法二选一：
   - **帧序列**：对组件循环截图，每张记下时间戳。截得到的就是看到的，最稳。
   - **录屏**：context 开 `recordVideo`，录完用 ffmpeg 裁出组件所在区域。帧序列截不住的快速过渡用这种。
2. **转**：ffmpeg 两遍调色板，控制体积：

   ```
   ffmpeg -y -framerate <帧率> -i frames/%04d.png -vf "fps=12,scale=<宽>:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" t03-<slug>.gif
   ```

   帧率按时间戳算（帧数 ÷ 时长），不要拍脑袋，否则「停留 5 秒」在动图里就不是 5 秒。超过 10MB 就裁短、降到 8–10fps，或者缩小宽度。
3. **一个动图只讲一件事**：「气泡进场、停留 5 秒、退场」是一个，「悬停时暂停计时」是另一个。动效里有 `prefers-reduced-motion` 分支的，正常和减弱各录一个，并排放。

## 5 每一项长这样

```markdown
- [ ] 气泡进场、停留 5 秒、退场；点完鼠标还停在按钮上也照常 5 秒消失

  ![气泡停留 5 秒](https://github.com/<owner>/<repo>/blob/idea-loop-evidence-pr-<N>/t03-sentence-fail-dwell.gif?raw=true)
```

- **复选框 + 一句「看什么」+ 素材。** 「看什么」写的是判断标准，不写操作步骤。人看完觉得对就勾上，不对就在下面回一句。
- 按形态分组：流程、动效、样式。
- 只放**脚本判不了、要人判断**的东西。逐格比对已经全绿的静态格不放，放了只会稀释人的注意力。

## 6 做素材本身就是一道验证

录素材要真的把路径走一遍，常常会走出单测和逐格比对都没抓到的问题。比如：点完按钮鼠标还停在上面，失败提示的计时被当成「悬停」一直暂停，提示永远不消失。

所以**录的过程中看到的行为和验收标准对不上，那是 bug，不是人验项**：执行方当场修、补回归测试，然后重录。只有「行为符合验收标准，但好不好看、顺不顺要人判断」的，才进人验清单。
