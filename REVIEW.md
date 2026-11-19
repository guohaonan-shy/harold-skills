# Review

## 验证命令

写代码时常跑前两条，提交前跑全量；review 时每一条都跑一遍。

| 用途 | 命令 |
|---|---|
| 类型检查 | `.mjs` 没有类型检查；命令行 dyna：`cd dyna && go vet ./...` |
| 单个测试文件 | `node --test <文件>`；命令行 dyna：`cd dyna && go test ./internal/<包>` |
| 全量测试 | `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'`；命令行 dyna：`cd dyna && go test ./...` |
| lint | `.mjs` 没有；命令行 dyna：`cd dyna && gofmt -l .`（有输出就是没格式化） |

## 额外要求

- 改了某个 plugin 的 skill、agent、hook、脚本或产物位置，同一个改动里同步它自己的 `README.md`（`AGENTS.md` 的约定）。
- `SKILL.md` 的 frontmatter description 只做路由，主体 < 5000 字（量法见 `AGENTS.md`「标准 plugin 目录结构」的要点），`allowed-tools` 收窄到具体命令模式（`AGENTS.md`「SKILL.md 编写约定」）。
- idea-loop 插件里（`evals/` 和 `scripts/` 下测试的夹具除外）不出现任何项目的信息，例子用通用的（`idea-loop/scripts/no-project-leak.test.mjs` 守着）。
- 改了命令行 `dyna/` 下的代码（`_test.go` 除外），同一个改动里升 `dyna/internal/version/version.go` 的版本，并把新版本的登记表存进 `dyna/registry/`（做法见 `DEVELOPMENT.md`「命令行 dyna」）；`scripts/dyna-version.test.mjs` 和 `go test` 守着。插件要的命令行版本范围写在 `idea-loop/dyna-version`，下限只在 skill 开始用新命令、新参数时提高，且那一版必须已经发布、登记表已存（`scripts/dyna-scan.test.mjs` 守着）。
- 改了某个 plugin 目录下任何文件的 PR，交审核报告前按改动的性质升它 `.claude-plugin/plugin.json` 的 `version`，三档取最高的那一档：
  - **major**（1.0.0）：装了它的项目不改自己的配置或用法就会坏，比如删掉或改名一个 skill、改了一个 skill 的调用参数、产物换了位置。
  - **minor**（0.1.0）：新增能力，或改了流程的行为但老用法照样能用，比如加一个 skill，或者某个流程从停下等人改成自己执行。
  - **patch**（0.0.1）：不改行为的修正，比如修错字、修 bug、修说明里前后不一致的地方，以及只改 README 或测试。

  定了哪一档、为什么，写进 PR 描述的「参考」。版本号从 main 上的当前版本往上升；合并前 main 已经升过（别的 PR 先合了），就从 main 的新版本重新按同一档升。`scripts/plugin-version.test.mjs` 守着「改了就必须升」。
