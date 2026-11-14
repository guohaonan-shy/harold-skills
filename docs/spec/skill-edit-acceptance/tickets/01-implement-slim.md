# 01 — 预重构：implement 主文件压回 5000 字以内，只挪分支

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

`idea-loop:implement` 的 `SKILL.md` 正文现在 9415 字（按仓库 `AGENTS.md`「标准 plugin 目录结构」要点里的量法量：去掉 frontmatter、`LC_ALL=en_US.UTF-8 wc -m`），上限是 5000。把只有部分运行才走到的分支整段挪进 implement 自己的 `references/`，主文件原处留一行指针（写明什么情况去读哪份），让编排者每次都走的路（前提、开 PR、账本、派工、核对与落地、卡住、回收的步骤）留在主文件里一眼看得到。行为不变：编排者读完主文件加上指针指到的参考，得到的规则跟现在一字不差。

挪的候选（按 `writing-for-agents` 的渐进披露自己判，每次都走的不挪）：「没活了就停下」里的「人回复后」「重派」「等 CI」、第 4 步「有」「都没有」两个分支、`大用例待跑` 那条；「多个仓库」；「设计变更」；「账本」里会话断了怎么恢复。

别的 skill 按节名引用 implement 的地方要继续找得到：pr-review 引「派工」「核对与落地」「回收」「等 CI」「设计变更」，pr 的 review-loop 参考引「没活了就停下」。整节挪走的，标题留在主文件、下面一行指针。

原来按文字断言 implement 的文档检查（`grep -l implement idea-loop/scripts/*.test.mjs` 找）：断言的文字挪到哪份参考，检查就跟着读那份（或主文件加参考），断言内容不改。

## 验收标准

- [x] 新增一个文档检查：implement 的 `SKILL.md` 正文按 `AGENTS.md` 的量法 < 5000 字；先对着改前的文件跑、看到它红，改完变绿
- [x] 只挪不删：改前主文件里每一句（指针行除外）都还在主文件或 implement 的某份参考里，原文不改（交回里写明怎么核的）
- [x] 主文件每处挪走的位置有一行指针，写明什么情况去读哪份参考；pr-review、pr 的 review-loop 参考按节名引用的六个标题都还在主文件里
- [x] 原来提到 implement 的文档检查全绿，断言内容没改，只改了读哪个文件
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子
- [x] 规则改动的证明：不涉及：只挪位置，行为没变（由上面「只挪不删」和文档检查全绿证明）
- [x] review 第 1 轮 S1（2026-11-14）：挪进参考文件的链接按参考文件自己的位置写，顺着链接能打开；「回放跑完照哪份说明判结果」那条链接现在指向不存在的位置，改成指到同目录的结果处理说明，链接文字不动（有文档检查断言这段文字）
- [x] review 第 2 轮 C1（2026-11-14）：「等 CI」那条规则只写在一处：主文件「等 CI」标题下只留指针，规则原文留在参考文件里（writing-for-agents「单一事实来源」：每个意思只放在一个权威的位置）；标题仍留在主文件，审查流程按节名找得到

## 选中的存量回归

- `idea-loop/scripts/skill-private-references.test.mjs`：新加的参考文件只能被 implement 自己读，别的 skill 不能直读它。
- `idea-loop/scripts/no-project-leak.test.mjs`：挪动的文字是插件规则，不能带进项目名。
- 其余提到 implement 的文档检查（`implement-reuse-blocked-doc`、`implement-resume-landed-doc`、`implement-replay-large-doc`、`pr-flow-doc`、`test-layering-ci-doc`、`issue-group-skills` 等）：它们钉住的说法被挪了位置。
