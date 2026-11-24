# 01 — 认环境改成读运行环境说明开头的标记，dyna 不再写死环境名单

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

现在 dyna 认运行环境靠写死在代码里的两项名单（claude-desktop、magi）和一条写死的规则（`IDEA_LOOP_RUNTIME` → `MAGI_SESSION_ID` → claude-desktop）。这张工单做完后，`dyna runtime name`、`dyna runtime show <能力>`、`dyna runtime inject <runtime|reference>` 认环境、找说明都只看两个目录里的运行环境说明，dyna 代码里不再出现任何运行环境的名字（默认落到 claude-desktop 的那一处除外，见下）：

- 两个目录：插件的 `runtime/`（`IDEA_LOOP_PLUGIN_ROOT` 下），和 home 的 `runtime/`（home 照现有本机覆盖的取法：`IDEA_LOOP_HOME`，没设就是用户主目录下的 `home`）。
- **每份说明的开头一行写标记**：在第一个 `## ` 小节之前，有一行以 `标记：` 开头。写了一个反引号包住的环境变量名（如 `` 标记：`MAGI_SESSION_ID` ``）就是这个环境的标记；写「没有」（如 `标记：没有`，桌面端就是这样）就是没有标记。没有 `标记：` 这一行的文件不是一份说明（插件里 `capabilities.md`、`claude-desktop-mic.md` 这类细节文件就是这样）。插件的两份说明各补上这一行：magi 写 `MAGI_SESSION_ID`，claude-desktop 写没有标记，并用一句话说明「标记」是什么。
- **哪些名字算认识的**：插件 `runtime/` 下带标记行的 `<名>.md`，加上 home `runtime/` 下带标记行、插件里没有同名的 `<名>.md`（用户自己的新环境，它就是一份完整的说明）。home 里跟插件同名的文件照旧是本机覆盖，规则一字不变，它可以没有标记行，标记以插件那份为准。
- **认环境的顺序**：
  1. `IDEA_LOOP_RUNTIME` 有值：是认识的名字就用它；不认识照旧报错退出、不猜，报错里列出认识的名字。
  2. 按名字排序扫认识的说明，哪份的标记变量在环境里有值就是它。不止一份有值时取第一份，并在 `inject reference` 的输出最前面加一行提示：哪几份的标记同时有值、用了哪一份。
  3. 都没有：用 home 里人选的环境。人选的记在 home 的 `runtime/` 目录里一个叫 `selected` 的纯文本文件，内容就是一个环境名（首尾空白不算）。写的名字不认识：当作没选，`inject reference` 最前面提示一行。
  4. 人也没选：claude-desktop（命令行、IDE 插件没有可靠标记，照旧落到这里）。
- `show <能力>`、`inject reference` 读的说明：插件里有的读插件那份并合并本机覆盖（现有行为）；只在 home 里有的直接读 home 那份。
- `dyna runtime --help` 里「认环境」「加一种运行环境」两段改成新规则：加一种环境 = 多一份带标记行的说明（插件里或 home 里），不改 dyna。
- dyna 版本在当前的 0.0.11 上升到 0.0.12，存 `registry/0.0.12.json`，插件的 `dyna-version` 下限提到 0.0.12（照 #437 的做法；后面几张工单改了命令就重存同一份 0.0.12 登记表，不再升）。

## 验收标准

- [ ] Go 单元测试先红后绿：home 里放一份 `zed.md`，标记行写 `ZED_SESSION`；设 `ZED_SESSION=1` 跑 `runtime name` 打印 `zed`，`runtime show 推送` 打印 zed.md 的「推送」一节。
- [ ] 没有任何标记变量、home 里没有 `selected`：`runtime name` 打印 `claude-desktop`；写入 `selected` 为 `magi` 后打印 `magi`；写入不认识的名字仍打印 `claude-desktop`，`inject reference` 第一行是提示。
- [ ] `MAGI_SESSION_ID` 有值时照旧是 magi；`IDEA_LOOP_RUNTIME=zed`（home 里有 zed.md）被认出，`IDEA_LOOP_RUNTIME=nope` 报错退出 1、列出认识的名字。
- [ ] 两份说明的标记同时有值：取排序后的第一份，`inject reference` 第一行写出提示。
- [ ] 插件的 `claude-desktop-mic.md`、`capabilities.md` 不被当成环境；home 里跟插件同名、没有标记行的文件照旧按小节覆盖，现有本机覆盖测试全绿。
- [ ] dyna 代码里不再有写死的环境名单（`Names` 删掉，改用从说明目录读出的名单）；`go test ./...` 全绿，登记表 0.0.12 已存，`dyna-version` 下限 0.0.12。
- [ ] 桌面端 `inject reference` 不超过 10000 字（现有长度测试照跑）。

## 选中的存量回归

- `dyna/internal/runtime` 的 `runtime_test.go`：认环境、注入、数据与名单一致的测试，名单改成读目录后最容易坏。
- `dyna/internal/runtime` 的 `override_test.go`：本机覆盖的合并，新增「home 里只有它」一层后要证明覆盖行为没变。
- `idea-loop/scripts/session-start-inject.test.mjs`、`runtime-data-doc.test.mjs`：开场注入长度与两份说明的格式。
- `scripts/dyna-version.test.mjs`：改了 dyna 要升版本。
