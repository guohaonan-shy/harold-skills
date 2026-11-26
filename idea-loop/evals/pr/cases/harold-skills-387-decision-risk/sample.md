# 样本：命令行的 PR，人在 review 里定的事不写，它带出的兼容风险写进合并风险

**一句话**：一个把 58 个脚本换成命令行 dyna 的 PR。review 第 1 轮人定了「自写的小 YAML 解析器换成现成的库」，决定本身在 review 归档评论里；它带出的后果（值里有冒号、问号、花括号又没加引号的档案读不出来）要写进合并风险，让读描述的人知道合并后会撞上什么。

## 出处

- guohaonan-shy/harold-skills#387「idea-loop 命令行 dyna」，2026-11-19 15:35 UTC 合并到 `release/idea-loop-0.2.0`（issue #339）。PR 分支 `issue/339-cli`，最后一个提交 `f35fecf6`，573 个文件，+75989 −29800，60 个提交。
- #452 triage 会话里人问「人定的事带来的风险写哪」，决定记录 `docs/raw/decisions/452.md` 题 24。
- 人在 review 里的批示在合并时贴出的归档评论里：第 1 轮「S1 B，换现成库」；实现阶段第 1 次「D2 可以先不发，等所有内容实现完成再用0.0.1」。
- 材料取法：`gh pr view 387 --repo guohaonan-shy/harold-skills`；文件清单 573 个，prompt 里按目录合并。

## 当时产出的原文

**旧描述**（PR 合并时的原文，没改一个字；十节的旧格式，下面的 `<!-- idea-loop:section … -->` 行是写入工具加的段落标记）

~~~~~markdown
<!-- idea-loop:section summary -->
## 一句话

idea-loop 的 58 个脚本收成一个用 Go 写的命令行 dyna（已发到 0.0.2）：会话和子代理在任何目录直接敲「dyna 模块 命令」，不再抄全路径和参数；手改 issue 状态、手删 worktree 会被拦下并告诉该用哪条命令；调 Codex 跑完或超时就连子进程一起结束，不再堆常驻进程；运行环境的做法变成命令自带的数据，子代理按能力取。
<!-- /idea-loop:section summary -->

<!-- idea-loop:section problem -->
## 问题

- **调脚本只能抄全路径和参数**：skill 和子代理里一共 154 处写着脚本的完整路径，参数也抄在文字里；脚本一改参数，这些文字就悄悄过期，没有测试会发现。
- **易错操作每次手写**：建删 worktree、改 issue 状态、推送合并都靠 agent 手写，写法各不相同，漏解锁、漏删分支、手改状态 label 时有发生。
- **Codex 进程堆积**：经 Codex 插件起的审查进程从不退出，11-18 本机查到 154 个常驻进程、连同子进程 1205 个、约 3.76 GB 内存，最老的跑了 23 天。
- **子代理拿不到运行环境的做法**：只有主会话开场被注入，子代理要自己去翻 runtime skill 的参考。
<!-- /idea-loop:section problem -->

<!-- idea-loop:section changes -->
## 怎么修

- **一个命令行，按模块分**：issues、spec、home、pr、git、worktree、design、ui、serve、research、dreaming、seo、retro、runtime、agent、test 共 16 个模块。参数靠「--help」查，skill 只写查不到的约定。依据：spec 的模块表。
- **跟 skill 分开发布**：命令行编成二进制单独发（GitHub Releases，Mac 与 Linux 各两个架构），插件里只放一个几行的转发小脚本，它带着插件要求的版本范围去核对本机装的命令行；版本不对或没装，开会话就告诉人跑 setup。依据：你 11-19 定「二进制是二进制，skill 是 skill」。
- **护栏**：手改 issue 状态 label、手写删 worktree 会被 hook 拦下并给出该用的命令；往知识库提交时有死链或同名文件就拒绝。
- **之前 → 之后**：skill 里「node 加一长串路径加参数」→「dyna 模块 命令」；pr-review 由子代理经 Codex 插件审 → 主会话自己并行起两个 Codex 进程，跑完即退；runtime、browser、seo-check 三个 skill → 命令自带的数据和命令。
- **按你的批示**：静态服务器 30 分钟没请求自动退出；第一版定为 0.0.1，全部实现完才发。
<!-- /idea-loop:section changes -->

<!-- idea-loop:section verification -->
## 怎么验证

- **行为没变**：每个模块都拿同样的输入分别喂旧脚本和新命令，逐字节比输出和退出码；旧脚本的行为测试逐条搬成新测试后才删旧脚本。
- **全量测试**：命令行测试全过；插件测试 724 条过 723 条，唯一不过的是「改了插件要升版本」——这个 PR 按约定不升，留给 0.2.0 一起升。
- **装好后真跑过**：从公开地址下载安装包、核过校验和后装进本机；用这个分支的插件开真会话，开场注入了运行环境、手删 worktree 被拦下；真调 Codex 审查一次（22 秒）、生图一次（56 秒），两次跑完都没有残留进程。
- **没验成**：DESIGN.md 官方检查工具没联网跑真的；开 PR、合并 PR 那几条命令只对假的 GitHub 命令行验过参数。
- **review**：跑了三轮。第 1 轮 2 条（说明里把命令叫「脚本」；YAML 解析器你定换成现成库，TOFEL-demo 8 处值加引号）、第 2 轮 3 条（改词全插件扫完；换库发版 0.0.2；漏引号报错补中文提示），都已修；第 3 轮两轴 0 条。
<!-- /idea-loop:section verification -->

<!-- idea-loop:section rollback -->
## 能否回滚

- **能不能撤**：撤销合并即可回到旧脚本；但这次同时删了三个 skill、改了 hook，要整个 PR 一起撤，不能只撤一半。已发出的命令行 0.0.1 留在 GitHub Releases 上，撤了也不影响谁（旧插件不调它）。
- **影响面**：只在 0.2.0 合进 main 之后影响装了插件的项目；别的项目里写着 runtime、browser、seo-check 这三个 skill 名的地方会失效，0.2.0 要按大版本算。
- **上线前要注意**：TOFEL-demo 的设计档案要等 Tofelair#1031（8 处值加引号）合进去，新版档案检查才通过；每台机器（包括公司虚拟机）都要先跑一次 setup 装命令行，否则 hook 只提示不生效；公司虚拟机连不上 GitHub 时要人手拷一份二进制。
- **顺带开的 issue**：本仓库知识库 8 处死链（#388），迁进 home 之前要修。
<!-- /idea-loop:section rollback -->

<!-- idea-loop:section your-todo -->
## 要你做的事

- 三轮 review 已过、没有要你定的事：说「合并」即可（合进集成分支，不是 main）；0.2.0 的版本号由父会话最后统一升。
- TOFEL-demo 那边的 Tofelair#1031（8 处值加引号）也需要你合，它的档案检查才会在新版命令行下通过。
<!-- /idea-loop:section your-todo -->

<!-- idea-loop:section reference -->
## 参考

- spec：[idea-loop-cli.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/idea-loop-cli.md)
- 工单（19 张，01 打通入口与 issues 模块；02–13 各模块；14 发版需 Harold 点头；15–18 迁移；19 收缩）：
  - [01-entry-registry-issues.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/01-entry-registry-issues.md)
  - [02-spec-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/02-spec-module.md)
  - [03-home-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/03-home-module.md)
  - [04-git-worktree-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/04-git-worktree-module.md)
  - [05-pr-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/05-pr-module.md)
  - [06-design-archive-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/06-design-archive-module.md)
  - [07-design-checks-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/07-design-checks-module.md)
  - [08-ui-serve-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/08-ui-serve-module.md)
  - [09-research-dreaming-retro-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/09-research-dreaming-retro-module.md)
  - [10-seo-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/10-seo-module.md)
  - [11-runtime-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/11-runtime-module.md)
  - [12-agent-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/12-agent-module.md)
  - [13-test-module.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/13-test-module.md)
  - [14-release-v0-1-0.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/14-release-v0-1-0.md)
  - [15-hooks-mcp-switch.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/15-hooks-mcp-switch.md)
  - [16-migrate-engineering-productivity.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/16-migrate-engineering-productivity.md)
  - [17-migrate-design.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/17-migrate-design.md)
  - [18-migrate-seo-runtime.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/18-migrate-seo-runtime.md)
  - [19-contract-remove-mjs.md](https://github.com/guohaonan-shy/harold-skills/blob/issue/339-cli/docs/spec/idea-loop-cli/tickets/19-contract-remove-mjs.md)

- 执行记录（工单 → 落地提交）：
  - 01-entry-registry-issues · [67ddff7](https://github.com/guohaonan-shy/harold-skills/commit/67ddff78baba6ecd9ec962f3308b39f7a6ba76ae)
  - 02-spec-module · [be763d1](https://github.com/guohaonan-shy/harold-skills/commit/be763d1899af6e51a97d3e42be3d72b0bf93947c)
  - 03-home-module · [0e4962c](https://github.com/guohaonan-shy/harold-skills/commit/0e4962c7fcbea31d0e64d5e29622d143a3125db1)
  - 04-git-worktree-module · [2751ed7](https://github.com/guohaonan-shy/harold-skills/commit/2751ed7920cb7f9edc3f6d4ab183a11481badf21)
  - 04-git-worktree-module · [531b238](https://github.com/guohaonan-shy/harold-skills/commit/531b238705de2f17fc9e6f27046f61d7129aaec6)
  - 05-pr-module · [aaac508](https://github.com/guohaonan-shy/harold-skills/commit/aaac5082f2beb3acc843ef4275ba741b62e6088a)
  - 06-design-archive-module · [5a977e3](https://github.com/guohaonan-shy/harold-skills/commit/5a977e318a9da737166d676834f3def7c85daf06)
  - 09-research-dreaming-retro-module · [c72343c](https://github.com/guohaonan-shy/harold-skills/commit/c72343c78b46f319ed746c5ecbe2711157b852df)
  - 07-design-checks-module · [7f2112b](https://github.com/guohaonan-shy/harold-skills/commit/7f2112bffabc8d60b990055e4557c882347c0e36)
  - 08-ui-serve-module · [2966f8d](https://github.com/guohaonan-shy/harold-skills/commit/2966f8de5c2599f8c023156b497bcb05d62dd512)
  - 11-runtime-module · [350b4d7](https://github.com/guohaonan-shy/harold-skills/commit/350b4d7a1989cee0e7c83443b051ba6abe735155)
  - 13-test-module · [a8cba6d](https://github.com/guohaonan-shy/harold-skills/commit/a8cba6d48acc44d11835813ef68f0d162950090f)
  - 10-seo-module · [1b79669](https://github.com/guohaonan-shy/harold-skills/commit/1b796696633c3d1106ae8c408968d0f6bd9663db)
  - 08-ui-serve-module · [0697059](https://github.com/guohaonan-shy/harold-skills/commit/0697059a94e027c88273b9e5b43c74824138b236)
  - 12-agent-module · [e9cbaee](https://github.com/guohaonan-shy/harold-skills/commit/e9cbaeef84a2d07a0cff514dcfac6c36993f0ab4)
  - 01-entry-registry-issues · [1c4ad62](https://github.com/guohaonan-shy/harold-skills/commit/1c4ad621d0040824562983a7353372b677567df5)
  - 08-ui-serve-module · [105883a](https://github.com/guohaonan-shy/harold-skills/commit/105883acb92442ac246298a979258a6419daec80)
  - 17-migrate-design · [8e7294a](https://github.com/guohaonan-shy/harold-skills/commit/8e7294ac27fcd8e9abd4b6f0b3cac56a091df42e)
  - 15-hooks-mcp-switch · [6943f5d](https://github.com/guohaonan-shy/harold-skills/commit/6943f5d64ceea1c5ff59bcd57223d494c0660ba4)
  - 16-migrate-engineering-productivity · [115d744](https://github.com/guohaonan-shy/harold-skills/commit/115d74467bd9baab050d16296798e06f4966edef)
  - 18-migrate-seo-runtime · [957e295](https://github.com/guohaonan-shy/harold-skills/commit/957e295aef5b0964a7cd214bc92f6303e0dcf23c)
  - 19-contract-remove-mjs · [154d955](https://github.com/guohaonan-shy/harold-skills/commit/154d955402118acf570605c35e99bcb709c6b22c)
  - 14-release-v0-1-0 · [cb16cdd](https://github.com/guohaonan-shy/harold-skills/commit/cb16cdd42141b7410811e3290a6d48cbc58885bd)
- 发布：[dyna-v0.0.1](https://github.com/guohaonan-shy/harold-skills/releases/tag/dyna-v0.0.1)，标签打在 154d955；发版步骤见 DEVELOPMENT.md 的 dyna 一节
- 版本：不碰 idea-loop 的 plugin.json（0.2.0 由父会话最后统一升，按大版本：删了 runtime、browser、seo-check 三个 skill）；dyna 自己 0.0.1
<!-- /idea-loop:section reference -->

Refs guohaonan-shy/harold-skills#339

🤖 Generated with [Claude Code](https://claude.com/claude-code)
~~~~~

**四轮产出**：四轮产出在分支上的 `idea-loop/evals/pr/rounds/harold-skills-387/`：`description-v1.md`、`description-v2.md`、`description-v3.md` 是前三轮，`description.md` 是第四轮（Harold 定的模板），`notes.md` 是每轮子代理记下的「标准没说清」和字数；每轮之间改了什么、Harold 的批示在 `docs/raw/decisions/452.md` 题 20–27。

- 第一轮 1965 字（去掉代码块）。
- 第二轮 2259：证据四对之前 / 之后里三对的「之前」缺，写〔缺：复现〕；人定的「换现成库」只写它的后果：不加引号的值读不出来，进「兼容」一条和「要你做的事」，决定本身不写。
- 第三轮 2509：概要的 diff 加三块（YAML 改用现成的库、静态服务器空闲自动退出、量 UI 改用本机 Chrome）；证据按问题分四组，另加一组「重写本身（行为没变）」。
- 第四轮 1934：证据只剩两组两边跑同一条 grep 的之前 / 之后（脚本全路径 154 → 0、引用旧 skill 名 39 → 0）；没复现的合进「没验成」；「重写本身」压成一行「行为没变」；合并风险「兼容」一条写 TOFEL-demo 主分支上 8 个文件读不出；要你做的事一个复选框加一段命令（合 Tofelair#1031）。

## 人指出的问题

- 人的原话（题 24）：「问题的本质是我的决定带来的风险会写入合并风险内？」答：对；另外决定让方案多做的一块画进概要。
- 起因：第二轮样本里 4 / 5 碰到「人在 review 里定的事」没有位置（#387 换现成库、#432 开会话统一、#1137 删种子、#1072 实验放行的一条发现）。旧描述把换库带来的 8 处读不出的档案放在「能否回滚」的「上线前要注意」里。

## 好的长什么样

- 决定本身不写（「你定了换现成库」留在 review 归档评论里，每轮一条、带原话）。
- 它改变的东西照常写：概要的 diff 画出「自写小解析器 → 现成库」；合并风险的「要特别注意的」写「设计档案里值带冒号、问号、花括号又没加引号的，现在读不出来（TOFEL-demo 主分支 8 个文件，报错带「要加引号」）」。
- 合并风险里有「门：单向」写清退不回的部分（已发出的 dyna 0.0.1、0.0.2 两个包）和「影响面」。
- 不好的样子：兼容风险只出现在别的节里（比如问题节或要你做的事里的一句），或只写「换了 YAML 库」而没说换完谁会撞上什么。

## 回放这一格怎么跑

- 现场：提交 `75665ec2`（本仓库 `release/idea-loop-0.2.0` 在这个 PR 合并前一刻的样子，是合并提交的第一个父提交；PR 的改动不在里面）。这个现场在本仓库，不用另指 `--repo`。
- 换过的地方：prompt 里给的是旧描述、按目录合并的文件清单、5 条 review 归档评论（含人的批示，折叠区略）；材料里的 eval 一词写成 e-val，评委写成裁判。
- 判定要点：旧描述「能否回滚」里已经提到 8 处档案，所以看的是写进的是不是「合并风险」那一节、说清了谁会撞上什么，而不是别的地方有没有提到。
- 大小：large，由编排者在 PR 开出来之后照 `--run-large` 跑。
