# 02 — retro：批时人选「进候选池 / 开 issue」，进池的写进池

**Blocked by**：01 — 候选池搬到 records、统一形状，加计数脚本
**设计冻结**：不涉及 UI

## 要建什么

现在 `idea-loop:retro` 把人批了的候选一律开成待验证 issue。改成：

- **第 1 步（读以前的东西）**：除了决定记录，也读当前仓库的候选池（`docs/records/retro-candidates/`，用 01 的计数脚本列出），retro 跑在别的仓库时再读 harold-skills 的池（`gh` 远程读，不检出）。
- **第 3–4 步（候选与摆给人）**：一条候选跟池里某一份是同一类时，摆给人时说出来：「这是第 N 次，并进 <那一份>」。判同一类按决定记录现有的「情形 / 处置」读法。
- **第 4 步人的回复**：「批」拆成两个：**批·进候选池**、**批·开 issue**；不批、改成不变（改成的，改完再摆一次时同样二选一）。retro 不给推荐，依据：人的原话「我觉得retro过程中进入候选还是直接进入issue需要由我来判断」。
- **第 5 步**：选开 issue 的照旧开。选进候选池的不开 issue，按落点写进池：落点是插件的进 harold-skills 的池，落点是目标仓库规则文件的进当前仓库的池。同一类的在那份的「出现」里加一行，否则新建一份（形状照 01）。
- **第 6 步**：决定记录里候选的「结果」写成 `批·进候选池（<池里那一份的链接>，第 N 次）` 或 `批·开 issue（<链接>）`。池里的改动跟决定记录走同一个只改 `docs/` 的 PR；有进 harold-skills 池的、retro 又不在 harold-skills 里跑，再给 harold-skills 开一个只改 `docs/` 的 PR（`gh` 远程建分支、写文件、开 PR，不检出），检查全过就合并；开不成的，记原因、把候选全文留在决定记录里交给人。
- 决定记录格式的 reference 同步：「结果」的新写法；「驳回过的候选」的读法也认池里的「状态」。
- skill 的 description 改掉「批了的开成 issue」这句，照仓库「description 只做路由」的约定。
- 一个 retro 回放用例（照 `idea-loop/evals/retro/cases/` 下已有用例的形状），取 harold-skills#108 的 retro 里人说「留在候选吧。」的那一步：是/否题「批了的候选有没有问人去候选池还是开 issue，人选了候选池的写进了候选池而没有开 issue」。用例材料（提交、prompt、停在哪）从 `docs/raw/decisions/108.md` 和那次的 PR 拼；拼不出的写明缺什么。回放本身是付费的 `claude -p`，不在白天跑：交出命令即可。

## 验收标准

- [x] retro 的 SKILL.md 第 1、4、5、6 步按上面改完，第 5 步的「做完的条件」改成：每条批了的候选要么有 issue 链接、要么有池里那一份的链接（或一句开不成的原因）
- [x] description 不再说「批了的开成 issue」
- [x] 决定记录 reference 的「结果」一行有两种批的写法
- [x] 新回放用例通过 `idea-loop/scripts/retro-case.test.mjs` 的形状校验
- [ ] ⏭ 延后 → 人：回放的改前「否」改后「是」，交出命令夜里跑

## 选中的存量回归

- `idea-loop/scripts/retro-case.test.mjs`：校验回放用例形状，新用例要过
- `idea-loop/scripts/session-digest.test.mjs`：retro 第 1 步的脚本，这一刀不改它，确认没被连带改坏
