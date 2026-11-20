# seo-brief-angle-vs-site-posts

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle seo-brief-angle-vs-site-posts --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：现有的blog我记得之前貌似做过类似的事儿，你可以check下（2026-10-27 站点仓库为「toefl speaking topics」新开页的 brief 审核时；另一次 2026-10-25「toefl speaking practice」新开页，人说「同时我希望不要跟现在的blog内容重合」。两句都来自站点仓库的会话，原文不在本仓库，经 `docs/records/retro-candidates/retro-candidate-92.md` 与 `docs/spec/seo-brief-angle-vs-site-posts/` 转述）

**是/否题**：brief 的角度候选有没有逐篇对照站内同主题的已有文章、写明重合与否？

**输入**：站点仓库（本地 remote 为 Tofelair，目录 `~/projects/TOFEL-demo`）的 `5d7148f6`（2026-10-26），是 2026-10-27 那次新开页之前的 main。prompt 取自当时站点 issue 的内容字段（目标词、页面类型、新开页）加上让 brief 产出的那句话；原 issue 的「站内现状」一段没有放进 prompt，让 agent 自己去站内找同主题文章。

**怎么跑**：这个用例的提交在站点仓库，要加 `--repo`：

```
node ~/.idea-loop/bin/retro-replay.mjs --run-large --pr <N> --worktree <本 worktree> --repo <站点仓库> --case seo-brief-angle-vs-site-posts
```

用 OpenSEO（付费）：两次 SERP 查询的 credits 加两次 `claude -p`（约 1 到 3.5 美元）。OpenSEO 在无头会话里连不上时，brief 的第 3 步做不出来，这个用例跑不出结果：退到只做文字检查，并在 PR 里写明。

**预期**：改前（主分支的 seo-brief）brief 的角度候选没有对照行，答「否」；改后每个角度候选带「对照：…」，写明重合的哪一篇哪一节、新页补什么，或「无重合」，答「是」。改前就答「是」，说明用例没抓住问题。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
