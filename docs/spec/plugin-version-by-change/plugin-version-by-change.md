---
type: spec
tags: [review-md, release]
summary: 改了插件的 PR 按改动性质升 major / minor / patch，没升版本的测试会红
related: ["[[pr-merge-says-release]]"]
issues: [305]
---

# REVIEW.md：改了插件的 PR 按改动性质升版本号

> #305 存在：2026-10-30 起合进 main 的 PR 里，27 次改了插件目录，20 次没升 `plugin.json` 的 `version`；人在 4 个 issue 里合并前补一句才升，且一律升 patch，详情在「问题陈述」

## 问题陈述

### 改了插件不升版本，改动到不了装了插件的项目

装了插件的项目按 `plugin.json` 的 `version` 取插件：本机装的 idea-loop 就放在 `~/.claude/plugins/cache/harold-skills/idea-loop/0.1.14/` 这样按版本号命名的目录里。版本号不变，这一版的内容就不会再更新。

真实例子：PR #304（#303）在 2026-11-14 00:49 合并，把 idea-loop 升到 0.1.14；PR #308（#174）在同一天 13:18 合并，改了 idea-loop 下 54 个文件，没升版本。本机 `0.1.14` 缓存里的 `idea-loop/README.md`、`agents/implementer.md`、`evals/retro/cases.mjs` 跟 main 上的同名文件不一样（2026-11-14 用 `cmp` 对着 origin/main `4af7902` 核）——#308 的改动在 0.1.14 里到不了人手上，要等下一个升版本的 PR。

量：2026-10-30 至 2026-11-14，main 上第一父链的合并提交里，改了某个插件目录的有 27 次，其中 20 次没碰那个插件的 `plugin.json`（对着 origin/main `4af7902` 用 `git log --merges --first-parent` 逐个 diff 数的）。

### 升了的那几次，都是人想起来补一句，且只升 patch

人在合并前主动要求升版本，跨 4 个 issue：#65（选了推荐的「升」，`docs/raw/decisions/65.md` 题 5）、#180（「这次合并我觉得结合今天harold-skills的改动发一个patch版本吧」）、#266（「没问题，patch是不是要变成0.1.12？」）、#298（「标记一个patch版本吧～」，`docs/raw/decisions/298.md` 题 2）。

档位跟改动性质对不上：PR #301（#298）把每周 dreaming 和分拣从「停下等人逐行批」改成自己执行，是流程行为变了、老用法照样能用，按语义化版本该升 minor（0.1.12 → 0.2.0），实际升的是 patch（0.1.13，提交 `f630496`）。

### 并行的两个 PR 撞同一个版本号

同时开着几个 issue 会话时，两个 PR 都从同一个 main 升版本，就会升成同一个号：#301 和 #303 的分支各自把 idea-loop 升到 0.1.13（`f630496`、`d056f8b`），#303 合并前只好在合入 main 的提交 `a07e382` 里改成 0.1.14。现在没有东西提醒「main 已经到这个号了」。

### 根因

仓库里没有「什么时候升、升哪一档」的规则：`REVIEW.md` 的「额外要求」只管同步 README 和 SKILL.md 字数；根目录 `AGENTS.md` 只要求说「随哪个版本发」（#178 加的那句），并默认「不升，跟着后面的版本一起发」。也没有任何检查会在插件改了、版本没变时红。

## 方案

改完后：在这个仓库里，一个 PR 只要改了某个插件目录下的文件，就在这个 PR 里把那个插件的 `version` 升好，档位按改动性质三选一；漏升了，全量测试会红；升的档对不对，由 review 的审查者对着规则核。人不用再在合并前补一句。

三处改动：

1. **`REVIEW.md`「额外要求」加一条**（对的是 review 和实现时读的检查清单：`idea-loop:implementer` 开工读 `REVIEW.md`，`idea-loop:pr-reviewer` 的 Standards 轴对着它核），照 issue「新文」，只把触发条件从「改了 skill、agent、hook 或脚本」放宽成「改了插件目录下的任何文件」（理由见「实现决策」第 1 条），再加一句撞号怎么办：

   > 改了某个 plugin 目录下任何文件的 PR，交审核报告前按改动的性质升它 `.claude-plugin/plugin.json` 的 `version`，三档取最高的那一档：
   > - **major**（1.0.0）：装了它的项目不改自己的配置或用法就会坏，比如删掉或改名一个 skill、改了一个 skill 的调用参数、产物换了位置。
   > - **minor**（0.1.0）：新增能力，或改了流程的行为但老用法照样能用，比如加一个 skill，或者某个流程从停下等人改成自己执行。
   > - **patch**（0.0.1）：不改行为的修正，比如修错字、修 bug、修说明里前后不一致的地方，以及只改 README 或测试。
   >
   > 定了哪一档、为什么，写进 PR 描述的「参考」。版本号从 main 上的当前版本往上升；合并前 main 已经升过（别的 PR 先合了），就从 main 的新版本重新按同一档升。`scripts/plugin-version.test.mjs` 守着「改了就必须升」。

2. **新测试 `scripts/plugin-version.test.mjs`**（仓库根下的 `scripts/`，不在任何插件里），`REVIEW.md`「验证命令」的全量测试命令把它带上。它对每个带 `.claude-plugin/plugin.json` 的顶层目录：当前分支跟主分支的分叉点比，这个目录下有文件改动，那么当前 `version` 必须比主分支最新的 `version` 大。比的是主分支最新、不是分叉点，所以别的 PR 先合了同一个号，这里会红，撞号在合并前就看得到。

3. **根目录 `AGENTS.md` 里 #178 那句改写**：现在写的「不升的，写明它会跟着哪个版本一起发」跟新规则冲突（改了插件就必须升）。改成：说一个 PR 可以合并、或交审核报告时，一并说它升到哪一版、哪一档；没碰插件的，说「不碰插件，不升版本」。

同一行为的其他入口：

- `idea-loop` 插件里的 `pr` / `pr-review` / `implement`：排除。版本怎么升是本仓库的发版方式，写进插件会带给所有装了 idea-loop 的项目，违反「插件里不出现任何项目的信息」；它们本来就读目标仓库的 `REVIEW.md`，规则写在那里就会被执行。
- 过去「攒几个 PR 再单独提交 `chore(idea-loop): 0.1.x`」、单独的 release 分支（如 PR #176）：不再需要，不另写规则禁止。
- `excalidrawer`：排除。它在 marketplace 里指向另一个仓库，这里没有它的 `plugin.json`，测试自然跳过。

## User Stories

1. 期望行为（对应「改了插件不升版本」）：一个 PR 改了某个插件目录下的文件、没升那个插件的 `version`，全量测试红，报出是哪个插件、main 上是哪一版；升了就绿；没改插件的 PR 不受影响。
2. 期望行为（对应「升了的那几次…只升 patch」）：改了插件的 PR，PR 描述的「参考」里写明升了哪一档、为什么；审查者对着 `REVIEW.md` 的三档核，档位不对记成 Standards 轴的发现。会话说「可以合并」时一并说升到哪一版。
3. 期望行为（对应「并行的两个 PR 撞同一个版本号」）：main 已经被别的 PR 升到同一个号，测试红，提示从 main 的新版本重新升。

## 实现决策

1. **触发条件是「插件目录下有任何改动」，不只是 skill、agent、hook、脚本**：依据是「问题陈述」第一节的缓存机制——版本号不变，这一版的任何文件都不会再更新，README 和测试也一样；issue 自己写的验证也是「插件目录有改动，版本必须变」。只改 README 或测试的，归 patch。
2. **测试放仓库根 `scripts/`，不放 `idea-loop/scripts/`**：依据是 `pr-merge-says-release` 定下的先例——给本仓库自己规则写的测试放进插件，会随插件发给别的项目。全量测试命令现在是 `node --test '*/scripts/*.test.mjs'`，匹配不到根下的 `scripts/`，所以同步改成再带上 `'scripts/*.test.mjs'`。
3. **比较基准**：改动用「当前分支与 `origin/main` 的分叉点」到当前工作区比（含未提交的改动，本机先跑能先红）；版本用 `origin/main` 上的 `plugin.json` 比。基准可以用环境变量换成别的 ref，用来在历史状态上演示红。`origin/main` 不存在（没 fetch 过的克隆）就跳过并打印原因，不报绿也不报红。版本按 `x.y.z` 三段数字比大小。
4. **档位不做机械判断**：依据是 issue 原文「『该升哪一档』机械判不了」。由审查者对着 `REVIEW.md` 的三档和 PR 描述「参考」里写的理由核。
5. **一个 PR 改了几个插件，每个都升**，各按各的改动定档。
6. **这个 PR 自己**只改 `REVIEW.md`、根目录 `AGENTS.md`、根下 `scripts/` 和本 spec，不碰任何插件目录，不升版本。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 涉及：「改了插件就必须升、且比 main 大」这条检查 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 改的是 `REVIEW.md`、`AGENTS.md` 各一段规则；档位判断不加 eval、不留回放用例，靠审查者对着新文核 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`scripts/plugin-version.test.mjs` 本身——对一个 git 状态（当前工作区 + 一个基准 ref）给出红或绿。能抓到：漏升、撞号；漏掉：档位升错（交给审查者）。检查逻辑做成一个接收「改动文件列表、基准版本、当前版本」的纯函数，单元测试喂构造的输入，另有一条对真实仓库状态跑的断言。
- **增量功能测试**：
  - 前置：在 `f630496` 的父提交（#301 分支上升版本之前）建一个临时 worktree，基准设为它跟 main 的分叉点。步骤：跑测试。期望：红，报 idea-loop 改了、版本没升。再换到 `f630496`：绿。覆盖：期望行为 1。
  - 前置：构造输入「idea-loop 有改动、main 上是 0.1.14、当前是 0.1.14」。期望：红，提示从 main 的新版本重新升。覆盖：期望行为 3。
  - 前置：构造输入「只改了 `docs/` 和根目录 `AGENTS.md`」。期望：绿。覆盖：期望行为 1。
  - 前置：分支上的 `REVIEW.md` 和根目录 `AGENTS.md`。步骤：读「额外要求」和 #178 那句所在段。期望：含三档新文、「参考」与撞号的说法；`AGENTS.md` 不再有「不升的，写明它会跟着哪个版本一起发」。覆盖：期望行为 2。
- **照着谁写**：`idea-loop/scripts/no-project-leak.test.mjs`（同样是对整个仓库状态跑的守卫测试）。

## Out of scope

- CHANGELOG、git tag、GitHub release：这次只管 `plugin.json` 的版本号。
- 给仓库加 CI：仓库现在没有 `.github/workflows`，全量测试由编排者转 ready 后在本机跑一次（`test-layering-ci-full` 的第 4 条），这条测试跟着它跑。

## 关联

- raw：`docs/raw/decisions/298.md` 候选 1（这条规则的来历，人批了开 issue）。
- 相关 spec：`pr-merge-says-release`（#178，加了「说随哪个版本发」那句，本 spec 改写它）；`test-layering-ci-full`（#303，定了没有 CI 的仓库由谁跑全量）。
- 相邻未完成的 issue：开着的 issue 里搜「版本」，只有 #305 自己；正在做的 #311、#188 会话改的是插件内容，合并时会按新规则各自升版本，不跟本 spec 改同一批文件。
