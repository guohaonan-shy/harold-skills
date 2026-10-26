# 03 — retro 开 issue 时打上 `retro` 和分类，正文写回放材料

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 `retro` skill 第 5 步把人批了的候选开成待验证 issue，现在既不打分类也不打别的 label，正文只有候选、落点、旧文新文、会话里的原话。改成：

1. 开 issue 时打上落点所在 plugin 的分类（`type:<plugin>`，有贴切子类就带上）和保留 label `retro`。开到目标仓库的项目级 issue 照那个仓库「issue 分类」一节打。
2. 正文再写三样，后面写回放用例要用：决策发生时的提交、让 skill 产出那个东西的那句话、skill 把东西交给人的那一刻（停在哪）。
3. 例外：候选落点是脚本或检查（retro 落点表的「能机械判定」那一行），或者是结构性改动、要讨论的方向，不打 `retro`，照旧作为普通待验证 issue 开出：它们要走完整的审核，不进 retro 整合。

照 `writing-for-agents` 的写法跟第 5 步现有内容合并，不在后面追加一段。

## 验收标准

- [x] `retro` 第 5 步写明打 `type:<plugin>` 和 `retro`、正文多写三样、哪几类例外不打 `retro`
- [x] SKILL.md 主体仍 < 5000 字
- [ ] 照 implementer「改规则的工单：怎么证明 skill 真的变了」证明生效：能机械判定的做成检查，否则写回放用例；用例材料取 #102 的来源（`docs/raw/decisions/55.md` 与它开出的 #102），verified 里写结果或「回放在队列里」 ⏭ 延后 → PR 交付验收：回放用例 `retro-issue-replay-material` 已写好、格式检查过，但本机 `claude -p` 未登录（OAuth 过期），当场没跑成；登录后跑 `node ~/.idea-loop/bin/retro-replay.mjs --case retro-issue-replay-material --worktree <worktree>`，或由编排者放进夜间队列

## 选中的存量回归

- `idea-loop/scripts/session-digest.test.mjs`（若有）：retro 第 1 步依赖它，改第 5 步时不应碰到，跑一遍确认
