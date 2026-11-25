# 03 — to-spec 的五个标注样本，evidence 组两个样本停点改到会话

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

维护 to-spec 的人改了它之后，能用一条命令对着五个标注样本改前、改后各跑一遍：`retro-replay.mjs --cases-root idea-loop/evals/to-spec`。格式和 evidence 组一样（每个现场一个文件夹：`case.json` + `sample.md` + `annotations.md`），照 `idea-loop/evals/evidence/cases/` 写。五个现场（当时的提交、prompt、停在哪、从人原话写的是 / 否题）：

- 样式组 `skill-change-has-diagnosis`：#438 起草 evidence-forms（`957553fe` 之前），改了 skill。题：「有没有『杠杆诊断』、frontmatter 有没有 `changes_agent_docs: true`？」
- 样式组 `ui-spec-shape`：#65 起草设计档案滚动段（`1444794` 起，输入同 evidence 组的 `spec-option-goal-figure`），碰 UI。题：「有没有『前端交互』，且正文没有给人看的配图和判词？」
- 样式组 `bugfix-spec-shape`：#398 起草 dispatch-triage-per-round（`32e23d72` 之前），只修问题。题：「七节齐、期望行为编号对得上问题陈述，且没有复现图和『根因』小节？」
- 好用组 `one-stop-point`：#379 起草 dispatch-day-night-modes（`4c49b35b` 之前）；PR #382 review 第 1 轮 S2 发现 spec 前后两处说法不一致，Harold「第二件 统一」（决定记录 379 题 8）。题：「夜里会话做到哪一步停，spec 里只有一种说法吗？」
- 好用组 `guard-four-covered`：同一现场，S1 发现 spec 只列夜里停的五类事、漏了护栏四样，Harold「第一件 我选择A」（题 7）。题：「夜里要停的事，spec 有没有把护栏里的四样也列进去？」

样式组看产出合不合新定义（七节、没有给人看的图和判词、该有「杠杆诊断」的有）；好用组看新 spec 还会不会让下游返工。取不到当时输入的，换同类现场，写进 `sample.md`。

仓库 `AGENTS.md` §5「标注样本」那一条已点名 #451 往里加 `idea-loop/evals/to-spec/`：把这一组写进去（现场名单），不另写例外。#452 同时在往同一条加 pr 组：后合的一方在先合的上改，两组都留。

evidence 组的 `spec-option-goal-figure`、`example-from-real-material` 两个样本：题从「spec 里要人定的那道待定题…」改问「交 spec 时会话里摆的那道题…」，`stop_at` 改成「交 spec 的那段话写完」；题里人的原话不变。

## 验收标准

- [ ] `idea-loop/evals/to-spec/` 下五个现场，每个有 `case.json`、`sample.md`、`annotations.md`，`case.json` 字段与 evidence 组一致、runner 读得进（`retro-replay.mjs --cases-root idea-loop/evals/to-spec` 至少能列出 / 校验五个用例不报格式错）。
- [ ] 五个小用例改前（集成分支插件）、改后（本分支插件）各跑一遍出判定，结果写进各自的 `annotations.md`；大用例写明待跑，由编排者在 PR 开出后照 `--run-large` 跑。
- [ ] `AGENTS.md` §5 写进了 to-spec 这一组，`scripts/root-agents-annotated-samples.test.mjs` 认它、全过。
- [ ] evidence 组两个样本的题与 `stop_at` 已改，原话不变。
- [ ] `node --test idea-loop/scripts/*.test.mjs scripts/*.test.mjs` 全过（含 no-project-leak：样本里引用的是本仓库自己的历史，按该测试的豁免规则放）。

## 选中的存量回归

- `scripts/root-agents-annotated-samples.test.mjs`：钉着 §5 的样本组名单。
- `idea-loop/evals/retro/` 下 runner 自己的测试：用例格式改坏会红。
- `idea-loop/scripts/no-project-leak.test.mjs`：evals 下的文字是否在它的扫描范围、豁免怎么写。
