# 合并

人在会话里明确说合并时才走这份，唯一的例外是满足 [`seo-auto-merge.md`](seo-auto-merge.md) 全部条件的 SEO 内容 PR（不等人说，自动走）。没有 mergeReady 判定：其余情况人看过审核报告（PR 描述）和最新一轮的汇报，自己决定。`review-loop`、设计产物的意思同 [`../SKILL.md`](../SKILL.md)。

**合并时不再等 CI**：CI 在交审核报告之前已经绿（[`deliver.md`](deliver.md)）。**工单、设计档案都在代码 PR 合并成功之后才动**（第 5 步）：合并没成，home 里什么都不变。

## 合并

1. `review-loop check .tmp/review-loop/<PR 号>.md` 列出没处理完的条目，再看 PR 描述「要你做的事」还有没有没勾的；有未处理的条目或没勾的就提醒人一句，人仍然说合并就继续。
2. **有设计产物就先过「合并前归档」**：只写 `delta/`、跑归档校验，不写 `prod/`；走完再到第 3 步，没有就直接第 3 步。冻结时 `commit` 到 home 的画布和冻结记录就在 `tmp/<spec-slug>/` 里。**归档是合并步骤里的一步，没有任何钩子替你拦**：已知缺口是在网页上点合并、或在别的会话里合并会绕过第 5 步，由每周的 `/idea-loop:dreaming` 的「漏归档」兜底；所以合并统一在 issue 会话里做。只有调研目录的需求不归档：调研页随 `tmp/` 的生命周期删，想早点清就手动删；用进设计的调研结论已经写在方向说明或冻结记录里，随设计一起归档。
3. **归档 review loop**：`review-loop archive .tmp/review-loop/<PR 号>.md <owner/repo> <PR 号>`，每份汇报各贴成 PR 上的一条评论，引用的本地图同时上传、换成链接（`idea-loop:pr` 的「review loop 文件」）。中途失败直接重跑，贴过的不会重复。
4. **逐个合并**：每个 PR 各 `gh pr merge <PR 号> --<合并方式>`（几个仓库的各用 `--repo <owner/repo>`），合并方式取各自仓库 `DEVELOPMENT.md` 的「分支」节。先合哪个，spec 里写了顺序的照它，没写的按 PR 清单的顺序，主 PR 最后。一个合并失败就停下告诉人，已合并的不撤。
5. **全部合并成功后做知识库收尾**：下面的「合并后归档并删工单」。一个 PR 合并失败就停下，这一步不做。
6. **翻 done**：最后一个 PR 合并后，`node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" set <docs> done <号>`（`<docs>` 指主 worktree 的 `docs/`；Linear 上集成推 Done，不手翻）。它核「挂着的 PR 全部合并」，不过就照它说的原因处理；漏翻了，`issues reconcile <docs>` 会补。spec 随它覆盖的 issue 全部关闭而了结，不改 spec 自己。
7. **有上线自查的网址就做「上线后自查」**：`type:seo/*` 的 issue，且主 PR 描述有「上线自查的网址」一节：下面的「上线后自查」，人说合并和自动合并两条路都走；它要等上线，起成后台命令后不干等，接着做第 8 步，结果回来再按里面的四种结局处理。没有这一节（人合并的 SEO PR 可能没写）就跳过，在会话里告诉人这次没做上线自查，因为没有网址。其余 issue 直接第 8 步。
8. 做「合并后的清理」。

## 合并前归档

把这次 UI 改动的设计差异，经实现核过、经人看过，才并进线上档案 `prod/`。差异 `delta/` 由 ui-reviewer 在这里对着最终画布和实现整份写出，review 看的就是它；这一节**只写 `delta/` 和校验，不写 `prod/`**：`prod/` 要等代码 PR 合并成功（「合并后归档并删工单」）。**写 `prod/` 只有归档脚本一条路，人没批过不跑。** 每个有设计产物的 spec 各做一遍：

1. **起 UI 审查（归档模式）**：用 Agent 工具起 `idea-loop:ui-reviewer`，只给指针：spec 名、集成 worktree 的绝对路径、分到的端口、模式「归档」、图的前缀 `r<最近一轮的轮次>-ui-merge-`、草稿存放处 `.tmp/pr-review/<PR 号>/archive/`，和这个 PR 的 review loop 文件 `.tmp/review-loop/<PR 号>.md`（它从里面取人的批示写进「决定」）。
2. **看它核得过不过**：
   - **不通过**（`status: failed`，什么都没写）：把它交回的 `failed.json` 里的条目，按 `idea-loop:pr` 的「Review 汇报」的「要你决定」格式记成 review loop 的一条新条目（轮次取 `review-loop next … review impl`，标记带 `"from":"impl"`，标题「来自实现 · 第 N 次 · 归档被拦下，核不过」），在会话里给人看，每条的图跟在文字后面。**不合并**，等人批示（改实现 / 接受实现，走设计变更 / 不修）。人批示要改（不论改实现还是设计变更），照 [`deliver.md`](deliver.md) 的「报告之后人提了要改的」和 SKILL.md 的「处理条目」处理。处理完人再说合并，从「合并」第 1 步重来。
   - **未完成**（服务起不来、页面打不开）：照实告诉人缺什么，**不合并、不归档**，不当成通过。
   - **通过**：往下。
3. **在会话里给人看草稿**：把 `draft.md` 作为新条目记进 review loop 文件（`review` 类、`from` 写 `impl`，标题「来自实现 · 第 N 次 · 归档设计档案，等你过目草稿」），按条目一段一段贴，截图和动图跟在对应那条的文字后面，发推送通知。人要改，就把批示原话（记进「你的批示」）用 SendMessage 转回**同一个** ui-reviewer，它改完交回再贴，直到人说通过。
4. **人通过后只校验**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <项目目录> <spec-slug> --dry-run`。退出码 1 是拒绝：把它列的违规或冲突回到 review loop 按「归档被拦下」处理（第 2 步「不通过」那一支），**不合并**。退出码 0 之后，输出里提示的缺失项（`.gitattributes` 没管素材、`prod/index.md` 没定视口 / 主题 / 语言）如实告诉人：脚本不改它们，补不补由人定。然后回到「合并」第 3 步。

第 2、3 步的条目就是这次归档的审查结论与人的批示（原话逐字），第 4 步做了什么写进该条目的「做了什么」。多个 spec 要归档的，每个各占一条。

## 合并后归档并删工单

全部代码 PR 合并成功才做，两件事，都 `commit` 到 home（`idea-loop:wiki-conventions` 的「知识库落地」）：

1. **归档**（有设计产物的 spec 各一遍）：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <项目目录> <spec-slug>`，人在「合并前归档」已经批过草稿。退出码 1 是拒绝（`prod/`、spec 和 `tmp/` 都没动）：代码已经合并，不回头，把它列的违规告诉人，档案留给每周 dreaming 的「漏归档」补。退出码 0 就 `node "${CLAUDE_PLUGIN_ROOT}/scripts/project-map.mjs" commit "归档 <spec-slug> 的设计差异" <项目目录>/docs/design/prod <项目目录>/docs/spec/<spec-slug> <项目目录>/docs/design/tmp/<spec-slug>`（`prod/`、被改写图片链接的 spec、被清掉的 `tmp/`，删除也提交）。
2. **删工单**：删掉这份 spec 的 `<项目目录>/docs/spec/<spec-slug>/tickets/`（spec 目录本身留着，等 `/idea-loop:dreaming` 写完 ADR 后整个删），再 `commit "docs(tickets): <spec-slug> 落地" <项目目录>/docs/spec/<spec-slug>/tickets`。

输出里有「home 没推上去」，在交给人的话里带上这一句，流程照走。

## 上线后自查

合并只是进了主分支，页面有没有真的换成这次的样子、有没有被误标 noindex，要打开线上页面才知道。这一步用 `seo-live-check.mjs` 逐个网址核，全过就记下这次改了什么并给目标词开排名追踪；有一项不过就回滚。下文 `S` 指 `${CLAUDE_PLUGIN_ROOT}/scripts`，`<仓库>` 指主 PR 所在的仓库，草稿都放 `.tmp/live-check/<PR 号>/`（先 `mkdir -p`），做完整个目录删掉。

**准备**：

1. 网址清单：`node S/pr-body.mjs get <owner/repo> <PR 号> live-check > .tmp/live-check/<PR 号>/urls.txt`，每行一个网址和它的目标词。
2. 期望值取合并提交的构建产物：`gh pr view <PR 号> --json mergeCommit,mergedAt`，在 `.tmp/live-check/<PR 号>/build` 用 `git worktree add` 检出合并提交，照目标仓库的构建命令构建（产物目录取 `node S/seo-md.mjs SEO.md` 的 `build.distDir`）。构建失败：不做自查，把原因告诉人，用『推送』提醒，不回滚（没有产物，什么也比不了）。

**等上线并核对**：

```
node S/seo-live-check.mjs SEO.md <build 里的产物目录> --urls=.tmp/live-check/<PR 号>/urls.txt --wait > .tmp/live-check/<PR 号>/result.json
```

它每分钟取一次线上页面，全部网址的 title 与 description 都换成产物里的，才算已上线，再逐个网址核四项：能打开、没有 noindex（meta robots 和 `X-Robots-Tag`）、title 与 description 同产物、在 `sitemap.xml` 里。最长等 `SEO.md`「构建与检查」的「上线等待」分钟（没写 30），所以用后台命令跑（前台命令有十分钟上限），在会话里说清在等什么、最久多久，结果回来时说一句。读 `result.json` 的 `verdict`，四种结局：

1. **`not-live`（等满了还没上线）**：不回滚。用『推送』发「部署可能没跑，<`pending` 里的网址>」；`node S/issues.mjs note <docs> <issue 号> <文件>` 评论「上线自查：等了 <`limitMinutes`> 分钟，线上还不是这次的内容（<网址>），未上线」，不带标记，不开排名追踪。部署补跑之后要再查，就人说一声，重跑这一节。
2. **`pass`（全过）**：
   - 评论：`node S/seo-live-record.mjs body .tmp/live-check/<PR 号>/result.json --merged=<mergedAt 的日期> --pr=<PR 号> > .tmp/live-check/<PR 号>/comment.md`，再 `issues.mjs note <docs> <issue 号> .tmp/live-check/<PR 号>/comment.md`。评论里的隐藏标记是这次改动的记录，效果报告靠 `node S/seo-live-record.mjs list <docs>` 读回改动清单，不另建台账。
   - 排名追踪：目标词（去重、跳过没写的）进 OpenSEO 项目的排名追踪器。先看这一份本周还剩多少：`get_project_context` 存成 `.tmp/live-check/<PR 号>/context.json`，`whoami` 读余额，`node S/seo-budget.mjs SEO.md <余额> --context <那份 context.json> --today <YYYY-MM-DD>`（不带方向），读 `week.shares` 里「排名追踪」的 `left`（也不超过 `week.floorRoom`）。`get_rank_tracker`（`openseo.projectId`）列出项目的追踪器，有就用它，没有 `create_rank_tracker`（不排期，建了不花 credits）；`estimate_rank_tracker_cost` 带上 `additionalKeywords` 估价，超过 `left` 就不加：用『推送』告诉人是哪些词、预估多少、这一份还剩多少，评论里补一句没进追踪。能加的 `add_rank_tracking_keywords`（追踪器排了期的，把估价里每次检查的上限传给它）。再 `whoami` 读余额，差值是这次的花费，用 `update_project_context` 的 `appendResearchLog` 记一笔，第一行 `排名追踪 <YYYY-MM-DD>：issue #<号>`，第二行 `花费：<n | 未知> credits，余额 <n | 未知>，份：排名追踪`（「花费」行同 `idea-loop:seo-scan` 的研究日志，`seo-budget.mjs` 靠它加总）。
   - 在会话里写「上线自查全过」，列网址，用『推送』发同一句。
3. **`fail`（有一项不过）**：回滚。`result.json` 的 `failed` 列着每个网址的哪一项、为什么。
   1. **先判这是第几次**：`node S/seo-live-record.mjs from-rollback <docs> <原 issue 号>`，读它输出的 `fromRollback`。`false` 是第一次；`true` 是第二次自查失败：原 issue 是上一次回滚开出来的，正文带「由上线自查回滚而来」，失败的原因多半不在这次改动里（例如整站本来就带 noindex），再按第一次的路走，回滚、重做、再回滚会没完。读不出正文（脚本退出码 1：Linear 的 issue、`gh` 失败）：当作第二次，宁可多要人定一次，也不留循环。**第二次也照样回滚**，坏改动不留在线上；不同的只有下面第 4 步（推送的话）和第 5 步（新 issue 的去向）。
   2. 在 `.tmp/live-check/<PR 号>/revert` 用 `git worktree add` 从基准分支最新处开新分支 `revert/pr-<PR 号>`，`git revert -m 1 <合并提交>`（目标仓库 `DEVELOPMENT.md`「分支」节的合并方式不是 `merge` 时，合并提交不是 merge commit，去掉 `-m 1`），推送，开 PR：描述写原 PR 的链接、失败的网址和哪一项（原样引 `failed`），说明这是上线自查失败的自动回滚。
   3. 等这个 PR 的检查：`gh pr checks <revert PR 号> --watch`，`REVIEW.md` 的检查过了就 `gh pr merge <revert PR 号> --<合并方式>`（`idea-loop:decision-rules` 护栏的 revert PR 例外）。检查没过：不合并，用『推送』发「回滚 PR 的检查没过，线上还是坏的：<revert PR 链接>」，停下等人。
   4. 回滚合并后用『推送』发：第一次「已回滚 #<PR 号>：<网址> <哪一项>」；第二次「第二次自查失败，已回滚，这条要你定」，后面接同样的「#<PR 号>：<网址> <哪一项>」。
   5. 原 issue 已是 done，状态机不允许翻回，所以另开一个 issue 接着做：`issues.mjs show <docs> <原 issue 号>` 读它的 `categories` 和 `kind`，正文照 `idea-loop:issues` 的「正文」写（背景：原 issue 改的是什么、上线自查查的是什么；问题：原 issue 做了什么、哪个网址哪一项没过；证据：`failed` 的原文；影响范围：这次改的网址；从哪发现：合并后的上线自查，原 issue 和原 PR 的链接，和 revert PR 的链接）。**不论是第几次**，正文里都单独写一行「由上线自查回滚而来」，下一次自查靠它认出这是第二次。去向：
      - 第一次：`issues.mjs new <docs> <标题> <正文文件> --state=todo --priority=<原 issue 的 priority 标签，没有写 P1> --kind=<原 issue 的 kind> --type=<原 issue 的 seo 子类，如 seo/pages>`。
      - 第二次：不开成 todo，不进调度的队列。`new` 不带 `--state`（开成 backlog，其余参数同上），再 `issues.mjs set <docs> triage <新 issue 号>` 翻 triage，等人在 triage 里定。项目的 `ISSUE_TRACKER.md` 写了跳过 triage、`set` 不让翻的：留在 backlog，同样不会被重做。
   6. 原 issue 上评论「已回滚，后续见 #<新 issue 号>」（`issues.mjs note`）。新 issue 开不成（`gh` 失败）的，把原因告诉人，评论照写，写「没能开新 issue」。
4. **自查本身没跑成**（脚本退出码 1：网址对不上产物里的页面、清单读不出网址）：不回滚，把脚本的原因告诉人，用『推送』提醒。网址写错是 PR 描述的问题，人订正后重跑这一节。

做完（四种结局都一样）：`git worktree remove --force .tmp/live-check/<PR 号>/build`（有 revert 的也一并移走），删 `.tmp/live-check/<PR 号>/`。

## 合并后的清理

合并之后逐项做，PR 描述「参考」里的清理清单就是这几项加上这个 PR 特有的：

1. **删素材分支**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" cleanup <owner/repo> <PR 号>`。
2. **收掉还留着的执行方 worktree**（卡住过、没被回收的）：目标仓库 `DEVELOPMENT.md` 的「清理」写了命令就先跑它；停掉它端口上的服务，`git worktree remove --force <路径>`，`git branch -D <它的分支>`。
3. **删临时文件**：`.tmp/review-loop/<PR 号>.md`、`.tmp/implement/<spec-slug>/`、`.tmp/pr-review/<PR 号>/`。
4. PR 描述「参考」清理清单里这个 PR 特有的几项。
