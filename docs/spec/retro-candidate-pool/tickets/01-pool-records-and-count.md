# 01 — 候选池搬到 records、统一形状，加计数脚本

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

retro 批了、人选「进候选池」的规则候选，要有一个统一的家和统一的形状，次数能机械地数出来。做完后：

- harold-skills 的候选池在 `docs/records/retro-candidates/`（原来在 `docs/raw/retro-candidates/` 的 20 份全部移过去，git 历史保留为移动）。池里每份文件 `type: record`，一条候选一份。
- 每份文件同一个形状：frontmatter（type、captured、title、tags）之后，依次是 信号、落点、旧文、新文、例子，一行「状态」（闭集：`在池里` / `已开 issue（<链接>）` / `驳回（<理由>）`），一节「出现」：每次出现一行，写哪个仓库哪个 issue、日期、逐字原话、那次的决定记录链接；后来被人推翻的那一行不删，标「已推翻」并附推翻时的原话。
  - 已有 6 份（文件名以日期开头的）基本是这个形状，补齐「状态」和「出现」。
  - 13 份 `retro-candidate-<号>.md` 和 #86 那份是当时 issue 的原文：改写成这个形状，原 issue 链接留在文件里，「出现」从原文里写的次数与来源取（例：#102 原文列了 #55 两次、#51 一次；#51 那次和 #55「别名 import」那次，人在 harold-skills#108 里回看后不再算数——#115 正文写的「依据只剩 1 次」，原话见 `docs/raw/decisions/108.md` 候选 2——都标「已推翻」）。照原文搬，不重新审其余的。状态都是 `在池里`。
- `docs/records/index.md` 新建，说明 `retro-candidates/` 收什么：retro 里人批了、选「进候选池」的规则候选，落点是插件的在 harold-skills、落点是项目的在项目自己的池；由 retro 写入与追加「出现」，由 dreaming 读和改「状态」。`docs/raw/index.md` 里 `retro-candidates/` 那段说明与对应行删掉或改成指向新位置。
- 一个计数脚本（idea-loop 插件的 scripts 下，跟其它脚本同风格：纯函数 + 底部 CLI，带 `*.test.mjs`）：喂一个候选池目录，按 JSON 输出每份候选的文件名、标题、落点、状态、出现次数（「出现」里不同会话的行数，去掉标「已推翻」的）、是否过门槛（次数 ≥3）。门槛 3 的依据是人在 Tofelair#538 的原话「出现超过两次」。文件形状不对（缺「出现」或「状态」、状态不在闭集里）的，列成问题、非零退出。

## 验收标准

- [x] `docs/raw/retro-candidates/` 不存在；`docs/records/retro-candidates/` 下 20 份，`git log --follow` 能追到原文件
- [x] 计数脚本对整个池跑一遍：零问题、退出码 0，每份都有次数
- [x] 单元测试覆盖：一条 3 次其中 1 次已推翻 → 2 次不过；一条 3 次都成立 → 过；同一会话出现两行只算 1 次；缺「出现」→ 报问题；状态不在闭集 → 报问题
- [x] `docs/` 下所有 `[[...]]` 链接都指得到文件（link sweep）
- [x] `docs/records/index.md` 写明收什么、谁写谁读
- [ ] review 第 1 轮 S2（2026-10-26）：池里 retro-candidate-82、83、84、86、95、96、97 这 7 份的旧文、新文、例子改成跟其余候选一样的固定行写法（每样一行，以「- 旧文：」「- 新文：」「- 例子：」开头），内容不改；没有例子的写「- 例子：无」

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs`：这一刀不碰它，但 scripts 目录的公共工具（如 frontmatter 解析）若被复用，它会第一个红
- 整个 `node --test idea-loop/scripts/` 跑一遍，确认新脚本没跟已有脚本的导出撞名
