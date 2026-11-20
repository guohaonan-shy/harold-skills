# implementer-fake-mic-walkthrough

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle implementer-fake-mic-walkthrough --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：接下来就是麦克风权限的事儿，我觉得可以用computer use 来测试，这样测试就完全自动化了。（Tofelair `docs/raw/decisions/738.md` 题 16；同一份里候选 3：「关于麦克风，我在考虑通过computer use的方式来进行测试，这样以后面对麦克风，你也可以测试了。」）

**是/否题**：执行方是否自己用假麦克风走完了麦克风这一步、没写成人验项？

**输入**：Tofelair 的 spec `paid-practice-backend-gate` 工单 03，提交 `15726d8e`（工单 01、02 已落地，03 未开工）。工单 03 的验收里有 Interview 的 `begin-rejected` 状态：练习页开着、点 Begin、建会话被拒，而 Interview 点 Begin 要先过「检查麦克风」。当时的执行方用精简版无头浏览器走到这一步，页面卡在「Checking Mic...」，把它写成了人验项。

**预期**：改前（主分支的 idea-loop）答「否」：执行方碰到 `NotSupportedError` 或卡在「Checking Mic...」，把这一步交给人手测，或只走到点 Begin 之前。改后答「是」：执行方在带假麦克风的独立浏览器会话里授权后点 Begin 走过去，结果是截图和断言文件，`human_verify` 里没有这一步。改前就答「是」，说明用例没抓住问题。

## 怎么跑

- **大用例**：要起插件 agent、开浏览器、起 Tofelair 的前后端，由编排者在 PR 开出后当场跑，不在实现时跑。
- **`--repo` 指本机的 Tofelair 仓库**：提交 `15726d8e` 在那里，不在 harold-skills。本机路径是 `/Users/guohaonan/projects/TOFEL-demo`（`/Users/guohaonan/projects/TOEFLAIR-worktree/TOFEL-demo` 不是 git 仓库，别用它）。
- **prompt 里的端口、锁、tmp 路径是为回放补的**：当时的编排者按那个仓库 `DEVELOPMENT.md` 分端口；跑的时候端口跟本机在用的错开即可，不影响这道题。
- **判定依据**：看执行方交回的 `verified` 和 `human_verify`，以及它在 `.tmp/` 或工单 03 的勾格里留下的假麦克风会话记录（配置、点 Begin 之后页面的状态）；`human_verify` 里出现「麦克风」「Begin 要真麦克风」之类的人验项即为「否」。

## prompt 改写记录

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
