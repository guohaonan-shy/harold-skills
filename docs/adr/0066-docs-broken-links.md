---
type: adr
status: 生效
tags: [knowledge-base, docs-broken-links]
summary: 知识库里指不到文件的双括号链接改成纯文本或删 related 项，不补文件
related: ["[[388]]", "[[0042-link-sweep-skip-code]]"]
---

# ADR-0066 — 知识库里指不到文件的链接：改成纯文本，不去补文件

> 由 spec `docs-broken-links` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`docs/` 是 Obsidian vault，双括号链接按文件名解析，在 Obsidian 里点一个指不到文件的链接会新建一个空页，而不是打开目标。`idea-loop:wiki-conventions` 要求「双括号链接指到的名字都要有文件」（行内代码和代码块里的不算，见 [[0042-link-sweep-skip-code]]）。issue #388 报了 8 处；2026-11-21 对 origin/main（94150ce5）重扫是 4 处，另外 4 处所在的 spec 已删，名字已成为两份 ADR。

剩下的 4 处，目标为什么不在：

- 两份 raw 讨论记录的 `related` 里指向一份已了结的 spec（spec 了结时删掉，没有接替它的 ADR），以及一份 0.2.0 重构的讨论记录（只在没合进主分支的分支上）；后者在其中一份的正文里还有一处。
- 一份 retro 候选里把另一个仓库的 Linear issue 号写成了链接。

根因：raw 是永久的，目标被删或从没进主分支时，引用它的 raw 没跟着改；写决定记录出处时把外部系统的号当成了 vault 链接。

## 2 决策（how）

- **找不到目标就不留链接，不去补文件。** 三处都没有真实存在的替代目标；把 0.2.0 讨论记录从别的分支搬进主分支不在这个 issue 内。
- 已删 spec 的那项：从 `related` 里删掉，`tags` 里的名字保留，召回照样找得到。
- 未合进主分支的讨论记录：`related` 里删掉，正文改成行内代码写文件名并注「（未合进主分支）」，读者仍知道指的是哪场讨论。
- 外部仓库的号：照候选池的写法规则，写成「仓库加 `docs/raw/decisions/<文件名>.md`」，不用双括号。起草时写的是纯文本「Linear 号」，review 第 1 轮按这条规则改。
- 纯文本用行内代码，以后的扫描不会再报。不碰插件，不升版本。夜间模式按推荐定，人看到后没有推翻（决定记录 [[388]]）。

取舍（没做）：不加常驻的死链测试或 CI（wiki-conventions 已要求每次删除后查死链，这次只是没执行，要不要做成常驻检查是另一个需求）；不把那份 0.2.0 讨论记录搬进主分支。

## 3 结果（result）

- 改动落在 `docs/raw/issue-workflow/2026-11-02-issue-intake-priority-grill.md`、`docs/raw/issue-workflow/2026-11-05-issue-triage-grill.md`、`docs/records/retro-candidates/2026-11-16-eval-covers-models-and-languages.md`。
- 合并在 PR #444（知识库里 4 处链接指向不存在的文件）；issue #388 已关闭。
- 验证：2026-11-22 对 origin/main 重扫 `docs/`（跳过代码块和行内代码，按文件名解析），双括号链接死链 0 处。本条没有常驻测试守着。
