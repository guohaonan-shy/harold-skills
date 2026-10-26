# 04 — 整合会话：调度出整合卡片，一个会话把至多 5 个 retro issue 做到 PR

**Blocked by**：01（同改 `issue-dispatch`）、02（要用凑整合的命令）
**设计冻结**：不涉及 UI

## 要建什么

「retro 整合」是同一个 plugin 里由 retro 开出、还没处理的至多 5 个 issue，合在一起由一个「整合会话」处理成一份 spec 和一个 PR。这张工单让它跑起来：

**调度出整合卡片**（`issue-dispatch` 每一轮，出完普通卡片之后）：

1. 同一个仓库已经有没归档的整合会话（标题以「<仓库名> retro 整合 」开头），或今天已经出过整合卡片、还没点：不出。
2. 否则用 02 的凑整合命令取这次的至多 5 个，出一张整合卡片：标题「<仓库名> retro 整合 #<号> #<号> …」，prompt 让会话调新的整合 skill、参数是这几个号；background 同普通卡片。这个标题不是「<仓库名>#<号>」格式，按 01 的数法不占任何队列的位置，也不算进一轮最多 3 张的限额。
3. 第 4 步「没有会话的 issue」：标题里列着这个号的整合会话也算它有会话。
4. 汇报里加一行整合卡片的情况；凑整合命令单列出来的无分类 retro issue 报给人。

**整合会话的 skill**（新 skill，放 engineering 分类，可被模型调用；名字实现时定，比如 `retro-merge`）：

1. **开场**：跟 `issue-session` 一样要自己的 worktree、`detach_session`、移进「实现中」section；标题不是「<仓库名> retro 整合 #…」就改成这样。把这几个 issue 翻成「验证中」。
2. **起草一份 spec**：用 `to-spec`，`issues` 列全这几个号。「验证」表每条核「旧文」还在不在主分支：在，「存在」；已经不在、意思已经有了，「不存在」，证据写出处。spec 经只改 `docs/` 的 PR 检查过了就合并，然后照 `issue-session` 的「换阶段」把 issue 翻到实现。
3. **切工单、实现**：`to-ticket`、`implement`。落到同一个 skill 同一段的几条合成一张工单，照 `writing-for-agents` 的写法跟现有内容合并，不往后 append；改完的 SKILL.md 主体仍 < 5000 字，超了在 PR 里标出。
4. **证明生效**：照 implementer「改规则的工单：怎么证明 skill 真的变了」；回放用例的材料从 issue 正文、`docs/raw/decisions/<号>.md`、来源 PR 里拼，拼不出来的在 PR 里标「无法回放」，不硬编用例。小用例当场跑，大用例进夜间队列。
5. **review**：`pr-review` 跑两轴 review，Spec 轴对照这份 spec（它的内容来自这批 issue 的候选和新文）。
6. **全程不停下等人**：spec 里的「待定」、implement 要人决定的工单、review 里的「要你决定」，都按推荐先做（spec 里写成「按推荐先定，待人确认」），收集起来。
7. **停下给人看**：最后在会话里先摆「要你确认」（上一步收集的，每条一句：做了什么、推荐的依据），再摆改动点（每个 issue → 落到哪个文件哪一节）、review 结果、回放结果，等人。
8. **人回复后**：哪条不要——不做的 `issues drop` 关成 not planned、撤掉对应改动；要讨论的 `issues unhandoff` 移出 spec、摘掉 `retro`，回普通队列。人说合并，由 `pr-review` 合并，再照 `issue-session` 的「换阶段」「收尾」关掉其余 issue、retro、归档自己。

同步：plugin README 的 skill 表加这个 skill、调度那一行加整合卡片；仓库根 `AGENTS.md`「idea-loop 的约定与刻意例外」第 1 条把它列进可被模型调用的那一类（调度出的卡片调它）；`plugin.json` 版本升到 0.1.4。

> 人的决定（2026-10-26）：「04 选 A，其余没意见」——retro issue 的分类是独立队列时，整合会话照旧待在主队列的「实现中」，先不按分类挪 section，等真出现再改。

## 验收标准

- [x] `issue-dispatch` 写明出整合卡片的条件、标题、prompt，第 4 步认整合会话，汇报含整合卡片一行
- [x] 新 skill 的 SKILL.md 写齐上面 8 步，description 只做路由（`AGENTS.md` SKILL.md 编写约定 §1），主体 < 5000 字
- [x] 新 skill 照分类目录放好，不用改 `plugin.json` 的 `skills` 登记（已有分类）；`plugin.json` 版本 0.1.4
- [x] README 与仓库 `AGENTS.md` 同步
- [x] 照 implementer「改规则的工单」证明 `issue-dispatch` 的新规则生效：能机械判定的做成检查，否则写回放用例；跑不了的写明原因进 verified

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs`：整合卡片依赖 02 的命令，跑一遍确认没被这一刀碰坏
