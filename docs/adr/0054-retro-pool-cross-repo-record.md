---
type: adr
status: 生效
tags: [retro, retro-candidates, links, retro-pool-cross-repo-record]
summary: 候选池里别的仓库的决定记录写成「仓库加路径」，不用 `[[ ]]`；池里 5 条断链已修
related: ["[[199]]", "[[0030-retro-candidate-pool]]"]
---

# ADR-0054 — 候选池里别的仓库的决定记录不用 `[[ ]]` 引

> 由 spec `retro-pool-cross-repo-record` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:retro` 的 `references/candidate-pool.md`「一份文件的形状」里，「出现」一行的模板固定写 `决定记录：[[<决定记录的文件名>]]`，没说决定记录在别的仓库时怎么写。在别的仓库跑的 retro 往本仓库的候选池里写候选时照模板填，就产生断链：`[[ ]]` 只指得到同一个 `docs/` 里的文件。

真实情况（2026-11-14，对着 origin/main `816d6f2` 逐个 `ls docs/raw/decisions/<号>.md`）：`docs/records/retro-candidates/` 里有 5 处指不到文件，来自 Tofelair 仓库的会话，本仓库没有它们的决定记录：`2026-10-31-handing-to-human-name-references.md` 里的 `[[577]]`、`[[731]]`，`2026-10-31-sync-base-before-push.md` 的 `[[712]]`，`2026-11-11-merge-check-conflicts-first.md` 的 `[[522]]`，`2026-11-12-reviewer-no-handback-rerun.md` 的 `[[643]]`。在 Obsidian 里点这些链接打不开，读的人也看不出决定记录在哪个仓库。池里同样来自别的仓库、却写成「仓库 `docs/raw/decisions/538.md` 候选 N」的 4 份没有断。问题是 #121（link sweep 跳过代码里的格式示例）验证时发现的。

## 2 决策（how）

- **模板下的规则列表加一条显式分支**：决定记录在池所在的仓库，照旧写 `[[<文件名>]]`；在别的仓库，写 `` <仓库> `docs/raw/decisions/<文件名>.md` ``（有「候选 N」照样跟在后面），不用 `[[ ]]`。放在模板紧下面的规则列表里，跟「出现每次一行」同处，不新增章节：读这份 reference 的是写池的 retro 会话，它照模板填空，模板缺分支就会照默认填错。
- **写法选「仓库 + 路径」，不选 URL。** 池里已有 4 处这样写，读的人认得；URL 要带分支和组织名，写池的会话不一定拿得到。
- **池里 5 处断链一并改成同样写法**，`<仓库>` 照那一行行首的仓库名写（`Tofelair` / `guohaonan-shy/Tofelair`）。
- 取舍：没给 link sweep 加常驻检查（#121 已管 sweep 的规则，这次只修模板和数据）；没改计数脚本和 dreaming：计数按行首 `- <仓库>#<号>` 数，不读「决定记录」那段；没改池里已经写对的跨仓库行。

## 3 结果（result）

- `idea-loop/skills/productivity/retro/references/candidate-pool.md` 第 33 行有这条规则；`docs/records/retro-candidates/` 下四份文件里 5 处链接已改成仓库加路径，对账时逐个核过：池里现在所有 `[[ ]]` 的目标都在 `docs/` 里存在。
- 提交 `0e96a6e`，合并在 PR #320（分支 `issue/199-cross-repo-decision-links`），决定记录随 PR #323 合并，见 [[199]]。idea-loop 升 patch（0.1.14 → 0.1.15）。issue #199 已 COMPLETED 关闭（2026-11-14）。
- 没有专门的测试守这一条：spec 把验收定在文字核对和池里链接目标存在上。
