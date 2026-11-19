# 01 — dyna 入口、登记表、版本核对，issues 模块打通

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

在仓库顶层新建命令行目录 `dyna`（一个 Go 模块，不是插件，marketplace 不列它），把整条链路先用 issues 一个模块打通：会话敲 `dyna issues <命令>`，经插件的小脚本核对版本范围，转给装好的二进制，执行的行为跟现在的 issues 脚本一模一样。

这一刀包含：

- **命令树与登记表**：Go + cobra，按模块分包（`cmd` 下的 main 只拼命令树；每个模块一个内部包；共用包放版本范围判断、「报错带下一条命令」的错误类型、进程树管理、GitHub 身份）。每条命令标注「谁能调」：会话 / 只由 hook / 只给测试。`dyna registry --json` 从命令树导出登记表（命令、参数、一句话说明、调用方、出错时提示的下一条命令）；`--help` 从同一棵树生成。
- **版本**：命令行有自己的语义化版本号（第一版 0.1.0）；插件根目录一个文件写插件要的命令行版本范围。
- **插件小脚本**：插件里一个几行的 sh 脚本 `bin/dyna`，把插件目录（`IDEA_LOOP_PLUGIN_ROOT`）和版本范围交给 `~/.idea-loop/bin/dyna`；自带 `self install` / `self upgrade`（curl 下载对应平台的包、shasum 核校验和，不需要二进制在场）。没装时说「跑 `/idea-loop:setup` 装命令行」。
- **二进制核版本**：不在范围里就不执行，说出本机版本、要的范围和下一步（低了：跑 `/idea-loop:setup` 升级；高过上限：去 `/plugin` 更新插件）。带 `--hook` 的命令版本不对时不拦、不报错，只在 stderr 留一行。
- **issues 模块**：现有 issues 脚本的全部子命令和行为用 Go 重写（`show`、`set`、`check` 等，参数、输出、退出码不变）；新增：挡路关系的标、去、列（包 GitHub 的 blocked_by 接口）；`gh issue` 的读、开、评论；`guard --hook`：从 stdin 读 PreToolUse 事件，用 `gh issue edit` 加或去 `status:*` label 的拦下并提示 `dyna issues set`，别的 label 放行。
- **扫描测试**（`node --test`，放插件测试里）：扫 skill、agent、README、`hooks.json`、`.mcp.json` 里写的每条 `dyna <模块> <命令>`，拿「插件写的最低版本」那份已存的登记表对：命令或参数不存在就红并报文件和行；只由 hook 调的命令出现在 skill/agent 里就红；`test` 模块只许测试、`REVIEW.md`、`DEVELOPMENT.md` 引用；最低版本没有存档的登记表就红，报「最低版本 X 还没发布」。登记表按版本一份存进命令行目录。
- **发布配置**：goreleaser 配置出 Mac（arm64、amd64）、Linux（amd64、arm64）的包和校验和，标签 `dyna-v<版本>`。只写配置、本机能 `goreleaser release --snapshot` 出包，不打标签、不上传（发版是工单 14，由人说了才发）。
- **仓库约定**：`DEVELOPMENT.md` 写要的 Go 版本和 goreleaser、怎么编本地二进制并用它跑（不要用 `~/.idea-loop/bin/` 里已装的发布版）；`REVIEW.md` 的验证命令加 `go test ./...`；照插件版本测试加一条「改了命令行代码就必须升命令行版本」；`AGENTS.md` 的 Repository Purpose 加一句命令行目录是什么；`GLOSSARY.md` 加「dyna：idea-loop 的命令行」。

这一刀不改任何 skill 文字，旧的 issues 脚本先留着（收缩在工单 19）。

## 验收标准

- [ ] `go test ./...` 在命令行目录全绿；现有 issues 脚本行为测试的断言都已搬成 `go test`（逐条对照，没搬的写理由）
- [ ] 对同一份 docs 和同一个 issue，`dyna issues show` 与旧脚本 `show` 的 JSON 输出一致；`set` 被拒的情形与提示一致
- [ ] `dyna registry --json` 输出包含 issues 模块每条命令的名字、参数、说明、调用方、下一条命令
- [ ] 把 `gh issue edit 1 --add-label status:todo` 喂给 `dyna issues guard --hook` 被拦，提示里有 `dyna issues set`；`gh issue edit 1 --add-label kind:bug` 放行
- [ ] 插件小脚本测试（假二进制）：范围写 `>=0.4.0 <1.0.0`、二进制报 0.3.2 时不执行并提示跑 `/idea-loop:setup` 升级；报 1.0.0 时提示去 `/plugin` 更新插件；没有二进制时提示跑 `/idea-loop:setup` 装
- [ ] 扫描测试：一份夹具 skill 写 `dyna issues frobnicate` → 红，报文件和行；写 `dyna issues guard` → 红，报「只许 hooks.json 引用」；最低版本写一个没存登记表的版本 → 红，报还没发布
- [ ] 端到端：临时插件目录 + 本地编出的二进制，`claude -p --plugin-dir <它>` 让会话跑 `dyna issues --help`，打印命令表、退出 0（⏭ 延后 → 跑不了 `claude -p` 时在交回里写明）
- [ ] `goreleaser release --snapshot --clean` 本机出 4 个平台的包和校验和
- [ ] 改了命令行代码没升命令行版本时，新加的版本测试红

## 选中的存量回归

- `issues.test.mjs`：行为基准，搬之前先跑一遍确认绿，搬后 Go 版对同样的输入给同样结果
- `plugin-version.test.mjs`：新加的命令行版本测试照它写，不能把它弄坏
- `no-project-leak.test.mjs`：命令行目录里的夹具和提示文字不能带真实项目信息（它若只扫插件目录，确认新目录的文字也守这条）
