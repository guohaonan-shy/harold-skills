---
type: adr
status: 生效
tags: [idea-loop, implement, implementer, pr-review, test-layering-ci-full]
summary: 执行方只跑改动涉及的测试，全量交给 PR 转 ready 后的 CI；无 CI 时本机兜底
related: ["[[0039-implementer-reuse-and-compact]]", "[[303]]"]
---

# ADR-0059 — 测试按阶段分层，全量交给 PR 的 CI

> 由 spec `test-layering-ci-full` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

idea-loop 原来把全量测试放在本机三处跑：执行方的「全量套件最后跑一次」和完成标准第 3 条；编排者落地时 fast-forward 不了就退回执行方「重跑全量套件」；审查者照 `review-standards` 的「机械检查」每一轮把目标仓库 `REVIEW.md`「验证命令」的每一条在本机跑一遍。目标仓库的 `REVIEW.md` 还带着一句出自 setup 模板的「提交前跑全量；review 时每一条都跑一遍」，装了 idea-loop 的项目都一样。PR 转 ready 之后 CI 又在 PR 上跑同一套全量。

真实例子是 Tofelair#485（PR #957）：工单 06 的执行方从派出到交回 4 小时 09 分，全量 API 测试跑了约 6 遍、每遍约 15 分钟，最后一遍因为本机 ffprobe 卡死拖了约 75 分钟没跑完；同一个 PR 在 CI 上 API 测试 7 分 01 秒、单元测试 9 分 12 秒，全绿（run 43429709097，head `991041e`）。本机同时跑着别的会话：16 GB 内存、交换区已用 20.4 / 21.5 GB、平均负载约 10，执行方的 pytest 被别的会话按进程名杀过几次（exit 144）；第 1 轮 review 的全量单元测试也因 ffprobe 并行卡死没跑完。根因是插件给三个阶段写的验证要求都是「本机全量」，没有一处把全量交给 CI。

## 2 决策（how）

一个 PR 的全量测试只在 CI 上跑一遍：

- **写代码时（执行方，PR 是 draft）**：只跑这张工单写的或改到的单元测试、改动涉及的 API 测试、工单选中的存量回归，加 typecheck 和 lint；全量不跑。交回的 `verified` 多一行「跑了哪些测试」，没跑全量写「全量交给 CI」。
- **PR 转 ready 之后（编排者）**：转 ready 的时机不变；转 ready、翻 in-review 之后，`gh pr checks <PR 号> --watch` 等 CI 在这个 head 上跑完，绿了才起 pr-review 第 1 轮。红了，用 `git blame` 和 `ticket-ledger.mjs of` 找到归属工单，在验收末尾追加一格 `CI（<日期>）：…`、派执行方修，落地推送后再等 CI。
- **review 每一轮（审查者）**：全量测试命令、以及 CI 已在这个 head 上跑过的测试不在本机跑，读 CI 结论写进 `checks.md`（`<检查名> | CI 结论 | 链接`，没跑完写「CI 未完成」，不算通过）；typecheck、lint 照旧本机跑并过改动行过滤。只为核实某条具体发现，才在本机跑对应的几个测试。
- **「改动涉及的 API 测试」怎么挑**：改动碰到哪些接口，就跑那几个接口的 API 测试，命令取 `REVIEW.md`「单个测试文件」那条换路径；碰到被很多接口共用的底层（数据库层、公共中间件）也不扩成全量，挑直接调到它的那几个接口，其余交给 CI。依据是人的原话：「如果改动的部分需要API测试，我觉的涉及到的API测试也需要跑，这样本地不需要跑全量的内容」。
- **`REVIEW.md` 只取命令**，什么时候跑哪条照插件；已装项目里留着的「提交前跑全量」不照它做，setup 模板同步改成新说法。
- **没有 CI 检查的项目退回本机跑一次**：全量没人跑就没有合并关卡。编排者转 ready 后 `gh pr checks` 报没有检查，就在集成 worktree 本机跑一次全量命令当 CI 结果用；审查者每一轮照旧本机跑全量。这个仓库自己没有 `.github/workflows`，它的 PR 走的就是这条。
- **要真实凭据的工作**（如重录 API 测试的假模型数据）照旧在本机跑，CI 里没有凭据。
- **CI 红了、但失败与这次改动无关**（基准分支最近一次 CI 上同一检查也红）：开 issue、写进 Review 汇报，不回工单。
- **版本**：idea-loop 升 patch，原定 0.1.12 到 0.1.13，合并前主分支已被别的 PR 升到 0.1.13，这次升到 0.1.14。

取舍（没做）：

- 没改目标仓库自己的 `REVIEW.md`、CI workflow（draft 跳过、`ready_for_review` 触发）：issue 写明另做。
- 没把「涉及的 API」做成按 diff 自动算的脚本：靠执行方判断并在 `verified` 里写出来，人和审查者看得到范围。
- `deliver.md`、`merge.md`、`explorer` 不动：前两者本来就是等 CI，后者只把命令记进笔记。

## 3 结果（result）

- `idea-loop/agents/implementer.md`：「只跑改动涉及的测试，全量交给 CI」一条、「涉及的 API」怎么挑、完成标准第 3 条（全量套件交给 CI）、交回格式的「跑了哪些测试」行、真实凭据例外。
- `idea-loop/skills/engineering/implement/SKILL.md`「核对与落地」写明全量由 CI 跑、这里不重跑，ff 不了的退回见 `references/landing-branches.md`；「等 CI」整段（`gh pr checks --watch`、红了回工单、没有检查本机跑一次）在 `references/stop-and-resume.md`。
- `idea-loop/skills/engineering/pr-review/SKILL.md` 前提有「每个 PR 的 head 上 CI 全绿（或没有检查）」，一轮之后往哪走先等 CI；`skills/engineering/pr-review/references/review-standards.md` 与 `agents/pr-reviewer.md` 的「机械检查」读 CI 结论；`skills/engineering/setup/references/review.md` 的模板改成「测试只跑改动涉及的；全量由 PR 转 ready 后的 CI 跑」；`README.md` 同步。
- 合并在 PR #304（idea-loop：测试按阶段分层，全量交给 PR 的 CI）；issue #303 已 COMPLETED 关闭；决定记录 [[303]]（review 跑了 3 轮，人在第 1 轮定「先都不压」：执行方为守 5000 字压掉的范围外句子全部恢复，`pr-review` 正文因此停在 5108 字、字数测试改成「不再变长」，收回上限交给 #137）。
- 守护：`scripts/test-layering-ci-doc.test.mjs`（按小节断言旧说法没了、新说法在）、`scripts/pr-review-slim-doc.test.mjs`（pr-review 字数棘轮）。本次对账跑前者，9 条全过。执行方实际跑的时候会不会照做，要等目标仓库下一个 PR 才看得到。
- 当前仓库状态：`.github/workflows` 不存在（2026-11-15 在 main c957b2c 上查），与「这个仓库的 PR 本机兜底」一致。
