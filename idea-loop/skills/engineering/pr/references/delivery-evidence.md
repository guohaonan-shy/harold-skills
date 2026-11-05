# 交付证据：放哪、怎么上传、人验清单

`idea-loop:implement` 的执行方做人验素材、`idea-loop:pr-review` 的审查者给问题配图、PR 描述拍「之前 → 之后」时用这份。图怎么做（UI 标注、UI flow、图表、动图）照 `idea-loop:evidence`，交付证据的截图一律取自实现：本地起的真实页面，或开发状态页（dev harness，开发环境里单独挂组件的页面）上挂着的真实组件。

交付证据只服务于「这次交付对不对」，人的结论以文字写回工单和 spec，图用完即弃：不进代码分支、不进 `docs/`，也不写进工单（工单在 git 里，引用一张不在 git 里的图，链接一定会坏）。真遇到值得长期保留的一张，显式复制进 `docs/` 对应的位置。

## 放哪、怎么上传、什么时候删

- **做的时候**：`<worktree 根>/.tmp/implement/<spec-slug>/evidence/`（工单素材）或 `.tmp/pr-review/<PR 号>/evidence/`（review 配图），约定见 `idea-loop:wiki-conventions` 的「中间产物」。截图原图、帧序列、拼图用的 JSON 都在这里。
- **上传**：每个 PR 一条**素材分支** `idea-loop-evidence-pr-<N>`：孤儿分支，跟代码没有共同历史，从不合并。脚本用 gh 当前登录的账号、经 GitHub 的 git 数据接口直接写，本地工作区不动；分支里没有 `.github/workflows`，推上去不会触发 CI。私有仓库里只有协作者看得见。

  ```
  node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" publish <owner/repo> <PR 号> <文件>...
  ```

  输出每个文件名对应的地址，形如 `https://github.com/<owner>/<repo>/blob/idea-loop-evidence-pr-<N>/<文件名>?raw=true`，PR 描述里的之前 → 之后对照、合并时归档进 PR 的汇报，都用它做图片地址：`![图说](<地址>)`。过程中的汇报不用上传：图写本地路径，在会话里用发送文件的工具发给人（聊天界面加载不了私有仓库的图），归档时由 `review-loop.mjs archive` 统一上传、换成地址。文件名以归属开头：工单素材用 `tNN-`（`t03-flow-sentence-failed.png`），review 第 N 轮的图用 `rN-`（`r2-spec-1-quota.png`），PR 描述的对照图用 `pr-`。分支里的文件是平铺的，不带归属就会互相覆盖，脚本会拒收。同名再传会替换原文件，地址不变，所以重录一张动图不用改已经贴出去的地址。单个文件不超过 10MB。
- **点开能看大图**：图片地址用上面那种 `blob/…?raw=true`：GitHub 给评论里的图包的链接会跳到 `raw.githubusercontent.com`，浏览器直接显示原图、能放大。宽的流程图、时序图在评论里会被缩小，全靠这一点看清。
- **删除**：PR 合并或关闭后跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" cleanup <owner/repo> <PR 号>`，时机与 `idea-loop:to-ticket` 删工单相同。它删掉素材分支，顺带删掉旧版留下的同名 draft release。漏网的由 `/idea-loop:dreaming` 扫：PR 已经 MERGED 或 CLOSED，`idea-loop-evidence-pr-<N>` 分支（或旧版的 release）却还在。

## 人验清单每一项长这样

```markdown
- [ ] 气泡进场、停留 5 秒、退场；点完鼠标还停在按钮上也照常 5 秒消失

  ![气泡停留 5 秒](https://github.com/<owner>/<repo>/blob/idea-loop-evidence-pr-<N>/t03-sentence-fail-dwell.gif?raw=true)
```

- **复选框 + 一句「看什么」+ 素材。** 「看什么」写的是判断标准，不写操作步骤。人看完觉得对就勾上，不对就在下面回一句。
- 按形态分组：流程、动效、样式。
- 只放**脚本判不了、要人判断**的东西。逐格比对已经全绿的静态格不放：放了只会稀释人的注意力。

## 做素材本身就是一道验证

录素材要真的把路径走一遍，常常会走出单测和逐格比对都没抓到的问题。比如：点完按钮鼠标还停在上面，失败提示的计时被当成「悬停」一直暂停，提示永远不消失。

所以**录的过程中看到的行为和验收标准对不上，那是 bug，不是人验项**：执行方当场修、补回归测试，然后重录。只有「行为符合验收标准，但好不好看、顺不顺要人判断」的，才进人验清单。
