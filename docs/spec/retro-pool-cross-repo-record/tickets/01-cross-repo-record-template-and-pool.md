# 01 — 候选池「出现」行：跨仓库的决定记录写仓库加路径，修掉池里 5 条断链

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

retro 把规则候选写进 `docs/records/retro-candidates/`，每份的「出现」一行末尾写「决定记录：[[<文件名>]]」。在别的仓库跑的 retro 往本仓库的池里写时，决定记录在那个仓库，本仓库里点不开（现有 5 处，见 spec「问题陈述」的表）。

做完后：

1. `idea-loop/skills/productivity/retro/references/candidate-pool.md` 模板下的规则列表多一条：决定记录不在池所在的仓库时，写 `<仓库> \`docs/raw/decisions/<文件名>.md\``（「候选 N」照样跟在后面），不用 `[[ ]]`。只用 `<仓库>` 占位，不写真实项目名。
2. 池里 5 处 `[[577]]`、`[[731]]`、`[[712]]`、`[[522]]`、`[[643]]` 改成同样写法，仓库名照那一行行首写，后面的「候选 N」原样保留。
3. `idea-loop/.claude-plugin/plugin.json` 的 `version` 0.1.14 → 0.1.15（patch）。

## 验收标准

- [x] `docs/records/retro-candidates/` 里每个 `[[x]]` 在 `docs/` 下都有 `x.md`。
- [x] `candidate-pool.md` 的规则列表含上面第 1 条，没有真实项目名。
- [x] 5 处改写后，行首的 `- <仓库>#<号>` 没动（计数脚本按它数）。
- [x] 全量测试（`idea-loop/scripts/*.test.mjs`、`scripts/*.test.mjs`）全绿。
- [x] 全量测试里唯一的红：#303 留下的一条测试把 idea-loop 版本钉在 0.1.14，升版即红，跟 `REVIEW.md`「改了插件就必须升版本」冲突。删掉它，「必须升」由 `scripts/plugin-version.test.mjs` 守。

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：新增的规则文字不能带项目名。
- `idea-loop/scripts/retro-pool-count.test.mjs` 与对真实池跑一遍 `retro-pool-count.mjs`：改写不影响计数、不报形状问题。
- `scripts/plugin-version.test.mjs`：改了插件就得升版本。
