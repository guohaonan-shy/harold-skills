# 交审核报告

`../SKILL.md` 的「一轮之后往哪走」判出「交审核报告」时走这份。目的：人说「合并」时，PR 上已经没有别的要做，CI 也已经绿了。`review-loop`、设计产物的意思同 `../SKILL.md`。

## 1. 记下这一轮做了什么

最新一轮条目末尾记一节「做了什么」（没有修复就写「没有要修的，进审核报告」），`review-loop check .tmp/review-loop/<PR 号>.md` 才不再列它。

## 2. 先推 spec 翻完成、删工单的 docs 提交，等 CI 绿

`node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" set <集成 worktree>/docs <spec-slug> 完成`；删掉这个 PR 落地的工单文件，`docs/spec/<spec-slug>/tickets/` 删空了就连目录一起删（spec 目录本身留着，等 `/idea-loop:dreaming` 写完 ADR 后整个删）。这两样作为一个只改 `docs/` 的提交（`docs(spec): <spec-slug> 完成`），推送到 PR 分支。

它覆盖的 issue 在合并后关掉：在 issue 会话里的，由会话的「换阶段」跑 `issues.mjs advance`；不在的，`idea-loop:issue-dispatch` 下一轮对账关掉，项目没跑 loop 的，合并后在主 checkout 上跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" reconcile <docs>`。

**这个提交要在交报告之前推**：只改 `docs/` 的提交，对 pull_request 的 `paths` 按整个 PR 的 diff 判，也会让整条 PR 的 CI 重跑；放到人说合并之后推，就是让人再等一轮 CI。推上去之后等这次推送触发的检查全绿（`gh pr checks <PR 号> --watch`；这个 PR 上没有检查就不等）。CI 红了或卡住，不交报告：查原因，是这次改动引入的，按 `../SKILL.md` 的「回工单」处理（先照下面第 5 点恢复工单）；与这次无关的，开 issue，在报告里写明。

## 3. 写审核报告

用 `pr-body.mjs set` 写进 PR 描述（用 Skill 工具调 `idea-loop:pr`，看它的「PR 描述的节」，节名、顺序、每节怎么写都照它）：`problem`、`changes`、`verification`、`issues`、`your-todo` 各节，`summary` 核一遍。读者是没跟过这件事的人，一份讲完（问题 → 怎么修 → 怎么验证 → 顺带开的 issue → 要你做的事）：

- 素材：spec 的「问题陈述」和「方案」，工单（标题、被谁挡着、端到端行为），review loop 文件里每次停下和每一轮的「已按规则处理」「做了什么」，`idea-loop:implement` 期间开的 issue。
- review 的结论收进 `verification`（几轮、中途修了什么），照规则定的做法和依据收进 `changes`，不再另贴一份。
- **人验素材**：review loop 文件里每次停下的交付验收中还没勾的项，全部收进 `verification`，一项一条：「看什么」+ 素材，素材按 `idea-loop:evidence` 的交付证据做（流程图、动图、并排截图），用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" publish` 上传后贴进描述，人在 PR 上直接看。会话里照 `idea-loop:pr` 的 review loop 一项一段，文字后紧跟它的图。
- `your-todo` 里写清要人做的事：要动生产的（例：推迁移）、要审的人验素材（一项一个复选框，指向 `verification` 里那条），末尾一句「说合并即可」。人看了说对，勾上；人直接说合并，视为人验素材都看过、都对。

## 4. 在会话里给人看，停下

把同样的内容在会话里给人看（带 PR 链接），发一条推送通知，然后停下。人在这里读、追问、说合并；说合并之后走 `merge.md`。

## 5. 报告之后人提了要改的

报告交出去时 spec 已经是「完成」、工单已经删了。人这时批示要修、说某项人验素材不对、要设计变更或说「再跑一轮」（人说合并之后，设计归档核不过、人选了改实现或设计变更，也走这里，见 `merge.md` 的「合并前归档」）：先 `git revert --no-edit <第 2 步的提交>` 推送，把工单和 spec 状态恢复，再照 `../SKILL.md` 的「处理条目」处理（人验素材不对的，在所属工单验收末尾追加 `- [ ] 人验反馈（<日期>）：<原话>`，照「回工单」处理）；全部处理完，从第 1 步重来（重推 docs 提交、等 CI、更新报告）。
