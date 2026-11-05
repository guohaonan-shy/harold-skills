# 02 — issue-triage skill 与 issue-triager agent；开 issue 走 issues new；删 issue-verify

**Blocked by**：01
**设计冻结**：不涉及 UI

## 要建什么

人或定时任务敲 `/idea-loop:issue-triage`，最早的 15 个 backlog issue 各由一个 `issue-triager` 查完、贴证据评论，会话摆一张表等人逐行批，照批的翻状态；`全部` 分批跑存量；`P0 <号>` 当场复现。各处开 issue 都经 `issues new`，triage 会话直接起草 spec，`issue-verify` 不复存在。

## 验收标准

- [x] 新 skill `idea-loop/skills/engineering/issue-triage/SKILL.md`：可被模型调用；description 只做路由（每周分拣、P0 当场复现两个触发）；三种调用（无参数、`全部`、`P0 <号>`）；同时最多 5 个子代理；四种建议去向与人批后的命令照 spec「建议去向四种，人批」那张表；跳过 triage 的项目没有 triage 去向；表好了 PushNotification；人说「不做」的写进 `docs/records/out-of-scope/<slug>.md`（格式照 spec「不做」清单）
- [x] 新 agent `idea-loop/agents/issue-triager.md`：`model: sonnet`、思考强度 medium（照现有 agent 的 frontmatter 写法）；description 写职业身份与交付；正文是 spec「`idea-loop:issue-triager`」那节：五步命中即停、复现手段表（从 `issue-verify` 搬来）、输出放 `.tmp/triage/<号>/`、`issues note` 贴评论、交回一行 JSON、只读不改不翻状态
- [x] `idea-loop:issues`：「开一个 issue」改成：先写正文文件 → `issues new`（默认 backlog；人明说做的 `--state=todo --priority`；判 P0 的开完调 `/idea-loop:issue-triage P0 <号>`）；状态表 backlog 那行指向 `idea-loop:issue-triage`；实体表的优先级写取值（P0/P1/P2，GitHub `priority:*`）；命令表加 `new / body / priority / backlog / note`，删 `open`；`github.md` 的优先级一行写 label 名
- [x] 删 `skills/engineering/issue-verify/`；复现手段在 agent 里，「起草」「自己校验」「跟人定要 grill 的」挪进 `issue-session/references/draft-spec.md`（只留新流程下还成立的：去掉「验证为不存在」的落地 PR 那段，改成起草时发现已做掉 → `set canceled --comment` 并删草稿）
- [x] `issue-session`：triage 会话第 1 步改成读 issue 全文和分拣的证据评论，调 `to-spec` 起草，再照 `references/draft-spec.md`；todo 会话自己起草时也指向它
- [x] `to-spec`：第 4 步不再 `issues open`：没覆盖 issue 时人在场用 `issues new` 按人说的开成 todo，不在场停下问人；第 6 步的例子不再提 `issue-verify`；`references/figures.md` 里 `issue-verify` 换成 `issue-triager`
- [x] `issue-dispatch`：一句话说候选按 P0 → P1 → P2 → 无排
- [x] `setup`：「每周分拣」一节，步骤在新 reference `references/weekly-triage.md`（照 `weekly-dreaming.md` 的写法，id `triage-<仓库名>`，prompt `/idea-loop:issue-triage`）；交回里列它；`labels` 那步提到会建优先级 label
- [x] `setup/references/issue-tracker.md` 与仓库根 `ISSUE_TRACKER.md`：加「优先级」一节（P0/P1/P2 的 label、P0 的标准、调度按它排）
- [x] `design-modeling/references/distill.md`：自己 `gh issue create` 的两处改成照 `idea-loop:issues` 的「开一个 issue」
- [x] 删 `docs/spec/issue-intake-priority/`，刷 `docs/spec/index.md`
- [x] `idea-loop/README.md`：skill 表加 `issue-triage`、删 `issue-verify`，agent 表 / 目录树加 `issue-triager`，`to-spec` 那行不再提 `issue-verify`
- [x] 文档测试：改 `issue-group-skills.test.mjs`、`to-spec-by-deliverable-doc.test.mjs`、`knowledge-base-landing-doc.test.mjs`、`pr-flow-doc.test.mjs` 里依赖 `issue-verify` / `issues open` 的断言；新增断言：插件（`idea-loop/` 下除 `docs/raw`、`evals` 外）没有 `issue-verify`、`issues open`；`implement`、`pr-review`、`retro`、`dreaming`、`issue-session` 的开 issue 都指向 `idea-loop:issues` 的「开一个 issue」；`issue-triage` 点名 `issue-triager`、`issues backlog`、`issues note`
- [x] `node --test idea-loop/scripts/*.test.mjs` 里跟这些文件相关的测试全过（全量由编排者跑；第 1 轮 review 后相关测试文件已逐个跑过全绿）

## 选中的存量回归

- `issue-group-skills.test.mjs`、`issues-skill-doc.test.mjs`、`issue-session-implement-doc.test.mjs`：issue 会话与 issues skill 的说法
- `no-project-leak.test.mjs`：新 skill 和 agent 不能带真实项目名
- `knowledge-base-landing-doc.test.mjs`、`to-spec-by-deliverable-doc.test.mjs`：列着 `issue-verify` 的路径
