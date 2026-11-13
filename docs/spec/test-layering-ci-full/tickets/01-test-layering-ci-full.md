# 01 — 执行方只跑改动涉及的测试，全量交给 PR 转 ready 后的 CI

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件的流程规则改成测试按阶段分层，一个 PR 的全量测试只在 CI 上跑一遍：

- **执行方**（`idea-loop:implementer` 的 agent 定义）写代码时只跑：这张工单写的或改到的单元测试、改动涉及的那几个接口的 API 测试、工单选中的存量回归、typecheck、lint。不再跑全量；被叫回来修时也不跑全量，靠重跑已勾格当初的测试保证不坏。「涉及的 API」：改动碰到哪些接口（路由、处理函数，或只有它们在用的下层代码）就跑那几个接口的测试；碰到被很多接口共用的底层也不扩成全量，挑直接调到它的几个，其余交给 CI。目标仓库 `REVIEW.md` 只取命令，什么时候跑哪条照插件（已装的项目 `REVIEW.md` 里可能还写着「提交前跑全量」，不照它跑）。要真实凭据的工作（比如重录 API 测试的假模型数据）照旧本机跑。完成标准里去掉全量套件。交回的 `verified` 多一行「跑了哪些测试」，逐个写测试文件或目录，没跑全量写「全量交给 CI」。
- **编排者**（`idea-loop:implement`）：落地时 fast-forward 不了，退回执行方重跑的是它这张工单那组测试，不是全量。「全部落地」那一步在 `gh pr ready`、翻 in-review 之后、起 pr-review 之前插一步「等 CI」：`gh pr checks <PR 号> --watch` 等这个 head 的检查跑完。全绿起 pr-review；红了读失败日志（`gh run view <run> --log-failed`），按失败的测试 `git blame` 找到引入它的提交、用工单账本脚本读出工单，在工单验收末尾追加 `- [ ] CI（<日期>）：<失败的测试验的行为>`，提交 `docs(tickets): <NN> — CI 失败`，照「重派」新起执行方，落地推送后回到「等 CI」；失败跟这次无关（基准分支最近一次 CI 上同一个检查也红）就开 issue、写进汇报，不回工单（照 pr-review 的 deliver 第 2 步现成做法）。PR 上没有检查的项目，编排者在集成 worktree 本机跑一次 `REVIEW.md` 的全量命令，结果当 CI 结果用。
- **pr-review**：前提多一条，每个 PR 的 head 上 CI 已跑完且全绿（或没有检查）；还在跑就等，红了照 implement 的「红了」处理。「一轮之后往哪走」修复落地推送后、起下一轮前也等 CI。
- **审查者**（`idea-loop:pr-reviewer` 定义和 pr-review 的 `review-standards` 参考的「机械检查」）：全量测试命令、以及 CI 已在这个 head 上跑过的测试，不在本机跑，读 CI 结论写进检查结果（`<检查名> | CI 结论 | 链接`，没跑完写「CI 未完成」，不算通过）；typecheck、lint 照旧本机跑并过改动行过滤。PR 上没有检查时照旧本机跑全量。核实某条发现要跑测试时只跑那几个。
- **setup 生成 `REVIEW.md` 的模板**：「写代码时常跑前两条，提交前跑全量；review 时每一条都跑一遍」改成：写代码时常跑前两条和 lint，测试只跑改动涉及的；全量由 PR 转 ready 后的 CI 跑，review 读 CI 结果。
- **插件 `README.md`**：讲工单完成条件（现在写着 the full suite are green）、implement、pr-review 那几句同步成新说法。
- **版本**：idea-loop 的 `plugin.json` 版本 `0.1.12` → `0.1.13`。

不改：pr-review 的 deliver、merge 两份参考（已经是等 CI）；explorer 定义；任何目标仓库的 `REVIEW.md` 和 CI workflow。

## 验收标准

- [x] 新增一个文档检查测试（照 `dreaming-incremental-doc.test.mjs` 的写法，按小节读文字断言），先对着改前的文字跑、看到它红，改完变绿
- [x] 执行方定义的「做」「完成标准」和被叫回来修的那句里不再要求跑全量套件；写了只跑改动涉及的单元测试、涉及的 API 测试、选中的存量回归、typecheck、lint，以及全量交给 CI
- [x] 执行方定义写了「涉及的 API」怎么挑、共用底层也不扩成全量、`REVIEW.md` 只取命令、真实凭据的工作照旧本机跑
- [x] 执行方交回格式的 `verified` 有「跑了哪些测试」一行
- [x] implement 落地 ff 不了时不再「重跑全量套件」
- [x] implement「全部落地」那段在 `gh pr ready` 之后、起 pr-review 之前有等 CI（`gh pr checks`），写了红了怎么回工单、无关失败开 issue、没有检查时本机跑一次全量
- [x] pr-review 的前提写了 head 上的 CI 全绿或没有检查，「一轮之后往哪走」起下一轮前等 CI
- [x] `review-standards` 的「机械检查」和 pr-reviewer 定义的「机械检查」写了全量测试读 CI 结论、没有检查才本机跑、核实发现只跑对应测试
- [x] setup 的 `REVIEW.md` 模板不再有「提交前跑全量」
- [x] 插件 `README.md` 同步，不再说工单完成要 full suite 绿
- [x] idea-loop 版本是 `0.1.13`
- [x] 全量 `node --test '*/scripts/*.test.mjs'` 绿（这个仓库 PR 上没有 CI，按新规则由编排者兜底；执行方跑新测试和 `no-project-leak.test.mjs` 即可）；pr-review 的 `SKILL.md` 主体 < 5000 字；implement 的改前已是 9019 字、本次后 9589 字，不在这里缩，交给 #137（人定于 review 第 1 轮 S1）
- [x] review 第 1 轮 C1（2026-11-13）：pr-review 前提里 CI 红了的处理写成显式调用：「用 Skill 工具调 `idea-loop:implement`，看它的「等 CI」」，不只写「照 implement 的「等 CI」处理」；规则原文（writing-for-agents）：要 agent 当场用上另一个 skill，写「用 Skill 工具调 <插件>:<名字>」，只要其中一节就加上节名；pr-review 正文仍 < 5000 字
- [ ] review 第 1 轮 S2（2026-11-13）：pr-review 的 `SKILL.md` 里，凡是为守 5000 字而删改、跟测试分层无关的句子，恢复成改动前（main 上）的原文，包括「人触发的轮次也计入」「上限只约束自动起，不约束人」「（有用例没过）」「一律单独提交」，以及修 C1 时压掉的「进 review 前」「照它处理」等措辞；本工单新加的 CI 相关句子保留。人的原话：「先都不压」。恢复后正文会超过 5000 字：把守 pr-review 字数的测试从「≤ 5000」改成「不超过恢复后的字数」（棘轮，注明收回 5000 由 #137 做），其余测试保持绿

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：改的都是插件文字，例子要保持通用，不能写进 Tofelair 之类的项目名。
- `idea-loop/scripts/dreaming-incremental-doc.test.mjs` 以及其它按文字断言 implement / pr-review / implementer 的文档测试（`grep -l "implementer.md\|implement/SKILL.md\|pr-review" idea-loop/scripts/*.test.mjs` 找出来）：改了这几份文字，可能踩到它们钉住的说法。
