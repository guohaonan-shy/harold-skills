## 问题

idea-loop 的 skill 和 agent 定义已经塞满了：将近一半主体超过 4500 字，dreaming 离 5000 字上限只剩 1 字，再加一个分支就得先删掉别的句子。原因是每次功能改动只往主文件里塞自己那一处，从来没有整份照 writing-for-agents 的写法规则重写过。

| 问题 | 量 | 出处 |
|---|---|---|
| 1. 主文件没有余量 | 57 份里 25 份主体超过 4500 字（41 个 skill + 16 份 agent 定义）；最长 ui-reviewer 6632，dreaming 4999、implementer 4943 | 0.2.0 集成分支，同步完 #431 之后，2026-11-20 |
| 2. 主文件里夹着决策历史和少数运行才用的分支 | 59 份里 27 份写着日期、「人定」；implementer 的「停，还是延后」约 900 字，只在停下或延后那次才用，每次都要读 | 同一条分支，2026-11-19 |
| 3. 同一条规矩写几处，命令写死在步骤里 | 「PR 从 spec 提交就挂着」在 pr、implement 各写一遍；步骤里手写 gh / git 命令 54 个文件 124 行，回放时 agent 没登录 gh，照步骤跑第一步就失败 | main，#356 立项时 |

一个真实例子：implement 的主体从 10-14 的 3885 字涨到 11-13 的 9589 字，约 25 个功能提交各往里塞了一个分支。

## 概要

每份定义只留每次都走的步骤，只在部分运行才走到的分支挪进这个 skill 自己的参考文件、主文件留一句「什么时候去读」；五组 skill 合并（41 → 36），被合并的整个删掉、不留旧名字；同一条规矩只留在归属处，别处只指过去；能用 dyna 的手写命令换成 dyna。流程行为不变。

```diff
 idea-loop/skills/
   productivity/
-    evidence/SKILL.md                          # 证据怎么写、配什么图
+    decision-rules/SKILL.md                    # 并进「证据是什么」「整体怎么写」「配什么图」，新会话开场整份注入
+    decision-rules/references/ui-flow.md, gif.md
-    glossary/SKILL.md                          # 术语表收什么、什么格式
+    wiki-conventions/references/glossary.md    # 同一份内容，主文件留一行指针
   engineering/
+    setup/references/seo/                      # 原 seo-setup 整个搬进来；setup 接完项目后按模块问要不要接 SEO
+    implement/references/stop-and-defer.md     # implementer 的「停，还是延后」挪出来
   seo/
-    seo-setup/
-    seo-brief/SKILL.md
+    seo-writing/references/brief.md            # 写 brief 成为 seo-writing 的一个分支
-    link-prospecting/SKILL.md
+    seo-outreach/references/prospecting.md     # 找候选站点成为 seo-outreach 的一个分支
+  （另 25 份新参考文件）                        # 各 skill 只在部分运行才走到的分支
 dyna/internal/
   home/glossary.go, seo/*.go                   # 给人看的提示和报错，原来指向被删的 skill，改指合并后的位置
   runtime/handoff.go                           # 开 issue 会话，见下
```

开 issue 会话原来两种运行环境各写各的，现在都调同一条 dyna 命令，环境差别收进命令里；侧边栏分组、定时任务、会话收尾照旧留在各自的运行环境说明里，开场注入：

```diff
 调度交出一个 issue
-  桌面端：dyna runtime handoff
-    claude -p 建会话
-    在 expect 里接回会话、敲 /desktop、读屏幕判成败
-  magi：运行环境说明里手写 magi sessions start，再自己追加调度记录
+  两种运行环境同一句：dyna runtime handoff
+    桌面端：claude -p 建会话 → claude --desktop --resume <id>
+    magi：magi sessions start
+    成功后追加调度记录；失败退出 1，报「交出失败：原因」
```

## 证据

- **之前**：按仓库 AGENTS.md 的量法逐份量 skill 和 agent 定义的主体，在 0.2.0 集成分支上：57 份里 25 份超过 4500，最长 ui-reviewer 6632。
  **之后**：同一条量法在本分支上：52 份（36 个 skill + 16 份 agent 定义）里 0 份超过，最长 writing-for-agents 4497，ui-reviewer 4146。

```text
在 skill、agent、README、两份 AGENTS 清单、hooks、
  运行环境说明、dyna 源码里搜被删的 5 个 skill 名       → 0 处
用本分支的 dyna 开一个新会话                            → 开场注入的决策规则 9 节，有「依据只认三种」「证据是什么」
合并后的入口能找到                                      → seo-writing 写着「写 brief」，seo-outreach 写着「找候选站点」，
                                                           wiki-conventions 写着「术语表」，setup 写着「按模块问要不要接 SEO」
开 issue 会话，参数写错（桌面端、magi 各一次）           → 都退出 1
「原话」这个字段名                                      → 全插件只有一种叫法，测试守着
```

全量测试（本机，2026-11-20；PR 上没有 CI）：node 1104 条过 1103，红的是「改了插件就要升版本」，见合并风险；dyna 的 vet、格式检查、Go 测试 43 个包全绿。

行为没变：桌面端开 issue 会话（用假的 claude 程序），改前改后打印的 JSON 和追加的调度记录同形。

没验成：问题 2、3 的之前和之后（决策历史搜索、手写 gh / git 命令的行数、没登录 gh 的回放 agent 跑第一步）没在基准分支和本分支上各跑一遍；五组合并后用同一句话调新入口，产出跟合并前比没比过，description 能不能被真实对话触发也没回放，装上 0.2.0 用的时候看；桌面端真机交出，执行方开不了你电脑上的桌面端会话，留给你，见下一节。

## 合并风险

**门**：双向。撤销合并即可；没有数据迁移，dyna 0.0.5 没发布，撤了不影响已装的版本。
**影响面**：全插件。合进的是 0.2.0 的集成分支，0.2.0 合进 main 发布前没人装得到。
- evidence、glossary、seo-setup、seo-brief、link-prospecting 这 5 个名字在 0.2.0 里调不到，刻意不留跳转（spec 定的「一次发布、不留旧路径」）；`/idea-loop:seo-setup` 改成 `/idea-loop:setup` 的 SEO 模块。
- dyna 升到 0.0.5，没发布；插件要求的最低版本仍是 0.0.4。还装着 0.0.4 的人开场注入第一句是旧的。
- idea-loop 的插件版本这次刻意不升，0.2.0 由集成分支合进 main 的那个 PR 一次升；所以「改了插件就要升版本」这条检查红在预期内。

## 要你做的事

- [ ] 真机交出一次：在本机一个已经信任过的仓库目录里，用本分支构建的 dyna 跑下面这条（尖括号换成真实的 worktree 目录、issue 号、仓库名；它要联网，在沙箱外跑；会往这台设备的调度记录里追加一条），看桌面端侧边栏有没有出现这个会话、命令是不是自己退出。碰到「信任这个目录吗」的确认框，告诉我，要把这句提醒补回运行环境说明。合并后再验也行。

  ```bash
  dyna runtime handoff --worktree <目录> --issue <号> --repo <仓库名> --period todo
  ```

说「合并」即可。

Refs guohaonan-shy/harold-skills#340
Refs guohaonan-shy/harold-skills#356
