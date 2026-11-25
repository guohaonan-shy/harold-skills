---
type: adr
status: 生效
tags: [agents-md, release, pr-merge-says-release]
summary: 说插件 PR 可以合并、交审核报告时，一并说它的版本去向；规则只放根 AGENTS.md 一处
related: ["[[168]]", "[[178]]"]
---

# ADR-0051 — 说插件 PR 可以合并时，一并交代它的版本去向

> 由 spec `pr-merge-says-release` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

这个仓库一个仓库放多个插件，`plugin.json` 的 `version` 当时不是每个 PR 都升，而是攒几个 PR 后单独发版（例：0.1.8 走 `release/idea-loop-0.1.8` 分支，PR #176）。所以一个 PR 合并后以哪个版本到用户手里，光看 PR 看不出来，会话说「可以合并」时也不会顺带交代。

真实例子：2026-10-30，#168 的会话里回答 #162「可以合并」，人接着问「那这个合并之后的patch版本是什么？」。实际 #162 没升版本（合并提交 `edbe10e`），合并后 main 上仍是 0.1.7，后来跟 #165、#131 一起作为 0.1.8 发出（`5e414ca`）。「版本不随每个 PR 升」只存在于 git 历史里，没写进任何会话开场会读的文件。

## 2 决策（how）

- **加一条行为规则，写在根 `AGENTS.md` 的「Repository Purpose」一节末尾，只写这一处。** 根 `CLAUDE.md` 只有一行 `@AGENTS.md`，这个仓库里每个会话开场都读到它；这是一条只跟本仓库发版方式有关的「做 X 时顺带做 Y」，放常驻文件正好。文字照 #168 的 retro 里人批过的原文（决定记录 [[168]] 候选 2），一字不改。
- **规则内容**：说一个 plugin 的 PR 可以合并、或交它的审核报告时，同一段话里写明它合并后随哪个版本发：升不升 `plugin.json` 的 `version`，不升的写明跟着哪个版本一起发。
- 取舍：没把规则写进 `idea-loop:pr` / `idea-loop:pr-review` 的 Review 汇报格式，因为这条只对本仓库成立，写进插件会把一个项目的发版方式带给所有装了 idea-loop 的项目，违反「插件里不出现项目信息」；没写进 `REVIEW.md`，因为它管验证命令和 review 要求、不管跟人说话时交代什么，两处写会漂；没顺手写成一整节「发版流程」（什么时候升、走不走 release 分支），这次只要求说「随哪个版本发」。
- 没为这句规则写文档测试：仓库的文档测试都在 `idea-loop/scripts/` 下、随插件发出去，给根目录文件写测试放进插件就是把项目信息带进插件。验收靠核对文字。

## 3 结果（result）

- 落地：`AGENTS.md`「Repository Purpose」末尾那一段，提交 `c458a19`（「docs(agents): 说插件 PR 可以合并时一并说随哪个版本发」），合并在 PR #307（分支 `issue/178-agents-version-on-merge`）；决定记录随 PR #309 合并，见 [[178]]。issue #178 已 COMPLETED 关闭（2026-11-13）。
- **现行文字已被后来的改动改写，意图不变。** 「不升就跟着后面的版本一起发」这套前提，被 spec `plugin-version-by-change`（issue #305，PR #316，提交 `965489c`）推翻：改了插件的 PR 必须在本 PR 里升版本，漏升时 `scripts/plugin-version.test.mjs` 红。`AGENTS.md` 里这句因此改成「说一个 plugin 的 PR 可以合并、或交它的审核报告时，一并说它把 `plugin.json` 的 `version` 升到了哪一版、哪一档（档位规则见 `REVIEW.md`「额外要求」）；没碰插件的，说「不碰插件，不升版本」。」当前在 `AGENTS.md` 第 23 行；三档规则在 `REVIEW.md`「额外要求」。原文里的 0.1.7 / 0.1.8 例子随之删掉。
- 守护：这句规则本身没有测试守着（见上）；「改了就必须升」由 `scripts/plugin-version.test.mjs` 守。
