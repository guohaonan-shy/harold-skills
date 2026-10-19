# 04 — 归档脚本与合并前钩子

**Blocked by**：01 — 设计档案的结构说明与校验
**设计冻结**：不涉及 UI

## 要建什么

让「本地还有没归档的 UI 改动就不能合并」这件事真的发生，并提供把改动并进 `prod/` 的唯一写入口。

### 合并前钩子

插件级 PreToolUse 钩子挂在 Bash 上：命令里含 `gh pr merge`，且当前仓库的 `docs/design/tmp/` 下有任何非空的需求目录，就拦下（按 Claude Code 钩子约定以阻断退出码返回），提示先归档并点名是哪几个需求。其余命令、`tmp/` 为空或不存在、不在 git 仓库里时一律放行。钩子只跑脚本，不起 agent，也不设 CI 检查。

### 归档脚本（命令行）

输入一个 spec 名，把 `docs/design/tmp/<spec-slug>/delta/` 并进 `prod/`：

1. 先跑 01 的校验（叠加这份 delta）；不通过就**什么都不写**，报出违规后非 0 退出。此时 `usedBy` 还没重算，新增页面引用已有组件时必然不一致，所以这一步跳过「`usedBy` 与反向引用一致」那半条（01 的校验模块有开关支持），第 3 步生成之后再完整校验一次。
2. `delta/` 下的对象文件按同路径覆盖进 `prod/`（连同各自的 `assets/`），按 `delta/removed.md` 删掉对象。
3. 重新生成所有组件与动效的 `usedBy`，重新生成 `prod/index.md`（页面、组件、动效、用户路径四张清单，表体从 frontmatter 生成；保留 index 自身 frontmatter 里的主视口 / 主题 / 语言设定）。
4. 交互图：`tmp/<spec-slug>/canvas/` 下的交互图挪进 `prod/pages/<page>/assets/flows/`（page 取图所对应状态的页面；对应不上时放进 delta 里第一个页面并在输出里说明），然后把 `docs/spec/<spec-slug>/<spec-slug>.md` 里指向旧位置的图片链接改写成新路径。
5. 检查目标仓库 `.gitattributes` 是否用 Git LFS 管 `docs/design/prod/**/assets/` 下的 png / gif / webm；没有就在输出里提示要加的那几行，**不改** `.gitattributes`。
6. 清空 `tmp/<spec-slug>/`。
7. 输出一份摘要：新增、改动、删除了哪些对象，挪了哪些图，改了 spec 的哪些链接。

还要有一个 dry-run 选项：只校验并输出摘要，不写。

目标项目 `.gitignore` 需要包含 `docs/design/tmp/`：归档脚本发现没有时一并提示（不代改）。

## 验收标准
- [x] 钩子：`tmp/` 下有非空需求目录时，喂一条 `gh pr merge 12` 被拦并点名该需求；清空后放行；非合并命令始终放行
- [x] 归档：夹具 delta 新增两个状态、改一条边、删一个状态，spec 引用了 `tmp/` 里的交互图；归档后 `prod/` 多两个状态、边更新、被删的没了，`usedBy` 与 `prod/index.md` 刷新，交互图在页面的 `assets/flows/`，spec 链接已改写，`tmp/<spec-slug>/` 清空
- [x] 校验不过时 `prod/`、spec、`tmp/` 一个字节都不变
- [x] 没配 LFS、没忽略 `tmp/` 时各提示一次，且不改 `.gitattributes` / `.gitignore`
- [x] dry-run 不写任何文件
- [x] 钩子已登记进插件的钩子配置，已有三个 PostToolUse 钩子不受影响
- [x] 全量 node 测试套件全绿

## 选中的存量回归
无 test-cases 库。跑全量 `*/scripts/*.test.mjs`；已有的钩子测试（设计 lint、DESIGN.md、术语表）必须保持绿。
