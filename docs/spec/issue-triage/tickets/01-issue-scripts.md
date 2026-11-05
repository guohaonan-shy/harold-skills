# 01 — issues.mjs：开 issue 校验正文、优先级、backlog 清单、先关后改 label；Linear 项目的 check

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

两份 spec 的脚本层一起做：本 spec 的「后端」，和 [[issue-linear]] 的「`issues.mjs` 在 Linear 项目上」「`spec.mjs` 认 Linear 号」「`check --from` 与 Linear 号」。

## 要建什么

agent 只能经 `issues new` 开 issue，正文缺必填节就被拒；调度按优先级派；分拣能列出该查的 backlog、贴带前缀的评论；`set done` 要么关上并写明合并了哪些 PR，要么什么都没改。issue 在 Linear 上的项目，写 GitHub 的命令都被拒并指向 linear.md，`check --from` 照常核 spec 与 PR，spec 的 `issues:` 能写 `FA-577`。`seo-issues.mjs` 开出的正文有四个必填节。

## 验收标准

- [ ] `bodyErrors(md)`：按 `## <节名>` 切，问题、证据、影响范围、从哪发现缺一节或只有空白就报（报缺哪几节）；可选节和别的节不管；「无，待验证」算填了
- [ ] `new <docs> <标题> <正文文件> [--state=backlog|todo] [--priority=P0|P1|P2] [--kind=…] [--type=…]...`：正文不过不调 `gh issue create`；同标题开着的 issue 已有就拒绝并报号；`--state=todo` 没带 `--priority` 拒绝；label 组合正确（todo 带 `status:todo`，backlog 不带 `status:*`；`priority:*`、`kind:*`、`type:*` 照参数，`type` 经 `typeSet` 校验）；输出新号
- [ ] `body <docs> <正文文件>`：只校验，过了输出「正文齐了」，不过退出 1
- [ ] `priority <docs> <P0|P1|P2|none> <号>...`：换掉原有的 `priority:*`，none 只去不加
- [ ] `backlog <docs> [<上限>]`：开着、没有 `status:*` 的，最早在前，截到上限；最新一条评论以「🤖 idea-loop：」开头且含「还要你补」、issue 的 `updated_at` 不晚于它 60 秒以上的跳过（评论只对候选 issue 取，用 `gh api repos/{owner}/{repo}/issues/<号>/comments`）
- [ ] `note <docs> <号> <正文文件>`：评论加「🤖 idea-loop：」前缀（已有前缀不重复加）
- [ ] `candidates`：P0 → P1 → P2 → 没有，同级号码小的先
- [ ] `labels`：建 `priority:P0/P1/P2`；它们算保留的 label（`keptLabels`）
- [ ] 删掉 `open`、`openSpecIssue`、`SPEC_ISSUE`、`withIssues`（没有别处用就删）；头注释的 usage 跟命令表一致
- [ ] `move`：done / canceled 先 `gh issue close`（评论随 close 带上），成功后才去 label；close 抛错时没调 `gh issue edit`
- [ ] `setState` 翻 done：评论第一句「合并的 PR：<repo>#<n>、…。」，人给的 `--comment` 接在后面
- [ ] `platformOf(md)`：`ISSUE_TRACKER.md` 第一个一级标题含 `Linear` → `linear`，否则（含没有文件）→ `github`
- [ ] Linear 项目上 `labels / type / set / candidates / reconcile / migrate / new / priority / backlog / note` 拒绝，原因含「Linear」和 `references/linear.md`，不调 `gh`
- [ ] `check <docs> <状态> <号> --from=<状态>`：有 `--from` 时不取 issue（假 `gh` 的 `api repos/…/issues/` 没被调），号可以是 `FA-577`；Linear 项目没给 `--from` 拒绝；→ done 的 PR 在「仓库」表的仓库里找：标题以 `[<号>]` 开头或正文有一行 `Linear: <号>`（Linear 号）；GitHub 号仍按 `Refs`
- [ ] `show` 在 Linear 项目上：`state: null`，给 spec、PR、分支
- [ ] `spec.mjs` 的 `issuesOf`：`[FA-577, 12]` → `['FA-577', 12]`；`specFor` 用它找 Linear 号
- [ ] `seo-issues.mjs`：正文有「影响范围」（受影响的处数与比例，原「问题」里的列表挪过来或保留，四节都不空）和「从哪发现」（`seo-scan <日期> 的 <方向> 方向`），开出前过 `bodyErrors`，开出不带 `status:*`
- [ ] 单元测试覆盖 spec「测试决策」里两份 spec 的每条增量用例；`node --test idea-loop/scripts/issues.test.mjs idea-loop/scripts/spec.test.mjs idea-loop/scripts/seo-issues.test.mjs` 全过

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs`：`move`、`candidates`、`labels` 都在改，原有用例要全过
- `idea-loop/scripts/issue-model-tripwire.test.mjs`：钉着 `issues.mjs` 的命令与说法
- `idea-loop/scripts/seo-issues.test.mjs`：正文结构在改
- `idea-loop/scripts/pr-flow-doc.test.mjs`：断言 `issues open` 存在，删 `open` 后这条要随 02 改；本票只保证脚本侧，文档测试失败留给 02（在交回里写明）
