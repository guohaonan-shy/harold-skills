# 01 — dreaming 每周整理全设备那一份记忆，setup 只建一个设备级 dreaming 任务

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

0.2.0 起一台设备只有一份记忆（home 仓库的 `memory/`，`autoMemoryDirectory` 指到那里），合成一份后会超出 Claude Code 每轮加载的上限（140 行 / 25,000 字节），也会让只属于一个项目的条目出现在每个项目的每一轮里。这张工单让下面三件事跑起来：

1. **量记忆**：一个新的纯量脚本 `memory-check`（idea-loop 的脚本目录里，跟 `proposal-table-check` 同一种写法：导出纯函数 + 命令行入口）。输入一个记忆目录，默认 home 的 `memory/`（home 的位置跟 home-config、project-map 两个脚本取法一致：`~/home`，`IDEA_LOOP_HOME` 覆盖）。它报：根索引 `MEMORY.md` 的行数和字节数在不在 140 行、25,000 字节以内（两个都要过）；根索引和每份项目索引里的链接是否都指到存在的文件；根目录下有没有没进索引的条目文件；根索引「## 项目」一节的每行是否指到存在的项目记忆索引（`../projects/<名字>/memory/MEMORY.md`）。全过退出码 0，否则 2，每个问题逐条点名。项目索引不设行数、字节上限。

2. **提议表多一节 `记忆`**：dreaming 的提议表校验脚本认一个新行类型 `记忆`，建议处置闭集是：挪进项目 · 合并 · 订正 · 毕业 · 删除 · 缩短索引行 · 问人。拆表时只有建议处置是「问人」的 `记忆` 行进问人的小表，其余 `记忆` 行归自动。dreaming 的提议表参考文件同步：行类型总表加这一行（现有测试会拿参考文件的总表对脚本的闭集），「表怎么汇成」写明这一节由 dreaming 自己写，样例表加一节合规的 `记忆`（现有测试会跑样例），执行段的行类型表写明 `记忆` 行照新参考文件执行。

3. **dreaming 的记忆一段**：dreaming 新增一份参考文件写记忆整理的步骤，SKILL.md 主体只加一行指针（主体必须仍 < 5000 字，量法见仓库根 AGENTS.md）。参考文件按 spec「一次记忆整理」写：量（跑 memory-check）→ 判每一条（读根索引和每条 frontmatter，只在合并、订正时读正文；判归属先看出处——#247 复制时加的项目前缀、frontmatter 的 `originSessionId` 对到转录的工作目录再按 git 远端对项目清单——再看内容，判不准留在根里）→ 执行（除「问人」外照建议处置做完，再跑 memory-check 到退出码 0；仍超就按「先毕业、再挪进项目、再合并、最后缩短索引行」继续压；然后只 `git add` `memory/` 和 `projects/*/memory/` 下自己改的文件，在 home 里提交一次，message `dreaming <日期>：记忆整理`，home 有 `origin` 就推）→ 问人（有「问人」行才有，照 dreaming 现有问人那份的做法，人不回不挡任何东西）。还要写：每种建议处置执行时做什么（spec 的闭集表）；取自 `consolidate-memory` 的三条做法（合并时保留内容更全那份的路径、相对时间改绝对日期、索引一行一句钩子 ≤150 字）以及为什么不调用它；中间物放 home 的 `.tmp/dreaming/<日期>/`；home 里不开 worktree、不开 PR；回滚是在 home 里 `git revert` 那个提交；已知限制（整理时正好有会话在写记忆的那一条这次不动）。SKILL.md 里要说清：记忆一段在提议段之前、开在 home 里也能跑（不需要 `DEVELOPMENT.md`）；人可以说「只跑记忆」，只出 `记忆` 一节；home 或它的 `memory/` 不存在就跳过这一段。

4. **setup 只建设备级任务**：setup 的「每周 dreaming」一节（SKILL.md 那一节和它的参考文件）改成在 home 那一步之后建一个设备级任务，id `dreaming-home`，标题写设备级的（例如「home 每周记忆整理与知识库对账」），目录是 home，已有就报给人；不再按仓库建 `dreaming-<仓库名>`，所以同一台设备第二个项目跑 setup 这一步只报「已有」。setup 的完成条件与交回里关于这个任务的说法同步改。dreaming 的增量范围参考文件里找定时任务执行记录的那一步，任务 id 改成 `dreaming-home`（不再从仓库目录名推）。setup 建 home 时写的 `.gitignore` 加一行 `.tmp/`。

5. **README**：idea-loop 的 `README.md` 里 setup、dreaming 两行和目录树里 dreaming 参考文件、脚本列表，同步写上设备级任务 `dreaming-home`、记忆一段和 `memory-check`。不改插件版本号（这个 PR 不升，plugin-version 测试红是预期内）。

## 验收标准

- [ ] memory-check：临时记忆目录，根索引 150 行、26,000 字节、链接全有效 → 退出码 2，点名超 140 行、超 25,000 字节两条
- [ ] memory-check：根索引一行指向不存在的文件、「## 项目」一行指向不存在的项目索引、根目录有一个没进索引的条目文件 → 三条都被点名，退出码 2
- [ ] memory-check：根索引在上限内、链接与项目指针全有效、无漏索引 → 退出码 0；项目索引超 140 行不报
- [ ] 提议表校验：`记忆` 节一行「问人」、一行「挪进项目」→ 校验通过，`--split-ask` 只抽出「问人」那行；把建议处置写成「归档」→ 退出码 2 并报闭集外
- [ ] 提议表参考文件的样例表含 `记忆` 节且通过校验；参考文件总表的 `记忆` 闭集与脚本一致（现有两条测试仍绿）
- [ ] 文档测试（照 `dreaming-autonomous-doc.test.mjs` 写一份新的）：dreaming SKILL.md 有指向记忆参考文件的一行、写了「只跑记忆」，主体 < 5000 字；记忆参考文件写了闭集、「只 add」自己改的路径、home 里提交与 `git revert`；setup 的每周 dreaming（SKILL.md 那一节与参考文件）写的是 `dreaming-home`、不再出现 `dreaming-<仓库名>`；增量范围参考文件写的是 `dreaming-home`；setup 的 home 参考文件的 `.gitignore` 含 `.tmp/`
- [ ] 插件内不出现任何真实项目名（`no-project-leak.test.mjs` 绿）；`node --test` 跑改动涉及的测试全绿（plugin-version 那条除外）

## 选中的存量回归

- `proposal-table-check.test.mjs`：样例表与总表对脚本闭集的两条——这一刀改了样例和总表，最容易漂移
- `dreaming-autonomous-doc.test.mjs`、`dreaming-incremental-doc.test.mjs`：dreaming SKILL.md 主体字数、拆表说法、增量范围的文字都被它们钉着
- `setup-home-doc.test.mjs`：setup 的 home 参考文件被它钉着，改 `.gitignore` 一行可能碰到
- `no-project-leak.test.mjs`：新参考文件的例子不能用真实项目名（spec 里的 Toeflair、Scriben 例子不能照抄进插件）
