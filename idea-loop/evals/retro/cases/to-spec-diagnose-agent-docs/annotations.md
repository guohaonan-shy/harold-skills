# to-spec-diagnose-agent-docs

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle to-spec-diagnose-agent-docs --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：你用writing-for-agent 这个skill扫design-archive这个skill，你觉得问题在哪？（紧接着还问了「这个skill目前是给谁引用的」）

**是/否题**：spec 的方案是从 writing-for-agents 的诊断和调用方清单推出来的吗？

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：`570e135`（2026-10-27，`docs(spec): 起草 design-tmp-worktree-root (#136)`）。它是 #125 第一版 spec（#138，`6fdabc4`）的祖先，这个状态里 `docs/spec/design-archive-skill-length/` 还不存在；`design-archive` 的 SKILL.md 当时 21626 字节（11386 字符），就是 issue 说的超长。
- **prompt**：#125 调度会话里让 to-spec 起草 spec 的原句不在仓库里（仓库里只有 spec 对它的转述：「精简照 `idea-loop:writing-for-agents` 的写法」，见 `docs/spec/writing-for-agents-pruning-layers/writing-for-agents-pruning-layers.md`「问题」1）。这里按 issue 标题加这句转述重拼，另加回放必须的补充：人不在场、禁止提交推送和 gh 写操作、最后说明停在哪。**没有把人的追问提前写进 prompt**：写了，改前的 skill 也会去诊断，用例就抓不住问题。
- **issue 正文**：issue 当时的正文也不在仓库里，prompt 里只留标题和 AGENTS.md 的长度规则，现状让 skill 自己在仓库里核。
- **改前预计答「否」**：改前的 to-spec 在「探代码」一步只探代码，不要求先诊断文档、列调用方；第一版就只写「按分支挪位置」。改后的 to-spec 要求先调 `idea-loop:writing-for-agents` 诊断、列调用方，方案从这两样推出。
- **缺的**：第一版 spec 原来的措辞可在 `6fdabc4` 里看（`git show 6fdabc4:docs/spec/design-archive-skill-length/design-archive-skill-length.md`）；回放里写出什么由 skill 自己决定。
- **判定依据**：看交回的最后一段回复和工作区里的 spec：有没有对 design-archive 逐条杠杆的诊断、有没有调用方清单（谁在引用 design-archive、各读哪几块）、方案每处改动是否标了对的杠杆。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
