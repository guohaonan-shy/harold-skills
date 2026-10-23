# 02 — 冻结只交画布，冻结后的设计变更由 designer 改画布

**Blocked by**：01 — 删合并前钩子，合并前归档从最终画布加实现整份写出档案差异
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里，一个需求冻结之后，画布 `docs/design/tmp/<spec-slug>/canvas/` 是唯一的设计真相：

- **冻结**：uiux-refine 冻结时去掉「写 delta」一步，设计 PR 只提交签字的画布、冻结记录和交互图。冻结记录多一节「冻结后的变更」，每次设计变更记一行：日期、改了哪几格、人的原话、评委分；冻结时这一节写「无」。
- **设计变更**：冻结之后人接受了一处跟画布不同的设计（来源三种：review 里人接受了实现；实现者做不下去、停下汇报里人接受了改法；人自己改主意），当前阶段的编排者——PR 开出前是 implement 的会话，开出后是 pr-review 的会话——起 `idea-loop:designer` 做一种新任务「设计变更」：输入画布路径、人的原话、受影响的状态名和相关截图，只改这几格，交回新的一版画布与这几格的截图。designer 是冻结后画布唯一的修改者。
- **评**：编排者新起一个 `idea-loop:ui-master`，只给改动的几格截图评分，用 refine「评分」那一步同一个评分脚本和它的停止判定；没过把意见交回同一个 designer 再改，判定停下就交人。
- **过了之后**：编排者提交画布并推送到当前分支（实现期间是集成分支，review 期间是 PR 分支），冻结记录记一行。来源不是「接受实现」、代码跟新画布不一致的，照 pr-review「修」那条路给归属工单追加一格、派实现者照新画布做。人不再单独看新画的格子。
- pr-review「接受」那条路里「改 `delta/` 里对应的文件（本地、不进 git），不提交」一句删掉，换成走上面的设计变更。
- 没有设计稿的 UI 改动不变：实现者照旧在 `delta/` 记「最小差异」。

依据与全貌：spec `docs/spec/canvas-truth-dreaming-agents/canvas-truth-dreaming-agents.md` 的「实现决策」1、2。

## 验收标准
- [x] uiux-refine 的冻结说明里没有「写 delta」一步，设计 PR 的内容不含 `delta/`；冻结记录的正文多了「冻结后的变更」一节及它的行格式
- [x] designer 的定义写明「设计变更」这种任务：输入、只改受影响的格子、交回什么
- [x] implement 与 pr-review 各写明：人接受设计变更后起 designer、起 ui-master 只评改动格子、照 refine 的评分脚本与停止判定、过了提交并记冻结记录、代码不一致的派实现者
- [x] pr-review「接受」那条路里不再有手改 `delta/` 的说法
- [x] 实现者记「最小差异」的规则原样保留
- [x] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过
- [ ] review 第 1 轮 C1（2026-10-23）：implement 与 pr-review 不直接读 uiux-refine 私有的冻结参考；「冻结之后的设计变更」的做法升成可调用的能力，或挪进真正用它的那个 skill，别处按能力名调用。规则原文：idea-loop/AGENTS.md「别的 skill 也要读，说明它不只服务一个流程：升成 skill，或挪进真正用它的那个 skill」

## 选中的存量回归
- `archive-check-flag.test.mjs`：冻结说明里删掉「写 delta」后，残留的档案校验命令仍须带 `--no-used-by`
- `critic-score.test.mjs`：设计变更复用 refine 的评分脚本，确认它的输入形状没被说明文字带偏
- `direction-note-check.test.mjs`：改 uiux-refine 的说明时，方向说明的校验不能被连带
