# review loop 文件：Review 汇报的存档

一个 PR 从开出来到合并，要人决定的事都在**会话**里进行（怎么给人看见 `../SKILL.md` 的「在会话里给人看」）：汇报给人看，人回复批示，编排者照做、回一条汇总。同样的内容逐字记进本地一份文件，合并时按条目贴进 PR 作为记录，然后删掉。汇报的格式在 [`review-report.md`](review-report.md)，这里只管这份文件。

## 一个 PR 一份文件

```
<worktree 根>/.tmp/review-loop/<PR 号>.md
```

```markdown
# PR #<N> 的 review loop

<!-- idea-loop-entry {"kind":"review","round":1,"from":"impl"} -->
## 来自实现中 · 第 1 次 · 落地 3 张，等你决定 1 件
<汇报，和会话里给人看的一字不差>

### 你的批示（<时间>）
> <人的原话，逐字>

### 做了什么
- <逐点：做了什么，带提交链接；没做的说为什么>

<!-- idea-loop-entry {"kind":"review","round":1} -->
## 来自 review · 第 1 轮
……
```

- **一份汇报一个条目**，按时间顺序往下加，前面的不改。标记的 `kind` 都是 `review`；`from` 写 `impl` 的是实现中的汇报，不写的是 review 轮次，两边各自从 1 数。轮次用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/review-loop.mjs" next <文件> review [impl]` 取。合并前的设计归档也记一个 `from: impl` 的条目（核不过的结论，或给人过目的草稿，加人的批示）。
- **旧文件照样认得**：已经写下的 `{"kind":"pause",…}` 条目当作实现中的汇报，它们旧的决定标题、条目里加粗的旧标记也认；新条目统一用「要你决定」这一节标题。
- **夜间回放的结果是 `replay` 条目**（标记 `{"kind":"replay","round":N}`），由夜间 runner 追加，不是编排者写的，轮次自己数。全过的条目末尾已有「做了什么」，算处理完；有没过的用例，条目带「要你决定」，列在 `check` 的未处理里，等人批示、处理后才算完。归档时标题写「规则回放第 N 次」。
- **人的原话逐字记**，不改写、不摘要。人在一个条目上来回说了几次，就有几组「你的批示 / 做了什么」。
- **照规则处理的条目也在这里**：「已按规则处理」连同链接一起记在条目里。人说「推翻 C1」，就是这个条目里多一组「你的批示 / 做了什么」，原话逐字记；下一轮的审查者读到它，不再按同一依据自动处理那条。没有任何要你决定的事时，修复都落地、推送之后，条目末尾记一节「做了什么」，这一份就算处理完（`review-loop.mjs check` 认这种条目；什么时候不等人，见 `idea-loop:implement` 的「没活了就停下」）。
- **它是这个 loop 的记忆**：会话被压缩、关掉重开、换一个会话接手，先读这份文件，就知道每份汇报说了什么、人怎么批的、做到了哪一步。它活到合并归档之后才删，进行中的条目只在这里，不提前贴到 PR。
- 图写本地路径（指向 `.tmp/` 下的证据目录，相对这份文件），归档时才上传。

## 归档进 PR

合并时由 `idea-loop:pr-review` 跑：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/review-loop.mjs" archive <文件> <owner/repo> <PR 号>
```

每个条目贴成 PR 上的一条普通评论，开头标明「这是记录，往来在会话里进行」。条目里引用的本地图上传到这个 PR 的素材分支（`idea-loop:evidence` 的交付证据），地址换成点开能看原图的链接。已经贴过的条目不再贴，中途失败可以直接重跑。

归档的评论以项目 bot 的身份发：仓库在 `~/.idea-loop/github-apps.json` 里配了 GitHub App（通常叫 `<project>-claude`）时，用它的安装令牌，令牌只活在脚本进程里，不打印、不写盘、不交给 agent；没配时借用 gh 当前登录的账号，每条开头写明「由 Claude 代发，不是本人所写」。**不以人的身份说话。**

```json
{ "<owner>/<repo>": { "appId": 123456, "privateKeyPath": "~/.idea-loop/keys/<app-name>.pem" } }
```

App 要的权限：Pull requests 写（发评论）、Contents 读。**不给 Contents 写。**
