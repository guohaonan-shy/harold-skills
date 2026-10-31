# writing-prune-references

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle writing-prune-references --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：section.md我觉得也应该简化（harold-skills#125 会话，决定记录 `docs/raw/decisions/125.md` 题 2；retro 候选 3 落成 #156。原话里的 `section.md` 指 `references/sections.md`）

**是/否题**：spec 的范围包含参考文件的剪枝吗？

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：`570e135`，同 `writing-branch-by-caller`：design-archive 的 `references/sections.md` 当时 12506 字，比主体还长。
- **prompt**：同 `writing-branch-by-caller`，一模一样（原句措辞不在仓库里，照 spec 转述写）。**prompt 里没提参考文件**，只说精简 SKILL.md 主体，参考要不要剪由 agent 自己判。prompt 里要求「用 Skill 工具调 writing-for-agents，不要去读仓库里的那份文件」：被回放的仓库快照里自带一份旧的 `writing-for-agents`，agent 直接 `cat` 它，改前改后读到的是同一份（run 20261031T082302、20261031T082820 两边都答「否」，原因在此）。
- **题面**：同上，题里的「spec」指最后一段回复里的方案。
- **改前预计答「否」**：改前的「剪枝」没点名挪到指针后面的参考，#125 第一版方案只挪 SKILL.md 的内容；改后「剪枝」写明参考同样算、参考最容易沉积、脚本参考只写照做 / 处理 / 坑，该答「是」。改前就答「是」，说明用例没抓住问题（比如 agent 读到 sections.md 超长就自己并进范围）。
- **判定依据**：看最后一段回复里的方案范围：有没有列出对 `references/` 下文件（尤其 `sections.md`）的精简。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
