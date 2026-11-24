# implementer-in-scope-legacy

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle implementer-in-scope-legacy --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：这个我遇到了好几次，就是issue改动发现因为改动衍生的相关问题，我觉的是需要在pr里面修复的。（harold-skills#163 issue 会话的 retro，2026-11-20；#428 正文引了这句和下一句）另一句：我觉的如果影响到本次改动的存量问题一起修复（这样也算是符合基于spec），如果不是则单独题提issue。

**是/否题**：执行方是把其余 seo skill 写『读出八节』当成影响本次改动的存量，在本工单里改了，而不是记成『工单范围以外，没改』吗？

**输入**：split-blog-publisher 的工单 02（commit 2a2f06be，`02-seo-md-keys.md`）。#428 写的「当时的提交 59132ae1」是工单 02 做完之后的结果（SEO.md 的新键已加好）；工单 02 开工时的状态是 2a2f06be，工单 02 不被别的工单挡，这个提交上 keyword-research、keyword-clustering、competitor-analysis、link-prospecting、seo-audit、seo-coach 六个 skill 的 SKILL.md 都还写着「读出八节」。#163 里这张工单真实交回的是「……工单范围以外，没改。」

**预期**：改前（主分支的 implementer 定义）答「否」，处置表只认「污染输入或结论、让 CI 变红」两种；改后答「是」，处置表多了「它写着的事实正是这次改掉的」，工单给 SEO.md 加了「配图」一节，别处说明文字里写死的节数跟着过期。改前就答「是」，说明用例没抓住问题。

**只测一处**：回放停在执行方交回，测的是执行方这一道关；编排者开 issue 前的复核、review 的第三种例外是同一判据的文本对齐，靠 review 核措辞一致。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
