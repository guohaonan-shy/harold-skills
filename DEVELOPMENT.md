# 开发

idea-loop 的 agent 照这份文件选分支、准备 worktree、起服务。小节标题保持原样：idea-loop 按标题找。

## 分支

- 基准分支：`main`
- 合并方式：`merge`

## worktree 准备

新 worktree 在开工前跑：

```
无
```

仓库没有依赖和锁文件，也没有被 git 忽略的配置；新 worktree 不用补任何东西，开工即可。

## 开发服务器

```
无
```

起好了的判断：无。仓库是 Claude Code plugin 的 marketplace，没有要起的服务；脚本直接用 `node` 跑。

## 命令行 dyna

`dyna/` 是 idea-loop 的命令行（Go 模块，不是插件；说明在 `AGENTS.md` 的 Repository Purpose）。

- **要装的**：Go 1.27 或更新（`brew install go`）；做发布包时还要 goreleaser（`brew install goreleaser`）。Go 模块依赖第一次 `go test` / `go build` 时自动下载。
- **编本地二进制并用它跑**：在 `dyna/` 下 `go build -o ../.tmp/dyna ./cmd/dyna`，再用 `../.tmp/dyna <模块> <命令>` 跑。**不要用 `~/.idea-loop/bin/` 里已装的发布版**：那是别的版本，不是正在改的这份。
- **让会话调到本地版**：设 `IDEA_LOOP_DYNA_BIN=<本地二进制的路径>`，插件的 `idea-loop/bin/dyna` 就转给它，不用 `~/.idea-loop/bin/` 里的。插件小脚本的测试（`idea-loop/scripts/dyna-launcher.test.mjs`）用临时 `HOME` 放二进制，不碰真正的 `~/.idea-loop/`。
- **测试**：`cd dyna && go test ./...`；扫 skill 文本和插件小脚本的测试用 `node --test`（见 `REVIEW.md` 的验证命令）。
- **新一版的登记表**：改了命令或参数，就升 `dyna/internal/version/version.go`，再 `../.tmp/dyna registry --json > registry/<新版本>.json`（在 `dyna/` 下）；`go test` 会核对存的那份和命令树一致。
- **出包（不发布）**：在 `dyna/` 下 `goreleaser release --snapshot --clean`，4 个平台的包和校验和落在 `dyna/dist/`（已被忽略）。打 `dyna-v<版本>` 标签、传 GitHub Releases 是发版，由人说了才发。
- **发版（人说了才发）**：goreleaser 开源版不认 `dyna-v` 前缀的标签，所以只用它在本机出包，上传用 gh：
  1. `git tag -a dyna-v<版本> -m "dyna <版本>" <提交>`，`git push origin dyna-v<版本>`；
  2. 在 `dyna/` 下 `GORELEASER_CURRENT_TAG=v<版本> goreleaser release --clean --skip=publish,validate,announce`；
  3. `gh release create dyna-v<版本> --verify-tag --draft --latest=false --title "dyna <版本>"`，再逐个 `gh release upload` 4 个包和校验和（网络断了就重传那一个），核对大小后 `gh release edit dyna-v<版本> --draft=false`；
  4. 从公开地址下载一个包核校验和，再 `idea-loop/bin/dyna self install`（装进 `~/.idea-loop/bin/`，装之前把改前改后给人看）。

## 清理

无。
