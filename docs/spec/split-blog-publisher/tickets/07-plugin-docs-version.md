# 07 — 插件说明与版本：博客 workflow 写进 idea-loop 的说明，升 minor

**Blocked by**：05 — seo-writing 改稿循环；06 — seo-brief 配图
**设计冻结**：不涉及 UI

## 要建什么
装了新版 idea-loop 的人从插件说明能看懂博客 workflow 怎么走（brief 出图 → 写作循环 → 发布）、项目要在 SEO.md 和 DESIGN.md 里写什么；seo 组说明列出 `cover`、`og` 和写作 lint。插件版本按 `REVIEW.md`「额外要求」从合并时 main 上的版本升 minor。

另：issue 会话的夜间模式说明（issue-session 的 night-mode 参考）补一句——写作评委报出 `premise`（论点站不住）时，夜里也照 spec 翻回 triage、评论写明评委原话，不按推荐改论点。依据：spec「实现决策」的「托管时 premise 翻回 triage」（角度是人定的）；这条由 05 的执行方报出，夜里按推荐定（PR 描述「夜里替你定的」）。

## 验收标准
- [x] idea-loop 的 README 和 seo 组说明写了博客 workflow、两个新 skill、写作 lint、项目要配的取值。
- [x] 夜间模式说明写了 `premise` 照 spec 翻回 triage，跟 seo-writing 改稿循环参考里 premise 的去向对得上，有文档测试守住。
- [x] `plugin.json` 的 version 升了 minor，marketplace 里的版本一致（如有）。（已由下面人的决定改为 patch：0.1.38）
- [x] `REVIEW.md` 的验证命令全量通过。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。
- [x] 人的决定（2026-11-20）：插件版本升 patch，不升 minor：从合并时 main 上的版本（现为 0.1.36）升到下一个 patch。人的原话：「插件版本还是patch」。
- [x] 人的决定（2026-11-20）：术语表加两条——「写作评委」（写作改稿循环里给稿件打分的子代理；_Avoid_：冷读评委、评委（单说指设计收敛的评审））、「出图配方」（封面、分享卡在 DESIGN.md 里的出图取值；_Avoid_：封面配方、OG 配方）；插件里这次新写的文字（seo-writing、seo-brief、cover、og、seo-setup 参考、seo 组说明）和它们的文档测试统一换成这两个叫法。人的原话：「缺的术语就按你说的补上就行」。

## 选中的存量回归
- `no-project-leak.test.mjs`：说明里的例子。
- `issue-group-skills.test.mjs`：skill 清单与目录一致。
