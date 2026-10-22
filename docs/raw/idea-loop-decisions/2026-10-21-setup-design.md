---
type: raw
source_type: document
captured: 2026-10-21
title: idea-loop setup 设计稿：项目配置集中到根目录的几份文件
tags: [idea-loop, setup]
related: []
---

# idea-loop setup 设计稿

2026-10-21，待 Harold 审。依据：idea-loop 对目标项目的依赖盘点，以及 mattpocock `setup-matt-pocock-skills`、claude-seo `/seo setup` 两份参照。

## 要解决的问题

idea-loop 的 skill 和 agent 现在各自去目标项目里**找**配置。比如在 CLAUDE.md / AGENTS.md 里找「worktree 准备命令」，在 REVIEW.md 里找「Verification paths」。找不到时各有各的兜底：

- worktree 走默认做法；
- 开发服务器启动命令没有兜底，agent 只能猜；
- dreaming 写死了 `origin/main`；
- `status:*` label 由 issue-dispatch 每轮顺手建。

结果是同一个项目事实散在好几处，每个使用方各自解释、各自兜底。

setup 把这些事实一次问清、写到**一个固定位置**。使用方只认这一处：没有就停下，让人跑 setup，不再自己猜。

## 定位

- 名字 `setup`，放在 `skills/engineering/setup/`。
- 只能由人调起（`disable-model-invocation: true`）。
- 每个目标项目跑一次；之后想改配置或插件升级了，再跑。重复跑只补缺的、改人说要改的，不覆盖人手改过的内容。

## 流程

1. **只读预检**，结果给人看一张表（正常 / 缺失 / 可选未装）：
   - git 仓库、`origin`、`origin/HEAD`
   - `gh` 已安装且已登录，对这个仓库有写权限
   - Codex companion 找得到（pr-review 要用）
   - Refero MCP（可选，uiux-research 要用）
   - Node
   
   这一步不安装、不登录，只给出修法。

2. **探查已有内容**：
   - CLAUDE.md / AGENTS.md、REVIEW.md
   - CI 配置、`package.json` 的 scripts、锁文件
   - `.worktreeinclude`、`docs/` 目录树
   - GLOSSARY / DESIGN / PRODUCT 三份文件
   - `.gitignore`、`.gitattributes`
   
   探查能答出的就不问。

3. **问人**：只问探查答不出的，每个问题带一个推荐答案，一次最多三个。
   - worktree 准备命令（接收端口参数）
   - 开发服务器启动命令（接收端口参数）
   - 验证命令：typecheck、单个测试、全量测试、lint
   - 基准分支（默认取 `origin/HEAD`）
   - 用不用 GitHub App 代发评论
   - 做不做 UI 设计（决定下面设计相关的几项要不要配）

4. **写入**，见下一节。

5. **交回给人**：写了哪些文件、建了哪些 label、哪些项留给人自己做（附命令）。

## 写到哪里

**定位一处，指针一行。** 照 mattpocock 的做法：

- **`docs/agents/idea-loop.md`**：项目事实的唯一来源，固定几个小节——
  - 命令：worktree 准备、开发服务器、验证
  - 分支：基准分支、合并方式
  - GitHub：仓库、label、App
  - 设计：做不做；做的话写设计档案默认的视口、主题、语言
  
  frontmatter 里记写入时的插件版本号，用来判断配置是不是过期了。
- **目标仓库 `AGENTS.md` 里一个 `## idea-loop` 块**：两行，指向上面那份文件。它常驻，所以所有 skill 和 agent 都能看到。
- **只补缺、不覆盖**：
  - `docs/` 骨架（`spec/`、`adr/`、`raw/`、`index.md`）
  - `.gitignore` 加 `docs/design/tmp/`
  - `.git/info/exclude` 加 `.tmp/`
  - 做设计的项目，在 `.gitattributes` 里给设计档案的图片配 Git LFS
- **GitHub**：建 6 个 `status:*` label（调现有的 `issues.mjs labels`）。用 App 的话，在 `~/.idea-loop/github-apps.json` 加一条：人给 appId 和私钥路径，setup 只写路径，不读私钥内容。

## 使用方怎么改

照 mattpocock 的两级依赖：

- **硬依赖**：implement 和 issue-explorer 要用 worktree 和开发服务器命令，pr-review 要用验证命令，issue-dispatch 要用 GitHub 和 label，dreaming 要用基准分支。
  - 改成读 `docs/agents/idea-loop.md` 的对应小节。
  - 没有这份文件，或里面的版本号低于当前插件版本时，停下，告诉人跑 `/idea-loop:setup`。
  - 删掉各自的兜底。dreaming 的 `origin/main` 改成读配置里的基准分支。
- **软依赖不变**：GLOSSARY.md、DESIGN.md、PRODUCT.md 照旧——有就读，没有就照常做，由 grill、uiux-imagine、dreaming 各自负责创建。

## setup 不做的事

- 不安装 `gh`、Codex、Refero、Playwright，也不执行 `gh auth login`。
- 不创建 GitHub App。
- 不写 GLOSSARY.md、DESIGN.md、PRODUCT.md，这三份各有负责创建的 skill。
- 不替人决定 CI 里跑什么。

## 顺手发现的问题（和 setup 相关）

- `docs/raw/index.md`：to-spec 和 prototype 都说它「从 frontmatter 生成」，但插件里没有任何脚本生成它。
- REVIEW.md 是 idea-loop 自己约定的文件名，项目里不一定有。setup 问出验证命令后写进 `docs/agents/idea-loop.md`，pr-review 改成读那里，REVIEW.md 降为可选的补充规则来源。

## 要你拍板的

1. 配置文件放在 `docs/agents/idea-loop.md`（跟着仓库走，团队共享），还是 `.idea-loop/config.json`（机器好读，但人不常看）？我推荐前者：使用方大多是 agent 读 Markdown，脚本只需要基准分支，可以从 `git` 自己查。
2. 「配置过期就停下」要不要做？做的话，插件每次改了配置的格式，都要所有项目重跑一次 setup。
3. 使用方的改动（删兜底、改读这份配置）和 setup 本身是放在同一个 PR，还是 setup 先合、使用方的改动分开做？
