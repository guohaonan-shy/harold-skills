# 01 — 回放起的每个子进程都不带 gh 登录

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

规则回放的 runner 会起三类子进程：在项目副本里重演那一步的 worker（`claude -p`，改前、改后各一遍）、Claude 判定会话、Codex 判定。现在它们原样继承 runner 的环境，所以子进程里的 `gh` 用的是跑回放这台机器的登录，worker 能读到用例提交之后才发生的线上 issue 与 PR 变化（例：停在起草前的项目副本里读到 issue 后来被关成 completed）。

做完之后：runner 交给这三类子进程的是同一份环境，由一个函数造出：在 runner 自己的环境上去掉 `GH_TOKEN`、`GITHUB_TOKEN`、`GH_ENTERPRISE_TOKEN`、`GITHUB_ENTERPRISE_TOKEN`，把 `GH_CONFIG_DIR` 指到这次回放 run dir 下的一个空目录；其余变量（`PATH`、`HOME`、`CLAUDE_CONFIG_DIR`、`IDEA_LOOP_RUNTIME`、测试用的 `RETRO_*` / `FAKE_*` 等）照传。于是子进程里任何 `gh` 读命令都报未登录、读不到线上现状。runner 自己的 `process.env` 不改，机器自己的 gh 登录不受影响。`--case` 当场跑和 `--run-large` 两个入口都走这段。

不改任何 prompt（worker prompt 只有人的原话，已有测试钉着），不拦 WebFetch / 网络读（spec 里记成已知限制），不改用例文件。

runner 文件头部那段说明里，补一句子进程不带 gh 登录及原因。

## 验收标准

- [ ] 跑一个用例时，给 runner 的环境设上 `GH_TOKEN`、`GITHUB_TOKEN`、指向一个有内容目录的 `GH_CONFIG_DIR` 和一个无关变量：worker 两遍、Claude 判定、Codex 判定各自看到的环境里都没有这两个 token，`GH_CONFIG_DIR` 指向一个存在的空目录且不是传进来的那个，无关变量原样在（e2e，用现有的假 claude / 假 Codex 记下环境）
- [ ] 造环境的函数单独测：四个 token 变量都被去掉、`GH_CONFIG_DIR` 被换、其余变量照传、传入的环境对象本身没被改动
- [ ] 回放测试和 idea-loop 其余测试全绿
- [ ] 本机实测：在这份环境下跑 `gh issue view 275 -R guohaonan-shy/harold-skills` 得到未登录、非零退出（记在交回里）

## 选中的存量回归

- `retro-replay.test.mjs`「e2e: both runs get exactly the case prompt, in a work dir that does not say it is a test, a different one each」：改的是起 worker 的那段，最可能碰坏 prompt 与工作目录。
- `retro-replay.test.mjs` 假 Codex 判定那几条（「the judge is the fake Codex…」「no Codex: says so before any session starts…」）：Codex 子进程改了环境，要确认它照样被找到、照样判。
- `retro-run-large.test.mjs`：`--run-large` 入口走同一段起子进程的代码。
