# 06 — seo-brief 写完 brief 顺手出好封面和分享卡

**Blocked by**：03 — cover skill；04 — og skill
**设计冻结**：不涉及 UI

## 要建什么
`seo-brief` 在定了角度、大纲、title 之后多一步「配图」：从角度推出两三个封面主体候选并标推荐，从 title 取 OG 大标题，调 `cover`、`og` 出图；结果写进 brief 的「配图」一节（封面主体候选与选中的、OG 大标题、图的位置），图提交在 issue 分支上。

人在场（人用 issue-session 接手这个 issue）时，选角度和挑封面主体放在同一次问，不问两次；托管时照推荐定，依据写「AI 照推荐定：<理由>」，跟角度同一写法。项目没配封面 / OG 配方时用默认出图，brief 里写一句，不阻塞。

## 验收标准
- [ ] SKILL.md 有「配图」一步，位置在 title 与 description 之后、写进去之前；brief 模板多「配图」一节。
- [ ] 人在场时角度和封面主体合成一问；托管时照推荐定并写依据。
- [ ] 没配配方时的退路写明，跟 cover / og 的退路一致。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- `seo-brief-angle-doc.test.mjs`：角度候选照推荐定的写法，配图一步挨着它改。
- `seo-spec-recommend-doc.test.mjs`：托管时照推荐定。
