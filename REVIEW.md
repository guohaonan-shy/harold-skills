# Review

## 验证命令

写代码时常跑前两条，提交前跑全量；review 时每一条都跑一遍。

| 用途 | 命令 |
|---|---|
| 类型检查 | 无（纯 `.mjs`，没有类型检查） |
| 单个测试文件 | `node --test <文件>` |
| 全量测试 | `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` |
| 设计档案浏览器测试 | `IDEA_LOOP_BROWSER_TESTS=1 node --test idea-loop/scripts/design-archive-sections-browser.test.mjs`。改了 `design-archive-sections.mjs`、它引入的 `ui-png-compare.mjs`，或这份浏览器测试本身时跑；约 6 分钟，放后台跑。全量测试不设这个变量，这份文件的用例全部 skipped |
| lint | 无 |

## 额外要求

- 改了某个 plugin 的 skill、agent、hook、脚本或产物位置，同一个改动里同步它自己的 `README.md`（`AGENTS.md` 的约定）。
- `SKILL.md` 的 frontmatter description 只做路由，主体 < 5000 字（量法见 `AGENTS.md`「标准 plugin 目录结构」的要点），`allowed-tools` 收窄到具体命令模式（`AGENTS.md`「SKILL.md 编写约定」）。
- idea-loop 插件里（`evals/` 和 `scripts/` 下测试的夹具除外）不出现任何项目的信息，例子用通用的（`idea-loop/scripts/no-project-leak.test.mjs` 守着）。
- 改了某个 plugin 目录下任何文件的 PR，交审核报告前按改动的性质升它 `.claude-plugin/plugin.json` 的 `version`，三档取最高的那一档：
  - **major**（1.0.0）：装了它的项目不改自己的配置或用法就会坏，比如删掉或改名一个 skill、改了一个 skill 的调用参数、产物换了位置。
  - **minor**（0.1.0）：新增能力，或改了流程的行为但老用法照样能用；插件还在 0.x 时，只有大范围的重构或者使用方式的重大改动才算，比如整条流程重新划分阶段、人要重新学怎么调用。
  - **patch**（0.0.1）：不改行为的修正，比如修错字、修 bug、修说明里前后不一致的地方，以及只改 README 或测试；插件还在 0.x 时，加 skill、agent、hook 或改已有流程的行为，老用法照样能用的，也算 patch，比如 retro 摆候选时多给一句去处推荐。

  定了哪一档、为什么，写进 PR 描述的「参考」。版本号从 main 上的当前版本往上升；合并前 main 已经升过（别的 PR 先合了），就从 main 的新版本重新按同一档升。`scripts/plugin-version.test.mjs` 守着「改了就必须升」。
