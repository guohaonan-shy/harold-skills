---
type: adr
status: 生效
tags: [review-md, release, plugin-version-by-change]
summary: 改了插件目录下任何文件的 PR 按改动性质升 major/minor/patch，没升版本的全量测试会红
related: ["[[0051-pr-merge-says-release]]", "[[298]]", "[[305]]"]
---

# ADR-0049 — REVIEW.md：改了插件的 PR 按改动性质升版本号

> 由 spec `plugin-version-by-change` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

装了插件的项目按 `plugin.json` 的 `version` 取插件：本机装的 idea-loop 放在 `~/.claude/plugins/cache/harold-skills/idea-loop/0.1.14/` 这样按版本号命名的目录里，版本号不变，这一版的内容就不会再更新。

真实例子：PR #304（#303）在 2026-11-14 00:49 合并，把 idea-loop 升到 0.1.14；PR #308（#174）在同一天 13:18 合并，改了 idea-loop 下 54 个文件，没升版本。本机 `0.1.14` 缓存里的 `idea-loop/README.md`、`agents/implementer.md`、`evals/retro/cases.mjs` 跟 main 上同名文件不一样（用 `cmp` 对着 origin/main `4af7902` 核）：#308 的改动在 0.1.14 里到不了人手上。量：2026-10-30 至 2026-11-14，main 第一父链的合并提交里改了某个插件目录的有 27 次，其中 20 次没碰那个插件的 `plugin.json`。

升了的那几次，都是人在合并前想起来补一句，跨 4 个 issue（#65、#180、#266、#298），且一律升 patch，档位跟改动性质对不上：PR #301（#298）把每周 dreaming 和分拣从「停下等人逐行批」改成自己执行，流程行为变了、老用法照样能用，按语义化版本该升 minor，实际升的是 patch。还有并行撞号：#301 和 #303 的分支各自把 idea-loop 升到 0.1.13，#303 合并前只好在合入 main 的提交里改成 0.1.14，没有东西提醒「main 已经到这个号了」。

根因：仓库里没有「什么时候升、升哪一档」的规则。`REVIEW.md` 的「额外要求」只管同步 README 和 SKILL.md 字数；根目录 `AGENTS.md` 只要求说「随哪个版本发」（#178），并默认不升、跟着后面的版本发；没有任何检查会在插件改了、版本没变时红。

## 2 决策（how）

- **在这个仓库里，一个 PR 只要改了某个插件目录下的文件，就在这个 PR 里把那个插件的 `version` 升好**，一个 PR 改了几个插件每个都升、各按各的改动定档。规则写进 `REVIEW.md`「额外要求」（`implementer` 开工读它，`pr-reviewer` 的 Standards 轴对着它核）：
  - **major**：装了它的项目不改自己的配置或用法就会坏（删掉或改名一个 skill、改调用参数、产物换位置）。
  - **minor**：新增能力，或改了流程行为但老用法照样能用（加 skill、某流程从停下等人改成自己执行）。
  - **patch**：不改行为的修正（错字、bug、说明前后不一致），以及只改 README 或测试。
  - 三档取最高的一档；档位和理由写进 PR 描述的「参考」；版本号从 main 上的当前版本往上升，合并前 main 已升过就从新版本重新按同一档升。
- **触发条件放宽成「插件目录下任何文件」，不只 skill、agent、hook、脚本**：依据是缓存机制——版本号不变，这一版的任何文件都不会再更新，README 和测试也一样。
- **「漏升」由测试守，「升哪一档」由人读规则核**：新测试 `scripts/plugin-version.test.mjs` 对每个带 `plugin.json` 的顶层目录，比「当前工作区与 `origin/main` 的分叉点」之后的改动，有改动就要求当前 `version` 比 `origin/main` 上最新的大；比的是主分支最新而不是分叉点，所以别人先合了同一个号这里也会红，撞号在合并前就看得到。档位机械判不了（issue 原文如此），交给审查者对着三档和 PR 描述核，升错记成 Standards 轴的发现。
- **测试放仓库根 `scripts/`，不放 `idea-loop/scripts/`**：依据是 `pr-merge-says-release` 定下的先例，给本仓库自己规则写的测试放进插件，会随插件发给别的项目。全量测试命令因此同步改成再带上 `'scripts/*.test.mjs'`。
- **`origin/main` 不存在（没 fetch 过的克隆）就跳过并说明原因**，不报绿也不报红；基准可用环境变量换成别的 ref，用来在历史状态上演示红。版本按 `x.y.z` 三段数字比大小。
- **根目录 `AGENTS.md` 里 #178 的句子改写**：说一个插件 PR 可以合并、或交审核报告时，一并说它升到哪一版、哪一档；没碰插件的说「不碰插件，不升版本」。旧句「不升的，写明它会跟着哪个版本一起发」跟新规则冲突。
- **取舍：**
  - 没把规则写进 `idea-loop` 的 `pr` / `pr-review` / `implement`：版本怎么升是本仓库的发版方式，写进插件会带给所有装了 idea-loop 的项目，违反「插件里不出现任何项目的信息」；它们本来读目标仓库的 `REVIEW.md`，规则写在那里就会被执行。
  - 没加 CHANGELOG、git tag、GitHub release，也没给仓库加 CI（仓库没有 `.github/workflows`，全量测试由编排者转 ready 后本机跑一次，这条测试跟着它跑）。
  - 已知限制：删掉一个插件的 `plugin.json` 不要求升（历史上删 `plugin.json` 的 4 个提交 `175e8e6`、`30aefeb`、`2ef7759`、`84d86ff` 全是插件退役、迁出或改名，没有版本可升；误删找不到真实实例）。
  - `excalidrawer` 在 marketplace 里指向另一个仓库，这里没有它的 `plugin.json`，测试自然跳过。

## 3 结果（result）

- `REVIEW.md`：「验证命令」的全量测试为 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'`；「额外要求」有三档新文，含「参考」写法与撞号的说法。
- `scripts/plugin-version.mjs`（纯函数 `findViolations`、`compareVersions`）与 `scripts/plugin-version.test.mjs`（11 个用例：漏升、撞号、版本比主分支低、只改 `docs/` 或仓库根不受影响、新插件不要求升、两个插件只升一个、目录名前缀相同不算同一个插件、三段数字比大小、版本号不是 `x.y.z`，加一条对真实仓库状态跑的断言，`origin/main` 不存在时跳过）。
- 根目录 `AGENTS.md` 的「当前 plugins」下已是新句；`CODING_STANDARDS.md` 写明守本仓库自己规则的脚本放仓库根 `scripts/`。
- 合并在 PR #316「REVIEW.md：改了插件的 PR 按改动性质升版本号」（决定记录进 PR #318）。issue #305 已 COMPLETED 关闭（2026-11-14）。

**取代线索：** 本决策取代 ADR-0042「plugin 版本不单独升：单条规则的小修随集成时的 chore 统一升」；承接 `pr-merge-says-release`（#178）的「说随哪个版本发」，把它改写成「说升到哪一版、哪一档」。
