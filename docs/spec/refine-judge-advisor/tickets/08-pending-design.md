# 08 — 搁置的设计：放在主 checkout 的 pending，起手时找回，对账时提醒

**Blocked by**：06（同改 uiux-refine 的 skill 主体）、07（同改「冻结之后」参考，本张改其中「会话中断或重开」一段）
**设计冻结**：不涉及 UI

## 要建什么

真实发生过：一块界面 imagine 了四轮、refine 做到第 7 版后，人看了线上数据决定「先不做」。设计成果留在需求的设计目录 `docs/design/tmp/<spec-slug>/` 里会被当成进行中的设计、合并前归档时清掉；删掉的话，以后做这块界面又得从头 imagine。人要求挪到 `docs/design/pending/<spec-slug>/`，并定了「先放在local吧～」，可没有任何约定认识这个目录。

每个 issue 会话跑在自己的 worktree 里，worktree 用完会被清掉，所以搁置的设计固定放在**主 checkout**（`git worktree list` 的第一行）里。

这张工单之后：
- **挪**：人说「这块界面先不做」时，编排者把当前 worktree 的 `docs/design/tmp/<spec-slug>/` 原样挪到主 checkout 的 `docs/design/pending/<spec-slug>/`，不清理里面的东西；spec 里写一句指针和搁置理由。
- **只在本地**：跟 `docs/design/tmp/` 一样加进仓库共用的本地忽略（git 公共目录下的 `info/exclude`），不提交，仓库的 `.gitignore` 不动。
- **找回**：`uiux-imagine`、`uiux-refine` 起手时先看主 checkout 的 `pending/` 里有没有同一块界面的设计，有就问人要不要接着做；要的话复制回当前 worktree 的 `tmp/`，再从「中断与恢复」接上。
- **对账**：`dreaming` 读主 checkout 的 `pending/`，列出每一份和它的 spec 是否已了结；spec 已了结的，提议删。
- **设计档案校验**跳过 `pending/`，不把它当旧布局报提示。
- `wiki-conventions` 的目录约定和「本地忽略」写进 `pending/`。

## 验收标准

- [x] `wiki-conventions` 的目录图和生命周期里有 `design/pending/<spec-slug>/`：放在主 checkout、只在本地、谁挪、谁读
- [x] `uiux-imagine`、`uiux-refine` 起手前查主 checkout 的 `pending/`，有同一块界面就问人；接着做时复制回当前 worktree 再从中断与恢复接上
- [x] 「这块界面先不做」的挪法写在设计流程里（含 spec 里留指针和理由）
- [x] `dreaming` 对账列出 pending 的每一份和 spec 是否已了结，已了结的提议删
- [x] 设计档案校验对 `pending/` 不报任何提示，有单元测试（在 `docs/design/` 下放一个 `pending/<slug>/` 的夹具）
- [x] uiux-refine、uiux-imagine 的 SKILL.md 主体仍 < 5000 字

## 选中的存量回归

- `design-archive-check.test.mjs`、`archive-check-flag.test.mjs`：校验要跳过一个新目录，`tmp/`、`prod/` 和旧布局提示的行为不能变
- `dreaming-autonomous-doc.test.mjs`、`dreaming-incremental-doc.test.mjs`：dreaming 加一类对账行
- `knowledge-base-landing-doc.test.mjs`、`design-tmp-worktree-root-doc.test.mjs`：它们断言 wiki-conventions 与 uiux-* 里设计目录的写法
- `proposal-table-check.test.mjs`：dreaming 的提议表若加新行类型要过它
- [ ] 全量测试（2026-11-16）：`issue-model-tripwire` 与 `pr-flow-doc` 两条守卫红——「搁置」是旧状态机八个状态之一，插件里不许再出现；搁置的设计换一个不撞旧状态名的叫法（README、dreaming 提议表的行类型与校验脚本、uiux-imagine / uiux-refine 等处一并换），两条守卫转绿
- [ ] 文档一致（2026-11-16）：根目录 `AGENTS.md` 写 dreaming「只问人两类（`DESIGN.md` 和文档里的冲突）」，这张工单让它又多问「要删的搁置设计」，跟 idea-loop README 的 dreaming 一行对不上；订正那一句
